# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `yarn install` - Install dependencies
- `yarn ios` - Run on iOS simulator/device
- `yarn android` - Run on Android emulator/device
- `npx tsc --noEmit` - Run TypeScript type checking
- `npx eslint src --ext .js,.jsx,.ts,.tsx` - Run ESLint linting
- `yarn format` - Auto-fix ESLint issues (uses bun)
- `yarn prettier-format` - Format code with Prettier

### Build & Deployment
- `yarn prebuild` - Generate native project files with Expo prebuild
- `yarn build:ios` - Build iOS app with EAS
- `yarn submit:ios` - Submit iOS app to App Store

## Architecture Overview

### Project Structure
This is an Expo-based React Native animation showcase app using Expo SDK 51. The app demonstrates 120+ animation examples using modern animation libraries.

### Navigation Architecture
- **Expo Router**: File-based routing with `app/` directory
  - `app/_layout.tsx`: Root layout with gesture handler and haptics setup
  - `app/animations/[slug].tsx`: Dynamic route that renders animations based on slug parameter
  - Uses drawer navigation for main menu

### Animation System
- **Registry Pattern**: All animations are registered in `src/animations/registry.ts`
  - Each animation exports a component and metadata
  - Dynamic imports handled through registry functions
  - Animations are self-contained in their own folders

### Key Libraries
- **Animation**: React Native Reanimated 4.1, React Native Skia, Lottie
- **Gestures**: React Native Gesture Handler, pressto (for pressable configs)
- **UI Components**: Custom implementations, no major UI library

### TypeScript Issues Fixed
1. **NavigationContainer `independent` prop**: Removed from 5 files (custom-drawer, gl-transitions, image-cropper, telegram-theme-switch, twitter-tab-bar)
   - NOTE: These components still use React Navigation which should be migrated to Expo Router
2. **Type safety improvements**:
   - Fixed `Function` type usage with proper type assertions
   - Replaced `any` types with proper type definitions in icon-factory.tsx

### Migration Note
The project is migrating from React Navigation to Expo Router. Components that still use NavigationContainer should be refactored to use Expo Router navigation patterns.

### Linting Configuration
- Extends `react-native-wcandillon` config with Prettier
- Key disabled rules:
  - `@typescript-eslint/explicit-module-boundary-types`
  - `@typescript-eslint/consistent-type-imports`
  - `import/no-useless-path-segments`

### Environment Variables
- `EXPO_PUBLIC_BACK_ICON_ENABLED` - Controls back icon visibility (default: true)

## Common Development Tasks

### Running Specific Animations
Animations are accessed via dynamic routes: `/animations/[slug]`
Example: `/animations/3d-scroll-transition`

### Adding New Animations
1. Create folder in `src/animations/your-animation/`
2. Export component from `index.tsx`
3. Register in `src/animations/registry.ts`

### Fixing Type Errors
Before committing, always run:
```bash
npx tsc --noEmit
npx eslint src --ext .js,.jsx,.ts,.tsx
```