use chrono::Utc;
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tempfile::TempDir;
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const BACKUP_FORMAT_VERSION: u32 = 1;
pub(crate) const CURRENT_SCHEMA_VERSION: u32 = 11;
const DATABASE_ENTRY: &str = "data/commissioning-workspace.db";
const DOCUMENTS_PREFIX: &str = "data/projects";
const MANIFEST_ENTRY: &str = "manifest.json";
const MAX_MANIFEST_SIZE: u64 = 2 * 1024 * 1024;
const MAX_ENTRY_COUNT: usize = 100_000;
const MAX_UNCOMPRESSED_SIZE: u64 = 20 * 1024 * 1024 * 1024;
const REQUIRED_TABLES: [&str; 10] = [
    "projects",
    "assets",
    "issues",
    "test_records",
    "test_items",
    "project_documents",
    "systems",
    "subsystems",
    "readiness_stage_records",
    "turnover_packages",
];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    format_version: u32,
    application_version: String,
    created_at: String,
    schema_version: u32,
    database_path: String,
    files: Vec<BackupManifestFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBackupSummary {
    path: String,
    created_at: String,
    application_version: String,
    schema_version: u32,
    file_count: usize,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBackupInspection {
    path: String,
    created_at: String,
    application_version: String,
    schema_version: u32,
    file_count: usize,
    total_bytes: u64,
    compatible: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRestoreSummary {
    restored_from: String,
    safety_backup_path: String,
    restored_at: String,
    file_count: usize,
    total_bytes: u64,
}

struct ValidatedBackup {
    manifest: BackupManifest,
    file_count: usize,
    total_bytes: u64,
}

fn application_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve the application data directory: {error}"))
}

pub(crate) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(application_data_dir(app)?.join("commissioning-workspace.db"))
}

pub(crate) fn project_storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(application_data_dir(app)?.join("projects"))
}

fn backup_storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("backups"))
        .map_err(|error| format!("Failed to resolve the backup directory: {error}"))
}

fn schema_version(connection: &Connection) -> Result<u32, String> {
    let version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to read the database schema version: {error}"))?;

    u32::try_from(version).map_err(|_| "The database schema version is invalid.".to_string())
}

fn open_read_only_database(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Failed to open the workspace database: {error}"))
}

pub(crate) fn create_consistent_database_copy(
    source: &Path,
    destination: &Path,
) -> Result<u32, String> {
    let source_connection = open_read_only_database(source)?;
    let schema_version = schema_version(&source_connection)?;
    let mut destination_connection = Connection::open(destination)
        .map_err(|error| format!("Failed to create the backup database: {error}"))?;
    let backup = Backup::new(&source_connection, &mut destination_connection)
        .map_err(|error| format!("Failed to initialize the database backup: {error}"))?;
    backup
        .run_to_completion(256, std::time::Duration::from_millis(5), None)
        .map_err(|error| format!("Failed to copy the workspace database: {error}"))?;
    drop(backup);
    destination_connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| format!("Failed to finalize the backup database: {error}"))?;

    Ok(schema_version)
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

