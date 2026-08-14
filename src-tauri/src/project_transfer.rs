use chrono::Utc;
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OpenFlags, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use tempfile::TempDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const PACKAGE_FORMAT_VERSION: u32 = 1;
const MANIFEST_ENTRY: &str = "manifest.json";
const DATABASE_ENTRY: &str = "data/projects.db";
const DOCUMENTS_PREFIX: &str = "data/documents";
const MAX_MANIFEST_SIZE: u64 = 2 * 1024 * 1024;
const MAX_ENTRY_COUNT: usize = 100_000;
const MAX_UNCOMPRESSED_SIZE: u64 = 20 * 1024 * 1024 * 1024;

const PROJECT_COLUMNS: &[&str] = &[
    "id",
    "name",
    "client",
    "location",
    "description",
    "status",
    "created_at",
    "updated_at",
];
const SYSTEM_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "code",
    "name",
    "description",
    "created_at",
    "updated_at",
    "commissioning_stage",
];
const SUBSYSTEM_COLUMNS: &[&str] = &[
    "id",
    "system_id",
    "code",
    "name",
    "description",
    "created_at",
    "updated_at",
    "commissioning_stage",
];
const ASSET_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "system_name",
    "tag",
    "name",
    "asset_type",
    "status",
    "description",
    "created_at",
    "updated_at",
    "system_id",
    "subsystem_id",
];
const ISSUE_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "asset_id",
    "title",
    "description",
    "priority",
    "status",
    "owner",
    "due_date",
    "created_at",
    "updated_at",
];
const TEST_RECORD_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "asset_id",
    "title",
    "record_type",
    "description",
    "created_at",
    "updated_at",
    "executed_by",
    "witnessed_by",
    "execution_date",
    "signed_off_by",
    "signed_off_at",
    "completion_notes",
];
const TEST_ITEM_COLUMNS: &[&str] = &[
    "id",
    "test_record_id",
    "description",
    "acceptance_criteria",
    "result",
    "notes",
    "sort_order",
    "created_at",
    "updated_at",
];
const ISSUE_TEST_ITEM_LINK_COLUMNS: &[&str] = &["issue_id", "test_item_id"];
const DOCUMENT_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "asset_id",
    "title",
    "category",
    "revision",
    "status",
    "required_for_readiness",
    "original_file_name",
    "stored_path",
    "mime_type",
    "file_size",
    "notes",
    "created_at",
    "updated_at",
];
const READINESS_COLUMNS: &[&str] = &[
    "id",
    "system_id",
    "subsystem_id",
    "from_stage",
    "to_stage",
    "recorded_by",
    "reason",
    "is_forced",
    "blocker_count",
    "blockers_json",
    "created_at",
];
const TURNOVER_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "scope_kind",
    "scope_id",
    "scope_code",
    "scope_name",
    "package_number",
    "revision",
    "status",
    "stage_at_generation",
    "blocker_count",
    "forced_transition_count",
    "prepared_by",
    "approved_by",
    "notes",
    "snapshot_json",
    "generated_at",
    "voided_at",
    "void_reason",
];
const TEST_RECORD_REVISION_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "test_record_id",
    "revision_number",
    "snapshot_json",
    "reopened_by",
    "reopen_reason",
    "created_at",
];
const AUDIT_EVENT_COLUMNS: &[&str] = &[
    "id",
    "project_id",
    "entity_type",
    "entity_id",
    "action",
    "entity_label",
    "actor",
    "reason",
    "details_json",
    "created_at",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackageProject {
    original_id: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPackageManifest {
    format: String,
    format_version: u32,
    application_version: String,
    created_at: String,
    schema_version: u32,
    database_path: String,
    projects: Vec<ProjectPackageProject>,
    files: Vec<ProjectPackageManifestFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPackageManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackageSummary {
    path: String,
    created_at: String,
    application_version: String,
    schema_version: u32,
    projects: Vec<ProjectPackageProject>,
    file_count: usize,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackageInspection {
    path: String,
    created_at: String,
    application_version: String,
    schema_version: u32,
    projects: Vec<ProjectPackageProject>,
    file_count: usize,
    total_bytes: u64,
    compatible: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedProjectSummary {
    original_id: String,
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPackageImportSummary {
    imported_at: String,
    projects: Vec<ImportedProjectSummary>,
    file_count: usize,
    total_bytes: u64,
}

struct ValidatedProjectPackage {
    manifest: ProjectPackageManifest,
    file_count: usize,
    total_bytes: u64,
}

fn open_read_only_database(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Failed to open the project package database: {error}"))
}

fn read_schema_version(connection: &Connection) -> Result<u32, String> {
    let version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to read the package schema version: {error}"))?;
    u32::try_from(version).map_err(|_| "The package schema version is invalid.".to_string())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file =
        File::open(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn validate_archive_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('/') || name.starts_with('\\') || name.contains('\\') {
        return Err(format!(
            "The project package contains an unsafe path: {name}"
        ));
    }
    if Path::new(name)
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "The project package contains an unsafe path: {name}"
        ));
    }
    Ok(())
}

fn document_archive_path(document_id: &str) -> String {
    format!("{DOCUMENTS_PREFIX}/{document_id}")
}

fn valid_document_archive_path(path: &str) -> bool {
    let Some(document_id) = path.strip_prefix(&format!("{DOCUMENTS_PREFIX}/")) else {
        return false;
    };
    !document_id.is_empty()
        && !document_id.contains('/')
        && super::validate_storage_id(document_id, "document ID").is_ok()
}

fn read_manifest<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<ProjectPackageManifest, String> {
    let mut entry = archive.by_name(MANIFEST_ENTRY).map_err(|_| {
        "The selected file is not a valid Commissioning Workspace project package.".to_string()
    })?;
    if entry.size() > MAX_MANIFEST_SIZE {
        return Err("The project package manifest is unexpectedly large.".to_string());
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read the project package manifest: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("The project package manifest is invalid: {error}"))
}

fn validate_manifest(manifest: &ProjectPackageManifest) -> Result<(), String> {
    if manifest.format != "commissioning-workspace-project-package" {
        return Err(
            "The selected file is not a Commissioning Workspace project package.".to_string(),
        );
    }
    if manifest.format_version != PACKAGE_FORMAT_VERSION {
        return Err(format!(
            "Project package format version {} is not supported by this application.",
            manifest.format_version
        ));
    }
    if manifest.database_path != DATABASE_ENTRY {
        return Err("The project package does not reference the expected database.".to_string());
    }
    if manifest.projects.is_empty() {
        return Err("The project package does not contain any projects.".to_string());
    }

    let mut project_ids = HashSet::new();
    for project in &manifest.projects {
        super::validate_storage_id(&project.original_id, "project ID")?;
        if project.name.trim().is_empty() || !project_ids.insert(project.original_id.as_str()) {
            return Err("The project package contains invalid project metadata.".to_string());
        }
    }

    let mut paths = HashSet::new();
    let mut has_database = false;
    for file in &manifest.files {
        validate_archive_entry_name(&file.path)?;
        if file.path == DATABASE_ENTRY {
            has_database = true;
        } else if !valid_document_archive_path(&file.path) {
            return Err(format!(
                "The project package contains an unsupported file: {}",
                file.path
            ));
        }
        if !paths.insert(file.path.as_str()) {
            return Err(format!(
                "The project package manifest contains a duplicate path: {}",
                file.path
            ));
        }
        if file.sha256.len() != 64
            || !file
                .sha256
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(format!("The checksum for {} is invalid.", file.path));
        }
    }
    if !has_database {
        return Err("The project package does not contain its project database.".to_string());
    }
    Ok(())
}

fn validate_archive(path: &Path) -> Result<ValidatedProjectPackage, String> {
    let file = File::open(path)
        .map_err(|error| format!("Failed to open the selected project package: {error}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|error| format!("The selected project package cannot be read: {error}"))?;
    if archive.len() > MAX_ENTRY_COUNT {
        return Err("The project package contains too many files.".to_string());
    }

    let manifest = read_manifest(&mut archive)?;
    validate_manifest(&manifest)?;
    if archive.len() != manifest.files.len() + 1 {
        return Err("The project package contents do not match its manifest.".to_string());
    }

    let mut actual_paths = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect the project package: {error}"))?;
        validate_archive_entry_name(entry.name())?;
        if !actual_paths.insert(entry.name().to_string()) {
            return Err("The project package contains duplicate file entries.".to_string());
        }
    }

    let total_bytes = manifest.files.iter().try_fold(0_u64, |total, file| {
        total
            .checked_add(file.size)
            .ok_or_else(|| "The project package size is invalid.".to_string())
    })?;
    if total_bytes > MAX_UNCOMPRESSED_SIZE {
        return Err("The project package is larger than the supported import limit.".to_string());
    }

    for expected in &manifest.files {
        let mut entry = archive
            .by_name(&expected.path)
            .map_err(|_| format!("The project package is missing {}.", expected.path))?;
        if entry.size() != expected.size {
            return Err(format!(
                "The project package entry {} has an invalid size.",
                expected.path
            ));
        }
        let mut hasher = Sha256::new();
        let copied = io::copy(
            &mut entry.by_ref().take(expected.size.saturating_add(1)),
            &mut HashWriter(&mut hasher),
        )
        .map_err(|error| format!("Failed to validate {}: {error}", expected.path))?;
        if copied != expected.size {
            return Err(format!(
                "The project package entry {} exceeds its declared size.",
                expected.path
            ));
        }
        if format!("{:x}", hasher.finalize()) != expected.sha256.to_ascii_lowercase() {
            return Err(format!(
                "The project package entry {} failed checksum validation.",
                expected.path
            ));
        }
    }

    Ok(ValidatedProjectPackage {
        file_count: manifest.files.len(),
        total_bytes,
        manifest,
    })
}

struct HashWriter<'a>(&'a mut Sha256);

impl Write for HashWriter<'_> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.0.update(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn extract_and_validate_package(
    package_path: &Path,
    destination: &Path,
) -> Result<ValidatedProjectPackage, String> {
    let validated = validate_archive(package_path)?;
    let file = File::open(package_path)
        .map_err(|error| format!("Failed to reopen the project package: {error}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|error| format!("The selected project package cannot be read: {error}"))?;

    for expected in &validated.manifest.files {
        let mut entry = archive
            .by_name(&expected.path)
            .map_err(|_| format!("The project package is missing {}.", expected.path))?;
        let output_path = destination.join(&expected.path);
        let parent = output_path
            .parent()
            .ok_or_else(|| "The project package contains an invalid path.".to_string())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to prepare project package storage: {error}"))?;
        let mut output = BufWriter::new(
            File::create(&output_path)
                .map_err(|error| format!("Failed to extract {}: {error}", expected.path))?,
        );
        io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Failed to extract {}: {error}", expected.path))?;
        output
            .flush()
            .map_err(|error| format!("Failed to finalize {}: {error}", expected.path))?;
    }

    validate_package_database(&destination.join(DATABASE_ENTRY), &validated.manifest)?;
    Ok(validated)
}

fn validate_package_database(
    database_path: &Path,
    manifest: &ProjectPackageManifest,
) -> Result<(), String> {
    super::backup::validate_database(database_path)?;
    let connection = open_read_only_database(database_path)?;
    let schema_version = read_schema_version(&connection)?;
    if schema_version != manifest.schema_version {
        return Err("The project package schema does not match its manifest.".to_string());
    }

    let mut statement = connection
        .prepare("SELECT id FROM projects ORDER BY id")
        .map_err(|error| format!("Failed to inspect packaged projects: {error}"))?;
    let database_project_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Failed to inspect packaged projects: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to inspect packaged projects: {error}"))?;
    let mut manifest_project_ids = manifest
        .projects
        .iter()
        .map(|project| project.original_id.clone())
        .collect::<Vec<_>>();
    manifest_project_ids.sort();
    if database_project_ids != manifest_project_ids {
        return Err("The project package project list does not match its database.".to_string());
    }

    let mut statement = connection
        .prepare("SELECT id FROM project_documents ORDER BY id")
        .map_err(|error| format!("Failed to inspect packaged documents: {error}"))?;
    let document_paths = statement
        .query_map([], |row| {
            row.get::<_, String>(0)
                .map(|document_id| document_archive_path(&document_id))
        })
        .map_err(|error| format!("Failed to inspect packaged documents: {error}"))?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|error| format!("Failed to inspect packaged documents: {error}"))?;
    let manifest_document_paths = manifest
        .files
        .iter()
        .filter(|file| file.path != DATABASE_ENTRY)
        .map(|file| file.path.clone())
        .collect::<HashSet<_>>();
    if document_paths != manifest_document_paths {
        return Err("The project package document list does not match its database.".to_string());
    }
    Ok(())
}

fn load_rows(
    connection: &Connection,
    table: &str,
    columns: &[&str],
) -> Result<Vec<Vec<SqlValue>>, String> {
    let sql = format!("SELECT {} FROM {table}", columns.join(", "));
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Failed to read {table}: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            (0..columns.len())
                .map(|index| row.get::<_, SqlValue>(index))
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|error| format!("Failed to read {table}: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read {table}: {error}"))?;
    Ok(rows)
}

fn insert_rows(
    transaction: &Transaction<'_>,
    table: &str,
    columns: &[&str],
    rows: &[Vec<SqlValue>],
) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    let placeholders = (1..=columns.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({placeholders})",
        columns.join(", ")
    );
    let mut statement = transaction
        .prepare(&sql)
        .map_err(|error| format!("Failed to prepare imported {table}: {error}"))?;
    for row in rows {
        statement
            .execute(params_from_iter(row.iter()))
            .map_err(|error| format!("Failed to import {table}: {error}"))?;
    }
    Ok(())
}

fn text_value(value: &SqlValue, field: &str) -> Result<String, String> {
    match value {
        SqlValue::Text(value) => Ok(value.clone()),
        _ => Err(format!("The project package contains an invalid {field}.")),
    }
}

fn set_required_mapping(
    row: &mut [SqlValue],
    index: usize,
    mapping: &HashMap<String, String>,
    field: &str,
) -> Result<(), String> {
    let old_value = text_value(&row[index], field)?;
    let new_value = mapping
        .get(&old_value)
        .ok_or_else(|| format!("The project package contains an invalid {field}."))?;
    row[index] = SqlValue::Text(new_value.clone());
    Ok(())
}

fn set_optional_mapping(
    row: &mut [SqlValue],
    index: usize,
    mapping: &HashMap<String, String>,
    field: &str,
) -> Result<(), String> {
    if matches!(row[index], SqlValue::Null) {
        return Ok(());
    }
    set_required_mapping(row, index, mapping, field)
}

fn new_identifier(transaction: &Transaction<'_>, prefix: &str) -> Result<String, String> {
    let random: String = transaction
        .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
        .map_err(|error| format!("Failed to generate an imported record ID: {error}"))?;
    Ok(format!("{prefix}-{random}"))
}

fn build_id_map(
    transaction: &Transaction<'_>,
    rows: &[Vec<SqlValue>],
    prefix: &str,
    field: &str,
) -> Result<HashMap<String, String>, String> {
    let mut mapping = HashMap::with_capacity(rows.len());
    for row in rows {
        let old_id = text_value(&row[0], field)?;
        if mapping
            .insert(old_id, new_identifier(transaction, prefix)?)
            .is_some()
        {
            return Err(format!("The project package contains a duplicate {field}."));
        }
    }
    Ok(mapping)
}

fn merge_id_maps(mappings: &[&HashMap<String, String>]) -> Result<HashMap<String, String>, String> {
    let mut merged = HashMap::new();
    for mapping in mappings {
        for (old_id, new_id) in *mapping {
            if let Some(existing) = merged.insert(old_id.clone(), new_id.clone()) {
                if existing != *new_id {
                    return Err(
                        "The project package contains record IDs reused across tables.".to_string(),
                    );
                }
            }
        }
    }
    Ok(merged)
}

fn remap_json_value(value: &mut JsonValue, mapping: &HashMap<String, String>) {
    match value {
        JsonValue::String(text) => {
            if let Some(replacement) = mapping.get(text) {
                *text = replacement.clone();
            }
        }
        JsonValue::Array(values) => {
            for value in values {
                remap_json_value(value, mapping);
            }
        }
        JsonValue::Object(values) => {
            for value in values.values_mut() {
                remap_json_value(value, mapping);
            }
        }
        _ => {}
    }
}

fn remap_json_column(
    row: &mut [SqlValue],
    index: usize,
    mapping: &HashMap<String, String>,
    field: &str,
) -> Result<(), String> {
    let text = text_value(&row[index], field)?;
    let mut value: JsonValue = serde_json::from_str(&text)
        .map_err(|error| format!("The project package contains invalid {field}: {error}"))?;
    remap_json_value(&mut value, mapping);
    row[index] = SqlValue::Text(
        serde_json::to_string(&value)
            .map_err(|error| format!("Failed to prepare imported {field}: {error}"))?,
    );
    Ok(())
}

fn remap_text_if_known(
    row: &mut [SqlValue],
    index: usize,
    mapping: &HashMap<String, String>,
    field: &str,
) -> Result<(), String> {
    let old_value = text_value(&row[index], field)?;
    if let Some(new_value) = mapping.get(&old_value) {
        row[index] = SqlValue::Text(new_value.clone());
    }
    Ok(())
}

fn unique_imported_name(base_name: &str, used_names: &mut HashSet<String>) -> String {
    if used_names.insert(base_name.to_lowercase()) {
        return base_name.to_string();
    }
    let imported = format!("{base_name} (Imported)");
    if used_names.insert(imported.to_lowercase()) {
        return imported;
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base_name} (Imported {index})");
        if used_names.insert(candidate.to_lowercase()) {
            return candidate;
        }
        index += 1;
    }
}

