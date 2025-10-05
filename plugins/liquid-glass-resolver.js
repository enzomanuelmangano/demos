const fs = require('fs');
const path = require('path');

/**
 * Default plugin configuration
 *
 * @typedef {Object} PluginConfig
 * @property {string[]} extensions - File extensions to process
 * @property {string} suffix - Suffix for variant files (e.g., '.liquid', '.glass', '.native')
 * @property {boolean} debugLogging - Enable debug logging
 * @property {string} projectRoot - Project root directory
 */
const DEFAULT_CONFIG = {
  extensions: ['.tsx', '.jsx', '.ts', '.js'], // Order matters: iOS-specific files (.ios.tsx) are checked first, then fallback to regular files (.tsx)
  suffix: '.liquid', // Can be customized to '.glass', '.native', '.enhanced', etc.
  debugLogging: false,
  projectRoot: process.cwd(),
};

/**
 * Advanced multi-level cache system
 */
const cache = {
  // File existence cache
  fileExists: new Map(),
  // Liquid variant detection cache
  liquidVariants: new Map(),
  // Directory scanning cache
  directoryContents: new Map(),
  // Resolved path cache
  resolvedPaths: new Map(),
  // AST transformation cache
  astTransforms: new Map(),
  // Clear all caches
  clear() {
    this.fileExists.clear();
    this.liquidVariants.clear();
    this.directoryContents.clear();
    this.resolvedPaths.clear();
    this.astTransforms.clear();
  },
  // Get cache statistics
  getStats() {
    return {
      fileExists: this.fileExists.size,
      liquidVariants: this.liquidVariants.size,
      directoryContents: this.directoryContents.size,
      resolvedPaths: this.resolvedPaths.size,
      astTransforms: this.astTransforms.size,
    };
  },
};

/**
 * Error reporting and logging system
 */
class PluginLogger {
  constructor(config) {
    this.debugLogging = config.debugLogging;
    this.errors = [];
    this.warnings = [];
    this.stats = {
      transformations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      filesScanned: 0,
    };
  }

  debug(message, data = null) {
    if (this.debugLogging) {
      console.log(`[liquid-glass-resolver] ${message}`, data || '');
    }
  }

  warn(message, context = null) {
    const warning = { message, context, timestamp: Date.now() };
    this.warnings.push(warning);
    if (this.debugLogging) {
      console.warn(
        `[liquid-glass-resolver] WARNING: ${message}`,
        context || '',
      );
    }
  }

  error(message, error = null, context = null) {
    const errorObj = {
      message,
      error: error?.message,
      context,
      timestamp: Date.now(),
    };
    this.errors.push(errorObj);
    if (this.debugLogging) {
      console.error(
        `[liquid-glass-resolver] ERROR: ${message}`,
        error || '',
        context || '',
      );
    }
  }

  incrementStat(stat) {
    if (this.stats[stat] !== undefined) {
      this.stats[stat]++;
    }
  }

  getReport() {
    return {
      stats: this.stats,
      errors: this.errors,
      warnings: this.warnings,
      cacheStats: cache.getStats(),
    };
  }
}

/**
 * Validates and sanitizes an import path to prevent directory traversal
 * @param {string} importPath - The import path to validate
 * @param {string} currentFile - The current file path
 * @param {string} projectRoot - The project root directory
 * @returns {string|null} - Sanitized path or null if invalid
 */
// Legacy function for backward compatibility
function validateImportPath(importPath, currentFile, projectRoot) {
  const logger = new PluginLogger({ debugLogging: false });
  return enhancedValidateImportPath(
    importPath,
    currentFile,
    projectRoot,
    logger,
  );
}

/**
 * Batch directory scanner for efficient file system operations
 * @param {string} directoryPath - Directory to scan
 * @param {object} config - Plugin configuration
 * @param {PluginLogger} logger - Logger instance
 * @returns {Set} - Set of files in the directory
 */
function scanDirectory(directoryPath, config, logger) {
  const cacheKey = directoryPath;

  if (cache.directoryContents.has(cacheKey)) {
    logger.incrementStat('cacheHits');
    return cache.directoryContents.get(cacheKey);
  }

  logger.incrementStat('cacheMisses');
  logger.incrementStat('filesScanned');

  try {
    const files = new Set();
    if (
      fs.existsSync(directoryPath) &&
      fs.statSync(directoryPath).isDirectory()
    ) {
      const entries = fs.readdirSync(directoryPath);
      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            files.add(entry);
          }
        } catch (error) {
          logger.warn(`Failed to stat file: ${fullPath}`, error.message);
        }
      }
    }

    cache.directoryContents.set(cacheKey, files);
    return files;
  } catch (error) {
    logger.error(`Failed to scan directory: ${directoryPath}`, error);
    cache.directoryContents.set(cacheKey, new Set());
    return new Set();
  }
}