fn normalized_relative_path(path: &Path) -> Result<String, String> {
    let components = path
        .components()
        .map(|component| match component {
            Component::Normal(value) => value
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| "A managed document path is not valid UTF-8.".to_string()),
            _ => Err("A managed document path contains an invalid component.".to_string()),
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(components.join("/"))
}

fn collect_backup_files(
    database_copy: &Path,
    projects_root: &Path,
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut files = vec![(DATABASE_ENTRY.to_string(), database_copy.to_path_buf())];

    if projects_root.exists() {
        for entry in WalkDir::new(projects_root).follow_links(false) {
            let entry =
                entry.map_err(|error| format!("Failed to inspect managed documents: {error}"))?;
            if entry.file_type().is_symlink() {
                return Err(format!(
                    "Managed document storage contains an unsupported symbolic link: {}",
                    entry.path().display()
                ));
            }
            if !entry.file_type().is_file() {
                continue;
            }

            let relative = entry
                .path()
                .strip_prefix(projects_root)
                .map_err(|_| "Failed to resolve a managed document path.".to_string())?;
            let relative = normalized_relative_path(relative)?;
            files.push((
                format!("{DOCUMENTS_PREFIX}/{relative}"),
                entry.path().to_path_buf(),
            ));
        }
    }

    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

fn build_manifest(
    files: &[(String, PathBuf)],
    schema_version: u32,
) -> Result<BackupManifest, String> {
    let mut manifest_files = Vec::with_capacity(files.len());

    for (archive_path, source_path) in files {
        let metadata = fs::metadata(source_path)
            .map_err(|error| format!("Failed to inspect {}: {error}", source_path.display()))?;
        manifest_files.push(BackupManifestFile {
            path: archive_path.clone(),
            size: metadata.len(),
            sha256: sha256_file(source_path)?,
        });
    }

    Ok(BackupManifest {
        format: "commissioning-workspace-backup".to_string(),
        format_version: BACKUP_FORMAT_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339(),
        schema_version,
        database_path: DATABASE_ENTRY.to_string(),
        files: manifest_files,
    })
}

fn write_backup_archive(
    output_path: &Path,
    manifest: &BackupManifest,
    files: &[(String, PathBuf)],
) -> Result<(), String> {
    let parent = output_path
        .parent()
        .ok_or_else(|| "The backup destination is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create the backup destination: {error}"))?;

    let temporary = tempfile::Builder::new()
        .prefix("commissioning-workspace-backup-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("Failed to create the temporary backup file: {error}"))?;
    let file = temporary
        .as_file()
        .try_clone()
        .map_err(|error| format!("Failed to prepare the temporary backup file: {error}"))?;
    let mut archive = ZipWriter::new(BufWriter::new(file));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);

    archive
        .start_file(MANIFEST_ENTRY, options)
        .map_err(|error| format!("Failed to write the backup manifest: {error}"))?;
    serde_json::to_writer_pretty(&mut archive, manifest)
        .map_err(|error| format!("Failed to serialize the backup manifest: {error}"))?;

    for (archive_path, source_path) in files {
        archive
            .start_file(archive_path, options)
            .map_err(|error| format!("Failed to add {archive_path} to the backup: {error}"))?;
        let mut source = BufReader::new(
            File::open(source_path)
                .map_err(|error| format!("Failed to read {}: {error}", source_path.display()))?,
        );
        io::copy(&mut source, &mut archive)
            .map_err(|error| format!("Failed to copy {archive_path} into the backup: {error}"))?;
    }

    let mut output = archive
        .finish()
        .map_err(|error| format!("Failed to finalize the workspace backup: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("Failed to flush the workspace backup: {error}"))?;
    output
        .get_ref()
        .sync_all()
        .map_err(|error| format!("Failed to persist the workspace backup: {error}"))?;
    drop(output);

    if output_path.exists() {
        fs::remove_file(output_path)
            .map_err(|error| format!("Failed to replace the existing backup: {error}"))?;
    }
    temporary
        .persist(output_path)
        .map_err(|error| format!("Failed to publish the workspace backup: {}", error.error))?;

    Ok(())
}

fn create_backup_at(
    app: &tauri::AppHandle,
    output_path: &Path,
) -> Result<WorkspaceBackupSummary, String> {
    let database = database_path(app)?;
    if !database.is_file() {
        return Err("The workspace database does not exist.".to_string());
    }

    let temporary_directory = TempDir::new()
        .map_err(|error| format!("Failed to create backup working storage: {error}"))?;
    let database_copy = temporary_directory
        .path()
        .join("commissioning-workspace.db");
    let schema_version = create_consistent_database_copy(&database, &database_copy)?;
    let files = collect_backup_files(&database_copy, &project_storage_root(app)?)?;
    let manifest = build_manifest(&files, schema_version)?;
    let file_count = manifest.files.len();
    let total_bytes = manifest.files.iter().map(|file| file.size).sum();
    write_backup_archive(output_path, &manifest, &files)?;

    Ok(WorkspaceBackupSummary {
        path: output_path.to_string_lossy().into_owned(),
        created_at: manifest.created_at,
        application_version: manifest.application_version,
        schema_version,
        file_count,
        total_bytes,
    })
}

fn validate_archive_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('/') || name.starts_with('\\') || name.contains('\\') {
        return Err(format!("The backup contains an unsafe path: {name}"));
    }

    let path = Path::new(name);
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("The backup contains an unsafe path: {name}"));
    }

    Ok(())
}

