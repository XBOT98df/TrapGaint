#!/bin/bash
# Quick one-liner to fix macOS Gatekeeper issues
xattr -cr "/Applications/Dragon Client.app" && echo "✅ Dragon Client is now ready to launch!"
