# Commissioning Workspace
Commissioning Workspace is a cross-platform desktop application for managing industrial commissioning workflows, from systemization and field verification to readiness assessment and final handover.
It provides tools for organizing projects, tracking assets, managing checklists and tests, maintaining audit records, and generating reports.
The application supports offline operation, allowing commissioning activities to continue without an internet connection.

## Requirements
- Node.js
- Rust toolchain
- Tauri prerequisites for your operating system

## Usage
- Install dependencies: `npm install`
- Run the application in development mode: `npm run tauri dev`
- Build the desktop application: `npm run tauri build`

## Project navigation

`Systems` is a project module between `Overview` and `Assets`.
It manages systems, their subsystems, readiness reviews, and commissioning stages.
Use `View assets` or `View system assets` to open equipment filtered to a system, then return to the same structure.
Assets also link to their parent system, and activity history and subsystem handover links open directly in `Systems`.

## Appearance and layout

All application styles and browser layout calculations live in `src/styles/`.

- `index.css` is the single stylesheet entry, imported by `src/main.tsx`.
  Its import order preserves the existing cascade, including shared overrides of page defaults.
- `theme.css` defines colors, typography, shadows, and light/dark themes.
- `tokens.css` defines shared dimensions, spacing, and table widths.
- `base.css` and `shell.css` define global defaults and the application shell.
- `components/` holds shared controls, tables, forms, modals, and interaction styles.
- `pages/` holds page-specific layouts with their media and container queries.
- `layout/` holds dynamic table spacing, menu positioning, chart geometry, responsive chart sizing, and data-dependent progress widths.
- `theme.ts` handles theme preference persistence and operating system theme changes.

Add styles through `src/styles/index.css` and keep visual constants and responsive calculations in this directory.
Pages and components consume class names and layout helpers while retaining their data and interaction logic.
PDF export formatting remains in `src/services/pdfLayout.ts` and `src/services/exportTheme.ts`.