fn read_manifest<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<BackupManifest, String> {
    let mut entry = archive.by_name(MANIFEST_ENTRY).map_err(|_| {
        "The selected file is not a valid Commissioning Workspace backup.".to_string()
    })?;
    if entry.size() > MAX_MANIFEST_SIZE {
        return Err("The backup manifest is unexpectedly large.".to_string());
    }

    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read the backup manifest: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("The backup manifest is invalid: {error}"))
}

fn validate_manifest(manifest: &BackupManifest) -> Result<(), String> {
    if manifest.format != "commissioning-workspace-backup" {
        return Err("The selected file is not a Commissioning Workspace backup.".to_string());
    }
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(format!(
            "Backup format version {} is not supported by this version of the application.",
            manifest.format_version
        ));
    }
    if manifest.database_path != DATABASE_ENTRY {
        return Err("The backup manifest does not reference the expected database.".to_string());
    }
    if !manifest
        .files
        .iter()
        .any(|file| file.path == DATABASE_ENTRY)
    {
        return Err("The backup does not contain the workspace database.".to_string());
    }

    let mut paths = std::collections::HashSet::new();
    for file in &manifest.files {
        validate_archive_entry_name(&file.path)?;
        if file.path != DATABASE_ENTRY && !file.path.starts_with(&format!("{DOCUMENTS_PREFIX}/")) {
            return Err(format!(
                "The backup contains an unsupported file: {}",
                file.path
            ));
        }
        if !paths.insert(file.path.as_str()) {
            return Err(format!(
                "The backup manifest contains a duplicate path: {}",
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

    Ok(())
}

fn validate_backup(path: &Path) -> Result<ValidatedBackup, String> {
    let file =
        File::open(path).map_err(|error| format!("Failed to open the selected backup: {error}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|error| format!("The selected backup cannot be read: {error}"))?;
    if archive.len() > MAX_ENTRY_COUNT {
        return Err("The backup contains too many files.".to_string());
    }

    let manifest = read_manifest(&mut archive)?;
    validate_manifest(&manifest)?;
    if archive.len() != manifest.files.len() + 1 {
        return Err("The backup contents do not match its manifest.".to_string());
    }

    let total_bytes = manifest.files.iter().try_fold(0_u64, |total, file| {
        total
            .checked_add(file.size)
            .ok_or_else(|| "The backup size is invalid.".to_string())
    })?;
    if total_bytes > MAX_UNCOMPRESSED_SIZE {
        return Err("The backup is larger than the supported restore limit.".to_string());
    }

    for expected in &manifest.files {
        let mut entry = archive
            .by_name(&expected.path)
            .map_err(|_| format!("The backup is missing {}.", expected.path))?;
        if entry.is_dir() || entry.size() != expected.size {
            return Err(format!(
                "The backup entry {} has an invalid size.",
                expected.path
            ));
        }

        let mut hasher = Sha256::new();
        let mut size = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let bytes_read = entry
                .read(&mut buffer)
                .map_err(|error| format!("Failed to verify {}: {error}", expected.path))?;
            if bytes_read == 0 {
                break;
            }
            size += bytes_read as u64;
            if size > expected.size {
                return Err(format!(
                    "The backup entry {} exceeds its declared size.",
                    expected.path
                ));
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let checksum = format!("{:x}", hasher.finalize());
        if checksum != expected.sha256.to_ascii_lowercase() {
            return Err(format!(
                "The backup entry {} failed checksum validation.",
                expected.path
            ));
        }
    }

    Ok(ValidatedBackup {
        file_count: manifest.files.len(),
        total_bytes,
        manifest,
    })
}

pub(crate) fn validate_database(path: &Path) -> Result<(), String> {
    let connection = open_read_only_database(path)?;
    let integrity: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Failed to validate the restored database: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "The restored database failed its integrity check: {integrity}"
        ));
    }

    for table in REQUIRED_TABLES {
        let exists: i64 = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [table],
                |row| row.get(0),
            )
            .map_err(|error| format!("Failed to inspect the restored database: {error}"))?;
        if exists != 1 {
            return Err(format!(
                "The restored database is missing the {table} table."
            ));
        }
    }

    let foreign_key_error_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("Failed to validate restored relationships: {error}"))?;
    if foreign_key_error_count != 0 {
        return Err("The restored database contains invalid relationships.".to_string());
    }

    Ok(())
}

fn rebase_document_paths(database_path: &Path, projects_root: &Path) -> Result<(), String> {
    let connection = Connection::open(database_path)
        .map_err(|error| format!("Failed to prepare restored document paths: {error}"))?;
    let mut statement = connection
        .prepare("SELECT id, project_id, original_file_name FROM project_documents")
        .map_err(|error| format!("Failed to read restored document paths: {error}"))?;
    let documents = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| format!("Failed to read restored document paths: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read restored document paths: {error}"))?;
    drop(statement);

    for (document_id, project_id, original_file_name) in documents {
        super::validate_storage_id(&document_id, "document ID")?;
        super::validate_storage_id(&project_id, "project ID")?;
        if Path::new(&original_file_name)
            .file_name()
            .and_then(|value| value.to_str())
            != Some(original_file_name.as_str())
        {
            return Err(format!(
                "The restored document {document_id} has an invalid file name."
            ));
        }
        let restored_path = projects_root
            .join(project_id)
            .join("documents")
            .join(&document_id)
            .join(original_file_name);
        connection
            .execute(
                "UPDATE project_documents SET stored_path = ?1 WHERE id = ?2",
                [
                    restored_path.to_string_lossy().as_ref(),
                    document_id.as_str(),
                ],
            )
            .map_err(|error| format!("Failed to update restored document paths: {error}"))?;
    }

    Ok(())
}

