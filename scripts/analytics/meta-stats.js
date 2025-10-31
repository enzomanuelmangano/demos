#!/usr/bin/env node

/**
 * Animation Metadata Statistics Analyzer
 *
 * Analyzes extracted metadata to visualize common patterns,
 * hooks, techniques, technologies, and other metadata across all animations.
 *
 * Works with deterministic extraction format.
 *
 * Usage:
 *   node scripts/meta-stats.js                    # Show all statistics
 *   node scripts/meta-stats.js --hooks            # Show only hooks
 *   node scripts/meta-stats.js --techniques       # Show only techniques
 *   node scripts/meta-stats.js --packages         # Show only packages
 *   node scripts/meta-stats.js --top 10           # Show top 10 results
 *   node scripts/meta-stats.js --search "term"    # Search for specific term
 *   node scripts/meta-stats.js --json             # Output as JSON
 */

const fs = require('fs');
const path = require('path');

const ANIMATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'animations');
const META_DIR = path.join(__dirname, 'meta');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

/**
 * Get all animation directories
 */
function getAnimationDirectories() {
  const entries = fs.readdirSync(ANIMATIONS_DIR, { withFileTypes: true });

  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith('.'))
    .map(entry => ({
      slug: entry.name,
      path: path.join(ANIMATIONS_DIR, entry.name),
    }));
}

/**
 * Read and parse metadata from meta/{slug}.json
 */
function readMetadata(slug) {
  const metaPath = path.join(META_DIR, `${slug}.json`);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Extract hooks from metadata (new deterministic format)
 */
function extractHooks(metadata, packageFilter = null) {
  if (!metadata.hooks || !Array.isArray(metadata.hooks)) {
    return [];
  }

  if (!packageFilter) {
    return metadata.hooks;
  }

  // Filter by package if specified
  if (metadata.packages_detail && metadata.packages_detail[packageFilter]) {
    return metadata.packages_detail[packageFilter].hooks || [];
  }

  return [];
}

/**
 * Extract functions from metadata (new deterministic format)
 */
function extractFunctions(metadata, packageFilter = null) {
  if (!metadata.functions || !Array.isArray(metadata.functions)) {
    return [];
  }

  if (!packageFilter) {
    return metadata.functions;
  }

  // Filter by package if specified
  if (metadata.packages_detail && metadata.packages_detail[packageFilter]) {
    return metadata.packages_detail[packageFilter].functions || [];
  }

  return [];
}

/**
 * Extract components from metadata (new deterministic format)
 */
function extractComponents(metadata, packageFilter = null) {
  if (!metadata.components || !Array.isArray(metadata.components)) {
    return [];
  }

  if (!packageFilter) {
    return metadata.components;
  }

  // Filter by package if specified
  if (metadata.packages_detail && metadata.packages_detail[packageFilter]) {
    return metadata.packages_detail[packageFilter].components || [];
  }

  return [];
}

/**
 * Extract patterns from metadata (new deterministic format)
 */
function extractPatterns(metadata) {
  if (!metadata.patterns || !Array.isArray(metadata.patterns)) {
    return [];
  }
  return metadata.patterns;
}

/**
 * Extract techniques from metadata (new deterministic format)
 */
function extractTechniques(metadata) {
  if (!metadata.techniques || !Array.isArray(metadata.techniques)) {
    return [];
  }
  return metadata.techniques;
}

/**
 * Extract packages from metadata (new deterministic format)
 */
function extractPackages(metadata) {
  if (!metadata.packages || !Array.isArray(metadata.packages)) {
    return [];
  }
  return metadata.packages;
}

/**
 * Extract all items from metadata (for search)
 */
function extractAllItems(metadata) {
  const items = [];

  // Helper to safely add array items
  const addArray = (arr, category) => {
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        if (typeof item === 'string') {
          items.push({ item, category });
        }
      });
    }
  };

  // Extract from various fields
  addArray(metadata.hooks, 'hook');
  addArray(metadata.functions, 'function');
  addArray(metadata.components, 'component');
  addArray(metadata.patterns, 'pattern');
  addArray(metadata.techniques, 'technique');
  addArray(metadata.packages, 'package');

  return items;
}

/**
 * Count occurrences of items
 */
function countItems(items) {
  const counts = {};

  items.forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });

  return counts;
}

/**
 * Sort counts in descending order
 */
function sortCounts(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([item, count]) => ({ item, count }));
}

/**
 * Create a visual bar chart
 */
function createBar(count, maxCount, width = 50) {
  const percentage = count / maxCount;
  const filledWidth = Math.round(percentage * width);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);

  return filled + empty;
}

/**
 * Display statistics with visual bars
 */
