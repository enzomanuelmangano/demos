#!/usr/bin/env node

import type { IncomingMessage } from 'http';
import fs from 'fs'
import https from 'https'
import path from 'path'

// ANSI color codes for terminal output
type TerminalColors = {
  reset: string;
  bright: string;
  dim: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
};

const colors: TerminalColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Default user target directory
const TARGET = 'components/ui';

function log(message: string, color: string = colors.white): void {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message: string): never {
  log(`Error: ${message}`, colors.red);
  process.exit(1);
}

function success(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function info(message: string): void {
  log(message, colors.cyan);
}

function warning(message: string): void {
  log(`⚠ ${message}`, colors.yellow);
}

function getCurrentDir(): string {
  return process.cwd();
}

// Find the demos.json config file
type DemosConfig = { target: string; configPath: string | null };

function findConfigFile(): DemosConfig {
  const currentDir = getCurrentDir();
  const configPath = path.join(currentDir, 'demos.json');

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent) as { target?: string };
      return {
        target: config.target || TARGET,
        configPath,
      };
    } catch (err: any) {
      warning(
        `Found demos.json but could not parse it. Using default target: ${TARGET}`,
      );
      return { target: TARGET, configPath: null };
    }
  }

  return { target: TARGET, configPath: null };
}

// GitHub repository information
const REPO_OWNER = 'enzomanuelmangano';
const REPO_NAME = 'demos';
const REPO_BRANCH = 'main';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

type GitHubEntry = { name: string; path: string; type: 'file' | 'dir' };

function makeGitHubRequest(endpoint: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: endpoint,
      method: 'GET',
      headers: {
        'User-Agent': 'demos-cli',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, (res: IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf8');
      });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData);
        } catch (err: any) {
          reject(
            new Error(`Failed to parse GitHub API response: ${err.message}`),
          );
        }
      });
    });

    req.on('error', (err: Error) => {
      reject(new Error(`GitHub API request failed: ${err.message}`));
    });

    req.end();
  });
}

function downloadFileFromGitHub(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${filePath}`;

    https
      .get(url, (res: IncomingMessage) => {
        if (res.statusCode === 404) {
          reject(new Error(`File not found: ${filePath}`));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => {
          resolve(data);
        });
      })
      .on('error', (err: Error) => {
        reject(new Error(`Download failed: ${err.message}`));
      });
  });
}

async function listAnimations(): Promise<string[]> {
  try {
    info('Fetching available animations from GitHub...');
    const response = (await makeGitHubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/animations`,
    )) as GitHubEntry[];

    const animations = response
      .filter((item: GitHubEntry) => item.type === 'dir')
      .map((item: GitHubEntry) => item.name)
      .sort();

    return animations;
  } catch (err: any) {
    error(`Could not fetch animations from GitHub: ${err.message}`);
  }
}

async function downloadAnimationFromGitHub(
  animationName: string,
  targetPath: string,
): Promise<void> {
  try {
    info(`Downloading ${animationName} from GitHub...`);

    const response = (await makeGitHubRequest(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/src/animations/${animationName}`,
    )) as GitHubEntry[];

    if (!response || response.length === 0) {
      throw new Error(`Animation "${animationName}" not found`);
    }

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    for (const item of response) {
      const itemPath = path.join(targetPath, item.name);

      if (item.type === 'file') {
        const content = await downloadFileFromGitHub(item.path);
        fs.writeFileSync(itemPath, content);
      } else if (item.type === 'dir') {
        await downloadAnimationFromGitHub(
          `${animationName}/${item.name}`,
          itemPath,
        );
      }
    }
  } catch (err: any) {
    throw new Error(`Failed to download animation: ${err.message}`);
  }
}

async function getCommand(animationName: string): Promise<void> {
  if (!animationName) {
    error(
      'Please specify an animation name. Usage: demos get <animation-name>',
    );
  }

  const { target } = findConfigFile();
  const targetPath = path.join(getCurrentDir(), target, animationName);

  // Check if target already exists
  if (fs.existsSync(targetPath)) {
    warning(
      `Animation "${animationName}" already exists in ${target}/${animationName}`,
    );
    return;
  }

  // Ensure target directory exists
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    info(`Created directory: ${target}`);
  }

  try {
    await downloadAnimationFromGitHub(animationName, targetPath);
    success(`Downloaded "${animationName}" to ${target}/${animationName}`);
    info(
      `Files downloaded successfully! You can now import and use the animation in your project.`,
    );
    info(
      `Source: ${REPO_URL}/tree/${REPO_BRANCH}/src/animations/${animationName}`,
    );
  } catch (err: any) {
    try {
      const availableAnimations = await listAnimations();
      error(
        `Failed to download animation: ${err.message}\n\nAvailable animations:\n${availableAnimations.map((name: string) => `  - ${name}`).join('\n')}`,
      );
    } catch (listErr: any) {
      error(`Failed to download animation: ${err.message}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    log(
      'Demos CLI - Copy React Native animations to your project',
      colors.bright,
    );
    log('');
    log('Usage:', colors.bright);
    log(
      '  demos get <animation-name>  Download an animation to your project',
      colors.dim,
    );
    log(
      '  demos list                 List all available animations',
      colors.dim,
    );
    log('');
    log('Configuration:', colors.bright);
    log('  Create a demos.json file in your project root:', colors.dim);
    log('  {', colors.dim);
    log(`    "target": "${TARGET}"`, colors.dim);
    log('  }', colors.dim);
    log(`  Default target directory is "${TARGET}"`, colors.dim);
    log('');
    log('Source:', colors.bright);
    log(`  ${REPO_URL}`, colors.dim);
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'get':
        await getCommand(args[1]);
        break;
      case 'list':
        const animations = await listAnimations();
        log('Available animations:', colors.bright);
        animations.forEach((animation: string) => {
          log(`  - ${animation}`, colors.dim);
        });
        break;
      default:
        error(
          `Unknown command: ${command}. Use "demos get <name>" or "demos list"`,
        );
    }
  } catch (err: any) {
    error(`Command failed: ${err.message}`);
  }
}

if (require.main === module) {
  main();
}

export { findConfigFile, getCommand, listAnimations, REPO_URL };