fn extract_validated_backup(path: &Path, destination: &Path) -> Result<ValidatedBackup, String> {
    let validated = validate_backup(path)?;
    let file = File::open(path)
        .map_err(|error| format!("Failed to reopen the selected backup: {error}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|error| format!("The selected backup cannot be read: {error}"))?;

    for expected in &validated.manifest.files {
        let mut entry = archive
            .by_name(&expected.path)
            .map_err(|_| format!("The backup is missing {}.", expected.path))?;
        let relative = Path::new(&expected.path)
            .strip_prefix("data")
            .map_err(|_| format!("The backup path {} is invalid.", expected.path))?;
        let output_path = destination.join(relative);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to prepare restored files: {error}"))?;
        }
        let mut output = BufWriter::new(
            File::create(&output_path)
                .map_err(|error| format!("Failed to create {}: {error}", output_path.display()))?,
        );
        io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Failed to restore {}: {error}", expected.path))?;
        output
            .flush()
            .map_err(|error| format!("Failed to finalize {}: {error}", expected.path))?;
    }

    let restored_database = destination.join("commissioning-workspace.db");
    rebase_document_paths(
        &restored_database,
        &project_storage_root_for_restore(destination)?,
    )?;
    validate_database(&restored_database)?;
    Ok(validated)
}

fn project_storage_root_for_restore(destination: &Path) -> Result<PathBuf, String> {
    let live_data_dir = destination
        .parent()
        .ok_or_else(|| "Failed to resolve restored document storage.".to_string())?;
    Ok(live_data_dir.join("projects"))
}

fn safety_backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = backup_storage_root(app)?.join("safety");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create the safety backup directory: {error}"))?;
    Ok(directory.join(format!(
        "Commissioning Workspace - Before Restore - {}.cwb",
        Utc::now().format("%Y-%m-%d %H%M%S%.3f")
    )))
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|error| format!("Failed to remove {}: {error}", path.display()))
}

