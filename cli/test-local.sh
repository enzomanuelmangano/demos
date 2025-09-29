#!/bin/bash

# Local testing script for Demos CLI

echo "🧪 Testing Demos CLI locally..."

# Create test project
TEST_DIR="test-project"
mkdir -p "$TEST_DIR/components/ui"
cd "$TEST_DIR"

echo "📁 Created test project in $TEST_DIR"

# Test help command
echo "🔍 Testing help command..."
node ../index.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Help command works"
else
  echo "❌ Help command failed"
  exit 1
fi

# Test list command
echo "📋 Testing list command..."
node ../index.js list > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ List command works"
else
  echo "❌ List command failed"
  exit 1
fi

# Test get command with a simple animation
echo "⬇️ Testing get command with action-tray..."
node ../index.js get action-tray > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Get command works"
  
  # Check if files were downloaded
  if [ -d "components/ui/action-tray" ]; then
    echo "✅ Files downloaded successfully"
    echo "📁 Downloaded structure:"
    find components/ui/action-tray -type f | head -10
  else
    echo "❌ Files not downloaded"
    exit 1
  fi
else
  echo "❌ Get command failed"
  exit 1
fi

# Test with config file
echo "⚙️ Testing with config file..."
echo '{"target": "src/components"}' > demos.json
node ../index.js get loading-button > /dev/null 2>&1
if [ $? -eq 0 ] && [ -d "src/components/loading-button" ]; then
  echo "✅ Config file works"
else
  echo "❌ Config file test failed"
  exit 1
fi

# Cleanup
cd ..
rm -rf "$TEST_DIR"

echo ""
echo "🎉 All tests passed! CLI is ready for publication."
echo ""
echo "To publish:"
echo "  cd cli"
echo "  ./publish.sh"
echo ""
echo "Or use GitHub Actions:"
echo "  git tag cli-v1.0.0"
echo "  git push origin cli-v1.0.0"
