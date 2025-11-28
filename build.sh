#!/bin/bash
# Build script for CrowdAssist - Creates distribution packages for Chrome and Firefox

set -e  # Exit on error

echo "🔨 Building CrowdAssist extension packages..."
echo ""

# Create dist directory if it doesn't exist
mkdir -p dist

# Clean previous builds
rm -f dist/crowdassist-chrome.zip
rm -f dist/crowdassist-firefox.zip

# Build for Chrome
echo "📦 Building Chrome package..."
cd extension
zip -r ../dist/crowdassist-chrome.zip . -x "manifest.firefox.json" -x "*.DS_Store"
cd ..
echo "✅ Chrome package: dist/crowdassist-chrome.zip"
echo ""

# Build for Firefox
echo "Building Firefox package..."
cd extension

# Temporarily rename Firefox manifest
cp manifest.json manifest.json.backup
cp manifest.firefox.json manifest.json

zip -r ../dist/crowdassist-firefox.zip . -x "manifest.json.backup" -x "manifest.firefox.json" -x "*.DS_Store"

# Restore original manifest
mv manifest.json.backup manifest.json

cd ..
echo "✅ Firefox package: dist/crowdassist-firefox.zip"
echo ""

# Show file sizes
echo "Package sizes:"
ls -lh dist/*.zip | awk '{print $9 " - " $5}'
echo ""

echo "Build complete! Packages are in the dist/ directory"

