# CrowdAssist

CrowdAssist is a browser extension for **Chrome** and **Firefox** aimed at bug bounty researchers working on Bugcrowd. It adds report-writing and submission-management helpers to the pages you already use, some of them backed by an AI model.

Most of it is small stuff that removes friction: exporting a report as Markdown, keeping your session from timing out, formatting images the way triage asks for, and drafting replies to program teams.

## Features

### Session Management
*Available globally when using Bugcrowd*

- **Auto-Renew Session** - Automatically refreshes your Bugcrowd session every hour to prevent the 2-hour timeout, keeping you logged in during long research sessions

### Report Creation
*Available on Bugcrowd report creation pages*

- **Highlight Code Blocks** - Colours fenced code blocks while you type, using Bugcrowd's own preview colours, so a `curl` command or an HTTP request reads the way it will after you submit. Covers http, bash, json, xml, ruby, python and sql. Off by default: it draws a layer over the editor, so switch it on in the popup and switch it back off if anything looks doubled. Colours match Preview, though token boundaries can differ slightly, since Bugcrowd highlights server-side and this runs locally
- **VRT Severity Badges** - Puts the taxonomy's own priority on every row of the VRT Category picker, so you can see what you're picking. Searching `idor` returns five rows that read almost identically and actually span P1 to P5, and that difference is now visible while you choose rather than after triage. The taxonomy is fetched once, cached locally and refreshed weekly, so it costs one request a week and nothing on the page's critical path. Entries the taxonomy leaves to the program get no badge. The badge is the VRT baseline, so Bugcrowd's own note that a program may rate it differently still applies
- **Searchable Target** - The Target dropdown becomes a search box. Type any part of a hostname to filter the scope list instead of scrolling a column of near-identical URLs, with the match highlighted and full keyboard control (arrows, Enter, Escape, Home/End). The real dropdown is still underneath and one click away via "Use the original dropdown" at the bottom of the list
- **Include Your IP** - Insert your public IP address into reports with one click
- **AI Report Review** ✨ - Runs your draft through the AI model and suggests fixes to wording and structure
- **Auto Create Report (Experimental)** ✨ - Drafts a full report from what you have so far. Treat the output as a starting point, not something to submit as-is

### Submission Management
*Available on Bugcrowd submission pages*

- **Copy as Markdown** - Export complete submission reports as properly formatted Markdown
- **Triage Time Insight** - Shows how long triage took, displayed under the Status panel. Measured from submission to the first state change, so it appears on every decided submission (Triaged, Resolved, Unresolved, Not Applicable, Informational…) and stays hidden only while the report is still New
- **Hide Bounties** - Toggle to hide every reward figure: the bounty sidebar and each card's reward on the submissions list, plus the reward and any reward activity on individual submission pages. Switch it from the on-page button or the synced checkbox in the popup; your choice is remembered across reloads
- **Smart Commenting** - Additions to the comment box:
  - **Include Your IP** - Add your public IP to the report comments
  - **Username Mentions** - Type `@` + name for autocomplete of Program Managers or Platform Team
  - **AI Review Text** ✨ - Cleans up grammar and phrasing in a comment without changing what you said
  - **Auto-Reply** ✨ - Drafts a response to the last program team comment. Read it before you send it

## Screenshots

### Copy Markdown

*Exporting a submission report as Markdown*

![Copy as Markdown Feature](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_copy_as_markdown.png)

### Report Creation

*Review and drafting tools on the report creation page*

![AI Report Review](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen1.png)

![AI Report Enhancement](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen2.png)

![Auto Create Report](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen3.png)

### Submission Management

*The comment box additions*

![AI Reply and Text Review](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/comment_screen2.png)

![Smart Commenting Features](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/comment_screen1.png)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## Installation

CrowdAssist uses different manifest versions for Chrome and Firefox due to browser-specific requirements. A helper script is provided to easily switch between them.

### Chrome / Chromium / Edge / Brave

