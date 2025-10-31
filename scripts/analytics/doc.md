## 🔍 Deterministic Metadata Extraction

**Automatically extract animation metadata from source code** using AST parsing — 100% deterministic, no AI.

```bash
# Extract metadata for a single animation
npm run meta:extract everybody-can-cook

# Extract metadata for all animations
npm run meta:extract:all
```

**What gets extracted:**
- ✅ Packages used (with versions)
- ✅ Hooks called (useSharedValue, useAnimatedStyle, etc.)
- ✅ Functions called (withTiming, withSpring, etc.)
- ✅ Components used (Animated.View, Canvas, etc.)
- ✅ Patterns detected (reactive-styling-pattern, scroll-animation, etc.)
- ✅ Techniques identified (spring-physics, staggered-timing, etc.)
- ✅ File structure (entry, components, hooks, utils)

**Benefits:**
- 100% deterministic and reproducible
- Updates automatically when code changes
- Perfect for statistics and pattern analysis
- No manual work required

See [README.md](./README.md) for detailed documentation.

---

### Statistics Analyzer

Analyze patterns across all animations with visual charts:

```bash
# Show all statistics
bun run meta:stats

# Show specific categories
bun run meta:stats -- --hooks           # React hooks usage
bun run meta:stats -- --techniques      # Animation techniques
bun run meta:stats -- --packages        # Package dependencies
bun run meta:stats -- --tags            # Popular tags

# Limit results
bun run meta:stats -- --hooks --top 15

# Export as JSON
bun run meta:stats -- --json > stats.json
```

**Insights Available:**

- 🪝 Most used React hooks (`useSharedValue`, `useAnimatedStyle`, etc.)
- 🎭 Most used Reanimated patterns
- ⚡ Most common animation techniques
- 🔧 Most used technologies
- 📦 Most used packages
- 🏷️ Most popular tags

**Current Stats (90 animations with metadata):**

- `useSharedValue`: 82.2% usage (74 animations)
- `useAnimatedStyle`: 80.0% usage (72 animations)
- `useDerivedValue`: 78.9% usage (71 animations)
- `react-native-reanimated`: 100% usage
- `@shopify/react-native-skia`: 48.9% usage

---

## Notes

- Each metadata file includes: description, features, technologies, packages, animation techniques, patterns, performance considerations, use cases, and more
- Files are located at: `/scripts/analytics/meta/{animation-name}.json`
- Content hashes (SHA-256) automatically track code changes
- Statistics help identify common patterns and dependencies across the codebase

## 🛠️ Metadata Management Tools

### Hash System (Staleness Detection)

Automatically detect when animation code changes but metadata remains outdated:

```bash
# Generate hashes for all animations
bun run meta:generate

# Validate all animations (check for stale metadata)
bun run meta:validate

# List all animations with status
bun run meta:list
```
