// 2026-04-09: Initial save-buddy path resolution from the reviewed preservation plan.
// paths.js - Single source of truth for Claude Code and save-buddy paths.

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME || process.env.USERPROFILE || '';

function resolveConfigDir() {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }

  const candidates = [
    join(HOME, '.claude'),
    join(HOME, '.claude-work'),
    join(HOME, '.claude-personal'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, '.claude.json'))) {
      return dir;
    }
  }

  return join(HOME, '.claude');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CONFIG_DIR = resolveConfigDir();
export const CONFIG_PATH = join(CONFIG_DIR, '.claude.json');
export const CREDS_PATH = join(CONFIG_DIR, '.credentials.json');

export const BUDDY_DIR = join(HOME, '.config', 'save-buddy');
export const STATE_DIR = join(BUDDY_DIR, 'state');
export const STATE_PATH = join(STATE_DIR, 'state.json');
export const REACTION_PATH = join(STATE_DIR, 'reaction.json');
export const ADDRESSED_FLAG_PATH = join(STATE_DIR, 'addressed.flag');

export const PROJECT_ROOT = join(__dirname, '..');
