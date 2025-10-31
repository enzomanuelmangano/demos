# Animation Metadata System

Deterministic metadata extraction and analysis for React Native animations.

## Overview

This system automatically extracts metadata from animation source code using **static AST analysis** — no AI, no manual work, 100% deterministic.

## Quick Start

```bash
# Extract metadata for one animation
npm run meta:extract everybody-can-cook

# Extract all animations
npm run meta:extract:all

# View statistics
npm run meta:stats

# View specific stats
npm run meta:stats -- --hooks --top 10
```

## What Gets Extracted

From your animation source code, the system automatically extracts:

- ✅ **Packages** (with versions from package.json)
- ✅ **Hooks** (useSharedValue, useAnimatedStyle, useDerivedValue, etc.)
- ✅ **Functions** (withTiming, withSpring, interpolate, etc.)
- ✅ **Components** (Animated.View, Animated.ScrollView, Canvas, etc.)
- ✅ **Patterns** (reactive-styling-pattern, scroll-animation, etc.)
- ✅ **Techniques** (spring-physics, staggered-timing, etc.)
- ✅ **File Structure** (entry, components, hooks, utils, types)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run meta:extract <slug>` | Extract single animation |
| `npm run meta:extract:all` | Extract all animations |
| `npm run meta:stats` | Show all statistics |
| `npm run meta:stats -- --hooks` | Show hook usage |
| `npm run meta:stats -- --functions` | Show function usage |
| `npm run meta:stats -- --patterns` | Show detected patterns |
| `npm run meta:stats -- --techniques` | Show techniques |
| `npm run meta:stats -- --packages` | Show package usage |
| `npm run meta:generate` | Generate content hashes |
| `npm run meta:validate` | Validate metadata freshness |

## Output Format

Extracted metadata is saved to `scripts/analytics/meta/{slug}.json`:

```json
{
  "animation_slug": "everybody-can-cook",
  "extracted_at": "2025-10-31T18:05:46.556Z",
  "file_structure": {
    "entry": "index.tsx",
    "components": ["components/staggered-text.tsx"],
    "hooks": [],
    "utils": []
  },
  "packages": ["react", "react-native", "react-native-reanimated"],
  "packages_with_versions": {
    "react": "19.1.0",
    "react-native-reanimated": "~4.1.1"
  },
  "hooks": ["useSharedValue", "useAnimatedStyle", "useDerivedValue"],
  "functions": ["withSpring", "withDelay", "interpolate"],
  "components": ["Animated.View", "Animated.Text"],
  "patterns": [
    "reactive-styling-pattern",
    "staggered-derived-values",
    "spring-animation"
  ],
  "techniques": [
    "spring-physics",
    "staggered-timing",
    "character-level-staggering"
  ],
  "stats": {
    "total_files": 3,
    "total_packages": 4,
    "total_hooks": 5,
    "total_functions": 5,
    "total_patterns": 9,
    "total_techniques": 6
  }
}
```

## Pattern Detection

The system automatically detects 20+ common patterns:

### Basic Patterns
- `shared-value-state` - Uses useSharedValue
- `animated-styling` - Uses useAnimatedStyle
- `derived-computation` - Uses useDerivedValue
- `scroll-animation` - Uses useAnimatedScrollHandler
- `gesture-animation` - Uses useAnimatedGestureHandler

### Animation Patterns
- `timing-animation` - Uses withTiming
- `spring-animation` - Uses withSpring
- `delayed-animation` - Uses withDelay
- `repeating-animation` - Uses withRepeat
- `sequence-animation` - Uses withSequence

### Complex Patterns
- `reactive-styling-pattern` - useSharedValue + useAnimatedStyle
- `staggered-derived-values` - useDerivedValue + withDelay
- `imperative-animation-api` - useImperativeHandle

## Technique Detection

The system identifies animation techniques:

- `spring-physics`
- `timing-based-transitions`
- `staggered-timing`
- `character-level-staggering`
- `scroll-based-animation`
- `gesture-based-animation`
- `transform-animations`
- `blur-effects`
- `canvas-rendering`

## Statistics

### View All Stats

```bash
npm run meta:stats
```

Output:
```
📊 Summary
────────────────────────────────────────────────────────────────────────────────

  Total Animations:           111
  With Metadata:              90
  Unique Hooks:               15
  Unique Functions:           20
  Unique Components:          25
  Unique Patterns:            18
  Unique Techniques:          12
  Unique Packages:            40