1. Download this repository as a ZIP file and unzip it, or clone the repository.
2. **Ensure you're using the Chrome manifest** (default):
   ```bash
   ./switch-manifest.sh chrome
   ```
3. Open your browser and navigate to `chrome://extensions` (or equivalent).
4. Enable "Developer mode" using the toggle in the top-right corner.
5. Click the "Load unpacked" button.
6. Select the `extension` directory.

### Firefox

1. Download this repository as a ZIP file and unzip it, or clone the repository.
2. **Switch to Firefox manifest:**
   ```bash
   ./switch-manifest.sh firefox
   ```
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
4. Click "Load Temporary Add-on".
5. Navigate to the `extension` directory and select `manifest.json`.

> **Important:** Firefox always reads the file named `manifest.json` from the extension directory. The switch script temporarily replaces it with the Firefox-compatible version.

### Switching Between Browsers

When testing in both browsers during development:

```bash
# Switch to Firefox mode
./switch-manifest.sh firefox

# Switch back to Chrome mode
./switch-manifest.sh chrome
```

The script automatically backs up and restores the correct manifest for each browser.

---

The extension is now installed and will be active on Bug Bounty Platform pages (Refresh could be needed).

> **Technical Note:** Chrome requires Manifest V3 with service workers, while Firefox uses the more stable Manifest V2 with background scripts. The JavaScript code is identical - only the manifest differs. See [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md) for detailed technical information.

### Configure CrowdAssist Settings

Click the CrowdAssist extension icon in your browser toolbar to access settings:

#### Auto-Renew Session (Enabled by Default)

The Auto-Renew Session feature is **enabled by default** and works automatically in the background:

- Refreshes your Bugcrowd session every hour
- Prevents the 2-hour session timeout
- Can be toggled on/off in the extension popup

> **Note:** This feature works silently in the background. Make sure you're logged into Bugcrowd for it to function properly.

#### Set the API Token

The AI features need an OpenAI API token:

1. Get your API token from [OpenAI's platform](https://platform.openai.com/api-keys)
2. Click the CrowdAssist icon in your browser and enter your API token
3. Save settings and start using AI features

> **Note:** Your API token is stored locally in your browser and never shared. Basic features like "Copy as Markdown", "Username Mentions", and "Auto-Renew Session" work without an API token.

## Contributors

- **bsysop** - Creator
  - Twitter: [@bsysop](https://twitter.com/bsysop)

## Contributing

This is an open-source project. If you have an idea for a feature or you found a bug, open an issue or send a pull request.

### Development Workflow

1. **Testing in Both Browsers:**
   - Use `./switch-manifest.sh chrome` or `./switch-manifest.sh firefox` to switch between browser manifests
   - Test all features in both browsers before submitting PRs

2. **Building Distribution Packages:**
   ```bash
   ./build.sh
   ```
   This creates ready-to-distribute ZIP files in the `dist/` directory:
   - `crowdassist-chrome.zip` - For Chrome Web Store
   - `crowdassist-firefox.zip` - For Firefox Add-ons (AMO)

3. **Code Structure:**
   - All JavaScript files include browser API polyfills for cross-browser compatibility
   - Manifest files are browser-specific but the codebase is shared
   - See [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md) for technical details

## Potential TODOs

- [ ] Implement Hackerone support (Under review)
- [ ] Implement YesWeHack support (Under review)
- [ ] Implement Intigriti support (Under review)
- [ ] Copy/Export Program Scope
- etc

## Privacy Note

CrowdAssist only reads data on Bug Bounty Platform pages, such as usernames for autocomplete and submission content for report export.

**Session Management:** The Auto-Renew Session feature reads your Bugcrowd session cookies to maintain your login session. These cookies are only used to send refresh requests to Bugcrowd's servers and are never transmitted elsewhere.

**API Token:** Your OpenAI API token is stored locally in your browser and never shared externally. 

The extension does not collect or store your data, and it sends nothing to third parties. The source is all here if you want to check.