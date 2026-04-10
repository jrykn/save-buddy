// 2026-04-10: Single source of truth for Claude Code and save-buddy paths.
// paths.js - Cross-platform Claude Code config discovery.
//
// Claude Code's default layout (Windows, macOS, Linux):
//
//   ~/.claude.json                -- Main user config (oauthAccount, companion, mcpServers)
//   ~/.claude/settings.json       -- User settings (hooks, permissions, statusLine)
//   ~/.claude/.credentials.json   -- OAuth credentials
//   ~/.claude/skills/             -- Skill directories
//
// Note that `.claude.json` lives at the home directory root, NOT inside `.claude/`.
// This surprised an early adopter on Windows (#1) and led to save-buddy writing
// to a non-existent path. The resolver below treats `.claude.json` and `.claude/`
// as independent locations on standard installs.
//
// Multi-account toggle layout (some power users):
//
//   ~/.claude-work/.claude.json
//   ~/.claude-work/settings.json
//   ~/.claude-work/.credentials.json
//   ~/.claude-personal/...
//
// In the toggle layout, everything lives in one directory. The resolver
// detects this by checking for a toggle directory containing `.claude.json`.
//
// The CLAUDE_CONFIG_DIR environment variable overrides everything: when set,
// both the settings directory and `.claude.json` are resolved relative to it.

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME || process.env.USERPROFILE || '';

function resolvePaths() {
  // 1. Explicit override: everything lives under CLAUDE_CONFIG_DIR.
  if (process.env.CLAUDE_CONFIG_DIR) {
    const dir = process.env.CLAUDE_CONFIG_DIR;
    return {
      configDir: dir,
      configPath: join(dir, '.claude.json'),
      credsPath: join(dir, '.credentials.json'),
    };
  }

  // 2. Toggle layout: ~/.claude-work/ or ~/.claude-personal/ containing .claude.json.
  //    In this case, settings.json and .credentials.json live in the same directory.
  const toggleDirs = [
    join(HOME, '.claude-work'),
    join(HOME, '.claude-personal'),
  ];
  for (const dir of toggleDirs) {
    if (existsSync(join(dir, '.claude.json'))) {
      return {
        configDir: dir,
        configPath: join(dir, '.claude.json'),
        credsPath: join(dir, '.credentials.json'),
      };
    }
  }

  // 3. Standard Claude Code layout:
  //    - .claude.json at home root
  //    - .claude/ directory for settings, credentials, skills, agents, commands
  return {
    configDir: join(HOME, '.claude'),
    configPath: join(HOME, '.claude.json'),
    credsPath: join(HOME, '.claude', '.credentials.json'),
  };
}

const resolved = resolvePaths();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CONFIG_DIR: directory containing settings.json, skills/, agents/, commands/.
export const CONFIG_DIR = resolved.configDir;

// CONFIG_PATH: path to the main .claude.json file (oauthAccount, companion, mcpServers).
// On standard installs this is at the home root, NOT inside CONFIG_DIR.
export const CONFIG_PATH = resolved.configPath;

// CREDS_PATH: OAuth credentials file.
export const CREDS_PATH = resolved.credsPath;

export const BUDDY_DIR = join(HOME, '.config', 'save-buddy');
export const STATE_DIR = join(BUDDY_DIR, 'state');
export const STATE_PATH = join(STATE_DIR, 'state.json');
export const REACTION_PATH = join(STATE_DIR, 'reaction.json');
export const ADDRESSED_FLAG_PATH = join(STATE_DIR, 'addressed.flag');

export const PROJECT_ROOT = join(__dirname, '..');
