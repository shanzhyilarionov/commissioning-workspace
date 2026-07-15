use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:commissioning-workspace.db",
                    migrations,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}