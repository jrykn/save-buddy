#!/usr/bin/env node
// 2026-04-09: Initial save-buddy installer that wires MCP, hooks, statusline, permissions, and skill.
// install.js - Idempotently register save-buddy with Claude Code settings.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import JSON5 from 'json5';
import { BUDDY_DIR, CONFIG_DIR as DETECTED_CONFIG_DIR } from './server/paths.js';

// 2026-04-09: Guard against running on Node < 20 (top-level await, ESM features).
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 20) {
  console.error(`ERROR: save-buddy requires Node.js >= 20. You are running ${process.versions.node}.`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname);
const DRY_RUN = process.argv.includes('--dry-run');
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = DETECTED_CONFIG_DIR;
const SETTINGS_PATH = join(CONFIG_DIR, 'settings.json');
const STATE_DIR = join(BUDDY_DIR, 'state');
const PREVIOUS_STATUSLINE_PATH = join(BUDDY_DIR, 'previous-statusline.json');

function readSettings() {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    const settings = JSON5.parse(raw);
    if (!DRY_RUN) {
      copyFileSync(SETTINGS_PATH, `${SETTINGS_PATH}.buddy-backup-${Date.now()}`);
    }
    return settings;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('ERROR: Cannot parse settings.json:', error.message);
    process.exit(1);
  }
}

function writeSettings(settings) {
  if (DRY_RUN) {
    console.log('\nDry run - settings would be:');
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  const tmpPath = `${SETTINGS_PATH}.save-buddy.tmp`;
  writeFileSync(tmpPath, JSON.stringify(settings, null, 2));
  renameSync(tmpPath, SETTINGS_PATH);
  console.log(`\nWrote settings to ${SETTINGS_PATH}`);
}

// 2026-04-09: Use save-buddy path prefix for hook matching (capstone P1 #3).
// Previously used substring match ('buddy-stop') which could false-positive on other extensions.
function ensureHook(settings, eventName, commandNeedle, command) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks[eventName])) settings.hooks[eventName] = [];

  const exists = settings.hooks[eventName].some((entry) =>
    entry?.hooks?.some((hook) => hook.command?.includes('save-buddy') && hook.command?.includes(commandNeedle)));

  if (!exists) {
    settings.hooks[eventName].push({ hooks: [{ type: 'command', command }] });
    console.log(`Added ${eventName} hook`);
  }
}

function installSkill() {
  const candidates = [
    join(process.cwd(), '.claude', 'skills'),
    join(HOME, '.claude', 'skills'),
    join(HOME, '.claude-work', 'skills'),
    join(HOME, '.claude-personal', 'skills'),
  ];
  const skillsRoot = candidates.find((candidate) => existsSync(candidate)) || join(HOME, '.claude', 'skills');
  const targetDir = join(skillsRoot, 'buddy');

  if (!DRY_RUN) {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(join(PROJECT_ROOT, 'skill', 'SKILL.md'), join(targetDir, 'SKILL.md'));
  }
  console.log(`Installed /buddy skill to ${targetDir}`);
}

console.log('save-buddy installer');
console.log('====================');
console.log(`Config directory: ${CONFIG_DIR}`);
console.log(`Settings file:   ${SETTINGS_PATH}`);
console.log(`Project root:    ${PROJECT_ROOT}`);
if (DRY_RUN) {
  console.log('(dry-run mode - no files will be written)');
}

const settings = readSettings();

if (!DRY_RUN) {
  mkdirSync(BUDDY_DIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });
}

if (!settings.mcpServers) settings.mcpServers = {};
const serverPath = join(PROJECT_ROOT, 'server', 'index.js').replace(/\\/g, '/');
settings.mcpServers['save-buddy'] = {
  command: 'node',
  args: [serverPath],
  ...(process.env.CLAUDE_CONFIG_DIR ? { env: { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } } : {}),
};
console.log('Added MCP server: save-buddy');

ensureHook(
  settings,
  'Stop',
  'buddy-stop',
  `node "${join(PROJECT_ROOT, 'hooks', 'buddy-stop.js').replace(/\\/g, '/')}"`,
);
ensureHook(
  settings,
  'UserPromptSubmit',
  'buddy-prompt',
  `node "${join(PROJECT_ROOT, 'hooks', 'buddy-prompt.js').replace(/\\/g, '/')}"`,
);
ensureHook(
  settings,
  'SessionStart',
  'buddy-session',
  `node "${join(PROJECT_ROOT, 'hooks', 'buddy-session.js').replace(/\\/g, '/')}"`,
);

const wrapperCommand = `node "${join(PROJECT_ROOT, 'statusline', 'buddy-hud-wrapper.js').replace(/\\/g, '/')}"`;
if (settings.statusLine?.command && !settings.statusLine.command.includes('buddy-hud-wrapper')) {
  if (!DRY_RUN) {
    writeFileSync(
      PREVIOUS_STATUSLINE_PATH,
      JSON.stringify({ statusLine: settings.statusLine }, null, 2),
    );
  }
  console.log(`Saved previous statusline: ${settings.statusLine.command}`);
}

settings.statusLine = {
  ...(settings.statusLine || {}),
  type: 'command',
  command: wrapperCommand,
};
console.log('Set statusLine command to save-buddy wrapper');

if (!settings.permissions) settings.permissions = {};
if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

// 2026-04-09: Log each permission for transparency (commit safety SEC-002).
const buddyPermissions = [
  'mcp__save-buddy__buddy_show',
  'mcp__save-buddy__buddy_pet',
  'mcp__save-buddy__buddy_react',
  'mcp__save-buddy__buddy_mute',
  'mcp__save-buddy__buddy_stats',
];
console.log('Auto-approving MCP permissions:');
for (const permission of buddyPermissions) {
  if (!settings.permissions.allow.includes(permission)) {
    settings.permissions.allow.push(permission);
  }
  console.log(`  ${permission}`);
}

try {
  const config = JSON.parse(readFileSync(join(CONFIG_DIR, '.claude.json'), 'utf-8'));
  if (config.companion && !DRY_RUN) {
    const backupPath = join(BUDDY_DIR, 'companion-backup.json');
    writeFileSync(backupPath, JSON.stringify(config.companion, null, 2));
    console.log(`Backed up companion data to ${backupPath}`);
  }
} catch {}

writeSettings(settings);
installSkill();

console.log('\nInstallation complete.');
console.log('Restart Claude Code, then run /buddy.');
