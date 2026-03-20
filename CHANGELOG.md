# Changelog

All notable changes to the CrowdAssist browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.5.0] - 2026-03-19

### Changed
- Redesigned all toolbar areas with pill buttons, SVG icons, and themed containers (replaces bracket-notation text links)
- Moved toolbar styling from inline JS to CSS custom properties with `data-ca-theme` attribute selectors

### Added
- Light/dark theme support for toolbars via CSS variables, with hover/active/disabled transitions
- Toolbar theme auto-updates when `theme_mode` changes in settings or system theme changes

### Fixed
- Copy as Markdown toolbar alignment on submission pages

## [1.4.0] - 2025-11-28

### Added
- Auto-Renew Session feature — background refresh every 60 minutes to prevent Bugcrowd timeout
- Firefox cross-browser compatibility (MV2 manifest, browser API polyfills)
- Build scripts (`switch-manifest.sh`, `build.sh`) for multi-browser packaging

### Removed
- Bugcrowd login status indicator

## [1.3.1] - 2025-11-11

### Added
- Triage Time Insight — shows duration from submission to triaged status

## [1.3.0] and earlier

### Added
- Include My IP
- AI Review Text
- Auto-Reply
- Copy as Markdown
- AI Generate Report
- Privacy Mode
- Username autocomplete