/**
 * Enhanced file existence check with caching and batch operations
 * @param {string} filePath - The file path to check
 * @param {PluginLogger} logger - Logger instance
 * @returns {boolean} - Whether the file exists
 */
function safeFileExists(filePath, logger) {
  if (cache.fileExists.has(filePath)) {
    logger?.incrementStat('cacheHits');
    return cache.fileExists.get(filePath);
  }

  logger?.incrementStat('cacheMisses');

  try {
    const exists = fs.existsSync(filePath);
    cache.fileExists.set(filePath, exists);
    return exists;
  } catch (error) {
    logger.error(`Failed to check file existence: ${filePath}`, error);
    cache.fileExists.set(filePath, false);
    return false;
  }
}

/**
 * Enhanced path validation with security checks
 * @param {string} importPath - The import path to validate
 * @param {string} currentFile - The current file path
 * @param {string} projectRoot - The project root directory
 * @param {PluginLogger} logger - Logger instance
 * @returns {string|null} - Sanitized path or null if invalid
 */
function enhancedValidateImportPath(
  importPath,
  currentFile,
  projectRoot,
  logger,
) {
  const cacheKey = `${currentFile}:${importPath}:${projectRoot}`;

  if (cache.resolvedPaths.has(cacheKey)) {
    logger.incrementStat('cacheHits');
    return cache.resolvedPaths.get(cacheKey);
  }

  logger.incrementStat('cacheMisses');

  try {
    // Input validation
    if (
      !importPath ||
      typeof importPath !== 'string' ||
      importPath.length === 0
    ) {
      logger.warn('Invalid import path: empty or non-string', {
        importPath,
        currentFile,
      });
      cache.resolvedPaths.set(cacheKey, null);
      return null;
    }

    // Only process relative imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
      cache.resolvedPaths.set(cacheKey, null);
      return null;
    }

    // Security: prevent path traversal attacks
    if (
      importPath.includes('..\\') ||
      (importPath.includes('../') &&
        importPath.match(/\.\.[\/\\]/g)?.length > 10)
    ) {
      logger.error('Potential path traversal attack detected', null, {
        importPath,
        currentFile,
      });
      cache.resolvedPaths.set(cacheKey, null);
      return null;
    }

    // Resolve the path
    const currentDir = path.dirname(currentFile);
    const resolvedPath = path.resolve(currentDir, importPath);
    const normalizedProjectRoot = path.resolve(projectRoot);
    const normalizedResolvedPath = path.resolve(resolvedPath);

    // Ensure the resolved path is within the project root
    if (!normalizedResolvedPath.startsWith(normalizedProjectRoot)) {
      logger.error('Import path outside project root', null, {
        importPath,
        resolvedPath: normalizedResolvedPath,
        projectRoot: normalizedProjectRoot,
        currentFile,
      });
      cache.resolvedPaths.set(cacheKey, null);
      return null;
    }

    cache.resolvedPaths.set(cacheKey, resolvedPath);
    return resolvedPath;
  } catch (error) {
    logger.error('Path validation failed', error, { importPath, currentFile });
    cache.resolvedPaths.set(cacheKey, null);
    return null;
  }
}

/**
 * Finds liquid variants for a given import path with caching
 * @param {string} importPath - The original import path
 * @param {string} currentFile - The current file being processed
 * @param {object} config - Plugin configuration
 * @returns {object|null} - Liquid variant info or null if not found
 */
function hasLiquidVariants(
  importPath,
  currentFile,
  config = DEFAULT_CONFIG,
  logger,
) {
  const cacheKey = `${currentFile}:${importPath}:${JSON.stringify(config)}`;

  // Check cache first
  if (cache.liquidVariants.has(cacheKey)) {
    logger?.incrementStat('cacheHits');
    return cache.liquidVariants.get(cacheKey);
  }

  logger?.incrementStat('cacheMisses');
  const result = findLiquidVariantsUncached(
    importPath,
    currentFile,
    config,
    logger,
  );

  cache.liquidVariants.set(cacheKey, result);
  return result;
}

