# CrowdAssist

CrowdAssist is a Chrome extension designed specifically for bug bounty researchers and Bug Bounty Platforms. It enhances your research workflow with AI-powered report writing, intelligent automation tools, and productivity features that save time and improve the quality of your vulnerability submissions.

Whether you're writing reports, managing submissions, or communicating with triager or program teams, CrowdAssist provides the tools you need to work more efficiently and professionally.

## Features

### Report Creation & Enhancement
*Available on Bugcrowd report creation pages*

- **Include Your IP** - Insert your public IP address into reports with one click
- **AI Report Review** ✨ - Leverage ChatGPT to analyze and improve your report for clarity, completeness, and impact
- **Auto Create Report (Experimental)** ✨ - Generate comprehensive, well-structured vulnerability reports using AI assistance and best practices

### Submission Management
*Available on Bugcrowd submission pages*

- **Copy as Markdown** - Export complete submission reports as properly formatted Markdown
- **Smart Commenting** - Enhanced commenting system with multiple productivity features:
  - **Include Your IP** - Add your public IP to the report comments
  - **Username Mentions** - Type `@` + name for autocomplete of Program Managers or Platform Team
  - **AI Review Text** ✨ - Polish your comments using ChatGPT for professional, clear and effective communication
  - **Auto-Reply** ✨ - Generate contextual responses to program team comments with AI assistance (Need to be validated by yourself)

## Screenshots

### Copy Markdown

*Effortlessly export submission reports as formatted Markdown*

![Copy as Markdown Feature](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_copy_as_markdown.png)

### Report Creation

*AI-powered report enhancement and creation tools*

![AI Report Review](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen1.png)

![AI Report Enhancement](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen2.png)

![Auto Create Report](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/report_screen3.png)

### Submission Management

*Enhanced commenting system with multiple productivity features*

![AI Reply and Text Review](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/comment_screen2.png)

![Smart Commenting Features](https://raw.githubusercontent.com/bsysop/CrowdAssist/refs/heads/main/screenshots/comment_screen1.png)

## Changelog

### v1.3.0
- Added **Dark Mode Support** with system default, light, and dark theme options (automatically follows your OS setting)
- Improved **Modal Interface** with floating dialogs replacing basic prompts
- Minor fixes

### v1.2
- Added **AI Review Text** button to improve comment text using ChatGPT
- Added **Auto-Reply** button to generate responses to program team comments
- Added **Report Creation helper** features for submission pages:
  - Include My IP button for report creation pages
  - AI Review Report button to improve vulnerability reports
- Enhanced button placement and styling
- Added OpenAI API integration for AI-powered features
- Improved page detection to distinguish between report creation and visualization pages

### v1.1
- Added "Include My IP" feature to quickly add your public IP address to comments.

### v1.0
- Initial release.
- Features: Username Mentions and Copy as Markdown.

## Installation

### Install CrowdAssist

1. Download this repository as a ZIP file and unzip it, or clone the repository.
2. Open your Chrome browser and navigate to `chrome://extensions`.
3. Enable "Developer mode" using the toggle in the top-right corner.
4. Click the "Load unpacked" button.
5. Select the `CrowdAssist` directory.

The extension is now installed and will be active on the Bug Bounty Platform pages (Refresh could be needed).

### Set ChatGPT API Token

To use CrowdAssist's AI-powered features, you'll need an OpenAI API token:

1. Get your API token from [OpenAI's platform](https://platform.openai.com/api-keys)
2. Click the CrowdAssist icon in your browser and enter your API token
3. Save settings and start using AI features

> **Note:** Your API token is stored locally in your browser and never shared. Basic features like "Copy as Markdown" and "Username Mentions" work without an API token.

## Contributors

- **bsysop** - Creator
  - Twitter: [@bsysop](https://twitter.com/bsysop)

## Contributing

This is an open-source project. If you have ideas for new features or have found a bug, please feel free to open an issue or submit a pull request.

## Potential TODOs

- [ ] Implement Hackerone support (Under review)
- [ ] Implement YesWeHack support (Under review)
- [ ] Implement Intigriti support (Under review)
- [ ] Copy/Export Program Scope
- etc

## Privacy Note

CrowdAssist only accesses the Information on the Bug Bounty Platform pages to enhance your workflow, such as usernames for autocomplete and submission content for report export. Your OpenAI API token is stored locally in your browser and never shared externally. No sensitive data is collected, transmitted, or stored by the extension. The complete source code is available for transparency and auditing. 