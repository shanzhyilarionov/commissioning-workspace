use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{Migration, MigrationKind};

mod backup;
mod project_deletion;
mod project_transfer;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_report_pdf(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let output_path = Path::new(&path);
    let is_pdf = output_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));

    if !is_pdf {
        return Err("The report file must use the .pdf extension.".to_string());
    }

    if !bytes.starts_with(b"%PDF") {
        return Err("The generated report is not a valid PDF document.".to_string());
    }

    std::fs::write(output_path, bytes)
        .map_err(|error| format!("Failed to save the PDF report: {error}"))
}

#[tauri::command]
fn save_audit_history_csv(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let output_path = Path::new(&path);
    let is_csv = output_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"));

    if !is_csv {
        return Err("The audit history file must use the .csv extension.".to_string());
    }

    let csv_bytes = bytes
        .as_slice()
        .strip_prefix(&[0xef, 0xbb, 0xbf])
        .unwrap_or(bytes.as_slice());
    let csv = std::str::from_utf8(csv_bytes)
        .map_err(|_| "The generated audit history is not valid UTF-8 text.".to_string())?;

    if !csv.starts_with("\"Project\",\"Timestamp (UTC)\"") || csv.lines().count() < 2 {
        return Err("The generated audit history is not a valid CSV document.".to_string());
    }

    std::fs::write(output_path, bytes)
        .map_err(|error| format!("Failed to save the audit history CSV: {error}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedProjectDocumentFile {
    original_file_name: String,
    stored_path: String,
    mime_type: String,
    file_size: u64,
}

fn validate_storage_id(value: &str, field_name: &str) -> Result<(), String> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(format!("Invalid {field_name}."));
    }

    Ok(())
}

fn project_storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("projects"))
        .map_err(|error| format!("Failed to resolve the application data directory: {error}"))
}

fn mime_type_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("tif") | Some("tiff") => "image/tiff",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("ppt") => "application/vnd.ms-powerpoint",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Some("txt") => "text/plain",
        Some("csv") => "text/csv",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn managed_document_path(
    app: &tauri::AppHandle,
    stored_path: &str,
) -> Result<Option<PathBuf>, String> {
    let path = PathBuf::from(stored_path);

    if !path.exists() {
        return Ok(None);
    }

    let canonical_path = std::fs::canonicalize(&path)
        .map_err(|error| format!("Failed to resolve the managed document path: {error}"))?;
    let storage_root = project_storage_root(app)?;

    if !storage_root.exists() {
        return Err("The managed document storage directory does not exist.".to_string());
    }

    let canonical_root = std::fs::canonicalize(storage_root).map_err(|error| {
        format!("Failed to resolve the managed document storage directory: {error}")
    })?;

    if !canonical_path.starts_with(canonical_root) {
        return Err("The requested file is outside managed document storage.".to_string());
    }

    Ok(Some(canonical_path))
}

fn remove_empty_parent_directories(path: &Path, stop_at: &Path) {
    let mut current = path.parent();

    while let Some(directory) = current {
        if directory == stop_at || !directory.starts_with(stop_at) {
            break;
        }

        match std::fs::remove_dir(directory) {
            Ok(()) => current = directory.parent(),
            Err(_) => break,
        }
    }
}

#[tauri::command]
fn import_project_document(
    app: tauri::AppHandle,
    source_path: String,
    project_id: String,
    document_id: String,
) -> Result<ImportedProjectDocumentFile, String> {
    validate_storage_id(&project_id, "project ID")?;
    validate_storage_id(&document_id, "document ID")?;

    let source = std::fs::canonicalize(&source_path)
        .map_err(|error| format!("Failed to resolve the selected document: {error}"))?;

    if !source.is_file() {
        return Err("The selected path is not a file.".to_string());
    }

    let original_file_name = source
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .filter(|file_name| !file_name.is_empty())
        .ok_or_else(|| "The selected document has an invalid file name.".to_string())?
        .to_string();

    let storage_root = project_storage_root(&app)?;
    let document_directory = storage_root
        .join(&project_id)
        .join("documents")
        .join(&document_id);

    std::fs::create_dir_all(&document_directory)
        .map_err(|error| format!("Failed to create managed document storage: {error}"))?;

    let destination = document_directory.join(&original_file_name);

    if let Err(error) = std::fs::copy(&source, &destination) {
        let _ = std::fs::remove_dir_all(&document_directory);
        return Err(format!("Failed to import the document: {error}"));
    }

    let metadata = std::fs::metadata(&destination)
        .map_err(|error| format!("Failed to read the imported document metadata: {error}"))?;

    Ok(ImportedProjectDocumentFile {
        original_file_name,
        stored_path: destination.to_string_lossy().into_owned(),
        mime_type: mime_type_for_path(&destination),
        file_size: metadata.len(),
    })
}