/**
 * Internal function to find liquid variants without caching
 * @param {string} importPath - The original import path
 * @param {string} currentFile - The current file being processed
 * @param {object} config - Plugin configuration
 * @returns {object|null} - Liquid variant info or null if not found
 */
function findLiquidVariantsUncached(importPath, currentFile, config, logger) {
  const validatedPath = validateImportPath(
    importPath,
    currentFile,
    config.projectRoot,
  );
  if (!validatedPath) {
    return null;
  }

  const basePath = validatedPath;
  const possiblePaths = [];

  // Generate possible paths with different extensions, prioritizing iOS-specific files
  for (const ext of config.extensions) {
    // First, try iOS-specific variant
    possiblePaths.push(basePath + `.ios${ext}`);
    possiblePaths.push(path.join(basePath, `index.ios${ext}`));

    // Then, try the regular extension
    possiblePaths.push(basePath + ext);
    possiblePaths.push(path.join(basePath, `index${ext}`));
  }

  // Also try the base path without extension
  possiblePaths.unshift(basePath);

  for (const resolvedPath of possiblePaths) {
    if (safeFileExists(resolvedPath, logger)) {
      const liquidInfo = checkForLiquidVariant(
        resolvedPath,
        currentFile,
        config,
        logger,
      );
      if (liquidInfo) {
        return liquidInfo;
      }
    }
  }

  return null;
}

/**
 * Checks if a specific file has a liquid variant
 * @param {string} resolvedPath - The resolved file path
 * @param {string} currentFile - The current file being processed
 * @param {object} config - Plugin configuration
 * @returns {object|null} - Liquid variant info or null if not found
 */
function checkForLiquidVariant(resolvedPath, currentFile, config, logger) {
  const dir = path.dirname(resolvedPath);
  const ext = path.extname(resolvedPath);
  const name = path.basename(resolvedPath, ext);
  const componentName = name === 'index' ? path.basename(dir) : name;

  // For index files, check for index.liquid.ext first
  let liquidPath;

  // Check if the resolved path is an iOS-specific file
  const isIosFile =
    name.endsWith('.ios') ||
    (name === 'index' && resolvedPath.includes('.ios'));

  if (name === 'index') {
    if (isIosFile) {
      liquidPath = path.join(dir, `index${config.suffix}.ios${ext}`);
    } else {
      liquidPath = path.join(dir, `index${config.suffix}${ext}`);
    }
  } else {
    if (isIosFile) {
      // Handle component.ios.tsx -> component.liquid.ios.tsx
      const baseComponentName = componentName.replace(/\.ios$/, '');
      liquidPath = path.join(
        dir,
        `${baseComponentName}${config.suffix}.ios${ext}`,
      );
    } else {
      liquidPath = path.join(dir, `${componentName}${config.suffix}${ext}`);
    }
  }
  const regularPath = resolvedPath;

  if (
    safeFileExists(liquidPath, logger) &&
    safeFileExists(regularPath, logger)
  ) {
    // Calculate the relative import path from currentFile to the liquid component
    const liquidRelativePath = path.relative(
      path.dirname(currentFile),
      liquidPath,
    );
    const liquidImportPath = liquidRelativePath
      .replace(new RegExp(`\${ext}$`), '')
      .replace(/\\/g, '/');

    const regularRelativePath = path
      .relative(path.dirname(currentFile), resolvedPath)
      .replace(new RegExp(`\${ext}$`), '')
      .replace(/\\/g, '/');

    return {
      componentName,
      dir,
      importPath: regularRelativePath.startsWith('.')
        ? regularRelativePath
        : `./${regularRelativePath}`,
      liquidImportPath: liquidImportPath.startsWith('.')
        ? liquidImportPath
        : `./${liquidImportPath}`,
    };
  }

  return null;
}

/**
 * Creates the requireNativeModule import declaration
 * @param {object} t - Babel types
 * @returns {object} - AST node for the import
 */
function createRequireNativeModuleImport(t) {
  return t.importDeclaration(
    [
      t.importSpecifier(
        t.identifier('requireNativeModule'),
        t.identifier('requireNativeModule'),
      ),
    ],
    t.stringLiteral('expo-modules-core'),
  );
}

/**
 * Creates the Constants import declaration
 * @param {object} t - Babel types
 * @returns {object} - AST node for the import
 */