fn valid_file_name(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.contains('/')
        && !value.contains('\\')
}

fn transform_rows(
    rows: &mut [Vec<SqlValue>],
    mappings: &[(usize, &HashMap<String, String>, bool, &str)],
) -> Result<(), String> {
    for row in rows {
        for (index, mapping, optional, field) in mappings {
            if *optional {
                set_optional_mapping(row, *index, mapping, field)?;
            } else {
                set_required_mapping(row, *index, mapping, field)?;
            }
        }
    }
    Ok(())
}

fn import_package_data(
    destination_database: &Path,
    projects_root: &Path,
    extracted_root: &Path,
    validated: &ValidatedProjectPackage,
) -> Result<Vec<ImportedProjectSummary>, String> {
    let source_database = extracted_root.join(DATABASE_ENTRY);
    let source = open_read_only_database(&source_database)?;
    let mut destination = Connection::open(destination_database)
        .map_err(|error| format!("Failed to open the workspace database: {error}"))?;
    destination
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Failed to prepare the workspace database: {error}"))?;
    let transaction = destination
        .transaction()
        .map_err(|error| format!("Failed to start the project import: {error}"))?;

    let mut project_rows = load_rows(&source, "projects", PROJECT_COLUMNS)?;
    let mut system_rows = load_rows(&source, "systems", SYSTEM_COLUMNS)?;
    let mut subsystem_rows = load_rows(&source, "subsystems", SUBSYSTEM_COLUMNS)?;
    let mut asset_rows = load_rows(&source, "assets", ASSET_COLUMNS)?;
    let mut issue_rows = load_rows(&source, "issues", ISSUE_COLUMNS)?;
    let mut test_record_rows = load_rows(&source, "test_records", TEST_RECORD_COLUMNS)?;
    let mut test_item_rows = load_rows(&source, "test_items", TEST_ITEM_COLUMNS)?;
    let mut link_rows = load_rows(
        &source,
        "issue_test_item_links",
        ISSUE_TEST_ITEM_LINK_COLUMNS,
    )?;
    let mut document_rows = load_rows(&source, "project_documents", DOCUMENT_COLUMNS)?;
    let mut readiness_rows = load_rows(&source, "readiness_stage_records", READINESS_COLUMNS)?;
    let mut turnover_rows = load_rows(&source, "turnover_packages", TURNOVER_COLUMNS)?;
    let mut revision_rows = load_rows(
        &source,
        "test_record_revisions",
        TEST_RECORD_REVISION_COLUMNS,
    )?;
    let mut audit_rows = load_rows(&source, "audit_events", AUDIT_EVENT_COLUMNS)?;

    let project_map = build_id_map(&transaction, &project_rows, "project", "project ID")?;
    let system_map = build_id_map(&transaction, &system_rows, "system", "system ID")?;
    let subsystem_map = build_id_map(&transaction, &subsystem_rows, "subsystem", "subsystem ID")?;
    let asset_map = build_id_map(&transaction, &asset_rows, "asset", "asset ID")?;
    let issue_map = build_id_map(&transaction, &issue_rows, "issue", "issue ID")?;
    let test_record_map = build_id_map(
        &transaction,
        &test_record_rows,
        "test-record",
        "test record ID",
    )?;
    let test_item_map = build_id_map(&transaction, &test_item_rows, "test-item", "test item ID")?;
    let document_map = build_id_map(&transaction, &document_rows, "document", "document ID")?;
    let readiness_map = build_id_map(
        &transaction,
        &readiness_rows,
        "readiness",
        "readiness record ID",
    )?;
    let turnover_map = build_id_map(
        &transaction,
        &turnover_rows,
        "turnover",
        "turnover package ID",
    )?;
    let revision_map = build_id_map(
        &transaction,
        &revision_rows,
        "test-record-revision",
        "test record revision ID",
    )?;
    let audit_map = build_id_map(
        &transaction,
        &audit_rows,
        "audit-event",
        "audit event ID",
    )?;
    let all_ids = merge_id_maps(&[
        &project_map,
        &system_map,
        &subsystem_map,
        &asset_map,
        &issue_map,
        &test_record_map,
        &test_item_map,
        &document_map,
        &readiness_map,
        &turnover_map,
        &revision_map,
        &audit_map,
    ])?;

    let mut existing_names = {
        let mut statement = transaction
            .prepare("SELECT name FROM projects")
            .map_err(|error| format!("Failed to inspect existing projects: {error}"))?;
        let names = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Failed to inspect existing projects: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect existing projects: {error}"))?
            .into_iter()
            .map(|name| name.to_lowercase())
            .collect::<HashSet<_>>();
        names
    };

    let mut imported_projects = Vec::with_capacity(project_rows.len());
    for row in &mut project_rows {
        let old_id = text_value(&row[0], "project ID")?;
        let old_name = text_value(&row[1], "project name")?;
        let new_id = project_map
            .get(&old_id)
            .ok_or_else(|| "The project package contains an invalid project ID.".to_string())?
            .clone();
        let new_name = unique_imported_name(&old_name, &mut existing_names);
        row[0] = SqlValue::Text(new_id.clone());
        row[1] = SqlValue::Text(new_name.clone());
        imported_projects.push(ImportedProjectSummary {
            original_id: old_id,
            id: new_id,
            name: new_name,
        });
    }
    let imported_original_ids = imported_projects
        .iter()
        .map(|project| project.original_id.as_str())
        .collect::<HashSet<_>>();
    let manifest_original_ids = validated
        .manifest
        .projects
        .iter()
        .map(|project| project.original_id.as_str())
        .collect::<HashSet<_>>();
    if imported_original_ids != manifest_original_ids {
        return Err("The imported project result does not match the package manifest.".to_string());
    }

    transform_rows(
        &mut system_rows,
        &[
            (0, &system_map, false, "system ID"),
            (1, &project_map, false, "system project ID"),
        ],
    )?;
    transform_rows(
        &mut subsystem_rows,
        &[
            (0, &subsystem_map, false, "subsystem ID"),
            (1, &system_map, false, "subsystem system ID"),
        ],
    )?;
    transform_rows(
        &mut asset_rows,
        &[
            (0, &asset_map, false, "asset ID"),
            (1, &project_map, false, "asset project ID"),
            (10, &system_map, true, "asset system ID"),
            (11, &subsystem_map, true, "asset subsystem ID"),
        ],
    )?;
    transform_rows(
        &mut issue_rows,
        &[
            (0, &issue_map, false, "issue ID"),
            (1, &project_map, false, "issue project ID"),
            (2, &asset_map, true, "issue asset ID"),
        ],
    )?;
    transform_rows(
        &mut test_record_rows,
        &[
            (0, &test_record_map, false, "test record ID"),
            (1, &project_map, false, "test record project ID"),
            (2, &asset_map, true, "test record asset ID"),
        ],
    )?;
    transform_rows(
        &mut test_item_rows,
        &[
            (0, &test_item_map, false, "test item ID"),
            (1, &test_record_map, false, "test item record ID"),
        ],
    )?;
    transform_rows(
        &mut link_rows,
        &[
            (0, &issue_map, false, "linked issue ID"),
            (1, &test_item_map, false, "linked test item ID"),
        ],
    )?;

    let prepared_projects_root = extracted_root.join("prepared-projects");
    for row in &mut document_rows {
        let old_document_id = text_value(&row[0], "document ID")?;
        let old_project_id = text_value(&row[1], "document project ID")?;
        let original_file_name = text_value(&row[8], "document file name")?;
        if !valid_file_name(&original_file_name) {
            return Err("The project package contains an invalid document file name.".to_string());
        }
        let new_document_id = document_map
            .get(&old_document_id)
            .ok_or_else(|| "The project package contains an invalid document ID.".to_string())?;
        let new_project_id = project_map
            .get(&old_project_id)
            .ok_or_else(|| "The project package contains an invalid project ID.".to_string())?;
        let packaged_file = extracted_root.join(document_archive_path(&old_document_id));
        let prepared_file = prepared_projects_root
            .join(new_project_id)
            .join("documents")
            .join(new_document_id)
            .join(&original_file_name);
        let prepared_parent = prepared_file
            .parent()
            .ok_or_else(|| "Failed to prepare imported document storage.".to_string())?;
        fs::create_dir_all(prepared_parent)
            .map_err(|error| format!("Failed to prepare imported document storage: {error}"))?;
        fs::copy(&packaged_file, &prepared_file)
            .map_err(|error| format!("Failed to prepare an imported document: {error}"))?;
        row[0] = SqlValue::Text(new_document_id.clone());
        row[1] = SqlValue::Text(new_project_id.clone());
        set_optional_mapping(row, 2, &asset_map, "document asset ID")?;
        row[9] = SqlValue::Text(
            projects_root
                .join(new_project_id)
                .join("documents")
                .join(new_document_id)
                .join(original_file_name)
                .to_string_lossy()
                .into_owned(),
        );
    }

    for row in &mut readiness_rows {
        set_required_mapping(row, 0, &readiness_map, "readiness record ID")?;
        set_optional_mapping(row, 1, &system_map, "readiness system ID")?;
        set_optional_mapping(row, 2, &subsystem_map, "readiness subsystem ID")?;
        remap_json_column(row, 9, &all_ids, "readiness blocker data")?;
    }
    for row in &mut turnover_rows {
        set_required_mapping(row, 0, &turnover_map, "turnover package ID")?;
        set_required_mapping(row, 1, &project_map, "turnover project ID")?;
        let scope_kind = text_value(&row[2], "turnover scope kind")?;
        match scope_kind.as_str() {
            "system" => set_required_mapping(row, 3, &system_map, "turnover scope ID")?,
            "subsystem" => set_required_mapping(row, 3, &subsystem_map, "turnover scope ID")?,
            _ => return Err("The project package contains an invalid turnover scope.".to_string()),
        }
        remap_json_column(row, 15, &all_ids, "turnover snapshot")?;
    }
    transform_rows(
        &mut revision_rows,
        &[
            (0, &revision_map, false, "test record revision ID"),
            (1, &project_map, false, "test record revision project ID"),
            (2, &test_record_map, false, "test record revision record ID"),
        ],
    )?;
    for row in &mut revision_rows {
        remap_json_column(row, 4, &all_ids, "test record revision snapshot")?;
    }
    transform_rows(
        &mut audit_rows,
        &[
            (0, &audit_map, false, "audit event ID"),
            (1, &project_map, false, "audit event project ID"),
        ],
    )?;
    for row in &mut audit_rows {
        remap_text_if_known(row, 3, &all_ids, "audit event entity ID")?;
        remap_json_column(row, 8, &all_ids, "audit event details")?;
    }

    transaction
        .execute(
            "
                UPDATE audit_operation_context
                SET enabled = 0, action = '', actor = '', reason = ''
                WHERE id = 1
            ",
            [],
        )
        .map_err(|error| format!("Failed to pause audit capture during import: {error}"))?;

    insert_rows(&transaction, "projects", PROJECT_COLUMNS, &project_rows)?;
    insert_rows(&transaction, "systems", SYSTEM_COLUMNS, &system_rows)?;
    insert_rows(
        &transaction,
        "subsystems",
        SUBSYSTEM_COLUMNS,
        &subsystem_rows,
    )?;
    insert_rows(&transaction, "assets", ASSET_COLUMNS, &asset_rows)?;
    insert_rows(&transaction, "issues", ISSUE_COLUMNS, &issue_rows)?;
    insert_rows(
        &transaction,
        "test_records",
        TEST_RECORD_COLUMNS,
        &test_record_rows,
    )?;
    insert_rows(
        &transaction,
        "test_items",
        TEST_ITEM_COLUMNS,
        &test_item_rows,
    )?;
    insert_rows(
        &transaction,
        "issue_test_item_links",
        ISSUE_TEST_ITEM_LINK_COLUMNS,
        &link_rows,
    )?;
    insert_rows(
        &transaction,
        "project_documents",
        DOCUMENT_COLUMNS,
        &document_rows,
    )?;
    insert_rows(
        &transaction,
        "readiness_stage_records",
        READINESS_COLUMNS,
        &readiness_rows,
    )?;
    insert_rows(
        &transaction,
        "turnover_packages",
        TURNOVER_COLUMNS,
        &turnover_rows,
    )?;
    insert_rows(
        &transaction,
        "test_record_revisions",
        TEST_RECORD_REVISION_COLUMNS,
        &revision_rows,
    )?;
    insert_rows(
        &transaction,
        "audit_events",
        AUDIT_EVENT_COLUMNS,
        &audit_rows,
    )?;

    transaction
        .execute(
            "
                UPDATE audit_operation_context
                SET enabled = 1, action = '', actor = '', reason = ''
                WHERE id = 1
            ",
            [],
        )
        .map_err(|error| format!("Failed to resume audit capture after import: {error}"))?;

    let relationship_errors: i64 = transaction
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("Failed to validate imported relationships: {error}"))?;
    if relationship_errors != 0 {
        return Err("The imported projects contain invalid relationships.".to_string());
    }

    fs::create_dir_all(projects_root)
        .map_err(|error| format!("Failed to prepare managed document storage: {error}"))?;
    let mut moved_directories = Vec::new();
    for project in &imported_projects {
        let prepared = prepared_projects_root.join(&project.id);
        if !prepared.exists() {
            continue;
        }
        let destination = projects_root.join(&project.id);
        if destination.exists() {
            for moved in moved_directories.iter().rev() {
                let _ = fs::remove_dir_all(moved);
            }
            return Err("An imported project document directory already exists.".to_string());
        }
        if let Err(error) = fs::rename(&prepared, &destination) {
            for moved in moved_directories.iter().rev() {
                let _ = fs::remove_dir_all(moved);
            }
            return Err(format!("Failed to install imported documents: {error}"));
        }
        moved_directories.push(destination);
    }

    if let Err(error) = transaction.commit() {
        let mut cleanup_failed = false;
        for moved in moved_directories.iter().rev() {
            if fs::remove_dir_all(moved).is_err() {
                cleanup_failed = true;
            }
        }
        if cleanup_failed {
            return Err(format!(
                "Failed to commit the project import: {error}. Imported document cleanup also failed."
            ));
        }
        return Err(format!("Failed to commit the project import: {error}"));
    }

    imported_projects.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(imported_projects)
}