fn move_if_exists(source: &Path, destination: &Path) -> Result<(), String> {
    if source.exists() {
        fs::rename(source, destination).map_err(|error| {
            format!(
                "Failed to move {} to {}: {error}",
                source.display(),
                destination.display()
            )
        })?;
    }
    Ok(())
}

fn path_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}

fn replace_workspace_data(
    app: &tauri::AppHandle,
    staged_database: &Path,
    staged_projects: &Path,
) -> Result<(), String> {
    let data_dir = application_data_dir(app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Failed to prepare application storage: {error}"))?;
    let live_database = database_path(app)?;
    let live_projects = project_storage_root(app)?;
    let old_database = data_dir.join("commissioning-workspace.db.before-restore");
    let live_database_wal = path_with_suffix(&live_database, "-wal");
    let live_database_shm = path_with_suffix(&live_database, "-shm");
    let old_database_wal = path_with_suffix(&old_database, "-wal");
    let old_database_shm = path_with_suffix(&old_database, "-shm");
    let old_projects = data_dir.join("projects.before-restore");
    remove_path_if_exists(&old_database)?;
    remove_path_if_exists(&old_database_wal)?;
    remove_path_if_exists(&old_database_shm)?;
    remove_path_if_exists(&old_projects)?;

    move_if_exists(&live_database, &old_database)?;
    if let Err(error) = move_if_exists(&live_database_wal, &old_database_wal) {
        let _ = move_if_exists(&old_database, &live_database);
        return Err(error);
    }
    if let Err(error) = move_if_exists(&live_database_shm, &old_database_shm) {
        let _ = move_if_exists(&old_database_wal, &live_database_wal);
        let _ = move_if_exists(&old_database, &live_database);
        return Err(error);
    }
    if let Err(error) = move_if_exists(&live_projects, &old_projects) {
        let _ = move_if_exists(&old_database_shm, &live_database_shm);
        let _ = move_if_exists(&old_database_wal, &live_database_wal);
        let _ = move_if_exists(&old_database, &live_database);
        return Err(error);
    }

    let installation_result = (|| {
        fs::rename(staged_database, &live_database)
            .map_err(|error| format!("Failed to install the restored database: {error}"))?;
        if staged_projects.exists() {
            fs::rename(staged_projects, &live_projects)
                .map_err(|error| format!("Failed to install restored documents: {error}"))?;
        } else {
            fs::create_dir_all(&live_projects)
                .map_err(|error| format!("Failed to create restored document storage: {error}"))?;
        }
        Ok::<(), String>(())
    })();

    if let Err(error) = installation_result {
        let _ = remove_path_if_exists(&live_database);
        let _ = remove_path_if_exists(&live_database_wal);
        let _ = remove_path_if_exists(&live_database_shm);
        let _ = remove_path_if_exists(&live_projects);
        let database_rollback = move_if_exists(&old_database, &live_database);
        let wal_rollback = move_if_exists(&old_database_wal, &live_database_wal);
        let shm_rollback = move_if_exists(&old_database_shm, &live_database_shm);
        let projects_rollback = move_if_exists(&old_projects, &live_projects);
        if database_rollback.is_err()
            || wal_rollback.is_err()
            || shm_rollback.is_err()
            || projects_rollback.is_err()
        {
            return Err(format!(
                "{error} Automatic rollback also failed. Restore the safety backup before continuing."
            ));
        }
        return Err(error);
    }

    remove_path_if_exists(&old_database)?;
    remove_path_if_exists(&old_database_wal)?;
    remove_path_if_exists(&old_database_shm)?;
    remove_path_if_exists(&old_projects)?;
    Ok(())
}

#[tauri::command]
pub fn create_workspace_backup(
    app: tauri::AppHandle,
    output_path: String,
) -> Result<WorkspaceBackupSummary, String> {
    let path = PathBuf::from(output_path);
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("cwb"))
    {
        return Err("Workspace backups must use the .cwb extension.".to_string());
    }

    let projects_root = project_storage_root(&app)?;
    if projects_root.exists() {
        let canonical_projects = fs::canonicalize(&projects_root)
            .map_err(|error| format!("Failed to resolve managed document storage: {error}"))?;
        let output_parent = path
            .parent()
            .ok_or_else(|| "The backup destination is invalid.".to_string())?;
        let canonical_output_parent = fs::canonicalize(output_parent)
            .map_err(|error| format!("Failed to resolve the backup destination: {error}"))?;
        if canonical_output_parent.starts_with(canonical_projects) {
            return Err(
                "The backup cannot be saved inside managed project document storage.".to_string(),
            );
        }
    }

    create_backup_at(&app, &path)
}

