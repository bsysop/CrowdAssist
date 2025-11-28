# CrowdAssist - Browser Compatibility

CrowdAssist is compatible with both **Chrome** and **Firefox** using a single codebase with separate manifest files for each browser.

## Quick Start

### Chrome / Chromium / Edge / Brave

1. Ensure Chrome manifest is active:
   ```bash
   ./switch-manifest.sh chrome
   ```
2. Open `chrome://extensions/` (or equivalent)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension/` folder

### Firefox

1. Switch to Firefox manifest:
   ```bash
   ./switch-manifest.sh firefox
   ```
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to the `extension/` folder and select `manifest.json`

> **Key Point:** Firefox always reads the file named `manifest.json`, which is why we use a switch script to swap between the Chrome and Firefox versions.

## Why Two Manifests?

While both browsers support web extensions, they have different manifest requirements:

| Feature | Chrome (MV3) | Firefox (MV2) |
|---------|-------------|---------------|
| Manifest Version | 3 | 2 (more stable) |
| Background Script | `service_worker` | `scripts` |
| Popup Action | `action` | `browser_action` |
| Permissions | Separate `host_permissions` | Combined in `permissions` |
| Web Resources | Object format | Array format |

The JavaScript code is identical - only the manifest configuration differs.

## Browser API Compatibility

All JavaScript files include a compatibility shim at the top:

```javascript
// Browser API compatibility shim for Chrome and Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}
```

This ensures seamless API compatibility:
- **Firefox**: Natively uses `browser.*` API (returns Promises)
- **Chrome**: Uses `chrome.*` API, polyfill provides `browser.*` wrapper

## Development Workflow

### Manifest Switching

Use the provided script to switch between browser manifests:

```bash
# Switch to Firefox manifest (Manifest V2)
./switch-manifest.sh firefox

# Switch back to Chrome manifest (Manifest V3)
./switch-manifest.sh chrome
```

The script:
- Backs up the current `manifest.json` as `manifest.chrome.json`
- Copies `manifest.firefox.json` to `manifest.json` (or vice versa)
- Ensures you're always using the correct manifest for your target browser

### Testing in Both Browsers

**Chrome:**
```bash
./switch-manifest.sh chrome
# Then reload the extension in chrome://extensions
```

**Firefox:**
```bash
./switch-manifest.sh firefox
# Then remove and re-add the extension in about:debugging
```

### Verifying Active Manifest

Check which manifest is currently active:

```bash
# Check manifest version
grep "manifest_version" extension/manifest.json

# If it shows "2" → Firefox manifest
# If it shows "3" → Chrome manifest
```

## Distribution / Packaging

### Chrome Web Store

1. Create a ZIP file with the `extension/` folder contents
2. **Exclude** `manifest.firefox.json` from the package
3. Include only `manifest.json` (MV3 with service_worker)

```bash
cd extension
zip -r ../crowdassist-chrome.zip . -x "manifest.firefox.json"
```

### Firefox Add-ons (AMO)

1. Create a ZIP file with the `extension/` folder contents
2. **Rename** `manifest.firefox.json` to `manifest.json` before packaging
3. Or use a build script to swap manifests automatically

```bash
cd extension
cp manifest.firefox.json manifest.json
zip -r ../crowdassist-firefox.zip .
git restore manifest.json  # restore original
```

## Build Script (Optional)

You can create a simple build script to automate packaging:

```bash
#!/bin/bash

# Build for Chrome
cd extension
zip -r ../dist/crowdassist-chrome.zip . -x "manifest.firefox.json"

# Build for Firefox
cp manifest.firefox.json manifest.json
zip -r ../dist/crowdassist-firefox.zip .
git restore manifest.json

echo "✅ Built packages for both browsers in dist/"
```

## Technical Details

### Service Workers vs Background Scripts

**Chrome MV3** requires service workers:
- Event-driven, non-persistent background script
- More resource efficient
- Required for Chrome Web Store submissions

**Firefox MV2** uses traditional background scripts:
- More stable and mature implementation
- Firefox MV3 service worker support is still experimental
- Fully compatible with all Firefox versions 91+

Both approaches work identically from the extension's perspective thanks to the browser API polyfill.

## Troubleshooting

### Firefox: "service_worker is currently disabled"

This means Firefox tried to use the Chrome manifest. Solution:
- Make sure to select `manifest.firefox.json` when loading
- If you see this error, remove the extension and re-add it

### Chrome: "background.scripts requires manifest version 2 or lower"

This means Chrome tried to use the Firefox manifest. Solution:
- Chrome automatically uses `manifest.json` from the folder
- Make sure `manifest.json` contains `service_worker`, not `scripts`

### Both Browsers: API calls failing

Check that the browser polyfill is present at the top of each JS file:
- `background.js`
- `content.js`
- `popup.js`