fn selected_projects_and_prune(
    database_path: &Path,
    project_ids: &[String],
) -> Result<Vec<ProjectPackageProject>, String> {
    let connection = Connection::open(database_path)
        .map_err(|error| format!("Failed to prepare the project package database: {error}"))?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Failed to prepare the project package database: {error}"))?;
    let placeholders = (1..=project_ids.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, name FROM projects WHERE id IN ({placeholders}) ORDER BY lower(name), id"
    );
    let mut statement = connection
        .prepare(&query)
        .map_err(|error| format!("Failed to read selected projects: {error}"))?;
    let projects = statement
        .query_map(params_from_iter(project_ids.iter()), |row| {
            Ok(ProjectPackageProject {
                original_id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|error| format!("Failed to read selected projects: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read selected projects: {error}"))?;
    drop(statement);
    if projects.len() != project_ids.len() {
        return Err("One or more selected projects no longer exist.".to_string());
    }
    let delete = format!("DELETE FROM projects WHERE id NOT IN ({placeholders})");
    connection
        .execute(&delete, params_from_iter(project_ids.iter()))
        .map_err(|error| format!("Failed to isolate the selected projects: {error}"))?;
    connection
        .execute_batch(
            "
                UPDATE workspace_settings
                SET value = ''
                WHERE key = 'current_operator';

                UPDATE audit_operation_context
                SET enabled = 1, action = '', actor = '', reason = ''
                WHERE id = 1;
            ",
        )
        .map_err(|error| format!("Failed to remove workspace-only package data: {error}"))?;
    connection
        .execute_batch("VACUUM;")
        .map_err(|error| format!("Failed to finalize the project package database: {error}"))?;
    Ok(projects)
}

fn collect_export_files(
    database_copy: &Path,
    projects_root: &Path,
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut files = vec![(DATABASE_ENTRY.to_string(), database_copy.to_path_buf())];
    let connection = open_read_only_database(database_copy)?;
    let mut statement = connection
        .prepare("SELECT id, stored_path FROM project_documents ORDER BY id")
        .map_err(|error| format!("Failed to read selected project documents: {error}"))?;
    let documents = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Failed to read selected project documents: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read selected project documents: {error}"))?;
    if documents.is_empty() {
        return Ok(files);
    }
    if !projects_root.exists() {
        return Err("Managed project document storage does not exist.".to_string());
    }
    let canonical_root = fs::canonicalize(projects_root)
        .map_err(|error| format!("Failed to resolve managed document storage: {error}"))?;
    for (document_id, stored_path) in documents {
        super::validate_storage_id(&document_id, "document ID")?;
        let canonical_file = fs::canonicalize(&stored_path).map_err(|error| {
            format!("Failed to resolve the managed document {document_id}: {error}")
        })?;
        if !canonical_file.is_file() || !canonical_file.starts_with(&canonical_root) {
            return Err(format!(
                "The managed document {document_id} is missing or outside managed storage."
            ));
        }
        files.push((document_archive_path(&document_id), canonical_file));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

fn build_manifest(
    files: &[(String, PathBuf)],
    projects: Vec<ProjectPackageProject>,
    schema_version: u32,
) -> Result<ProjectPackageManifest, String> {
    let mut manifest_files = Vec::with_capacity(files.len());
    for (archive_path, source_path) in files {
        let metadata = fs::metadata(source_path)
            .map_err(|error| format!("Failed to inspect {}: {error}", source_path.display()))?;
        manifest_files.push(ProjectPackageManifestFile {
            path: archive_path.clone(),
            size: metadata.len(),
            sha256: sha256_file(source_path)?,
        });
    }
    Ok(ProjectPackageManifest {
        format: "commissioning-workspace-project-package".to_string(),
        format_version: PACKAGE_FORMAT_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339(),
        schema_version,
        database_path: DATABASE_ENTRY.to_string(),
        projects,
        files: manifest_files,
    })
}

fn write_project_package(
    output_path: &Path,
    manifest: &ProjectPackageManifest,
    files: &[(String, PathBuf)],
) -> Result<(), String> {
    let parent = output_path
        .parent()
        .ok_or_else(|| "The project package destination is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create the project package destination: {error}"))?;
    let temporary = tempfile::Builder::new()
        .prefix("commissioning-workspace-projects-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("Failed to create a temporary project package: {error}"))?;
    let file = temporary
        .as_file()
        .try_clone()
        .map_err(|error| format!("Failed to prepare the project package: {error}"))?;
    let mut archive = ZipWriter::new(BufWriter::new(file));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    archive
        .start_file(MANIFEST_ENTRY, options)
        .map_err(|error| format!("Failed to write the project package manifest: {error}"))?;
    serde_json::to_writer_pretty(&mut archive, manifest)
        .map_err(|error| format!("Failed to serialize the project package manifest: {error}"))?;
    for (archive_path, source_path) in files {
        archive
            .start_file(archive_path, options)
            .map_err(|error| format!("Failed to add {archive_path}: {error}"))?;
        let mut source = BufReader::new(
            File::open(source_path)
                .map_err(|error| format!("Failed to read {}: {error}", source_path.display()))?,
        );
        io::copy(&mut source, &mut archive)
            .map_err(|error| format!("Failed to package {archive_path}: {error}"))?;
    }
    let mut output = archive
        .finish()
        .map_err(|error| format!("Failed to finalize the project package: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("Failed to flush the project package: {error}"))?;
    output
        .get_ref()
        .sync_all()
        .map_err(|error| format!("Failed to persist the project package: {error}"))?;
    drop(output);
    if output_path.exists() {
        fs::remove_file(output_path)
            .map_err(|error| format!("Failed to replace the existing project package: {error}"))?;
    }
    temporary
        .persist(output_path)
        .map_err(|error| format!("Failed to publish the project package: {}", error.error))?;
    Ok(())
}

fn create_project_package_at(
    source_database: &Path,
    projects_root: &Path,
    output_path: &Path,
    project_ids: &[String],
) -> Result<ProjectPackageSummary, String> {
    let temporary_directory = TempDir::new()
        .map_err(|error| format!("Failed to create project export storage: {error}"))?;
    let database_copy = temporary_directory.path().join("projects.db");
    let schema_version =
        super::backup::create_consistent_database_copy(source_database, &database_copy)?;
    if schema_version != super::backup::CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "Project export requires schema version {}, but the workspace uses version {schema_version}.",
            super::backup::CURRENT_SCHEMA_VERSION
        ));
    }
    let projects = selected_projects_and_prune(&database_copy, project_ids)?;
    super::backup::validate_database(&database_copy)?;
    let files = collect_export_files(&database_copy, projects_root)?;
    let manifest = build_manifest(&files, projects, schema_version)?;
    let file_count = manifest.files.len();
    let total_bytes = manifest.files.iter().map(|file| file.size).sum();
    write_project_package(output_path, &manifest, &files)?;
    Ok(ProjectPackageSummary {
        path: output_path.to_string_lossy().into_owned(),
        created_at: manifest.created_at,
        application_version: manifest.application_version,
        schema_version,
        projects: manifest.projects,
        file_count,
        total_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn create_test_schema(path: &Path) {
        let connection = Connection::open(path).unwrap();
        connection
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;
                CREATE TABLE _sqlx_migrations (
                    version INTEGER PRIMARY KEY,
                    success INTEGER NOT NULL
                );
                INSERT INTO _sqlx_migrations (version, success) VALUES (12, 1);
                CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    client TEXT NOT NULL,
                    location TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE systems (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    code TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    commissioning_stage TEXT NOT NULL
                );
                CREATE TABLE subsystems (
                    id TEXT PRIMARY KEY,
                    system_id TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
                    code TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    commissioning_stage TEXT NOT NULL
                );
                CREATE TABLE assets (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    system_name TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    name TEXT NOT NULL,
                    asset_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    system_id TEXT REFERENCES systems(id) ON DELETE SET NULL,
                    subsystem_id TEXT REFERENCES subsystems(id) ON DELETE SET NULL
                );
                CREATE TABLE issues (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    status TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    due_date TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE test_records (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
                    title TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    executed_by TEXT NOT NULL,
                    witnessed_by TEXT NOT NULL,
                    execution_date TEXT,
                    signed_off_by TEXT NOT NULL,
                    signed_off_at TEXT,
                    completion_notes TEXT NOT NULL
                );
                CREATE TABLE test_items (
                    id TEXT PRIMARY KEY,
                    test_record_id TEXT NOT NULL REFERENCES test_records(id) ON DELETE CASCADE,
                    description TEXT NOT NULL,
                    acceptance_criteria TEXT NOT NULL,
                    result TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE issue_test_item_links (
                    issue_id TEXT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
                    test_item_id TEXT NOT NULL UNIQUE REFERENCES test_items(id) ON DELETE CASCADE
                );
                CREATE TABLE project_documents (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    revision TEXT NOT NULL,
                    status TEXT NOT NULL,
                    required_for_readiness INTEGER NOT NULL,
                    original_file_name TEXT NOT NULL,
                    stored_path TEXT NOT NULL UNIQUE,
                    mime_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    notes TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE readiness_stage_records (
                    id TEXT PRIMARY KEY,
                    system_id TEXT REFERENCES systems(id) ON DELETE CASCADE,
                    subsystem_id TEXT REFERENCES subsystems(id) ON DELETE CASCADE,
                    from_stage TEXT NOT NULL,
                    to_stage TEXT NOT NULL,
                    recorded_by TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    is_forced INTEGER NOT NULL,
                    blocker_count INTEGER NOT NULL,
                    blockers_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE turnover_packages (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    scope_kind TEXT NOT NULL,
                    scope_id TEXT NOT NULL,
                    scope_code TEXT NOT NULL,
                    scope_name TEXT NOT NULL,
                    package_number TEXT NOT NULL,
                    revision TEXT NOT NULL,
                    status TEXT NOT NULL,
                    stage_at_generation TEXT NOT NULL,
                    blocker_count INTEGER NOT NULL,
                    forced_transition_count INTEGER NOT NULL,
                    prepared_by TEXT NOT NULL,
                    approved_by TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    generated_at TEXT NOT NULL,
                    voided_at TEXT,
                    void_reason TEXT NOT NULL
                );
                CREATE TABLE workspace_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE audit_operation_context (
                    id INTEGER PRIMARY KEY,
                    enabled INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    reason TEXT NOT NULL
                );
                INSERT INTO audit_operation_context
                VALUES (1, 1, '', '', '');
                CREATE TABLE test_record_revisions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    test_record_id TEXT NOT NULL,
                    revision_number INTEGER NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    reopened_by TEXT NOT NULL,
                    reopen_reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE (test_record_id, revision_number)
                );
                CREATE TABLE audit_events (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_label TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    details_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                "#,
            )
            .unwrap();
    }

    fn insert_source_data(database: &Path, projects_root: &Path) {
        let connection = Connection::open(database).unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        connection
            .execute(
                "INSERT INTO projects VALUES (?1, ?2, '', '', '', 'active', ?3, ?3)",
                params!["project-one", "Plant", "2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO projects VALUES (?1, ?2, '', '', '', 'active', ?3, ?3)",
                params!["project-two", "Other", "2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO systems VALUES ('system-one', 'project-one', 'SYS', 'System', '', ?1, ?1, 'ready')",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO subsystems VALUES ('subsystem-one', 'system-one', 'SUB', 'Subsystem', '', ?1, ?1, 'ready')",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO assets VALUES ('asset-one', 'project-one', 'System', 'P-101', 'Pump', 'Pump', 'completed', '', ?1, ?1, 'system-one', 'subsystem-one')",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO issues VALUES ('issue-one', 'project-one', 'asset-one', 'Issue', '', 'medium', 'open', '', NULL, ?1, ?1)",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO test_records VALUES ('record-one', 'project-one', 'asset-one', 'Test', 'functional_test', '', ?1, ?1, '', '', NULL, '', NULL, '')",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO test_items VALUES ('item-one', 'record-one', 'Run', '', 'fail', '', 0, ?1, ?1)",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO issue_test_item_links VALUES ('issue-one', 'item-one')",
                [],
            )
            .unwrap();
        let document_path = projects_root
            .join("project-one")
            .join("documents")
            .join("document-one")
            .join("manual.pdf");
        fs::create_dir_all(document_path.parent().unwrap()).unwrap();
        fs::write(&document_path, b"%PDF-test-document").unwrap();
        connection
            .execute(
                "INSERT INTO project_documents VALUES ('document-one', 'project-one', 'asset-one', 'Manual', 'manual', 'A', 'approved', 1, 'manual.pdf', ?1, 'application/pdf', ?2, '', ?3, ?3)",
                params![
                    document_path.to_string_lossy().as_ref(),
                    fs::metadata(&document_path).unwrap().len(),
                    "2026-01-01T00:00:00Z"
                ],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO readiness_stage_records VALUES ('readiness-one', 'system-one', NULL, 'in_progress', 'ready', 'Tester', '', 0, 1, ?1, ?2)",
                params![
                    r#"[{"type":"issue","targetId":"issue-one","scopeId":"system-one"}]"#,
                    "2026-01-01T00:00:00Z"
                ],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO turnover_packages VALUES ('turnover-one', 'project-one', 'system', 'system-one', 'SYS', 'System', 'TP-001', '0', 'draft', 'ready', 1, 0, 'Tester', '', '', ?1, ?2, NULL, '')",
                params![
                    r#"{"project":{"id":"project-one"},"scope":{"id":"system-one"},"assets":[{"id":"asset-one"}],"issues":[{"id":"issue-one"}],"documents":[{"id":"document-one"}]}"#,
                    "2026-01-01T00:00:00Z"
                ],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO test_record_revisions VALUES ('revision-one', 'project-one', 'record-one', 1, ?1, 'Tester', 'Corrected reading', ?2)",
                params![
                    r#"{"record":{"id":"record-one","projectId":"project-one"},"items":[{"id":"item-one"}]}"#,
                    "2026-01-02T00:00:00Z"
                ],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO audit_events VALUES ('audit-one', 'project-one', 'test_record', 'record-one', 'reopened', 'Test', 'Tester', 'Corrected reading', ?1, ?2)",
                params![
                    r#"{"recordId":"record-one","projectId":"project-one"}"#,
                    "2026-01-02T00:00:00Z"
                ],
            )
            .unwrap();
    }

    #[test]
    fn project_package_round_trip_adds_projects_and_remaps_relationships() {
        let source_directory = TempDir::new().unwrap();
        let source_database = source_directory.path().join("source.db");
        let source_projects = source_directory.path().join("projects");
        create_test_schema(&source_database);
        insert_source_data(&source_database, &source_projects);
        let package_path = source_directory.path().join("projects.cwp");

        let exported = create_project_package_at(
            &source_database,
            &source_projects,
            &package_path,
            &["project-one".to_string()],
        )
        .unwrap();
        assert_eq!(exported.projects.len(), 1);
        assert_eq!(exported.file_count, 2);

        let extracted = TempDir::new().unwrap();
        let validated = extract_and_validate_package(&package_path, extracted.path()).unwrap();
        let packaged_database = Connection::open(extracted.path().join(DATABASE_ENTRY)).unwrap();
        let packaged_projects: i64 = packaged_database
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(packaged_projects, 1);
        let excluded_projects: i64 = packaged_database
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'project-two'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(excluded_projects, 0);
        drop(packaged_database);

        let destination_directory = TempDir::new().unwrap();
        let destination_database = destination_directory.path().join("destination.db");
        let destination_projects = destination_directory.path().join("projects");
        create_test_schema(&destination_database);
        let destination = Connection::open(&destination_database).unwrap();
        destination
            .execute(
                "INSERT INTO projects VALUES ('existing-project', 'Plant', '', '', '', 'active', ?1, ?1)",
                ["2026-01-01T00:00:00Z"],
            )
            .unwrap();
        drop(destination);

        let imported = import_package_data(
            &destination_database,
            &destination_projects,
            extracted.path(),
            &validated,
        )
        .unwrap();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].name, "Plant (Imported)");
        assert_ne!(imported[0].id, "project-one");

        let destination = Connection::open(&destination_database).unwrap();
        let existing_projects: i64 = destination
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'existing-project' AND name = 'Plant'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(existing_projects, 1);
        let relationship: (String, String, String, String) = destination
            .query_row(
                "SELECT a.project_id, a.system_id, a.subsystem_id, i.asset_id FROM assets a JOIN issues i ON i.project_id = a.project_id WHERE a.project_id = ?1",
                [&imported[0].id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(relationship.0, imported[0].id);
        assert_ne!(relationship.1, "system-one");
        assert_ne!(relationship.2, "subsystem-one");
        assert_ne!(relationship.3, "asset-one");
        let (document_id, stored_path): (String, String) = destination
            .query_row(
                "SELECT id, stored_path FROM project_documents WHERE project_id = ?1",
                [&imported[0].id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_ne!(document_id, "document-one");
        assert_eq!(fs::read(stored_path).unwrap(), b"%PDF-test-document");
        let snapshot: String = destination
            .query_row(
                "SELECT snapshot_json FROM turnover_packages WHERE project_id = ?1",
                [&imported[0].id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!snapshot.contains("project-one"));
        assert!(!snapshot.contains("system-one"));
        assert!(!snapshot.contains("asset-one"));
        assert!(snapshot.contains(&imported[0].id));
        let revision_snapshot: String = destination
            .query_row(
                "SELECT snapshot_json FROM test_record_revisions WHERE project_id = ?1",
                [&imported[0].id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!revision_snapshot.contains("record-one"));
        assert!(!revision_snapshot.contains("item-one"));
        let audit_relationship: (String, String, String) = destination
            .query_row(
                "SELECT project_id, entity_id, details_json FROM audit_events WHERE project_id = ?1",
                [&imported[0].id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(audit_relationship.0, imported[0].id);
        assert_ne!(audit_relationship.1, "record-one");
        assert!(!audit_relationship.2.contains("record-one"));
        drop(destination);

        let imported_again = import_package_data(
            &destination_database,
            &destination_projects,
            extracted.path(),
            &validated,
        )
        .unwrap();
        assert_eq!(imported_again[0].name, "Plant (Imported 2)");
        let destination = Connection::open(&destination_database).unwrap();
        let total_projects: i64 = destination
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(total_projects, 3);
        drop(destination);

        super::super::project_deletion::delete_project_at(
            &destination_database,
            &destination_projects,
            &imported[0].id,
        )
        .unwrap();
        super::super::project_deletion::delete_project_at(
            &destination_database,
            &destination_projects,
            "existing-project",
        )
        .unwrap();

        let destination = Connection::open(&destination_database).unwrap();
        let remaining_projects: i64 = destination
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_projects, 1);
        assert!(!destination_projects.join(&imported[0].id).exists());

        let missing_project_storage = destination_projects.join("missing-project");
        fs::create_dir_all(&missing_project_storage).unwrap();
        fs::write(missing_project_storage.join("preserved.txt"), b"preserve").unwrap();
        let missing_result = super::super::project_deletion::delete_project_at(
            &destination_database,
            &destination_projects,
            "missing-project",
        );
        assert_eq!(missing_result.unwrap_err(), "Project not found.");
        assert_eq!(
            fs::read(missing_project_storage.join("preserved.txt")).unwrap(),
            b"preserve"
        );
        assert!(!fs::read_dir(&destination_projects).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".project-delete-")
        }));
    }
}

#[tauri::command]
pub fn create_project_package(
    app: tauri::AppHandle,
    output_path: String,
    project_ids: Vec<String>,
) -> Result<ProjectPackageSummary, String> {
    if project_ids.is_empty() {
        return Err("Select at least one project to export.".to_string());
    }
    let mut unique_ids = HashSet::new();
    for project_id in &project_ids {
        super::validate_storage_id(project_id, "project ID")?;
        if !unique_ids.insert(project_id.as_str()) {
            return Err("The project selection contains a duplicate project.".to_string());
        }
    }
    let path = PathBuf::from(output_path);
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("cwp"))
    {
        return Err("Project packages must use the .cwp extension.".to_string());
    }
    let projects_root = super::backup::project_storage_root(&app)?;
    if projects_root.exists() {
        let canonical_projects = fs::canonicalize(&projects_root)
            .map_err(|error| format!("Failed to resolve managed document storage: {error}"))?;
        let parent = path
            .parent()
            .ok_or_else(|| "The project package destination is invalid.".to_string())?;
        let canonical_parent = fs::canonicalize(parent)
            .map_err(|error| format!("Failed to resolve the package destination: {error}"))?;
        if canonical_parent.starts_with(canonical_projects) {
            return Err(
                "Project packages cannot be saved inside managed document storage.".to_string(),
            );
        }
    }
    create_project_package_at(
        &super::backup::database_path(&app)?,
        &projects_root,
        &path,
        &project_ids,
    )
}

#[tauri::command]
pub fn inspect_project_package(path: String) -> Result<ProjectPackageInspection, String> {
    let package_path = PathBuf::from(&path);
    let temporary = TempDir::new()
        .map_err(|error| format!("Failed to create project package inspection storage: {error}"))?;
    let validated = extract_and_validate_package(&package_path, temporary.path())?;
    Ok(ProjectPackageInspection {
        path,
        created_at: validated.manifest.created_at,
        application_version: validated.manifest.application_version,
        schema_version: validated.manifest.schema_version,
        projects: validated.manifest.projects,
        file_count: validated.file_count,
        total_bytes: validated.total_bytes,
        compatible: validated.manifest.schema_version == super::backup::CURRENT_SCHEMA_VERSION,
    })
}

#[tauri::command]
pub fn import_project_package(
    app: tauri::AppHandle,
    path: String,
) -> Result<ProjectPackageImportSummary, String> {
    let database = super::backup::database_path(&app)?;
    let data_directory = database
        .parent()
        .ok_or_else(|| "Failed to resolve application storage.".to_string())?;
    fs::create_dir_all(data_directory)
        .map_err(|error| format!("Failed to prepare application storage: {error}"))?;
    let temporary = TempDir::new_in(data_directory)
        .map_err(|error| format!("Failed to create project import storage: {error}"))?;
    let validated = extract_and_validate_package(Path::new(&path), temporary.path())?;
    if validated.manifest.schema_version != super::backup::CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "This project package uses schema version {}, but this application requires version {}.",
            validated.manifest.schema_version,
            super::backup::CURRENT_SCHEMA_VERSION
        ));
    }
    let projects = import_package_data(
        &database,
        &super::backup::project_storage_root(&app)?,
        temporary.path(),
        &validated,
    )?;
    Ok(ProjectPackageImportSummary {
        imported_at: Utc::now().to_rfc3339(),
        projects,
        file_count: validated.file_count,
        total_bytes: validated.total_bytes,
    })
}