#[tauri::command]
pub fn inspect_workspace_backup(path: String) -> Result<WorkspaceBackupInspection, String> {
    let path = PathBuf::from(path);
    let validated = validate_backup(&path)?;
    Ok(WorkspaceBackupInspection {
        path: path.to_string_lossy().into_owned(),
        created_at: validated.manifest.created_at,
        application_version: validated.manifest.application_version,
        schema_version: validated.manifest.schema_version,
        file_count: validated.file_count,
        total_bytes: validated.total_bytes,
        compatible: validated.manifest.schema_version <= CURRENT_SCHEMA_VERSION,
    })
}

#[tauri::command]
pub fn restore_workspace_backup(
    app: tauri::AppHandle,
    path: String,
) -> Result<WorkspaceRestoreSummary, String> {
    let backup_path = PathBuf::from(&path);
    let data_dir = application_data_dir(&app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Failed to prepare application storage: {error}"))?;
    let staging = TempDir::new_in(&data_dir)
        .map_err(|error| format!("Failed to create restore working storage: {error}"))?;
    let validated = extract_validated_backup(&backup_path, staging.path())?;
    if validated.manifest.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "This backup uses schema version {}, which is newer than this application supports.",
            validated.manifest.schema_version
        ));
    }

    let safety_path = safety_backup_path(&app)?;
    create_backup_at(&app, &safety_path)?;
    replace_workspace_data(
        &app,
        &staging.path().join("commissioning-workspace.db"),
        &staging.path().join("projects"),
    )?;

    Ok(WorkspaceRestoreSummary {
        restored_from: path,
        safety_backup_path: safety_path.to_string_lossy().into_owned(),
        restored_at: Utc::now().to_rfc3339(),
        file_count: validated.file_count,
        total_bytes: validated.total_bytes,
    })
}

#[tauri::command]
pub fn open_workspace_backup_directory(app: tauri::AppHandle) -> Result<(), String> {
    let directory = backup_storage_root(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create the backup directory: {error}"))?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Failed to open the backup directory: {error}"))
}

