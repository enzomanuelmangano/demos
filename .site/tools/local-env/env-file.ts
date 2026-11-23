// Reads the owner's env file (outside every repo) for the local tools. Values never leave the process that needs
// them: nothing here prints, logs or writes a value; callers print key NAMES only (docs/local-env.md).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = resolve(import.meta.dir, '../..');
/** The env file: REACTIIVE_ENV_FILE, else the owner's Production pull next to the worktrees (`<reactiive>/.secrets/`). */
export const ENV_FILE = resolve(process.env.REACTIIVE_ENV_FILE ?? resolve(SITE, '../../.secrets/reactiive-io.production.env'));

/** The reference's variable names (its `.env.example`): only these ever reach the local API. */
export const REFERENCE_KEYS = [
  'DATABASE_URL',
  'EXPO_PUBLIC_WEBSITE_URL', 'EXPO_PUBLIC_AMPLITUDE_API_KEY', 'EXPO_PUBLIC_ACCESS_KEY', 'EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_MEDIA_CDN_URL',
  'LEMON_SQUEEZY_API_KEY', 'LEMON_SQUEEZY_STORE_ID', 'LEMON_SQUEEZY_MONTHLY_SUPPORTER_VARIANT_ID', 'LEMON_SQUEEZY_ANNUAL_SUPPORTER_VARIANT_ID', 'LEMON_SQUEEZY_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_OAUTH_TOKEN',
  'PATREON_CLIENT_ID', 'PATREON_CLIENT_SECRET', 'APPLE_TEAM_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY', 'APPLE_KEY_ID',
  'AUTH_JWT_SECRET', 'LOG_LEVEL', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'BEEHIIV_API_KEY', 'BEEHIIV_PUBLICATION_ID',
] as const;

/** Public client keys: the reference ships these in its browser bundle (next.config.ts `env`). */
export const PUBLIC_KEYS = ['EXPO_PUBLIC_WEBSITE_URL', 'EXPO_PUBLIC_AMPLITUDE_API_KEY', 'EXPO_PUBLIC_ACCESS_KEY', 'EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_MEDIA_CDN_URL'] as const;

/** Parses KEY=value lines (Vercel's `env pull` format: double-quoted, `\n` escaped). */
export function readEnvFile(path = ENV_FILE): Map<string, string> | null {
  if (!existsSync(path)) return null;
  const out = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) v = v.slice(1, -1);
    out.set(m[1], v);
  }
  return out;
}

/** Whether the file's values belong to the production deployment (its own VERCEL_ENV says so). */
export const isProduction = (env: Map<string, string>) => env.get('VERCEL_ENV') === 'production' || env.get('VERCEL_TARGET_ENV') === 'production';
