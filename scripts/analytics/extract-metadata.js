#!/usr/bin/env node

/**
 * Deterministic Animation Metadata Extractor
 *
 * Automatically extracts metadata from animation source code using AST parsing.
 * No AI involved - purely static code analysis.
 *
 * Usage:
 *   node scripts/analytics/extract-metadata.js [animation-slug]
 *   node scripts/analytics/extract-metadata.js --all
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const crypto = require('crypto');

const ANIMATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'animations');
const META_DIR = path.join(__dirname, 'meta');
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const HASH_ALGORITHM = 'sha256';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Get all TypeScript/JavaScript files in a directory recursively
 * (for AST parsing - excludes JSON)
 */
function getAllTsFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);

    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllTsFiles(fullPath, arrayOfFiles);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * Get all code files including JSON in a directory recursively
 * (for hash calculation - matches meta-hash.js)
 */
function getAllCodeFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);

    // Skip system files
    if (file === '.DS_Store') {
      return;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllCodeFiles(fullPath, arrayOfFiles);
    } else if (/\.(ts|tsx|js|jsx|json)$/.test(file)) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * Parse a TypeScript file and extract all imports
 */
function extractImports(sourceFile) {
  const imports = {
    packages: new Set(),
    namedImports: {},
    defaultImports: {},
    typeImports: {},
  };

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.text;

      // Track package
      imports.packages.add(moduleSpecifier);

      // Extract named imports
      if (node.importClause) {
        const { name, namedBindings } = node.importClause;

        // Default import
        if (name) {
          if (!imports.defaultImports[moduleSpecifier]) {
            imports.defaultImports[moduleSpecifier] = [];
          }
          imports.defaultImports[moduleSpecifier].push(name.text);
        }

        // Named imports
        if (namedBindings) {
          if (ts.isNamedImports(namedBindings)) {
            namedBindings.elements.forEach(element => {
              const importName = element.name.text;
              const isTypeOnly = element.isTypeOnly || node.importClause.isTypeOnly;

              if (isTypeOnly) {
                if (!imports.typeImports[moduleSpecifier]) {
                  imports.typeImports[moduleSpecifier] = [];
                }
                imports.typeImports[moduleSpecifier].push(importName);
              } else {
                if (!imports.namedImports[moduleSpecifier]) {
                  imports.namedImports[moduleSpecifier] = [];
                }
                imports.namedImports[moduleSpecifier].push(importName);
              }
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    packages: Array.from(imports.packages),
    namedImports: imports.namedImports,
    defaultImports: imports.defaultImports,
    typeImports: imports.typeImports,
  };
}

/**
 * Extract function and hook calls from the AST
 */
function extractCalls(sourceFile) {
  const calls = {
    hooks: new Set(),
    functions: new Set(),
    components: new Set(),
  };

  function visit(node) {
    // Hook calls (useXxx)
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      if (ts.isIdentifier(expr)) {
        const name = expr.text;

        if (name.startsWith('use')) {
          calls.hooks.add(name);
        } else if (name.startsWith('with')) {
          calls.functions.add(name);
        } else {
          calls.functions.add(name);
        }
      }

      // Property access like Animated.View or withTiming()
      if (ts.isPropertyAccessExpression(expr)) {
        const left = expr.expression;
        const right = expr.name.text;

        if (ts.isIdentifier(left)) {
          const fullName = `${left.text}.${right}`;

          // Detect Animated.View, Animated.Text, etc.
          if (left.text === 'Animated') {
            calls.components.add(fullName);
          }
        }
      }
    }

    // JSX Elements (components)
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;

      if (ts.isIdentifier(tagName)) {
        calls.components.add(tagName.text);
      } else if (ts.isPropertyAccessExpression(tagName)) {
        const left = tagName.expression;
        const right = tagName.name.text;
        if (ts.isIdentifier(left)) {
          calls.components.add(`${left.text}.${right}`);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    hooks: Array.from(calls.hooks).sort(),
    functions: Array.from(calls.functions).sort(),
    components: Array.from(calls.components).sort(),
  };
}

/**
 * Analyze file structure
 */
function analyzeFileStructure(animationPath) {
  const structure = {
    entry: null,
    components: [],
    hooks: [],
    utils: [],
    types: [],
    constants: [],
    assets: [],
    other: [],
  };

  const files = getAllTsFiles(animationPath);
  const basePath = animationPath;

  files.forEach(file => {
    const relativePath = path.relative(basePath, file);
    const fileName = path.basename(file);
    const dirName = path.dirname(relativePath);

    // Categorize files
    if (fileName === 'index.tsx' || fileName === 'index.ts') {
      structure.entry = relativePath;
    } else if (dirName.includes('components') || dirName === '.') {
      structure.components.push(relativePath);
    } else if (dirName.includes('hooks')) {
      structure.hooks.push(relativePath);
    } else if (dirName.includes('utils')) {
      structure.utils.push(relativePath);
    } else if (dirName.includes('types') || fileName.includes('types.ts')) {
      structure.types.push(relativePath);
    } else if (dirName.includes('constants') || fileName.includes('constants.ts')) {
      structure.constants.push(relativePath);
    } else {
      structure.other.push(relativePath);
    }
  });

  return structure;
}

/**
 * Calculate hash for animation folder
 * Matches the logic in meta-hash.js for consistency
 */
function calculateAnimationHash(animationPath) {
  const allFiles = getAllCodeFiles(animationPath);

  // Sort files for consistent hashing
  allFiles.sort();

  // Create hash from all file contents
  const hash = crypto.createHash(HASH_ALGORITHM);

  allFiles.forEach(file => {
    const relativePath = path.relative(animationPath, file);
    const content = fs.readFileSync(file, 'utf8');

    // Include filename in hash to detect renames
    hash.update(relativePath);
    hash.update(content);
  });

  return hash.digest('hex');
}

/**
 * Aggregate data from all files in an animation
 */
function analyzeAnimation(animationPath, slug) {
  const files = getAllTsFiles(animationPath);

  const aggregatedData = {
    packages: new Set(),
    namedImports: {},
    hooks: new Set(),
    functions: new Set(),
    components: new Set(),
  };

  console.log(`  ${colors.gray}Analyzing ${files.length} files...${colors.reset}`);

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Extract imports
    const imports = extractImports(sourceFile);
    imports.packages.forEach(pkg => aggregatedData.packages.add(pkg));

    // Merge named imports
    Object.keys(imports.namedImports).forEach(pkg => {
      if (!aggregatedData.namedImports[pkg]) {
        aggregatedData.namedImports[pkg] = new Set();
      }
      imports.namedImports[pkg].forEach(item => {
        aggregatedData.namedImports[pkg].add(item);
      });
    });

    // Extract calls
    const calls = extractCalls(sourceFile);
    calls.hooks.forEach(hook => aggregatedData.hooks.add(hook));
    calls.functions.forEach(fn => aggregatedData.functions.add(fn));
    calls.components.forEach(comp => aggregatedData.components.add(comp));
  });

  // Convert Sets to sorted arrays, filter out relative imports
  const allPackages = Array.from(aggregatedData.packages);
  const packages = allPackages.filter(pkg => !pkg.startsWith('.') && !pkg.startsWith('/')).sort();
  const hooks = Array.from(aggregatedData.hooks).sort();
  const functions = Array.from(aggregatedData.functions).sort();
  const components = Array.from(aggregatedData.components).sort();

  // Convert namedImports Sets to arrays, filter out relative imports
  const namedImports = {};
  Object.keys(aggregatedData.namedImports).forEach(pkg => {
    // Skip relative imports
    if (pkg.startsWith('.') || pkg.startsWith('/')) {
      return;
    }
    namedImports[pkg] = Array.from(aggregatedData.namedImports[pkg]).sort();
  });

  // Categorize by package
  const packageData = categorizeByPackage(packages, namedImports, hooks, functions, components);

  // Analyze file structure
  const fileStructure = analyzeFileStructure(animationPath);

  // Detect patterns
  const { patterns, techniques } = detectPatterns(hooks, functions, components);

  // Get package versions
  const packageVersions = getPackageVersions(packages);

  // Calculate content hash
  const contentHash = calculateAnimationHash(animationPath);

  return {
    animation_slug: slug,
    content_hash: contentHash,
    hash_algorithm: HASH_ALGORITHM,
    file_structure: fileStructure,
    packages: packages, // Already filtered above
    packages_with_versions: packageVersions,
    packages_detail: packageData,
    hooks: hooks,
    functions: functions,
    components: components,
    patterns: patterns,
    techniques: techniques,
    stats: {
      total_files: files.length,
      total_packages: packages.length,
      total_hooks: hooks.length,
      total_functions: functions.length,
      total_components: components.length,
      total_patterns: patterns.length,
      total_techniques: techniques.length,
    },
  };
}

/**
 * Categorize imports by package
 */
function categorizeByPackage(packages, namedImports, hooks, functions, components) {
  const packageData = {};

  // Only include actual packages (not relative imports)
  packages.forEach(pkg => {
    // Skip relative imports
    if (pkg.startsWith('.') || pkg.startsWith('/')) {
      return;
    }

    packageData[pkg] = {
      imports: namedImports[pkg] || [],
      hooks: [],
      functions: [],
      components: [],
    };
  });

  // Categorize hooks by package
  const reanimatedHooks = [
    'useSharedValue', 'useAnimatedStyle', 'useDerivedValue',
    'useAnimatedProps', 'useAnimatedReaction', 'useAnimatedRef',
    'useAnimatedScrollHandler', 'useAnimatedGestureHandler',
    'useFrameCallback', 'useAnimatedKeyboard', 'useAnimatedSensor',
  ];

  const reactHooks = [
    'useState', 'useEffect', 'useCallback', 'useMemo',
    'useRef', 'useContext', 'useReducer', 'useImperativeHandle',
    'useLayoutEffect', 'useDebugValue',
  ];

  const skiaHooks = [
    'useFont', 'useImage', 'useTexture', 'useSVG', 'useData',
    'useValue', 'useComputedValue', 'useTouchHandler', 'useClockValue',
    'useLoop', 'useTiming', 'useSpring', 'useDecay', 'useDerivedValueOnJS',
    'useRectBuffer', 'useRSXformBuffer', 'useDataCollection',
  ];

  hooks.forEach(hook => {
    if (reanimatedHooks.includes(hook)) {
      if (packageData['react-native-reanimated']) {
        packageData['react-native-reanimated'].hooks.push(hook);
      }
    } else if (reactHooks.includes(hook)) {
      if (packageData['react']) {
        packageData['react'].hooks.push(hook);
      }
    } else if (skiaHooks.includes(hook)) {
      if (packageData['@shopify/react-native-skia']) {
        packageData['@shopify/react-native-skia'].hooks.push(hook);
      }
    }
  });

  // Categorize functions
  const reanimatedFunctions = [
    'withTiming', 'withSpring', 'withDecay', 'withDelay',
    'withRepeat', 'withSequence', 'cancelAnimation',
    'runOnJS', 'runOnUI', 'interpolate', 'interpolateColor',
    'Extrapolation', 'Easing',
  ];

  functions.forEach(fn => {
    if (reanimatedFunctions.includes(fn)) {
      if (packageData['react-native-reanimated']) {
        packageData['react-native-reanimated'].functions.push(fn);
      }
    }
  });

  // Categorize components
  const skiaComponents = [
    'Canvas', 'Group', 'Paint', 'Image', 'Text', 'Path', 'Circle', 'Rect',
    'RoundedRect', 'Line', 'Oval', 'Points', 'Vertices', 'DiffRect',
    'LinearGradient', 'RadialGradient', 'SweepGradient', 'TwoPointConicalGradient',
    'Turbulence', 'FractalNoise', 'Blur', 'CornerPathEffect', 'DiscretePathEffect',
    'DashPathEffect', 'Path1DPathEffect', 'Path2DPathEffect', 'Line2DPathEffect',
    'BlurMask', 'Shadow', 'ShadowLayer', 'Fill', 'Stroke', 'Atlas',
    'Paragraph', 'Glyphs', 'TextPath', 'TextBlob', 'Box', 'BoxShadow',
    'BackdropFilter', 'ImageSVG', 'FitBox', 'ColorMatrix', 'Mask',
  ];

  components.forEach(comp => {
    if (comp.startsWith('Animated.')) {
      if (packageData['react-native-reanimated']) {
        packageData['react-native-reanimated'].components.push(comp);
      }
    } else if (skiaComponents.includes(comp)) {
      if (packageData['@shopify/react-native-skia']) {
        packageData['@shopify/react-native-skia'].components.push(comp);
      }
    }
  });

  return packageData;
}

/**
 * Detect common animation patterns and techniques
 */
function detectPatterns(hooks, functions, components) {
  const patterns = [];
  const techniques = [];

  // Basic patterns
  if (hooks.includes('useSharedValue')) {
    patterns.push('shared-value-state');
  }

  if (hooks.includes('useAnimatedStyle')) {
    patterns.push('animated-styling');
  }

  if (hooks.includes('useDerivedValue')) {
    patterns.push('derived-computation');
  }

  if (hooks.includes('useAnimatedScrollHandler')) {
    patterns.push('scroll-animation');
    techniques.push('scroll-based-animation');
  }

  if (hooks.includes('useAnimatedGestureHandler')) {
    patterns.push('gesture-animation');
    techniques.push('gesture-based-animation');
  }

  if (hooks.includes('useAnimatedReaction')) {
    patterns.push('animated-reaction');
    techniques.push('reactive-side-effects');
  }

  if (functions.includes('withTiming')) {
    patterns.push('timing-animation');
    techniques.push('timing-based-transitions');
  }

  if (functions.includes('withSpring')) {
    patterns.push('spring-animation');
    techniques.push('spring-physics');
  }

  if (functions.includes('withDelay')) {
    patterns.push('delayed-animation');
    techniques.push('staggered-timing');
  }

  if (functions.includes('withRepeat')) {
    patterns.push('repeating-animation');
    techniques.push('loop-animations');
  }

  if (functions.includes('withSequence')) {
    patterns.push('sequence-animation');
    techniques.push('sequential-animations');
  }

  if (functions.includes('interpolate')) {
    patterns.push('value-interpolation');
    techniques.push('value-mapping');
  }

  if (functions.includes('interpolateColor')) {
    patterns.push('color-interpolation');
    techniques.push('color-transitions');
  }

  // Complex patterns
  if (hooks.includes('useSharedValue') && hooks.includes('useAnimatedStyle')) {
    patterns.push('reactive-styling-pattern');
  }

  if (hooks.includes('useDerivedValue') && functions.includes('withDelay')) {
    patterns.push('staggered-derived-values');
    techniques.push('character-level-staggering');
  }

  if (hooks.includes('useImperativeHandle')) {
    patterns.push('imperative-animation-api');
    techniques.push('ref-based-control');
  }

  // Technology-specific patterns
  if (components.some(c => c.includes('Skia') || c.includes('Canvas'))) {
    patterns.push('skia-graphics');
    techniques.push('canvas-rendering');
  }

  if (components.some(c => c.includes('Blur'))) {
    techniques.push('blur-effects');
  }

  if (components.some(c => c.includes('MaskedView'))) {
    techniques.push('masking-effects');
  }

  // Transform detection (would need deeper AST analysis for accuracy)
  // For now, we mark it as potential based on useAnimatedStyle
  if (hooks.includes('useAnimatedStyle')) {
    techniques.push('transform-animations');
  }

  return { patterns, techniques };
}

/**
 * Get package versions from package.json
 */
function getPackageVersions(packages) {
  let packageJson = {};

  try {
    packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  } catch (error) {
    console.warn(`${colors.yellow}Warning: Could not read package.json${colors.reset}`);
    return {};
  }

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const versions = {};
  packages.forEach(pkg => {
    // Skip relative imports
    if (pkg.startsWith('.')) return;

    // Check if package exists in dependencies
    if (allDeps[pkg]) {
      versions[pkg] = allDeps[pkg];
    }
  });

  return versions;
}

/**
 * Get animation directories
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
 * Extract metadata for a single animation
 */
function extractAnimation(slug) {
  const animationPath = path.join(ANIMATIONS_DIR, slug);

  if (!fs.existsSync(animationPath)) {
    console.error(`${colors.yellow}✗${colors.reset} Animation not found: ${slug}`);
    return false;
  }

  console.log(`${colors.cyan}→${colors.reset} Extracting: ${colors.bright}${slug}${colors.reset}`);

  try {
    const metadata = analyzeAnimation(animationPath, slug);

    // Write to file (replaces AI-generated metadata)
    const outputPath = path.join(META_DIR, `${slug}.json`);
    fs.writeFileSync(
      outputPath,
      JSON.stringify(metadata, null, 2) + '\n',
      'utf8'
    );

    console.log(`${colors.green}✓${colors.reset} ${slug} - extracted successfully`);
    console.log(`  ${colors.gray}Files: ${metadata.stats.total_files}, Packages: ${metadata.stats.total_packages}, Hooks: ${metadata.stats.total_hooks}${colors.reset}`);

    return true;
  } catch (error) {
    console.error(`${colors.yellow}✗${colors.reset} Error extracting ${slug}: ${error.message}`);
    return false;
  }
}

/**
 * Extract metadata for all animations
 */
function extractAll() {
  const animations = getAnimationDirectories();

  console.log(
    `${colors.bright}Extracting metadata for ${animations.length} animations...${colors.reset}\n`
  );

  let successCount = 0;
  let failCount = 0;

  animations.forEach(animation => {
    if (extractAnimation(animation.slug)) {
      successCount++;
    } else {
      failCount++;
    }
    console.log(); // blank line
  });

  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  ${colors.green}${successCount} extracted${colors.reset}`);
  if (failCount > 0) {
    console.log(`  ${colors.yellow}${failCount} failed${colors.reset}`);
  }
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
${colors.bright}Deterministic Animation Metadata Extractor${colors.reset}

${colors.bright}Usage:${colors.reset}
  ${colors.cyan}node scripts/analytics/extract-metadata.js <animation-slug>${colors.reset}   Extract single animation
  ${colors.cyan}node scripts/analytics/extract-metadata.js --all${colors.reset}               Extract all animations

${colors.bright}Examples:${colors.reset}
  node scripts/analytics/extract-metadata.js everybody-can-cook
  node scripts/analytics/extract-metadata.js --all

${colors.bright}Output:${colors.reset}
  Writes to ${colors.cyan}scripts/analytics/meta/{animation-slug}.json${colors.reset}

${colors.bright}Extracted Data:${colors.reset}
  - File structure (entry, components, hooks, utils, types)
  - All packages used
  - All hooks called
  - All functions called
  - All components used
  - Detected patterns
  - Statistics
    `);
    return;
  }

  if (command === '--all' || command === '-a') {
    extractAll();
  } else {
    extractAnimation(command);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  analyzeAnimation,
  extractImports,
  extractCalls,
};