function displayStats(title, data, options = {}) {
  const {
    limit = Infinity,
    color = colors.cyan,
    showPercentage = true,
    totalAnimations,
  } = options;

  if (data.length === 0) {
    console.log(`${colors.gray}No data available${colors.reset}\n`);
    return;
  }

  console.log(`${colors.bright}${color}${title}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);

  const maxCount = data[0].count;
  const displayData = data.slice(0, limit);

  displayData.forEach((entry, index) => {
    const bar = createBar(entry.count, maxCount);
    const percentage = totalAnimations
      ? ((entry.count / totalAnimations) * 100).toFixed(1)
      : ((entry.count / maxCount) * 100).toFixed(1);

    const rank = `${colors.gray}${String(index + 1).padStart(3, ' ')}.${colors.reset}`;
    const count = `${colors.bright}${String(entry.count).padStart(3, ' ')}${colors.reset}`;
    const pct = showPercentage
      ? `${colors.gray}(${percentage}%)${colors.reset}`
      : '';

    console.log(
      `${rank} ${count} ${pct.padEnd(8)} ${color}${bar}${colors.reset} ${entry.item}`,
    );
  });

  if (data.length > limit) {
    console.log(
      `${colors.gray}     ... and ${data.length - limit} more${colors.reset}`,
    );
  }

  console.log();
}

/**
 * Analyze all metadata files
 */
function analyzeMetadata(options = {}) {
  const { packageFilter = null } = options;
  const animations = getAnimationDirectories();

  const filterMsg = packageFilter
    ? ` (filtering by package: ${packageFilter})`
    : '';
  console.log(
    `${colors.bright}Analyzing ${animations.length} animations${filterMsg}...${colors.reset}\n`,
  );

  const allHooks = [];
  const allFunctions = [];
  const allComponents = [];
  const allPatterns = [];
  const allTechniques = [];
  const allPackages = [];

  let metadataCount = 0;
  let animationsWithPackage = 0;

  animations.forEach(animation => {
    const metadata = readMetadata(animation.slug);

    if (!metadata) {
      return;
    }

    metadataCount++;

    // Check if this animation uses the filtered package
    if (packageFilter) {
      const hasPackage =
        metadata.packages &&
        metadata.packages.includes(packageFilter);

      if (!hasPackage) {
        return;
      }

      animationsWithPackage++;
    }

    allHooks.push(...extractHooks(metadata, packageFilter));
    allFunctions.push(...extractFunctions(metadata, packageFilter));
    allComponents.push(...extractComponents(metadata, packageFilter));
    allPatterns.push(...extractPatterns(metadata));
    allTechniques.push(...extractTechniques(metadata));
    allPackages.push(...extractPackages(metadata));
  });

  return {
    totalAnimations: animations.length,
    animationsWithMeta: metadataCount,
    animationsWithPackage: packageFilter
      ? animationsWithPackage
      : metadataCount,
    packageFilter,
    hooks: sortCounts(countItems(allHooks)),
    functions: sortCounts(countItems(allFunctions)),
    components: sortCounts(countItems(allComponents)),
    patterns: sortCounts(countItems(allPatterns)),
    techniques: sortCounts(countItems(allTechniques)),
    packages: sortCounts(countItems(allPackages)),
  };
}

/**
 * Search for specific term across all metadata
 */
function searchMetadata(searchTerm, options = {}) {
  const animations = getAnimationDirectories();
  const { caseInsensitive = true } = options;

  console.log(
    `${colors.bright}Searching for "${searchTerm}" in ${animations.length} animations...${colors.reset}\n`,
  );

  const results = [];
  let metadataCount = 0;

  animations.forEach(animation => {
    const metadata = readMetadata(animation.slug);

    if (!metadata) {
      return;
    }

    metadataCount++;

    const allItems = extractAllItems(metadata);
    const searchPattern = caseInsensitive
      ? new RegExp(searchTerm, 'i')
      : new RegExp(searchTerm);

    allItems.forEach(({ item, category }) => {
      if (searchPattern.test(item)) {
        results.push({
          animationSlug: animation.slug,
          item,
          category,
        });
      }
    });
  });

  // Count occurrences by item
  const itemCounts = {};
  const categoryGroups = {};
  const animationsByItem = {};

  results.forEach(result => {
    // Count items
    itemCounts[result.item] = (itemCounts[result.item] || 0) + 1;

    // Group by category
    if (!categoryGroups[result.category]) {
      categoryGroups[result.category] = [];
    }
    if (!categoryGroups[result.category].includes(result.item)) {
      categoryGroups[result.category].push(result.item);
    }

    // Track which animations use each item
    if (!animationsByItem[result.item]) {
      animationsByItem[result.item] = new Set();
    }
    animationsByItem[result.item].add(result.animationSlug);
  });

  return {
    totalAnimations: animations.length,
    animationsWithMeta: metadataCount,
    searchTerm,
    matchCount: Object.keys(itemCounts).length,
    totalOccurrences: results.length,
    items: sortCounts(itemCounts),
    categoryGroups,
    animationsByItem: Object.fromEntries(
      Object.entries(animationsByItem).map(([item, set]) => [
        item,
        Array.from(set),
      ]),
    ),
  };
}

/**
 * Display summary
 */
function displaySummary(stats) {
  console.log(`${colors.bright}${colors.blue}📊 Summary${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);

  console.log(
    `  Total Animations:           ${colors.bright}${stats.totalAnimations}${colors.reset}`,
  );
  console.log(
    `  With Metadata:              ${colors.bright}${stats.animationsWithMeta}${colors.reset}`,
  );

  if (stats.packageFilter) {
    console.log(
      `  Using Package:              ${colors.bright}${stats.animationsWithPackage}${colors.reset} ${colors.gray}(filtered by ${stats.packageFilter})${colors.reset}`,
    );
  }

  console.log(
    `  Unique Hooks:               ${colors.bright}${stats.hooks.length}${colors.reset}`,
  );
  console.log(
    `  Unique Functions:           ${colors.bright}${stats.functions.length}${colors.reset}`,
  );
  console.log(
    `  Unique Components:          ${colors.bright}${stats.components.length}${colors.reset}`,
  );
  console.log(
    `  Unique Patterns:            ${colors.bright}${stats.patterns.length}${colors.reset}`,
  );
  console.log(
    `  Unique Techniques:          ${colors.bright}${stats.techniques.length}${colors.reset}`,
  );
  console.log(
    `  Unique Packages:            ${colors.bright}${stats.packages.length}${colors.reset}`,
  );

  console.log();
}

/**
 * Display search results
 */
function displaySearchResults(searchResults, options = {}) {
  const { limit = 50, showAnimations = false } = options;

  console.log(
    `${colors.bright}${colors.cyan}🔍 Search Results for "${searchResults.searchTerm}"${colors.reset}`,
  );
  console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);

  if (searchResults.matchCount === 0) {
    console.log(`${colors.yellow}No matches found${colors.reset}\n`);
    return;
  }

  console.log(
    `  Found:               ${colors.bright}${searchResults.matchCount}${colors.reset} unique items`,
  );
  console.log(
    `  Total Occurrences:   ${colors.bright}${searchResults.totalOccurrences}${colors.reset}`,
  );
  console.log(
    `  In Animations:       ${colors.bright}${
      Object.values(searchResults.animationsByItem)
        .flat()
        .filter((v, i, a) => a.indexOf(v) === i).length
    }${colors.reset} / ${searchResults.animationsWithMeta}\n`,
  );

  // Group by category
  const categories = Object.keys(searchResults.categoryGroups);

  if (categories.length > 0) {
    console.log(`${colors.bright}By Category:${colors.reset}`);
    categories.forEach(category => {
      const items = searchResults.categoryGroups[category];
      console.log(
        `  ${colors.gray}${category}:${colors.reset} ${items.length} items`,
      );
    });
    console.log();
  }

  // Display items with counts
  displayStats('Matches', searchResults.items, {
    limit,
    color: colors.cyan,
    totalAnimations: searchResults.animationsWithMeta,
  });

  // Show which animations use each item
  if (showAnimations) {
    console.log(
      `${colors.bright}${colors.blue}📱 Animations Using These Items${colors.reset}`,
    );
    console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`);

    const displayItems = searchResults.items.slice(0, limit);

    displayItems.forEach(({ item, count }) => {
      const animations = searchResults.animationsByItem[item] || [];
      console.log(
        `${colors.bright}${item}${colors.reset} ${colors.gray}(${count} occurrences)${colors.reset}`,
      );
      animations.slice(0, 5).forEach(slug => {
        console.log(`  ${colors.gray}•${colors.reset} ${slug}`);
      });
      if (animations.length > 5) {
        console.log(
          `  ${colors.gray}... and ${animations.length - 5} more${colors.reset}`,
        );
      }
      console.log();
    });
  }
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options = {
    showHooks: args.includes('--hooks'),
    showFunctions: args.includes('--functions'),
    showComponents: args.includes('--components'),
    showPatterns: args.includes('--patterns'),
    showTechniques: args.includes('--techniques'),
    showPackages: args.includes('--packages'),
    json: args.includes('--json'),
    showAnimations: args.includes('--animations') || args.includes('--list'),
    limit: Infinity,
    search: null,
    packageFilter: null,
  };

  // Parse package filter
  const packageIndex = args.indexOf('--package');
  if (packageIndex !== -1 && args[packageIndex + 1]) {
    options.packageFilter = args[packageIndex + 1];
  }

  // Parse search term
  const searchIndex = Math.max(
    args.indexOf('--search'),
    args.indexOf('--find'),
  );
  if (searchIndex !== -1 && args[searchIndex + 1]) {
    options.search = args[searchIndex + 1];
  }

  // Parse top limit
  const topIndex = args.indexOf('--top');
  if (topIndex !== -1 && args[topIndex + 1]) {
    options.limit = parseInt(args[topIndex + 1], 10) || Infinity;
  }

  // If no specific category selected, show all
  const showAll =
    !options.showHooks &&
    !options.showFunctions &&
    !options.showComponents &&
    !options.showPatterns &&
    !options.showTechniques &&
    !options.showPackages;

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Animation Metadata Statistics${colors.reset}

${colors.bright}Usage:${colors.reset}
  ${colors.cyan}npm run meta:stats${colors.reset}                                Show all statistics
  ${colors.cyan}npm run meta:stats -- --hooks${colors.reset}                     Show only React hooks
  ${colors.cyan}npm run meta:stats -- --functions${colors.reset}                 Show only functions
  ${colors.cyan}npm run meta:stats -- --components${colors.reset}                Show only components
  ${colors.cyan}npm run meta:stats -- --patterns${colors.reset}                  Show only patterns
  ${colors.cyan}npm run meta:stats -- --techniques${colors.reset}                Show only techniques
  ${colors.cyan}npm run meta:stats -- --packages${colors.reset}                  Show only packages
  ${colors.cyan}npm run meta:stats -- --package "name"${colors.reset}            Filter by specific package
  ${colors.cyan}npm run meta:stats -- --top 10${colors.reset}                    Show top 10 results
  ${colors.cyan}npm run meta:stats -- --search "term"${colors.reset}             Search for specific term
  ${colors.cyan}npm run meta:stats -- --find "Linear"${colors.reset}             Find items containing text
  ${colors.cyan}npm run meta:stats -- --json${colors.reset}                      Output as JSON

${colors.bright}Examples:${colors.reset}
  npm run meta:stats -- --hooks --top 15
  npm run meta:stats -- --techniques --patterns
  npm run meta:stats -- --search "Linear"
  npm run meta:stats -- --find "spring" --animations

${colors.bright}Package Filter Examples:${colors.reset}
  npm run meta:stats -- --package "react-native-reanimated" --hooks
  npm run meta:stats -- --package "@shopify/react-native-skia" --components
  npm run meta:stats -- --package "react-native-gesture-handler" --hooks --top 10
    `);
    return;
  }

  // Handle search
  if (options.search) {
    const searchResults = searchMetadata(options.search, {
      caseInsensitive: true,
    });

    if (options.json) {
      console.log(JSON.stringify(searchResults, null, 2));
      return;
    }

    displaySearchResults(searchResults, {
      limit: options.limit,
      showAnimations: options.showAnimations,
    });
    return;
  }

  // Analyze metadata
  const stats = analyzeMetadata({
    packageFilter: options.packageFilter,
  });

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // Display summary
  displaySummary(stats);

  // Display categories (use filtered count for percentages if package filter is applied)
  const baseCount = options.packageFilter
    ? stats.animationsWithPackage
    : stats.animationsWithMeta;

  if (showAll || options.showHooks) {
    const title = options.packageFilter
      ? `🪝 Most Used Hooks (${options.packageFilter})`
      : '🪝 Most Used Hooks';

    displayStats(title, stats.hooks, {
      limit: options.limit,
      color: colors.green,
      totalAnimations: baseCount,
    });
  }

  if (showAll || options.showFunctions) {
    const title = options.packageFilter
      ? `⚡ Most Used Functions (${options.packageFilter})`
      : '⚡ Most Used Functions';

    displayStats(title, stats.functions, {
      limit: options.limit,
      color: colors.yellow,
      totalAnimations: baseCount,
    });
  }

  if (showAll || options.showComponents) {
    const title = options.packageFilter
      ? `🧩 Most Used Components (${options.packageFilter})`
      : '🧩 Most Used Components';

    displayStats(title, stats.components, {
      limit: options.limit,
      color: colors.blue,
      totalAnimations: baseCount,
    });
  }

  if (showAll || options.showPatterns) {
    displayStats('🎭 Most Used Patterns', stats.patterns, {
      limit: options.limit,
      color: colors.magenta,
      totalAnimations: stats.animationsWithMeta,
    });
  }

  if (showAll || options.showTechniques) {
    displayStats('⚡ Most Common Techniques', stats.techniques, {
      limit: options.limit,
      color: colors.cyan,
      totalAnimations: stats.animationsWithMeta,
    });
  }

  if (showAll || options.showPackages) {
    displayStats('📦 Most Used Packages', stats.packages, {
      limit: options.limit,
      color: colors.blue,
      totalAnimations: stats.animationsWithMeta,
    });
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  analyzeMetadata,
  searchMetadata,
  extractHooks,
  extractFunctions,
  extractComponents,
  extractPatterns,
  extractTechniques,
  extractPackages,
};
