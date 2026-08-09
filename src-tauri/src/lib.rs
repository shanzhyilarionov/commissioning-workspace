use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{Migration, MigrationKind};

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
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
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
        Some("docx") => {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
        Some("ppt") => "application/vnd.ms-powerpoint",
        Some("pptx") => {
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        }
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

    let canonical_root = std::fs::canonicalize(storage_root)
        .map_err(|error| format!("Failed to resolve the managed document storage directory: {error}"))?;

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
fn open_project_document(
    app: tauri::AppHandle,
    stored_path: String,
) -> Result<(), String> {
    let path = managed_document_path(&app, &stored_path)?
        .ok_or_else(|| "The managed document file no longer exists.".to_string())?;

    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Failed to open the document: {error}"))
}

#[tauri::command]
fn delete_project_document_file(
    app: tauri::AppHandle,
    stored_path: String,
) -> Result<(), String> {
    let Some(path) = managed_document_path(&app, &stored_path)? else {
        return Ok(());
    };

    let storage_root = project_storage_root(&app)?;

    std::fs::remove_file(&path)
        .map_err(|error| format!("Failed to delete the managed document: {error}"))?;

    remove_empty_parent_directories(&path, &storage_root);

    Ok(())
}

#[tauri::command]
fn delete_project_document_project_files(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    validate_storage_id(&project_id, "project ID")?;

    let project_directory = project_storage_root(&app)?.join(project_id);

    if project_directory.exists() {
        std::fs::remove_dir_all(project_directory)
            .map_err(|error| format!("Failed to delete the project document storage: {error}"))?;
    }

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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:commissioning-workspace.db",
                    migrations,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            save_report_pdf,
            import_project_document,
            open_project_document,
            delete_project_document_file,
            delete_project_document_project_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}