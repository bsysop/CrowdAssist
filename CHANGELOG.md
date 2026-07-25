# Changelog

All notable changes to the CrowdAssist browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.8.0] - 2026-07-25

### Added
- **Fix Formatting** button, which applies the report formatting Bugcrowd asks for. It sits in the comment toolbar on a submission and in the report creation/edit toolbar, and reports how many fixes it made. Rules live in a pipeline (`CA_FORMAT_RULES`), so adding another standardisation rule means adding one entry.
  - First rule, quote images: prefixes every image embed with `> `.
  - Only image embeds are touched. Bugcrowd writes images as `![name](url "name")` and every other attachment as `[name](url "name")`, so the match keys on the leading `!`. A `report.pdf` link is left alone.
  - Lines already starting with `>` are skipped, so the button is safe to press repeatedly. Content inside ``` or `~~~` fenced blocks is never rewritten, since reports routinely paste raw markdown and HTTP requests in fences.
  - Filenames are `encodeURI`'d, which leaves parentheses intact, so detection matches on the ends of the line instead of parsing the URL. That handles `Screenshot (1).png`.
  - The value goes back through `setNativeValue()` so React's `onChange` actually observes it. Assigning `.value` directly can leave React holding the pre-click text and silently send the unformatted version.

### Changed
- **Hide Bounties** now covers every reward figure, not just the sidebar column on the submissions list:
  - the reward on each submission card in the list,
  - the reward on an individual submission page,
  - and reward events in that submission's activity feed, including collaboration splits.
  - All of them share `span.bc-reward`. The `N points` and `Still being assessed` variants are included too, because blanking only the amounts while leaving those visible would still show which submissions were paid.
  - The same Show/Hide toggle now appears on individual submission pages as well as the list, built from one shared helper so both look and behave the same. On a submission it sits at the top of the status column, which stays visible because submissions hide individual reward nodes rather than a container.
  - The `hide_bounties` flag is cached in memory rather than re-read from `storage.sync` on every DOM mutation, since the observer now repaints far more nodes per pass.

### Fixed
- `setNativeValue()` threw `Cannot read properties of undefined (reading 'set')` on every call, so the formatting button never did anything in either editor. It read `Object.getOwnPropertyDescriptor(element, 'value').set` unguarded. React installs that own property in the page world, and content scripts run in an isolated world where the node has no own `value` descriptor. Both descriptor lookups are now guarded, falling back to the prototype setter, which is also the setter that makes React notice the change.
- **Hide Bounties** no longer locks up the submissions list. `init()` is the MutationObserver callback, and the repaint assigned `textContent` to the toggle label unconditionally. That replaces the text node even when the string is identical, which emits a childList record, which re-triggers `init()`. Every write in the repaint is now conditional, so a pass that changes nothing touches nothing.
- **Triage Time Insight** now appears on every submission triage has decided (Resolved, Unresolved, Not Applicable, Informational and the rest) instead of only those currently sitting in Triaged. Submissions still in New continue to show nothing.
  - The old version bailed out unless the status badge read exactly `Triaged`, and found the triage moment via a `.bc-badge--triaged` element in the rendered feed. That badge is absent on submissions decided without ever passing through Triaged, and many go straight to Unresolved, so dropping the status check alone would have fixed nothing.
  - It now reads the submission's React props and activity feed JSON, and measures from `submitted_at` to the first `submission.transitioned` activity: the moment triage made a decision, whatever outcome it landed on. The tooltip also names that outcome.
  - Timestamps come from structured data (`submissionDetailProps.submission.submitted_at`) rather than an `nth-child` DOM path, with the old selector kept as a fallback.

## [1.7.0] - 2026-06-02

### Added
- **Hide Bounties** toggle on the Bugcrowd submissions list page (`/submissions`), which hides the bounty sidebar column via `visibility: hidden`. Controllable from an on-page pill button and a synced **Hide Bounties** checkbox in the extension popup. The setting persists across reloads.

### Changed
- Widened the `/submissions` content-script match pattern (`…/submissions/*` became `…/submissions*`) so the script also runs on the bare submissions list page, not just `/submissions/<id>` detail pages.

## [1.6.0] - 2026-04-22

### Added
- Anthropic Claude Sonnet as an alternative AI backend (model `claude-sonnet-4-6`)
- **AI Provider** selector in the popup, switching between OpenAI (GPT-3.5) and Anthropic (Claude Sonnet)
- Separate **Anthropic API Token** field. Both tokens persist independently when you switch providers
- Provider-aware **Test Connection** (verifies OpenAI via `/v1/models`, Anthropic via a `/v1/messages` ping)

### Changed
- Rewrote all four AI prompts (AI Review Text, Auto-Reply, AI Review Report, AI Generate Report) for higher fidelity:
  - Byte-for-byte preservation of markdown, fenced code, URLs, payloads, HTTP blocks, and parameter names
  - No invented facts, CVEs, CVSS scores, or commitments. AI Generate Report now emits `[verify]` placeholders instead of guessing
  - "Return only the final text", which kills chatty preambles like "Here is your improved report"
  - AI Generate Report template extended with Affected Component, Proof of Concept, and References (VRT/CWE/OWASP) sections
- Consolidated AI calls behind a single `callAI()` helper, replacing four duplicated `fetch()` blocks
- Raised token budgets (review-text 300 to 500, review-report 1000 to 1500, generate-report 800 to 1200) so longer outputs no longer get truncated mid-section

## [1.5.0] - 2026-03-19

### Changed
- Redesigned all toolbar areas with pill buttons, SVG icons, and themed containers, replacing the old bracket-notation text links
- Moved toolbar styling from inline JS to CSS custom properties with `data-ca-theme` attribute selectors

### Added
- Light/dark theme support for toolbars via CSS variables, with hover, active and disabled transitions
- Toolbar theme auto-updates when `theme_mode` changes in settings or when the system theme changes

### Fixed
- Copy as Markdown toolbar alignment on submission pages

## [1.4.0] - 2025-11-28

### Added
- Auto-Renew Session, a background refresh every 60 minutes to prevent the Bugcrowd timeout
- Firefox cross-browser compatibility (MV2 manifest, browser API polyfills)
- Build scripts (`switch-manifest.sh`, `build.sh`) for multi-browser packaging

### Removed
- Bugcrowd login status indicator

## [1.3.1] - 2025-11-11

### Added
- Triage Time Insight, showing the duration from submission to triaged status

## [1.3.0] and earlier

### Added
- Include My IP
- AI Review Text
- Auto-Reply
- Copy as Markdown
- AI Generate Report
- Privacy Mode
- Username autocomplete