function createConstantsImport(t) {
  return t.importDeclaration(
    [t.importDefaultSpecifier(t.identifier('Constants'))],
    t.stringLiteral('expo-constants'),
  );
}

/**
 * Creates the liquid glass availability variable declaration
 * @param {object} t - Babel types
 * @returns {object} - AST node for the variable declaration
 */
function createLiquidGlassAvailableDeclaration(t) {
  return t.variableDeclaration('let', [
    t.variableDeclarator(
      t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
      t.identifier('undefined'),
    ),
  ]);
}

/**
 * Creates the isLiquidGlassAvailable function
 * @param {object} t - Babel types
 * @returns {object} - AST node for the function
 */
function createLiquidGlassAvailableFunction(t) {
  return t.functionDeclaration(
    t.identifier('isLiquidGlassAvailable'),
    [],
    t.blockStatement([
      t.ifStatement(
        t.binaryExpression(
          '===',
          t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
          t.identifier('undefined'),
        ),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.identifier('IS_LIQUID_GLASS_AVAILABLE'),
              t.logicalExpression(
                '&&',
                t.binaryExpression(
                  '!==',
                  t.memberExpression(
                    t.identifier('Constants'),
                    t.identifier('appOwnership'),
                  ),
                  t.stringLiteral('expo'),
                ),
                t.memberExpression(
                  t.callExpression(t.identifier('requireNativeModule'), [
                    t.stringLiteral('ExpoGlassEffect'),
                  ]),
                  t.identifier('isLiquidGlassAvailable'),
                ),
              ),
            ),
          ),
        ]),
      ),
      t.returnStatement(
        t.unaryExpression(
          '!',
          t.unaryExpression('!', t.identifier('IS_LIQUID_GLASS_AVAILABLE')),
        ),
      ),
    ]),
  );
}

/**
 * Creates import declarations for both liquid and regular variants
 * @param {object} t - Babel types
 * @param {string} liquidImportName - Name for liquid import
 * @param {string} regularImportName - Name for regular import
 * @param {string} liquidImportPath - Path to liquid variant
 * @param {string} regularImportPath - Path to regular variant
 * @param {boolean} isNamed - Whether this is a named import
 * @param {string} importedName - The original imported name for named imports
 * @returns {Array} - Array of import AST nodes
 */
function createVariantImports(
  t,
  liquidImportName,
  regularImportName,
  liquidImportPath,
  regularImportPath,
  isNamed = false,
  importedName = null,
) {
  const createSpecifier = localName => {
    if (isNamed) {
      return [
        t.importSpecifier(t.identifier(localName), t.identifier(importedName)),
      ];
    } else {
      return [t.importDefaultSpecifier(t.identifier(localName))];
    }
  };

  return [
    t.importDeclaration(
      createSpecifier(liquidImportName),
      t.stringLiteral(liquidImportPath),
    ),
    t.importDeclaration(
      createSpecifier(regularImportName),
      t.stringLiteral(regularImportPath),
    ),
  ];
}

/**
 * Creates the conditional component selection
 * @param {object} t - Babel types
 * @param {string} localName - Local variable name
 * @param {string} liquidImportName - Name of liquid import
 * @param {string} regularImportName - Name of regular import
 * @returns {object} - AST node for conditional component
 */
function createConditionalComponent(
  t,
  localName,
  liquidImportName,
  regularImportName,
) {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(localName),
      t.conditionalExpression(
        t.callExpression(t.identifier('isLiquidGlassAvailable'), []),
        t.identifier(liquidImportName),
        t.identifier(regularImportName),
      ),
    ),
  ]);
}

/**
 * Processes a single import declaration for liquid glass transformation
 * @param {object} importPath - Babel path object
 * @param {object} state - Plugin state
 * @param {object} t - Babel types
 * @param {object} config - Plugin configuration
 */