#[tauri::command]
fn open_project_document(app: tauri::AppHandle, stored_path: String) -> Result<(), String> {
    let path = managed_document_path(&app, &stored_path)?
        .ok_or_else(|| "The managed document file no longer exists.".to_string())?;

    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Failed to open the document: {error}"))
}

#[tauri::command]
fn delete_project_document_file(app: tauri::AppHandle, stored_path: String) -> Result<(), String> {
    let Some(path) = managed_document_path(&app, &stored_path)? else {
        return Ok(());
    };

    let storage_root = project_storage_root(&app)?;

    std::fs::remove_file(&path)
        .map_err(|error| format!("Failed to delete the managed document: {error}"))?;

    remove_empty_parent_directories(&path, &storage_root);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_projects_table",
            sql: r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                client TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'archived')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_assets_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    system_name TEXT NOT NULL DEFAULT '',
                    tag TEXT NOT NULL COLLATE NOCASE,
                    name TEXT NOT NULL,
                    asset_type TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (
                            status IN (
                                'not_started',
                                'in_progress',
                                'completed',
                                'blocked'
                            )
                        ),
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    UNIQUE (project_id, tag)
                );

                CREATE INDEX IF NOT EXISTS
                    idx_assets_project_id
                ON assets(project_id);

                CREATE INDEX IF NOT EXISTS
                    idx_assets_project_status
                ON assets(project_id, status);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_issues_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS issues (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    asset_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    priority TEXT NOT NULL DEFAULT 'medium'
                        CHECK (
                            priority IN (
                                'low',
                                'medium',
                                'high',
                                'critical'
                            )
                        ),
                    status TEXT NOT NULL DEFAULT 'open'
                        CHECK (
                            status IN (
                                'open',
                                'in_progress',
                                'resolved',
                                'closed'
                            )
                        ),
                    owner TEXT NOT NULL DEFAULT '',
                    due_date TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    FOREIGN KEY (asset_id)
                        REFERENCES assets(id)
                        ON DELETE SET NULL
                );

                CREATE INDEX IF NOT EXISTS
                    idx_issues_project_id
                ON issues(project_id);

                CREATE INDEX IF NOT EXISTS
                    idx_issues_project_status
                ON issues(project_id, status);

                CREATE INDEX IF NOT EXISTS
                    idx_issues_project_priority
                ON issues(project_id, priority);

                CREATE INDEX IF NOT EXISTS
                    idx_issues_asset_id
                ON issues(asset_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_test_records_tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS test_records (
                id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL,
                asset_id TEXT,
                title TEXT NOT NULL,
                record_type TEXT NOT NULL DEFAULT 'checklist'
                    CHECK (
                        record_type IN (
                            'checklist',
                            'functional_test'
                        )
                    ),
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                FOREIGN KEY (project_id)
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (asset_id)
                    REFERENCES assets(id)
                    ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS test_items (
                id TEXT PRIMARY KEY NOT NULL,
                test_record_id TEXT NOT NULL,
                description TEXT NOT NULL,
                acceptance_criteria TEXT NOT NULL DEFAULT '',
                result TEXT NOT NULL DEFAULT 'pending'
                    CHECK (
                        result IN (
                            'pending',
                            'pass',
                            'fail',
                            'not_applicable'
                        )
                    ),
                notes TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                FOREIGN KEY (test_record_id)
                    REFERENCES test_records(id)
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS
                idx_test_records_project_id
            ON test_records(project_id);

            CREATE INDEX IF NOT EXISTS
                idx_test_records_project_type
            ON test_records(project_id, record_type);

            CREATE INDEX IF NOT EXISTS
                idx_test_records_asset_id
            ON test_records(asset_id);

            CREATE INDEX IF NOT EXISTS
                idx_test_items_test_record_id
            ON test_items(test_record_id);

            CREATE INDEX IF NOT EXISTS
                idx_test_items_record_sort_order
            ON test_items(test_record_id, sort_order);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "link_failed_test_items_to_issues",
            sql: r#"
                CREATE TABLE IF NOT EXISTS issue_test_item_links (
                    issue_id TEXT PRIMARY KEY NOT NULL,
                    test_item_id TEXT NOT NULL UNIQUE,
                    FOREIGN KEY (issue_id)
                        REFERENCES issues(id)
                        ON DELETE CASCADE,
                    FOREIGN KEY (test_item_id)
                        REFERENCES test_items(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS
                    idx_issue_test_item_links_test_item
                ON issue_test_item_links(test_item_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_test_record_signoff",
            sql: r#"
                ALTER TABLE test_records
                    ADD COLUMN executed_by TEXT NOT NULL DEFAULT '';

                ALTER TABLE test_records
                    ADD COLUMN witnessed_by TEXT NOT NULL DEFAULT '';

                ALTER TABLE test_records
                    ADD COLUMN execution_date TEXT;

                ALTER TABLE test_records
                    ADD COLUMN signed_off_by TEXT NOT NULL DEFAULT '';

                ALTER TABLE test_records
                    ADD COLUMN signed_off_at TEXT;

                ALTER TABLE test_records
                    ADD COLUMN completion_notes TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_project_documents_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS project_documents (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    asset_id TEXT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'other'
                        CHECK (
                            category IN (
                                'drawing',
                                'manual',
                                'datasheet',
                                'procedure',
                                'certificate',
                                'report',
                                'other'
                            )
                        ),
                    revision TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK (
                            status IN (
                                'draft',
                                'for_review',
                                'approved',
                                'superseded'
                            )
                        ),
                    original_file_name TEXT NOT NULL,
                    stored_path TEXT NOT NULL UNIQUE,
                    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    file_size INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    FOREIGN KEY (asset_id)
                        REFERENCES assets(id)
                        ON DELETE SET NULL
                );

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_id
                ON project_documents(project_id);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_status
                ON project_documents(project_id, status);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_category
                ON project_documents(project_id, category);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_asset_id
                ON project_documents(asset_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_systems_and_subsystems",
            sql: r#"
                CREATE TABLE IF NOT EXISTS systems (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    code TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL COLLATE NOCASE,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    UNIQUE (project_id, name)
                );

                CREATE INDEX IF NOT EXISTS
                    idx_systems_project_id
                ON systems(project_id);

                CREATE UNIQUE INDEX IF NOT EXISTS
                    idx_systems_project_code_unique
                ON systems(project_id, code)
                WHERE trim(code) <> '';

                CREATE TABLE IF NOT EXISTS subsystems (
                    id TEXT PRIMARY KEY NOT NULL,
                    system_id TEXT NOT NULL,
                    code TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL COLLATE NOCASE,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (system_id)
                        REFERENCES systems(id)
                        ON DELETE CASCADE,

                    UNIQUE (system_id, name)
                );

                CREATE INDEX IF NOT EXISTS
                    idx_subsystems_system_id
                ON subsystems(system_id);

                CREATE UNIQUE INDEX IF NOT EXISTS
                    idx_subsystems_system_code_unique
                ON subsystems(system_id, code)
                WHERE trim(code) <> '';

                ALTER TABLE assets
                    ADD COLUMN system_id TEXT
                    REFERENCES systems(id)
                    ON DELETE SET NULL;

                ALTER TABLE assets
                    ADD COLUMN subsystem_id TEXT
                    REFERENCES subsystems(id)
                    ON DELETE SET NULL;

                INSERT INTO systems (
                    id,
                    project_id,
                    code,
                    name,
                    description,
                    created_at,
                    updated_at
                )
                SELECT
                    'system-' || lower(hex(randomblob(16))),
                    project_id,
                    '',
                    MIN(trim(system_name)),
                    '',
                    MIN(created_at),
                    MAX(updated_at)
                FROM assets
                WHERE trim(system_name) <> ''
                GROUP BY project_id, lower(trim(system_name));

                UPDATE assets
                SET system_id = (
                    SELECT systems.id
                    FROM systems
                    WHERE systems.project_id = assets.project_id
                      AND systems.name =
                          trim(assets.system_name) COLLATE NOCASE
                    LIMIT 1
                )
                WHERE trim(system_name) <> '';

                CREATE INDEX IF NOT EXISTS
                    idx_assets_system_id
                ON assets(system_id);

                CREATE INDEX IF NOT EXISTS
                    idx_assets_subsystem_id
                ON assets(subsystem_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_readiness_and_turnover_workflow",
            sql: r#"
                ALTER TABLE systems
                    ADD COLUMN commissioning_stage TEXT NOT NULL
                    DEFAULT 'not_started'
                    CHECK (
                        commissioning_stage IN (
                            'not_started',
                            'in_progress',
                            'ready',
                            'commissioned',
                            'handed_over'
                        )
                    );

                ALTER TABLE subsystems
                    ADD COLUMN commissioning_stage TEXT NOT NULL
                    DEFAULT 'not_started'
                    CHECK (
                        commissioning_stage IN (
                            'not_started',
                            'in_progress',
                            'ready',
                            'commissioned',
                            'handed_over'
                        )
                    );

                ALTER TABLE project_documents
                    ADD COLUMN required_for_readiness INTEGER NOT NULL
                    DEFAULT 0
                    CHECK (required_for_readiness IN (0, 1));

                CREATE TABLE IF NOT EXISTS readiness_stage_records (
                    id TEXT PRIMARY KEY NOT NULL,
                    system_id TEXT,
                    subsystem_id TEXT,
                    from_stage TEXT NOT NULL,
                    to_stage TEXT NOT NULL,
                    recorded_by TEXT NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    is_forced INTEGER NOT NULL DEFAULT 0
                        CHECK (is_forced IN (0, 1)),
                    blocker_count INTEGER NOT NULL DEFAULT 0,
                    blockers_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,

                    CHECK (
                        (system_id IS NOT NULL AND subsystem_id IS NULL)
                        OR
                        (system_id IS NULL AND subsystem_id IS NOT NULL)
                    ),

                    FOREIGN KEY (system_id)
                        REFERENCES systems(id)
                        ON DELETE CASCADE,

                    FOREIGN KEY (subsystem_id)
                        REFERENCES subsystems(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS
                    idx_readiness_stage_records_system
                ON readiness_stage_records(system_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS
                    idx_readiness_stage_records_subsystem
                ON readiness_stage_records(subsystem_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_required_readiness
                ON project_documents(project_id, required_for_readiness, status);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create_turnover_packages_and_expand_document_categories",
            sql: r#"
                ALTER TABLE project_documents
                    RENAME TO project_documents_legacy;

                CREATE TABLE project_documents (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    asset_id TEXT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'other'
                        CHECK (
                            category IN (
                                'drawing',
                                'specification',
                                'datasheet',
                                'manual',
                                'procedure',
                                'certificate',
                                'test_record',
                                'report',
                                'other'
                            )
                        ),
                    revision TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK (
                            status IN (
                                'draft',
                                'for_review',
                                'approved',
                                'superseded'
                            )
                        ),
                    required_for_readiness INTEGER NOT NULL DEFAULT 0
                        CHECK (required_for_readiness IN (0, 1)),
                    original_file_name TEXT NOT NULL,
                    stored_path TEXT NOT NULL UNIQUE,
                    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    file_size INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    FOREIGN KEY (asset_id)
                        REFERENCES assets(id)
                        ON DELETE SET NULL
                );

                INSERT INTO project_documents (
                    id,
                    project_id,
                    asset_id,
                    title,
                    category,
                    revision,
                    status,
                    required_for_readiness,
                    original_file_name,
                    stored_path,
                    mime_type,
                    file_size,
                    notes,
                    created_at,
                    updated_at
                )
                SELECT
                    id,
                    project_id,
                    asset_id,
                    title,
                    category,
                    revision,
                    status,
                    required_for_readiness,
                    original_file_name,
                    stored_path,
                    mime_type,
                    file_size,
                    notes,
                    created_at,
                    updated_at
                FROM project_documents_legacy;

                DROP TABLE project_documents_legacy;

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_id
                ON project_documents(project_id);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_status
                ON project_documents(project_id, status);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_project_category
                ON project_documents(project_id, category);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_asset_id
                ON project_documents(asset_id);

                CREATE INDEX IF NOT EXISTS
                    idx_project_documents_required_readiness
                ON project_documents(project_id, required_for_readiness, status);

                CREATE TABLE IF NOT EXISTS turnover_packages (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    scope_kind TEXT NOT NULL
                        CHECK (scope_kind IN ('system', 'subsystem')),
                    scope_id TEXT NOT NULL,
                    scope_code TEXT NOT NULL DEFAULT '',
                    scope_name TEXT NOT NULL,
                    package_number TEXT NOT NULL COLLATE NOCASE,
                    revision TEXT NOT NULL COLLATE NOCASE,
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'final')),
                    stage_at_generation TEXT NOT NULL
                        CHECK (
                            stage_at_generation IN (
                                'not_started',
                                'in_progress',
                                'ready',
                                'commissioned',
                                'handed_over'
                            )
                        ),
                    blocker_count INTEGER NOT NULL DEFAULT 0,
                    forced_transition_count INTEGER NOT NULL DEFAULT 0,
                    prepared_by TEXT NOT NULL,
                    approved_by TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    snapshot_json TEXT NOT NULL,
                    generated_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    UNIQUE (project_id, package_number, revision)
                );

                CREATE INDEX IF NOT EXISTS
                    idx_turnover_packages_project_generated
                ON turnover_packages(project_id, generated_at DESC);

                CREATE INDEX IF NOT EXISTS
                    idx_turnover_packages_scope
                ON turnover_packages(project_id, scope_kind, scope_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_turnover_package_void_lifecycle",
            sql: r#"
                ALTER TABLE turnover_packages
                    RENAME TO turnover_packages_legacy;

                CREATE TABLE turnover_packages (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    scope_kind TEXT NOT NULL
                        CHECK (scope_kind IN ('system', 'subsystem')),
                    scope_id TEXT NOT NULL,
                    scope_code TEXT NOT NULL DEFAULT '',
                    scope_name TEXT NOT NULL,
                    package_number TEXT NOT NULL COLLATE NOCASE,
                    revision TEXT NOT NULL COLLATE NOCASE,
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'final', 'void')),
                    stage_at_generation TEXT NOT NULL
                        CHECK (
                            stage_at_generation IN (
                                'not_started',
                                'in_progress',
                                'ready',
                                'commissioned',
                                'handed_over'
                            )
                        ),
                    blocker_count INTEGER NOT NULL DEFAULT 0,
                    forced_transition_count INTEGER NOT NULL DEFAULT 0,
                    prepared_by TEXT NOT NULL,
                    approved_by TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    snapshot_json TEXT NOT NULL,
                    generated_at TEXT NOT NULL,
                    voided_at TEXT,
                    void_reason TEXT NOT NULL DEFAULT '',

                    CHECK (
                        (
                            status = 'void'
                            AND voided_at IS NOT NULL
                            AND trim(void_reason) <> ''
                        )
                        OR
                        (
                            status IN ('draft', 'final')
                            AND voided_at IS NULL
                            AND trim(void_reason) = ''
                        )
                    ),

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    UNIQUE (project_id, package_number, revision)
                );

                INSERT INTO turnover_packages (
                    id,
                    project_id,
                    scope_kind,
                    scope_id,
                    scope_code,
                    scope_name,
                    package_number,
                    revision,
                    status,
                    stage_at_generation,
                    blocker_count,
                    forced_transition_count,
                    prepared_by,
                    approved_by,
                    notes,
                    snapshot_json,
                    generated_at,
                    voided_at,
                    void_reason
                )
                SELECT
                    id,
                    project_id,
                    scope_kind,
                    scope_id,
                    scope_code,
                    scope_name,
                    package_number,
                    revision,
                    status,
                    stage_at_generation,
                    blocker_count,
                    forced_transition_count,
                    prepared_by,
                    approved_by,
                    notes,
                    snapshot_json,
                    generated_at,
                    NULL,
                    ''
                FROM turnover_packages_legacy;

                DROP TABLE turnover_packages_legacy;

                CREATE INDEX IF NOT EXISTS
                    idx_turnover_packages_project_generated
                ON turnover_packages(project_id, generated_at DESC);

                CREATE INDEX IF NOT EXISTS
                    idx_turnover_packages_scope
                ON turnover_packages(project_id, scope_kind, scope_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_audit_trail_and_test_record_revisions",
            sql: r#"
                CREATE TABLE IF NOT EXISTS workspace_settings (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );

                INSERT OR IGNORE INTO workspace_settings (
                    key,
                    value,
                    updated_at
                )
                VALUES (
                    'current_operator',
                    '',
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                );

                CREATE TABLE IF NOT EXISTS audit_operation_context (
                    id INTEGER PRIMARY KEY NOT NULL
                        CHECK (id = 1),
                    enabled INTEGER NOT NULL DEFAULT 1
                        CHECK (enabled IN (0, 1)),
                    action TEXT NOT NULL DEFAULT '',
                    actor TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT ''
                );

                INSERT OR IGNORE INTO audit_operation_context (
                    id,
                    enabled,
                    action,
                    actor,
                    reason
                )
                VALUES (1, 1, '', '', '');

                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_label TEXT NOT NULL DEFAULT '',
                    actor TEXT NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    details_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS
                    idx_audit_events_project_created
                ON audit_events(project_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS
                    idx_audit_events_entity
                ON audit_events(project_id, entity_type, entity_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS test_record_revisions (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL,
                    test_record_id TEXT NOT NULL,
                    revision_number INTEGER NOT NULL
                        CHECK (revision_number > 0),
                    snapshot_json TEXT NOT NULL,
                    reopened_by TEXT NOT NULL,
                    reopen_reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,

                    FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,

                    UNIQUE (test_record_id, revision_number)
                );

                CREATE INDEX IF NOT EXISTS
                    idx_test_record_revisions_record
                ON test_record_revisions(test_record_id, revision_number DESC);

                CREATE TRIGGER audit_projects_insert
                AFTER INSERT ON projects
                WHEN COALESCE(
                    (SELECT enabled FROM audit_operation_context WHERE id = 1),
                    1
                ) = 1
                BEGIN
                    INSERT INTO audit_events (
                        id, project_id, entity_type, entity_id, action,
                        entity_label, actor, reason, details_json, created_at
                    )
                    VALUES (
                        lower(hex(randomblob(16))), NEW.id, 'project', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        NEW.name,
                        COALESCE(
                            NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''),
                            NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''),
                            'Local operator'
                        ),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('name', NEW.name, 'status', NEW.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_projects_update
                AFTER UPDATE ON projects
                WHEN COALESCE(
                    (SELECT enabled FROM audit_operation_context WHERE id = 1),
                    1
                ) = 1
                BEGIN
                    INSERT INTO audit_events (
                        id, project_id, entity_type, entity_id, action,
                        entity_label, actor, reason, details_json, created_at
                    )
                    VALUES (
                        lower(hex(randomblob(16))), NEW.id, 'project', NEW.id,
                        COALESCE(
                            NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''),
                            CASE WHEN OLD.status <> NEW.status THEN 'status_changed' ELSE 'updated' END
                        ),
                        NEW.name,
                        COALESCE(
                            NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''),
                            NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''),
                            'Local operator'
                        ),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object(
                            'before', json_object('name', OLD.name, 'status', OLD.status),
                            'after', json_object('name', NEW.name, 'status', NEW.status)
                        ),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_systems_insert
                AFTER INSERT ON systems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'system', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        trim(NEW.code || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('code', NEW.code, 'name', NEW.name, 'stage', NEW.commissioning_stage),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_systems_update
                AFTER UPDATE ON systems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'system', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.commissioning_stage <> NEW.commissioning_stage THEN 'stage_advanced' ELSE 'updated' END),
                        trim(NEW.code || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('code', OLD.code, 'name', OLD.name, 'stage', OLD.commissioning_stage), 'after', json_object('code', NEW.code, 'name', NEW.name, 'stage', NEW.commissioning_stage)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_systems_delete
                BEFORE DELETE ON systems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'system', OLD.id, 'deleted',
                        trim(OLD.code || ' - ' || OLD.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('code', OLD.code, 'name', OLD.name, 'stage', OLD.commissioning_stage),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_subsystems_insert
                AFTER INSERT ON subsystems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM systems WHERE id = NEW.system_id), 'subsystem', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        trim(NEW.code || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('code', NEW.code, 'name', NEW.name, 'stage', NEW.commissioning_stage),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_subsystems_update
                AFTER UPDATE ON subsystems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM systems WHERE id = NEW.system_id), 'subsystem', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.commissioning_stage <> NEW.commissioning_stage THEN 'stage_advanced' ELSE 'updated' END),
                        trim(NEW.code || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('code', OLD.code, 'name', OLD.name, 'stage', OLD.commissioning_stage), 'after', json_object('code', NEW.code, 'name', NEW.name, 'stage', NEW.commissioning_stage)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_subsystems_delete
                BEFORE DELETE ON subsystems
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM systems WHERE id = OLD.system_id), 'subsystem', OLD.id, 'deleted',
                        trim(OLD.code || ' - ' || OLD.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('code', OLD.code, 'name', OLD.name, 'stage', OLD.commissioning_stage),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_assets_insert
                AFTER INSERT ON assets
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'asset', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        trim(NEW.tag || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('tag', NEW.tag, 'name', NEW.name, 'status', NEW.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_assets_update
                AFTER UPDATE ON assets
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'asset', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.status <> NEW.status THEN 'status_changed' ELSE 'updated' END),
                        trim(NEW.tag || ' - ' || NEW.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('tag', OLD.tag, 'name', OLD.name, 'status', OLD.status), 'after', json_object('tag', NEW.tag, 'name', NEW.name, 'status', NEW.status)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_assets_delete
                BEFORE DELETE ON assets
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'asset', OLD.id, 'deleted',
                        trim(OLD.tag || ' - ' || OLD.name),
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('tag', OLD.tag, 'name', OLD.name, 'status', OLD.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_issues_insert
                AFTER INSERT ON issues
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'issue', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', NEW.title, 'priority', NEW.priority, 'status', NEW.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_issues_update
                AFTER UPDATE ON issues
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'issue', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.status <> NEW.status THEN 'status_changed' ELSE 'updated' END),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('title', OLD.title, 'priority', OLD.priority, 'status', OLD.status), 'after', json_object('title', NEW.title, 'priority', NEW.priority, 'status', NEW.status)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_issues_delete
                BEFORE DELETE ON issues
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'issue', OLD.id, 'deleted', OLD.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', OLD.title, 'priority', OLD.priority, 'status', OLD.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_records_insert
                AFTER INSERT ON test_records
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'test_record', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', NEW.title, 'type', NEW.record_type, 'signedOffAt', NEW.signed_off_at),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_records_update
                AFTER UPDATE ON test_records
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                    AND (
                        OLD.asset_id IS NOT NEW.asset_id
                        OR OLD.title <> NEW.title
                        OR OLD.record_type <> NEW.record_type
                        OR OLD.description <> NEW.description
                        OR OLD.executed_by <> NEW.executed_by
                        OR OLD.witnessed_by <> NEW.witnessed_by
                        OR OLD.execution_date IS NOT NEW.execution_date
                        OR OLD.signed_off_by <> NEW.signed_off_by
                        OR OLD.signed_off_at IS NOT NEW.signed_off_at
                        OR OLD.completion_notes <> NEW.completion_notes
                    )
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'test_record', NEW.id,
                        COALESCE(
                            NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''),
                            CASE
                                WHEN OLD.signed_off_at IS NULL AND NEW.signed_off_at IS NOT NULL THEN 'signed'
                                WHEN OLD.signed_off_at IS NOT NULL AND NEW.signed_off_at IS NULL THEN 'reopened'
                                ELSE 'updated'
                            END
                        ),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('title', OLD.title, 'signedOffBy', OLD.signed_off_by, 'signedOffAt', OLD.signed_off_at), 'after', json_object('title', NEW.title, 'signedOffBy', NEW.signed_off_by, 'signedOffAt', NEW.signed_off_at)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_records_delete
                BEFORE DELETE ON test_records
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'test_record', OLD.id, 'deleted', OLD.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', OLD.title, 'type', OLD.record_type, 'signedOffBy', OLD.signed_off_by, 'signedOffAt', OLD.signed_off_at),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_items_insert
                AFTER INSERT ON test_items
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM test_records WHERE id = NEW.test_record_id), 'test_item', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        NEW.description,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('recordId', NEW.test_record_id, 'description', NEW.description, 'result', NEW.result),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_items_update
                AFTER UPDATE ON test_items
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM test_records WHERE id = NEW.test_record_id), 'test_item', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.result <> NEW.result THEN 'result_changed' ELSE 'updated' END),
                        NEW.description,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('recordId', NEW.test_record_id, 'before', json_object('description', OLD.description, 'result', OLD.result), 'after', json_object('description', NEW.description, 'result', NEW.result)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_test_items_delete
                BEFORE DELETE ON test_items
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), (SELECT project_id FROM test_records WHERE id = OLD.test_record_id), 'test_item', OLD.id, 'deleted', OLD.description,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('recordId', OLD.test_record_id, 'description', OLD.description, 'result', OLD.result),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_documents_insert
                AFTER INSERT ON project_documents
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'document', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), 'created'),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', NEW.title, 'revision', NEW.revision, 'status', NEW.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_documents_update
                AFTER UPDATE ON project_documents
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'document', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN OLD.status <> NEW.status THEN 'status_changed' ELSE 'updated' END),
                        NEW.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('before', json_object('title', OLD.title, 'revision', OLD.revision, 'status', OLD.status), 'after', json_object('title', NEW.title, 'revision', NEW.revision, 'status', NEW.status)),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_documents_delete
                BEFORE DELETE ON project_documents
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'document', OLD.id, 'deleted', OLD.title,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('title', OLD.title, 'revision', OLD.revision, 'status', OLD.status),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_turnover_insert
                AFTER INSERT ON turnover_packages
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'turnover_package', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN NEW.status = 'final' THEN 'finalized' ELSE 'created' END),
                        NEW.package_number || ' Rev ' || NEW.revision,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF(NEW.prepared_by, ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('packageNumber', NEW.package_number, 'revision', NEW.revision, 'status', NEW.status, 'scope', NEW.scope_name),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_turnover_update
                AFTER UPDATE ON turnover_packages
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), NEW.project_id, 'turnover_package', NEW.id,
                        COALESCE(NULLIF((SELECT action FROM audit_operation_context WHERE id = 1), ''), CASE WHEN NEW.status = 'void' AND OLD.status <> 'void' THEN 'voided' ELSE 'updated' END),
                        NEW.package_number || ' Rev ' || NEW.revision,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE(NULLIF((SELECT reason FROM audit_operation_context WHERE id = 1), ''), NEW.void_reason, ''),
                        json_object('beforeStatus', OLD.status, 'afterStatus', NEW.status, 'packageNumber', NEW.package_number, 'revision', NEW.revision),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;

                CREATE TRIGGER audit_turnover_delete
                BEFORE DELETE ON turnover_packages
                WHEN COALESCE((SELECT enabled FROM audit_operation_context WHERE id = 1), 1) = 1
                BEGIN
                    INSERT INTO audit_events VALUES (
                        lower(hex(randomblob(16))), OLD.project_id, 'turnover_package', OLD.id, 'deleted',
                        OLD.package_number || ' Rev ' || OLD.revision,
                        COALESCE(NULLIF((SELECT actor FROM audit_operation_context WHERE id = 1), ''), NULLIF((SELECT value FROM workspace_settings WHERE key = 'current_operator'), ''), 'Local operator'),
                        COALESCE((SELECT reason FROM audit_operation_context WHERE id = 1), ''),
                        json_object('packageNumber', OLD.package_number, 'revision', OLD.revision, 'status', OLD.status, 'scope', OLD.scope_name),
                        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    );
                END;
            "#,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:commissioning-workspace.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            save_report_pdf,
            save_audit_history_csv,
            import_project_document,
            open_project_document,
            delete_project_document_file,
            project_deletion::delete_project,
            project_transfer::create_project_package,
            project_transfer::inspect_project_package,
            project_transfer::import_project_package,
            backup::create_workspace_backup,
            backup::get_automatic_workspace_backup_status,
            backup::inspect_workspace_backup,
            backup::restore_workspace_backup,
            backup::run_automatic_workspace_backup,
            backup::open_workspace_backup_directory,
            backup::restart_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
