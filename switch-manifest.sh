#!/bin/bash
# Switch between Chrome and Firefox manifests for development

if [ "$1" == "firefox" ]; then
    echo "🦊 Switching to Firefox manifest..."
    cd extension
    cp manifest.json manifest.chrome.json
    cp manifest.firefox.json manifest.json
    echo "✅ Now using Firefox manifest (Manifest V2)"
    echo "   You can now load the extension in Firefox"
    echo ""
    echo "   To switch back: ./switch-manifest.sh chrome"
elif [ "$1" == "chrome" ]; then
    echo "🌐 Switching to Chrome manifest..."
    cd extension
    if [ -f manifest.chrome.json ]; then
        cp manifest.chrome.json manifest.json
        echo "✅ Now using Chrome manifest (Manifest V3)"
        echo "   You can now load the extension in Chrome"
    else
        echo "⚠️  manifest.chrome.json backup not found"
        echo "   Restoring from git..."
        git restore manifest.json
        echo "✅ Restored Chrome manifest from git"
    fi
    echo ""
    echo "   To switch back: ./switch-manifest.sh firefox"
else
    echo "Usage: ./switch-manifest.sh [chrome|firefox]"
    echo ""
    echo "Examples:"
    echo "  ./switch-manifest.sh firefox   - Switch to Firefox manifest"
    echo "  ./switch-manifest.sh chrome    - Switch to Chrome manifest"
    exit 1
fi

