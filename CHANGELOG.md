# Changelog

All notable changes to the CrowdAssist browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.6.0] - 2026-04-22

### Added
- Anthropic Claude Sonnet as an alternative AI backend (model `claude-sonnet-4-6`)
- **AI Provider** selector in the popup — switch between OpenAI (GPT-3.5) and Anthropic (Claude Sonnet)
- Separate **Anthropic API Token** field; both tokens persist independently when switching providers
- Provider-aware **Test Connection** (verifies OpenAI via `/v1/models`, Anthropic via `/v1/messages` ping)

### Changed
- Rewrote all four AI prompts (AI Review Text, Auto-Reply, AI Review Report, AI Generate Report) for higher fidelity:
  - Byte-for-byte preservation of markdown, fenced code, URLs, payloads, HTTP blocks, and parameter names
  - No invented facts, CVEs, CVSS scores, or commitments — AI Generate Report now emits `[verify]` placeholders instead of guessing
  - "Return only the final text" — eliminates chatty preambles like "Here is your improved report"
  - AI Generate Report template extended with Affected Component, Proof of Concept, and References (VRT/CWE/OWASP) sections
- Consolidated AI calls behind a single `callAI()` helper; replaced four duplicated `fetch()` blocks
- Raised token budgets (review-text 300→500, review-report 1000→1500, generate-report 800→1200) so longer outputs are no longer truncated mid-section

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
