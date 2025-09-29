#!/bin/bash

# Demos CLI Installation Script

echo "🚀 Installing Demos CLI..."

# Make the CLI executable
chmod +x index.js

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Test the CLI
echo "🧪 Testing CLI..."
node index.js list > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Demos CLI installed successfully!"
    echo ""
    echo "Usage:"
    echo "  node index.js get <animation-name>  # Copy an animation"
    echo "  node index.js list                  # List available animations"
    echo ""
    echo "Example:"
    echo "  node index.js get action-tray"
    echo ""
    echo "For more information, run: node index.js"
else
    echo "❌ Installation failed. Please check the error messages above."
    exit 1
fi
