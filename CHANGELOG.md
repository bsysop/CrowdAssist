# Changelog

All notable changes to the CrowdAssist browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.10.0] - 2026-07-29

### Added
- VRT severity badges on the submission form's VRT Category picker. Every row now shows the priority the Vulnerability Rating Taxonomy assigns it. Searching `idor` returns five rows that read almost identically and span P1 to P5: `Modify/View Sensitive Information(Iterable Object Identifiers)` is P1, while `Modify/View Sensitive Information(Complex Object Identifiers GUID/UUID)` is P4. One word apart, three priority levels apart, and until now you only found out after triage.
  - New `extension/vrt-severity.js` fetches `https://bugcrowd.com/vulnerability-rating-taxonomy.json`. The unversioned URL tracks the current release. It flattens the taxonomy to a map from `"Category > Subcategory > Variant"` to priority and caches that in `storage.local` with a 7-day TTL. 103 KB in, a 28 KB map out, fetched at most once a week.
  - Nothing waits on it. No UI path awaits the fetch, so rows render unbadged and get annotated whenever the data lands, from cache or from the network. The request is same-origin, so there is no CORS preflight, and `bugcrowd.com` and `storage` were already in the manifest. No new permissions.
  - `storage.local`, not `sync`: sync's 8 KB-per-item quota cannot hold the map.
  - Matching is exact in both of the picker's modes. Search rows carry the full path in `aria-label`. Browse rows carry only the leaf name, so the path is rebuilt from the highlighted category plus the subcategory heading. Checked against the live DOM: the five IDOR rows resolve to P2, P4, P1, P5, P3.
  - 86 of the 437 entries carry no priority, because the taxonomy leaves those to the program. They are dropped when the map is built and render without a badge, rather than being given a rating that does not exist.
  - The badge wears Bugcrowd's own `bc-badge bc-badge--pN` classes, so it uses the platform's exact priority palette (red, orange, amber, green, blue) and follows light and dark mode without this extension declaring a single colour. Confirmed by flipping `bc-body--dark` to `bc-body--light`: the badges moved from `#EB959B on #350205` to `#B10511 on #FBEBEC` on their own.
  - The badge is labelled as the VRT baseline, and its tooltip says the program may rate it differently. That matches Bugcrowd's own caveat printed beside the field.
  - `tests/vrt-severity.test.js` adds 22 assertions covering the flatten, the five live paths, browse-mode path reconstruction, and degradation on null, empty and malformed input. Runs as `node tests/vrt-severity.test.js` against a real taxonomy snapshot in `tests/fixtures/`.

### Fixed
- The badges rendered as broken table cells. Bugcrowd styles the spans inside a dropdown row, and that rule outranked `.ca-vrt-badge`, so the badge inherited the row text's `8px 28px` padding and a neutral grey border instead of its own. The result was a 54 px grey box, and before that a full-width bar above each row at 95 px of row height. The annotated row is now a flex line, and the badge's layout properties are declared at a specificity that holds. Measured after: a 32 by 22 badge, rows back to 39 and 60 px.
- Rows the taxonomy leaves to the program correctly show no badge, but their text then started 62 px left of every badged row, and one unindented row among indented ones reads as a rendering fault. They now get an invisible placeholder that holds the gutter open. Distinct text left edges went from `[652, 590]` to `[644]` across 50 rows, 15 of them badge-less.
- Badge vertical position is derived rather than eyeballed. The row's text span is `padding-top: 8px; line-height: 21px`, so a 22 px pill centres on the first line at +7 px. Identical on every row, single- and two-line.

## [1.9.0] - 2026-07-26

