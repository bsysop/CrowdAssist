# CrowdAssist

An assistant for Bug Bounty Researchers to help with report writing on Bugcrowd.

## Features

CrowdAssist offers two main features to streamline your workflow.

### Username Mentions

Quickly mention researchers and Bugcrowd staff in comments by typing `@` followed by their name. A helpful tooltip will appear to autocomplete the username.

![Username Mentions Feature](https://github.com/bsysop/CrowdAssist/blob/main/screenshots/tag_feature.gif?raw=true)

### Copy as Markdown

Easily copy the full submission report as Markdown with a single click. The "Copy as Markdown" button appears at the top of the submission details.

![Copy as Markdown Feature](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/copy_markdown_feature.gif)

### Include My IP

Quickly add your public IP address to a comment.

![Include My IP Feature](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/include_my_ip.gif)

## Changelog

### v1.1
- Added "Include My IP" feature to quickly add your public IP address to comments.

### v1.0
- Initial release.
- Features: Username Mentions and Copy as Markdown.

## Installation

1. Download this repository as a ZIP file and unzip it, or clone the repository.
2. Open your Chrome browser and navigate to `chrome://extensions`.
3. Enable "Developer mode" using the toggle in the top-right corner.
4. Click the "Load unpacked" button.
5. Select the `CrowdAssist` directory.

The extension is now installed and will be active on Bugcrowd pages (Refresh could be needed).

## Contributing

This is an open-source project. If you have ideas for new features or have found a bug, please feel free to open an issue or submit a pull request.

## Potential TODOs

- [ ] Copy/Export Program Scope
- etc

## Privacy Note

This extension enhances your workflow by reading public usernames directly from the submission's activity feed. It does this by looking for specific HTML tags (`span.owner-name[data-tooltip-id]`) and does not read or store any other data from the page. The full source code is available in `content.js` for auditing. 