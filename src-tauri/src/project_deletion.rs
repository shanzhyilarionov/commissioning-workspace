use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

struct StagedProjectStorage {
    temporary_directory: TempDir,
    staged_path: PathBuf,
    original_path: PathBuf,
}

impl StagedProjectStorage {
    fn restore(self) -> Result<(), String> {
        if self.original_path.exists() {
            let recovery_path = self.temporary_directory.keep();
            return Err(format!(
                "The project database was not changed, but its document storage could not be restored because the original path already exists. The documents were preserved at {}.",
                recovery_path.display()
            ));
        }

        if let Err(error) = fs::rename(&self.staged_path, &self.original_path) {
            let recovery_path = self.temporary_directory.keep();
            return Err(format!(
                "The project database was not changed, but its document storage could not be restored: {error}. The documents were preserved at {}.",
                recovery_path.display()
            ));
        }

        let _ = self.temporary_directory.close();
        Ok(())
    }

    fn discard(self) {
        let _ = self.temporary_directory.close();
    }
}

fn stage_project_storage(
    projects_root: &Path,
    project_id: &str,
) -> Result<Option<StagedProjectStorage>, String> {
    let original_path = projects_root.join(project_id);
    if !original_path.exists() {
        return Ok(None);
    }

    let temporary_directory = tempfile::Builder::new()
        .prefix(".project-delete-")
        .tempdir_in(projects_root)
        .map_err(|error| format!("Failed to prepare project document deletion: {error}"))?;
    let staged_path = temporary_directory.path().join("project");
    fs::rename(&original_path, &staged_path)
        .map_err(|error| format!("Failed to stage the project documents for deletion: {error}"))?;

    Ok(Some(StagedProjectStorage {
        temporary_directory,
        staged_path,
        original_path,
    }))
}

pub(crate) fn delete_project_at(
    database_path: &Path,
    projects_root: &Path,
    project_id: &str,
) -> Result<(), String> {
    let staged_storage = stage_project_storage(projects_root, project_id)?;

    let deletion_result = (|| -> Result<(), String> {
        let mut connection = Connection::open(database_path)
            .map_err(|error| format!("Failed to open the workspace database: {error}"))?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(|error| format!("Failed to prepare project deletion: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("Failed to start project deletion: {error}"))?;
        let rows_affected = transaction
            .execute("DELETE FROM projects WHERE id = ?1", [project_id])
            .map_err(|error| format!("Failed to delete the project: {error}"))?;

        if rows_affected == 0 {
            return Err("Project not found.".to_string());
        }

        transaction
            .commit()
            .map_err(|error| format!("Failed to commit project deletion: {error}"))?;
        Ok(())
    })();

    match deletion_result {
        Ok(()) => {
            if let Some(staged_storage) = staged_storage {
                staged_storage.discard();
            }
            Ok(())
        }
        Err(error) => {
            if let Some(staged_storage) = staged_storage {
                if let Err(restore_error) = staged_storage.restore() {
                    return Err(format!("{error} {restore_error}"));
                }
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    super::validate_storage_id(&project_id, "project ID")?;
    delete_project_at(
        &super::backup::database_path(&app)?,
        &super::backup::project_storage_root(&app)?,
        &project_id,
    )
}