#[tauri::command]
pub fn restart_application(app: tauri::AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_database(path: &Path) {
        let connection = Connection::open(path).unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE _sqlx_migrations (version INTEGER, success INTEGER);
                INSERT INTO _sqlx_migrations VALUES (11, 1);
                CREATE TABLE projects (id TEXT PRIMARY KEY);
                CREATE TABLE assets (id TEXT PRIMARY KEY);
                CREATE TABLE issues (id TEXT PRIMARY KEY);
                CREATE TABLE test_records (id TEXT PRIMARY KEY);
                CREATE TABLE test_items (id TEXT PRIMARY KEY);
                CREATE TABLE project_documents (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    original_file_name TEXT NOT NULL,
                    stored_path TEXT NOT NULL
                );
                CREATE TABLE systems (id TEXT PRIMARY KEY);
                CREATE TABLE subsystems (id TEXT PRIMARY KEY);
                CREATE TABLE readiness_stage_records (id TEXT PRIMARY KEY);
                CREATE TABLE turnover_packages (id TEXT PRIMARY KEY);
                INSERT INTO projects VALUES ('project-1');
                "#,
            )
            .unwrap();
    }

    #[test]
    fn writes_and_validates_a_complete_archive() {
        let directory = TempDir::new().unwrap();
        let database = directory.path().join("database.db");
        create_test_database(&database);
        let document = directory.path().join("manual.pdf");
        fs::write(&document, b"document bytes").unwrap();
        let files = vec![
            (DATABASE_ENTRY.to_string(), database),
            (
                "data/projects/project-1/documents/document-1/manual.pdf".to_string(),
                document,
            ),
        ];
        let manifest = build_manifest(&files, 11).unwrap();
        let backup = directory.path().join("backup.cwb");
        write_backup_archive(&backup, &manifest, &files).unwrap();

        let validated = validate_backup(&backup).unwrap();
        assert_eq!(validated.file_count, 2);
        assert_eq!(validated.manifest.schema_version, 11);
    }

    #[test]
    fn creates_a_consistent_sqlite_snapshot() {
        let directory = TempDir::new().unwrap();
        let source = directory.path().join("source.db");
        let destination = directory.path().join("destination.db");
        create_test_database(&source);

        let version = create_consistent_database_copy(&source, &destination).unwrap();
        let copied = open_read_only_database(&destination).unwrap();
        let project_count: i64 = copied
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();

        assert_eq!(version, 11);
        assert_eq!(project_count, 1);
    }

    #[test]
    fn rejects_manifest_paths_outside_managed_storage() {
        let manifest = BackupManifest {
            format: "commissioning-workspace-backup".to_string(),
            format_version: 1,
            application_version: "0.1.0".to_string(),
            created_at: Utc::now().to_rfc3339(),
            schema_version: 11,
            database_path: DATABASE_ENTRY.to_string(),
            files: vec![BackupManifestFile {
                path: "../outside".to_string(),
                size: 0,
                sha256: "0".repeat(64),
            }],
        };

        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn extracts_a_backup_and_rebases_document_paths() {
        let data_directory = TempDir::new().unwrap();
        let source_database = data_directory.path().join("source.db");
        create_test_database(&source_database);
        let connection = Connection::open(&source_database).unwrap();
        connection
            .execute(
                r#"
                INSERT INTO project_documents (
                    id,
                    project_id,
                    original_file_name,
                    stored_path
                ) VALUES (?1, ?2, ?3, ?4)
                "#,
                [
                    "document-1",
                    "project-1",
                    "manual.pdf",
                    "/old/location/manual.pdf",
                ],
            )
            .unwrap();
        drop(connection);

        let document = data_directory.path().join("manual.pdf");
        fs::write(&document, b"document bytes").unwrap();
        let files = vec![
            (DATABASE_ENTRY.to_string(), source_database),
            (
                "data/projects/project-1/documents/document-1/manual.pdf".to_string(),
                document,
            ),
        ];
        let manifest = build_manifest(&files, 11).unwrap();
        let backup = data_directory.path().join("backup.cwb");
        write_backup_archive(&backup, &manifest, &files).unwrap();

        let staging = data_directory.path().join("staging");
        fs::create_dir_all(&staging).unwrap();
        extract_validated_backup(&backup, &staging).unwrap();

        let restored_database =
            Connection::open(staging.join("commissioning-workspace.db")).unwrap();
        let stored_path: String = restored_database
            .query_row(
                "SELECT stored_path FROM project_documents WHERE id = 'document-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            PathBuf::from(stored_path),
            data_directory
                .path()
                .join("projects/project-1/documents/document-1/manual.pdf")
        );
        assert!(staging
            .join("projects/project-1/documents/document-1/manual.pdf")
            .is_file());
    }
}
