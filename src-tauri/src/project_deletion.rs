use rusqlite::{params, Connection};
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
        let audit_context = transaction
            .query_row(
                "
                    SELECT enabled, action, actor, reason
                    FROM audit_operation_context
                    WHERE id = 1
                ",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .map_err(|error| format!("Failed to read the audit state: {error}"))?;
        transaction
            .execute(
                "
                    UPDATE audit_operation_context
                    SET enabled = 0, action = '', actor = '', reason = ''
                    WHERE id = 1
                ",
                [],
            )
            .map_err(|error| format!("Failed to pause audit capture: {error}"))?;
        let rows_affected = transaction
            .execute("DELETE FROM projects WHERE id = ?1", [project_id])
            .map_err(|error| format!("Failed to delete the project: {error}"))?;

        if rows_affected == 0 {
            return Err("Project not found.".to_string());
        }

        transaction
            .execute(
                "
                    UPDATE audit_operation_context
                    SET enabled = ?1, action = ?2, actor = ?3, reason = ?4
                    WHERE id = 1
                ",
                params![
                    audit_context.0,
                    audit_context.1,
                    audit_context.2,
                    audit_context.3
                ],
            )
            .map_err(|error| format!("Failed to restore audit capture: {error}"))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_database(path: &Path) {
        let connection = Connection::open(path).unwrap();
        connection
            .execute_batch(
                r#"
                    PRAGMA foreign_keys = ON;

                    CREATE TABLE projects (
                        id TEXT PRIMARY KEY NOT NULL
                    );

                    CREATE TABLE systems (
                        id TEXT PRIMARY KEY NOT NULL,
                        project_id TEXT NOT NULL,
                        FOREIGN KEY (project_id)
                            REFERENCES projects(id)
                            ON DELETE CASCADE
                    );

                    CREATE TABLE subsystems (
                        id TEXT PRIMARY KEY NOT NULL,
                        system_id TEXT NOT NULL,
                        FOREIGN KEY (system_id)
                            REFERENCES systems(id)
                            ON DELETE CASCADE
                    );

                    CREATE TABLE audit_operation_context (
                        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
                        enabled INTEGER NOT NULL,
                        action TEXT NOT NULL,
                        actor TEXT NOT NULL,
                        reason TEXT NOT NULL
                    );

                    CREATE TABLE audit_events (
                        id TEXT PRIMARY KEY NOT NULL,
                        project_id TEXT NOT NULL,
                        entity_type TEXT NOT NULL,
                        entity_id TEXT NOT NULL,
                        FOREIGN KEY (project_id)
                            REFERENCES projects(id)
                            ON DELETE CASCADE
                    );

                    CREATE TRIGGER audit_systems_delete
                    BEFORE DELETE ON systems
                    WHEN (
                        SELECT enabled
                        FROM audit_operation_context
                        WHERE id = 1
                    ) = 1
                    BEGIN
                        INSERT INTO audit_events VALUES (
                            'audit-system-' || OLD.id,
                            OLD.project_id,
                            'system',
                            OLD.id
                        );
                    END;

                    CREATE TRIGGER audit_subsystems_delete
                    BEFORE DELETE ON subsystems
                    WHEN (
                        SELECT enabled
                        FROM audit_operation_context
                        WHERE id = 1
                    ) = 1
                    BEGIN
                        INSERT INTO audit_events VALUES (
                            'audit-subsystem-' || OLD.id,
                            (
                                SELECT project_id
                                FROM systems
                                WHERE id = OLD.system_id
                            ),
                            'subsystem',
                            OLD.id
                        );
                    END;

                    INSERT INTO audit_operation_context VALUES (
                        1,
                        1,
                        'existing-action',
                        'Existing Operator',
                        'Existing reason'
                    );
                    INSERT INTO projects VALUES ('project-one');
                    INSERT INTO systems VALUES ('system-one', 'project-one');
                    INSERT INTO subsystems VALUES (
                        'subsystem-one',
                        'system-one'
                    );
                    INSERT INTO audit_events VALUES (
                        'audit-existing',
                        'project-one',
                        'project',
                        'project-one'
                    );
                "#,
            )
            .unwrap();
    }

    #[test]
    fn deletes_a_project_without_cascade_audit_failures() {
        let temporary_directory = tempfile::tempdir().unwrap();
        let database_path = temporary_directory.path().join("workspace.db");
        let projects_root = temporary_directory.path().join("projects");
        let project_storage = projects_root.join("project-one");
        fs::create_dir_all(&project_storage).unwrap();
        fs::write(project_storage.join("document.pdf"), b"test").unwrap();
        create_database(&database_path);

        delete_project_at(&database_path, &projects_root, "project-one").unwrap();

        let connection = Connection::open(&database_path).unwrap();
        connection.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        let system_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM systems", [], |row| row.get(0))
            .unwrap();
        let subsystem_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM subsystems", [], |row| row.get(0))
            .unwrap();
        let audit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM audit_events", [], |row| row.get(0))
            .unwrap();
        let audit_context: (i64, String, String, String) = connection
            .query_row(
                "
                    SELECT enabled, action, actor, reason
                    FROM audit_operation_context
                    WHERE id = 1
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();

        assert_eq!(project_count, 0);
        assert_eq!(system_count, 0);
        assert_eq!(subsystem_count, 0);
        assert_eq!(audit_count, 0);
        assert_eq!(
            audit_context,
            (
                1,
                "existing-action".to_string(),
                "Existing Operator".to_string(),
                "Existing reason".to_string()
            )
        );
        assert!(!project_storage.exists());
    }
}
