# Commissioning Workspace
Commissioning Workspace is a cross-platform desktop application for planning, executing, and documenting industrial commissioning works.
It centralizes projects, systems, equipment assets, checklists, test records, punch lists, readiness reviews, reports, turnover packages, and local workspace backups.

## Requirements
- Node.js
- npm
- Rust
- Tauri system dependencies

## Run
- Install dependencies: `npm install`
- Start the application: `npm run tauri dev`

## Workspace backups
- Open Settings to create a `.cwb` backup containing the SQLite database and all managed project documents.
- Restoring a backup validates its manifest, checksums, database integrity, and relationships before replacing workspace data.
- A safety backup is created automatically before every restore.