### Added
- Searchable Target picker on the submission form. The native Target `<select>` is replaced by a combobox that filters the scope list as you type. It does a substring match on the option text and highlights the matched run, so `cloudtrace` finds it inside `http://cloudtrace2.example.com/`. Arrows move and scroll the highlight, Enter commits, Escape closes and restores the displayed selection, Home and End jump, Tab moves on, and clicking outside closes.
  - The native select is never removed. It stays in the DOM as the source of truth, and the last row of the menu, "Use the original dropdown", hands it straight back. A native `<select>` popup cannot be opened from script, so un-hiding the real control is the only fallback available. Putting it in the menu is what makes it discoverable.
  - It is hidden with `opacity: 0` rather than `display: none`, because the field is `required` and Chrome refuses to submit a form whose invalid required control is not focusable.
  - Options are read from the live `<select>` on every render rather than snapshotted at attach time. React populates and later re-renders this field asynchronously, so a snapshot taken on the wrong tick sticks permanently. The symptom was a picker that opened with zero rows.
  - Writing the choice back goes through the prototype `value` setter and fires both `input` and `change`. Measured on the live form, assigning `.value` directly moves the DOM but leaves React's own `value` prop at `""`, so the field looks set and submits empty against its `required` attribute. Every insertion path in `content.js` except `fixFormattingIn` still uses that naive pattern, which is a latent bug anywhere it meets a controlled input. The commit reads the value back and restores the native dropdown if it did not take, so a future change to how Bugcrowd binds the field degrades instead of silently losing the target.
  - Scope is the Target field only. The VRT and bug-type picker already has its own search.
  - A magnifier icon and the placeholder "Search or select a target…" are the only things telling anyone the field can be typed into. Without them it is pixel-identical to the select it replaced and the feature goes undiscovered. A `✕` clears back to "Select target…", restoring the one thing the native control could do that the combobox could not.
  - Reviewing it in the browser turned up eleven gaps, all fixed before release. The most serious was that the field could misrepresent what would be submitted. Only the Escape path re-synced the text, so typing a query and then clicking away left the input showing `zzz` while the select still held `Desktop Electron App`. You would read one target and submit another. Every close path now re-syncs, which also absorbs the stale text Chrome's form-state restoration can put back on reload.
  - The remaining ten: focus now selects the existing text so typing replaces it, deferred a tick because a click places the caret after the focus event and would otherwise wipe the selection. Opening highlights and scrolls to the current selection rather than always row 0. The focus ring is neutral instead of brand orange, which on a form field read as a validation error next to Bugcrowd's own inputs. The chevron is heavier. The input carries an `id` and `aria-label`, and the options carry `id`s with `aria-activedescendant` tracking the highlight, since the page's `<label>` points at the select we hide. `disabled` is mirrored from the native control. Tabbing through the form no longer throws the menu open, which now needs a click, typing or ArrowDown. Truncated rows carry a `title` so a URL that differs near its end is still readable.
- Fix Formatting now enforces Bugcrowd's *Pen Test Submission Style Guide v1.1* (Advanced Services Group) rather than the single image-quoting rule it shipped with. It is all deterministic string work in the new `extension/format-rules.js`, with no AI, no network, no API key and no token cost.
  - 28 auto-fix rules run in three ordered phases. Phase A normalises block markers: markdown headers and setext underlines become `**bold**`, a bare section label such as `Steps to Reproduce` is promoted to a bold heading, separating lines are deleted, section names are canonicalised, title-shaped headings are title-cased against the guide's stop-word list, list markers are normalised and renumbered, and top-level lists take the style their section calls for, meaning ordered inside Steps to Reproduce and bullets elsewhere. Phase B rewrites words and inline spans: markdown hyperlinks become inline code, `&` becomes `and`, plus product capitalisation, slang expansion, `i.e.,` and `e.g.,`, third person, `Please`, "reach out with questions", greeting and sign-off, italics, mid-sentence bolding, inline-code sub-titles, trailing periods in lists, and `Now` or `Then` at the start of a step. Phase C handles spacing and the guide's `>` "tab" convention: code fence language tags, colon before a list or block, tabbed code fences, the picture context block, and blank lines after sub-titles and after list context.
  - 8 warning scanners detect what must not be auto-edited and report it instead: credentials in the report, single-item lists that will not render, screenshots with no description or a placeholder filename, acronyms that are never written out, combined steps, references to other findings, mid-sentence target links, and first or second person the phrase map could not rewrite.
  - A preview modal now stands between the click and the edit, listing every rule that fired with its count plus the warnings, with Cancel and Apply. It is populated through the DOM rather than an HTML string, because warning messages quote the report back and `createModal` assigns its argument to `innerHTML`.
  - Both surfaces run the identical rule set: the report editor and the submission comment box.
- `tests/format-rules.test.js` adds 115 assertions covering every rule, the guide's own examples, idempotency, and the negative cases that must survive untouched. Runs as `node tests/format-rules.test.js` with no dependencies, and sits outside `extension/` so `build.sh` does not ship it.

