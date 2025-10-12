#!/usr/bin/env node

/**
 * Animation Metadata Hash Management
 *
 * This script manages content hashes for animation metadata files.
 * It helps detect when animation code changes but metadata is stale.
 *
 * Usage:
 *   node scripts/meta-hash.js generate [animation-slug]  # Generate/update hashes
 *   node scripts/meta-hash.js validate [animation-slug]  # Check for stale metadata
 *   node scripts/meta-hash.js list                       # List all animations with status
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ANIMATIONS_DIR = path.join(__dirname, '..', 'src', 'animations');
const HASH_ALGORITHM = 'sha256';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);

    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * Calculate hash for animation folder
 * Excludes _meta.json and non-code files
 */
function calculateAnimationHash(animationPath) {
  const files = getAllFiles(animationPath);

  // Filter files to include only code files, exclude _meta.json
  const relevantFiles = files.filter(file => {
    const relativePath = path.relative(animationPath, file);

    // Exclude _meta.json
    if (relativePath === '_meta.json') return false;

    // Include common code file extensions
    const ext = path.extname(file);
    return ['.ts', '.tsx', '.js', '.jsx', '.json'].includes(ext);
  });

  // Sort files for consistent hashing
  relevantFiles.sort();

  // Create hash from all file contents
  const hash = crypto.createHash(HASH_ALGORITHM);

  relevantFiles.forEach(file => {
    const relativePath = path.relative(animationPath, file);
    const content = fs.readFileSync(file, 'utf8');

    // Include filename in hash to detect renames
    hash.update(relativePath);
    hash.update(content);
  });

  return hash.digest('hex');
}

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
 * Read and parse _meta.json
 */
function readMetadata(animationPath) {
  const metaPath = path.join(animationPath, '_meta.json');

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(
      `${colors.red}✗${colors.reset} Error parsing ${metaPath}: ${error.message}`,
    );
    return null;
  }
}

/**
 * Write metadata with hash
 */
function writeMetadata(animationPath, metadata, hash) {
  const metaPath = path.join(animationPath, '_meta.json');

  // Add hash fields
  const updatedMetadata = {
    ...metadata,
    content_hash: hash,
    hash_algorithm: HASH_ALGORITHM,
    hash_generated_at: new Date().toISOString(),
    last_validated: new Date().toISOString(),
  };

  // Write with pretty formatting
  fs.writeFileSync(
    metaPath,
    JSON.stringify(updatedMetadata, null, 2) + '\n',
    'utf8',
  );
}

/**
 * Generate/update hash for an animation
 */
function generateHash(slug) {
  const animationPath = path.join(ANIMATIONS_DIR, slug);

  if (!fs.existsSync(animationPath)) {
    console.error(`${colors.red}✗${colors.reset} Animation not found: ${slug}`);
    return false;
  }

  const metadata = readMetadata(animationPath);

  if (!metadata) {
    console.error(
      `${colors.red}✗${colors.reset} No _meta.json found for: ${slug}`,
    );
    return false;
  }

  const hash = calculateAnimationHash(animationPath);
  writeMetadata(animationPath, metadata, hash);

  console.log(`${colors.green}✓${colors.reset} ${slug} - hash updated`);
  console.log(`  ${colors.gray}${hash}${colors.reset}`);

  return true;
}

/**
 * Generate hashes for all animations
 */
function generateAllHashes() {
  const animations = getAnimationDirectories();

  console.log(
    `${colors.bright}Generating hashes for ${animations.length} animations...${colors.reset}\n`,
  );

  let successCount = 0;
  let failCount = 0;

  animations.forEach(animation => {
    if (generateHash(animation.slug)) {
      successCount++;
    } else {
      failCount++;
    }
  });

  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  console.log(`  ${colors.green}${successCount} updated${colors.reset}`);
  if (failCount > 0) {
    console.log(`  ${colors.red}${failCount} failed${colors.reset}`);
  }
}

/**
 * Validate hash for an animation
 */
function validateHash(slug) {
  const animationPath = path.join(ANIMATIONS_DIR, slug);

  if (!fs.existsSync(animationPath)) {
    console.error(`${colors.red}✗${colors.reset} Animation not found: ${slug}`);
    return { status: 'not_found', slug };
  }

  const metadata = readMetadata(animationPath);

  if (!metadata) {
    return { status: 'no_meta', slug };
  }

  if (!metadata.content_hash) {
    return { status: 'no_hash', slug };
  }

  const currentHash = calculateAnimationHash(animationPath);
  const isValid = currentHash === metadata.content_hash;

  return {
    status: isValid ? 'valid' : 'stale',
    slug,
    storedHash: metadata.content_hash,
    currentHash,
    generatedAt: metadata.hash_generated_at,
  };
}

/**
 * Validate all animations
 */