function processImportDeclaration(importPath, state, t, config) {
  const importValue = importPath.node.source.value;
  const currentFile = state.filename;
  const logger = new PluginLogger(config);

  // Skip if this is already a liquid import (to prevent infinite loops)
  if (importValue.includes(config.suffix)) {
    if (config.debugLogging) {
      console.log(
        `[liquid-glass-resolver] Skipping liquid import: ${importValue}`,
      );
    }
    return;
  }

  // Skip if we've already processed this import in this file
  state.processedImports = state.processedImports || new Set();
  const importKey = `${currentFile}:${importValue}`;
  if (state.processedImports.has(importKey)) {
    return;
  }
  state.processedImports.add(importKey);

  const liquidInfo = hasLiquidVariants(
    importValue,
    currentFile,
    config,
    logger,
  );
  if (!liquidInfo) {
    if (config.debugLogging) {
      console.log(
        `[liquid-glass-resolver] No liquid variants found for: ${importValue}`,
      );
    }
    return;
  }

  // Handle both default and named imports
  const specifiers = importPath.node.specifiers;
  if (!specifiers || specifiers.length === 0) {
    if (config.debugLogging) {
      console.log(
        `[liquid-glass-resolver] No specifiers found for: ${importValue}`,
      );
    }
    return;
  }

  const liquidImportPath = liquidInfo.liquidImportPath;
  const regularImportPath = liquidInfo.importPath;

  // Process named imports
  const namedSpecifiers = specifiers.filter(
    spec => spec.type === 'ImportSpecifier',
  );

  // Process default import
  const defaultSpecifier = specifiers.find(
    spec => spec.type === 'ImportDefaultSpecifier',
  );

  if (!defaultSpecifier && namedSpecifiers.length === 0) {
    if (config.debugLogging) {
      console.log(
        `[liquid-glass-resolver] No valid specifiers found for: ${importValue}`,
      );
    }
    return;
  }

  // For simplicity, we'll handle the first named import or default import
  const specifier = defaultSpecifier || namedSpecifiers[0];
  const isNamed = !defaultSpecifier;
  const localName = specifier.local.name;
  const importedName = isNamed ? specifier.imported.name : null;
  const liquidImportName = `${localName}Liquid`;
  const regularImportName = `${localName}Regular`;

  if (config.debugLogging) {
    console.log(
      `[liquid-glass-resolver] Transforming: ${importValue} -> ${liquidImportPath}`,
    );
  }

  // Check if shared components have already been added to this file
  if (!state.sharedComponentsAdded) {
    state.sharedComponentsAdded = true;

    const [liquidImport, regularImport] = createVariantImports(
      t,
      liquidImportName,
      regularImportName,
      liquidImportPath,
      regularImportPath,
      isNamed,
      importedName,
    );

    const conditionalComponent = createConditionalComponent(
      t,
      localName,
      liquidImportName,
      regularImportName,
    );

    importPath.replaceWithMultiple([
      createConstantsImport(t),
      createRequireNativeModuleImport(t),
      createLiquidGlassAvailableDeclaration(t),
      createLiquidGlassAvailableFunction(t),
      liquidImport,
      regularImport,
      conditionalComponent,
    ]);
  } else {
    // For subsequent imports, only add the variant imports and conditional component
    const [liquidImport, regularImport] = createVariantImports(
      t,
      liquidImportName,
      regularImportName,
      liquidImportPath,
      regularImportPath,
      isNamed,
      importedName,
    );

    const conditionalComponent = createConditionalComponent(
      t,
      localName,
      liquidImportName,
      regularImportName,
    );

    importPath.replaceWithMultiple([
      liquidImport,
      regularImport,
      conditionalComponent,
    ]);
  }
}

/**
 * Main plugin export
 * @param {object} babel - Babel instance
 * @param {object} options - Plugin options
 * @returns {object} - Babel plugin
 */
module.exports = function ({ types: t }, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (config.debugLogging) {
    console.log(
      '[liquid-glass-resolver] Plugin initialized with config:',
      config,
    );
  }

  return {
    name: 'liquid-glass-resolver',
    visitor: {
      Program: {
        enter(path, state) {
          // Skip plugin if disabled via config
          if (config.disabled) {
            state.skipPlugin = true;
            return;
          }

          // Reset state for each file
          state.processedImports = new Set();
          state.sharedComponentsAdded = false;
        },
      },
      ImportDeclaration(path, state) {
        // Skip if plugin is disabled
        if (state.skipPlugin) {
          return;
        }

        const importValue = path.node.source.value;

        // Only process relative imports
        if (!importValue.startsWith('./') && !importValue.startsWith('../')) {
          return;
        }

        try {
          processImportDeclaration(path, state, t, config);
        } catch (error) {
          if (config.debugLogging) {
            console.error(
              `[liquid-glass-resolver] Error processing ${importValue}:`,
              error,
            );
          }
          // Don't throw - let the build continue
        }
      },
    },
  };
};
