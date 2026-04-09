#!/usr/bin/env node
// 2026-04-09: Initial save-buddy uninstaller that removes only the settings this project adds.
// uninstall.js - Surgically remove save-buddy integration from Claude Code settings.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSON5 from 'json5';
import { BUDDY_DIR, CONFIG_DIR as DETECTED_CONFIG_DIR } from './server/paths.js';

const DRY_RUN = process.argv.includes('--dry-run');
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = DETECTED_CONFIG_DIR;
const SETTINGS_PATH = join(CONFIG_DIR, 'settings.json');
const PREVIOUS_STATUSLINE_PATH = join(BUDDY_DIR, 'previous-statusline.json');

function readSettings() {
  try {
    return JSON5.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    console.log('No settings.json found. Nothing to uninstall.');
    process.exit(0);
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

function removeHook(settings, eventName, commandNeedle) {
  if (!Array.isArray(settings.hooks?.[eventName])) {
    return;
  }

  settings.hooks[eventName] = settings.hooks[eventName]
    .map((entry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((hook) => !hook.command?.includes(commandNeedle)),
    }))
    .filter((entry) => entry.hooks.length > 0);

  if (settings.hooks[eventName].length === 0) {
    delete settings.hooks[eventName];
  }
}

function findSkillDir() {
  const candidates = [
    join(process.cwd(), '.claude', 'skills', 'buddy'),
    join(HOME, '.claude', 'skills', 'buddy'),
    join(HOME, '.claude-work', 'skills', 'buddy'),
    join(HOME, '.claude-personal', 'skills', 'buddy'),
    join(CONFIG_DIR, 'skills', 'buddy'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

console.log('save-buddy uninstaller');
console.log('======================');
console.log(`Config directory: ${CONFIG_DIR}`);
if (DRY_RUN) {
  console.log('(dry-run mode - no files will be written)');
}

const settings = readSettings();

if (settings.mcpServers?.['save-buddy']) {
  delete settings.mcpServers['save-buddy'];
  console.log('Removed MCP server: save-buddy');
}
if (settings.mcpServers?.buddy) {
  delete settings.mcpServers.buddy;
  console.log('Removed MCP server: buddy (legacy)');
}

removeHook(settings, 'Stop', 'buddy-stop');
removeHook(settings, 'UserPromptSubmit', 'buddy-prompt');
removeHook(settings, 'PreToolUse', 'buddy-prompt');
removeHook(settings, 'SessionStart', 'buddy-session');
console.log('Removed save-buddy hooks');

if (settings.statusLine?.command?.includes('buddy-hud-wrapper')) {
  try {
    const previous = JSON.parse(readFileSync(PREVIOUS_STATUSLINE_PATH, 'utf-8'));
    if (previous.statusLine) {
      settings.statusLine = previous.statusLine;
      console.log(`Restored previous statusline: ${previous.statusLine.command || '[object]'}`);
    } else if (previous.command) {
      settings.statusLine = { type: 'command', command: previous.command };
      console.log(`Restored previous statusline: ${previous.command}`);
    } else {
      delete settings.statusLine;
      console.log('Removed statusLine setting');
    }
  } catch {
    delete settings.statusLine;
    console.log('Removed statusLine setting');
  }
}

if (Array.isArray(settings.permissions?.allow)) {
  const remove = new Set([
    'mcp__save-buddy__buddy_show',
    'mcp__save-buddy__buddy_pet',
    'mcp__save-buddy__buddy_react',
    'mcp__save-buddy__buddy_mute',
    'mcp__save-buddy__buddy_stats',
    'mcp__buddy__buddy_show',
    'mcp__buddy__buddy_pet',
    'mcp__buddy__buddy_react',
    'mcp__buddy__buddy_mute',
    'mcp__buddy__buddy_stats',
  ]);
  settings.permissions.allow = settings.permissions.allow.filter((entry) => !remove.has(entry));
  console.log('Removed buddy MCP permissions');
}

writeSettings(settings);

const skillDir = findSkillDir();
if (skillDir) {
  if (!DRY_RUN) {
    rmSync(skillDir, { recursive: true, force: true });
  }
  console.log(`Removed /buddy skill from ${skillDir}`);
}

console.log('\nUninstall complete. Restart Claude Code to apply.');
console.log(`State files remain at ${BUDDY_DIR}`);
