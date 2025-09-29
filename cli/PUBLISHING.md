# Publishing Demos CLI to npm

This document explains how to publish the Demos CLI to npm and make it available for users to install and use.

## Overview

The Demos CLI allows users to download React Native animations from this repository directly to their projects using a simple command similar to shadcn.

## Files Structure

```
cli/
├── index.js           # Main CLI entry point
├── package.json       # npm package configuration
├── README.md          # User documentation
├── install.sh         # Local installation script
├── publish.sh         # Publishing script
├── test-local.sh      # Local testing script
└── PUBLISHING.md      # This file
```

## Publishing Process

### 1. Manual Publishing

```bash
cd cli
./publish.sh
```

This script will:

- Check npm login status
- Update version (if specified)
- Run tests
- Publish to npm

### 2. Automated Publishing with GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/publish-cli.yml`) that automatically publishes when:

- A tag starting with `cli-v` is pushed
- Manual workflow dispatch is triggered

#### Using Tags:

```bash
git tag cli-v1.0.0
git push origin cli-v1.0.0
```

#### Using Manual Dispatch:

1. Go to Actions tab in GitHub
2. Select "Publish CLI to npm"
3. Click "Run workflow"
4. Enter version number

## Prerequisites

### For Manual Publishing:

1. npm account with publish permissions
2. Logged in to npm: `npm login`
3. NPM_TOKEN environment variable (for CI/CD)

### For Automated Publishing:

1. NPM_TOKEN secret in GitHub repository settings
2. Repository write permissions

## Testing

Before publishing, run the local test script:

```bash
cd cli
./test-local.sh
```

This will:

- Test help command
- Test list command
- Test get command
- Test config file functionality
- Verify file downloads

## Usage After Publishing

Once published, users can install and use the CLI:

### Using npx (recommended):

```bash
npx demos-cli get action-tray
npx demos-cli list
```

### Global installation:

```bash
npm install -g demos-cli
demos get action-tray
demos list
```

### Local installation:

```bash
npm install demos-cli
npx demos get action-tray
```

## Configuration

Users can create a `demos.json` file in their project root:

```json
{
  "target": "components/ui"
}
```

If no config file exists, animations are downloaded to `components/ui` by default.

## Source Repository

The CLI downloads animations from:

- Repository: https://github.com/enzomanuelmangano/demos
- Branch: main
- Path: src/animations/

## Version Management

- Follow semantic versioning (semver)
- Update version in `package.json`
- Use descriptive commit messages
- Tag releases with `cli-v` prefix

## Troubleshooting

### Common Issues:

1. **npm login required**: Run `npm login` before publishing
2. **Permission denied**: Check npm account permissions
3. **Version already exists**: Increment version number
4. **GitHub API rate limits**: Wait and retry

### Testing Issues:

1. **Network connectivity**: Ensure internet connection
2. **GitHub API access**: Check if repository is accessible
3. **File permissions**: Ensure CLI script is executable

## Support

For issues with the CLI:

1. Check the [GitHub repository](https://github.com/enzomanuelmangano/demos)
2. Open an issue with CLI label
3. Check npm package page for documentation

## License

The CLI is published under the same license as the main repository (MIT).