function validateAllHashes() {
  const animations = getAnimationDirectories();

  console.log(
    `${colors.bright}Validating ${animations.length} animations...${colors.reset}\n`,
  );

  const results = animations.map(animation => validateHash(animation.slug));

  const valid = results.filter(r => r.status === 'valid');
  const stale = results.filter(r => r.status === 'stale');
  const noMeta = results.filter(r => r.status === 'no_meta');
  const noHash = results.filter(r => r.status === 'no_hash');

  // Print results
  if (valid.length > 0) {
    console.log(
      `${colors.green}${colors.bright}Valid (${valid.length}):${colors.reset}`,
    );
    valid.forEach(r => {
      console.log(`  ${colors.green}✓${colors.reset} ${r.slug}`);
    });
    console.log();
  }

  if (stale.length > 0) {
    console.log(
      `${colors.red}${colors.bright}Stale (${stale.length}):${colors.reset}`,
    );
    stale.forEach(r => {
      console.log(`  ${colors.red}✗${colors.reset} ${r.slug} - hash mismatch`);
      console.log(
        `    ${colors.gray}Generated: ${r.generatedAt}${colors.reset}`,
      );
    });
    console.log();
  }

  if (noHash.length > 0) {
    console.log(
      `${colors.yellow}${colors.bright}Missing Hash (${noHash.length}):${colors.reset}`,
    );
    noHash.forEach(r => {
      console.log(
        `  ${colors.yellow}!${colors.reset} ${r.slug} - _meta.json exists but no hash`,
      );
    });
    console.log();
  }

  if (noMeta.length > 0) {
    console.log(
      `${colors.yellow}${colors.bright}Missing Metadata (${noMeta.length}):${colors.reset}`,
    );
    noMeta.forEach(r => {
      console.log(
        `  ${colors.yellow}!${colors.reset} ${r.slug} - no _meta.json found`,
      );
    });
    console.log();
  }

  // Summary
  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  ${colors.green}${valid.length} valid${colors.reset}`);
  if (stale.length > 0) {
    console.log(`  ${colors.red}${stale.length} stale${colors.reset}`);
  }
  if (noHash.length > 0) {
    console.log(
      `  ${colors.yellow}${noHash.length} missing hash${colors.reset}`,
    );
  }
  if (noMeta.length > 0) {
    console.log(
      `  ${colors.yellow}${noMeta.length} missing metadata${colors.reset}`,
    );
  }

  // Exit code based on results
  if (stale.length > 0) {
    console.log(
      `\n${colors.red}${colors.bright}⚠️  Some metadata files are stale!${colors.reset}`,
    );
    console.log(
      `Run: ${colors.cyan}npm run meta:generate${colors.reset} to update`,
    );
    process.exit(1);
  }
}

/**
 * List all animations with their status
 */
function listAnimations() {
  const animations = getAnimationDirectories();

  console.log(
    `${colors.bright}Animations (${animations.length} total):${colors.reset}\n`,
  );

  animations.forEach(animation => {
    const result = validateHash(animation.slug);

    let statusIcon, statusText, statusColor;

    switch (result.status) {
      case 'valid':
        statusIcon = '✓';
        statusText = 'Valid';
        statusColor = colors.green;
        break;
      case 'stale':
        statusIcon = '✗';
        statusText = 'Stale';
        statusColor = colors.red;
        break;
      case 'no_hash':
        statusIcon = '!';
        statusText = 'No Hash';
        statusColor = colors.yellow;
        break;
      case 'no_meta':
        statusIcon = '!';
        statusText = 'No Meta';
        statusColor = colors.yellow;
        break;
    }

    console.log(
      `  ${statusColor}${statusIcon}${colors.reset} ${animation.slug} ${colors.gray}(${statusText})${colors.reset}`,
    );
  });
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
${colors.bright}Animation Metadata Hash Manager${colors.reset}

${colors.bright}Usage:${colors.reset}
  ${colors.cyan}npm run meta:generate [animation-slug]${colors.reset}   Generate/update hash(es)
  ${colors.cyan}npm run meta:validate [animation-slug]${colors.reset}   Validate hash(es)
  ${colors.cyan}npm run meta:list${colors.reset}                        List all with status

${colors.bright}Examples:${colors.reset}
  npm run meta:generate                    # Update all hashes
  npm run meta:generate everybody-can-cook # Update single animation
  npm run meta:validate                    # Check all for staleness
  npm run meta:list                        # Show status of all

${colors.bright}Hash Fields Added to _meta.json:${colors.reset}
  ${colors.gray}content_hash${colors.reset}        - SHA-256 hash of animation code
  ${colors.gray}hash_algorithm${colors.reset}      - Algorithm used (sha256)
  ${colors.gray}hash_generated_at${colors.reset}   - ISO timestamp of generation
  ${colors.gray}last_validated${colors.reset}      - ISO timestamp of last validation
    `);
    return;
  }

  switch (command) {
    case 'generate':
    case 'gen':
    case 'g':
      if (target) {
        generateHash(target);
      } else {
        generateAllHashes();
      }
      break;

    case 'validate':
    case 'check':
    case 'v':
      if (target) {
        const result = validateHash(target);

        if (result.status === 'valid') {
          console.log(`${colors.green}✓${colors.reset} ${result.slug} - valid`);
          console.log(
            `  ${colors.gray}Hash: ${result.currentHash}${colors.reset}`,
          );
          console.log(
            `  ${colors.gray}Generated: ${result.generatedAt}${colors.reset}`,
          );
        } else if (result.status === 'stale') {
          console.log(
            `${colors.red}✗${colors.reset} ${result.slug} - STALE (hash mismatch)`,
          );
          console.log(
            `  ${colors.gray}Generated: ${result.generatedAt}${colors.reset}`,
          );
          process.exit(1);
        } else if (result.status === 'no_hash') {
          console.log(
            `${colors.yellow}!${colors.reset} ${result.slug} - no hash in _meta.json`,
          );
          process.exit(1);
        } else if (result.status === 'no_meta') {
          console.log(
            `${colors.yellow}!${colors.reset} ${result.slug} - no _meta.json found`,
          );
          process.exit(1);
        }
      } else {
        validateAllHashes();
      }
      break;

    case 'list':
    case 'ls':
    case 'l':
      listAnimations();
      break;

    default:
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
      console.log(
        `Run ${colors.cyan}npm run meta:help${colors.reset} for usage`,
      );
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  calculateAnimationHash,
  validateHash,
  generateHash,
};