🪝 Most Used Hooks
────────────────────────────────────────────────────────────────────────────────

  1.  74 (82.2%) ██████████████████████████████████████████████ useSharedValue
  2.  72 (80.0%) ████████████████████████████████████████████ useAnimatedStyle
  3.  71 (78.9%) ██████████████████████████████████████████ useDerivedValue
```

### Filter by Category

```bash
# Hooks only
npm run meta:stats -- --hooks

# Functions only
npm run meta:stats -- --functions

# Patterns only
npm run meta:stats -- --patterns

# Top 15 results
npm run meta:stats -- --hooks --top 15
```

### Filter by Package

```bash
# Reanimated hooks only
npm run meta:stats -- --package "react-native-reanimated" --hooks

# Skia components
npm run meta:stats -- --package "@shopify/react-native-skia" --components
```

### Search

```bash
# Search for specific term
npm run meta:stats -- --search "spring"

# Find with context
npm run meta:stats -- --find "Linear" --animations
```

## How It Works

1. **File Discovery**: Scans animation directory for `.ts`, `.tsx`, `.js`, `.jsx` files
2. **AST Parsing**: Uses TypeScript compiler API to parse each file
3. **Import Extraction**: Identifies all imported packages and their items
4. **Call Analysis**: Detects hook calls, function calls, and JSX components
5. **Pattern Detection**: Identifies combinations indicating specific patterns
6. **Version Resolution**: Matches packages with versions from package.json
7. **File Categorization**: Groups files by type (components, hooks, utils, etc.)

## Validation

### Content Hashing

Track when code changes but metadata is outdated:

```bash
# Generate hashes
npm run meta:generate

# Check for stale metadata
npm run meta:validate

# List all animations with status
npm run meta:list
```

Statuses:
- ✓ **Valid** - Code matches metadata
- ✗ **Stale** - Code changed, metadata outdated
- ! **No Hash** - Metadata exists but no hash
- ! **No Meta** - No metadata file found

## Workflow

### For New Animations

1. Write your animation code
2. Extract metadata: `npm run meta:extract <slug>`
3. Generate hash: `npm run meta:generate <slug>`

### For Code Changes

1. Modify animation code
2. Re-extract: `npm run meta:extract <slug>`
3. Update hash: `npm run meta:generate <slug>`

### For Analysis

1. Extract all: `npm run meta:extract:all`
2. View stats: `npm run meta:stats`
3. Filter/search: `npm run meta:stats -- --hooks --top 20`

## Benefits

- ✅ **100% Accurate** - Directly from source code
- ✅ **Deterministic** - Same code → same output
- ✅ **Automated** - No manual work
- ✅ **Fast** - Processes animations in seconds
- ✅ **Maintainable** - Updates automatically with code
- ✅ **Validatable** - Hash system tracks changes

## Files

```
scripts/analytics/
├── extract-metadata.js  - Main extractor (AST-based)
├── meta-stats.js        - Statistics analyzer
├── meta-hash.js         - Hash validation system
├── doc.md               - Documentation overview
├── README.md            - This file
└── meta/                - Generated metadata files
    ├── {slug}.json      - Extracted metadata
    └── ...
```

## Advanced

### JSON Output

```bash
npm run meta:stats -- --json > stats.json
```

### Custom Pattern Detection

Edit `extract-metadata.js` function `detectPatterns()` to add your own pattern logic.

### Package Filtering

```bash
npm run meta:stats -- --package "react-native-reanimated" --hooks --functions
```

## Requirements

- Node.js 16+
- TypeScript (dev dependency)
- Animations in `src/animations/`
- Package.json at project root

## License

Part of the reactiive/thank-you animation library.