### Fixed
Found by auditing the rules above back against the PDF. All ten were reproduced against the running code before being fixed.
- Greeting and sign-off stripping deleted real sentences. The patterns matched a keyword plus any 30 to 40 further characters, so a report ending `Best practices were not followed`, or opening `Hello world is reflected in the response`, silently lost that line. The keyword may now be followed by at most two more words and punctuation.
- CRLF input disabled most of the list rules. In a JS regex `.` does not match CR, and the list-item and fence patterns anchor with `(.*)$`, so on CRLF every list line failed to match. That meant no marker normalisation, no renumbering, no trailing-period stripping, no list-type enforcement, no code-fence language tag, and mixed line endings in the output. Line endings are now normalised once on entry to `applyFormatRules` and `scanFormatWarnings`.
- Nested detail under a numbered step was flattened into numbers. `1. Open the page` followed by `- use the test account` became a nested ordered list. List-type enforcement now applies to top-level items only, since the guide is choosing a list style per section rather than renumbering sub-detail.
- A report with no section heading lost all step numbering, because "no section seen yet" was treated as "not Steps to Reproduce" and every ordered list was demoted to bullets. It is now treated as neutral, and the new bare-label promotion means most such reports get proper handling instead.
- Renumbering restarted after any bullet. A nested bullet cleared every indent level's counter, so the outer list began again at 1. Only the bullet's own depth and below are cleared now.
- Every whole-line bold was title-cased, turning `**The application does not validate the session token**` into title case. Only title-shaped lines are title-cased now, meaning five words or fewer with no terminal punctuation. Colon-stripping stays unconditional, since that rule is unambiguous.
- Trailing periods survived on any list item ending in a digit, because the guard against version numbers was a bare `\d\.`. It is now a dotted version, so `The server returns HTTP 500.` is stripped while `Affects version 1.5.` is kept.
- Removing a "reach out with questions" sentence left a leading space when it opened the line.
- The cross-reference warning fired on "as per the report", which is ordinary prose. It now needs a qualifier (`other`, `previous`, `another` or `earlier`) or an explicit number.
- The combined-steps warning split on a URL's trailing period, so `Send the request to https://a.test/b. Observe the response` read as two sentences. URLs and code spans are blanked before splitting, and a capital is required after the break.

### Changed
- Image embeds are now emitted as `>![name](url)` preceded by a lone `>` line and followed by a blank line, which is the picture context block the guide's example shows, rather than the previous `> ![name](url)`. Reports formatted by 1.8.0 are tightened once on the next click and are stable after that.
- `setNativeValue()` takes an `eventNames` argument, defaulting to `['input']` so existing callers are unchanged. The Target picker passes `['input', 'change']`.
- Removed `.ca-username-tooltip` from `style.css`, a byte-for-byte duplicate of `.username-tooltip` that nothing referenced.
- AI Generate Report no longer produces `## Summary` style headings. The guide reserves markdown headers for the Bugcrowd platform, so the generator was emitting output that violated its most emphatic rule on every run. The template now asks for `**Summary**` and adds the third-person, no-trailing-period and no-`Now`/`Then` constraints.

### Notes
- Rules that need real judgment are deliberately absent, because a regex attempting them corrupts reports. That covers rewriting arbitrary prose into third person, capitalising the first word of a sentence (indistinguishable from a payload or hostname), expanding an acronym in context, constructing a compliant `Vulnerability - Target` title, deciding which strings belong in a code block, splitting combined steps, and moving target links out of mid-sentence. The warning scanners flag these where they are detectable.
- Six guide rules are not implementable in a browser extension at all: the font limit (the editor is a plain markdown textarea), adding a black border to a white-background screenshot, cropping, annotating with callouts and arrows, "be careful about copy/pasting", and including client communications in the finding.
- Idempotency carries the whole design, since phase C writes `>` prefixes and a rule that fails to recognise its own output would stack `> > >` on every click. Every rule detects its own result, `collapse-blanks` keeps inserted spacing from drifting, and the test suite asserts `apply(apply(x)) === apply(x)` on every fixture.
- The guide's own examples round-trip with zero fixes reported: the picture block (`Some Step Foo:` / `>` / `>![…]`) and the code-block form (`>```http`, bare content lines, `>` for the blank lines inside, `>```). The `>`-with-no-space convention matches all three examples in the guide.

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

### Changed
- Updated both AI backends. OpenAI moves from `gpt-3.5-turbo` to `gpt-5.6-luna`, and Anthropic from `claude-sonnet-4-6` to `claude-sonnet-5`.
  - `gpt-3.5-turbo` is deprecated and shuts down on 2026-10-23, so the OpenAI path had a hard expiry date. Luna is the cost-optimized tier of the current family; these calls are short (400-1500 max tokens) and not reasoning-heavy.
  - `claude-sonnet-4-6` was not deprecated, but Sonnet 5 gives near-Opus quality on the same tier.
  - The Anthropic request no longer sends `temperature`: Sonnet 5 rejects a non-default value with a 400, so a bare model swap would have broken every AI feature. Tone is steered from the system prompts, which already specify it.
  - The Anthropic request now sets `thinking: {type: 'disabled'}` explicitly. Sonnet 5 runs adaptive thinking when the field is omitted, and `max_tokens` caps thinking plus response text together, so a thinking pass would have truncated these short replies.
  - The OpenAI request still sends `temperature`, which that API accepts.

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
