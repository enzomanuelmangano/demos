#!/bin/bash

# Demos CLI Publishing Script

echo "🚀 Publishing Demos CLI to npm..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Make sure you're in the cli directory."
  exit 1
fi

# Check if npm is logged in
if ! npm whoami > /dev/null 2>&1; then
  echo "❌ Error: Not logged in to npm. Run 'npm login' first."
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Current version: $CURRENT_VERSION"

# Ask for new version
read -p "Enter new version (or press Enter to keep $CURRENT_VERSION): " NEW_VERSION

if [ -n "$NEW_VERSION" ]; then
  echo "📝 Updating version to $NEW_VERSION..."
  npm version "$NEW_VERSION"
fi

# Run tests
echo "🧪 Running tests..."
node index.js list > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed"
  exit 1
fi

# Publish to npm
echo "📤 Publishing to npm..."
npm publish

if [ $? -eq 0 ]; then
  echo "✅ Successfully published to npm!"
  echo ""
  echo "🎉 Your CLI is now available at:"
  echo "   npx demos-cli get <animation-name>"
  echo ""
  echo "📚 Documentation: https://www.npmjs.com/package/demos-cli"
else
  echo "❌ Failed to publish to npm"
  exit 1
fi
