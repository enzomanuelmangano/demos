# Demos CLI

A CLI that allows you to download React Native animations from the [demos repository](https://github.com/enzomanuelmangano/demos) to your project.

## Installation

### Using npx (recommended)

```bash
npx demos-cli get <animation-name>
```

### Global installation

```bash
npm install -g demos-cli
demos get <animation-name>
```

### Local installation

```bash
npm install demos-cli
npx demos get <animation-name>
```

## Usage

### Basic Commands

```bash
# Show help
npx demos-cli

# List all available animations
npx demos-cli list

# Download an animation to your project
npx demos-cli get <animation-name>
```

### Examples

```bash
# Download the action-tray animation
npx demos-cli get action-tray

# Download the airbnb-slider animation
npx demos-cli get airbnb-slider

# List all available animations
npx demos-cli list
```

## Configuration

Create a `demos.json` file in your project root to configure where animations should be copied:

```json
{
  "target": "components/ui"
}
```

If no configuration file is found, animations will be copied to `components/ui` by default.

## How it works

1. The CLI looks for a `demos.json` configuration file in your project root
2. If found, it reads the `target` directory from the config
3. If not found, it defaults to `components/ui`
4. It downloads the entire animation directory from the GitHub repository to `<target>/<animation-name>`
5. It preserves the original directory structure and all files
6. All animations are fetched from: [https://github.com/enzomanuelmangano/demos](https://github.com/enzomanuelmangano/demos)

## Available Animations

Run `npx demos-cli list` to see all available animations. Some popular ones include:

- `action-tray` - A customizable action tray component
- `airbnb-slider` - A smooth slider component
- `loading-button` - An animated loading button
- `toast` - A toast notification component
- `floating-modal` - A floating modal component

## File Structure

When you copy an animation, the entire directory structure is preserved:

```
components/ui/
└── action-tray/
    ├── components/
    │   ├── ActionTray.tsx
    │   └── ActionTrayButton.tsx
    ├── constants/
    │   └── palette.ts
    └── index.tsx
```

## Development

To modify the CLI:

1. Edit `cli/index.js`
2. Test your changes: `node index.js <command>`
3. Make sure the script is executable: `chmod +x index.js`
4. Publish to npm: `npm publish`

## Source

This CLI downloads animations from the [demos repository](https://github.com/enzomanuelmangano/demos) created by [Enzo Manuel Mangano](https://github.com/enzomanuelmangano). The repository contains a collection of React Native animations crafted with Reanimated, Gesture Handler, and Skia.

## Inspired by

[ShadCn UI](https://github.com/shadcn-ui)
