#!/usr/bin/env node
// 2026-04-10: CLI entry point for npx save-buddy.
// cli.js - Bootstraps save-buddy installation to ~/.save-buddy.
//
// npx runs packages from a temp cache that gets cleaned up. The MCP server,
// hooks, and statusline wrapper need to persist on disk. This script clones
// the repo to ~/.save-buddy and runs the installer from there.

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const INSTALL_DIR = join(HOME, '.save-buddy');
const REPO_URL = 'https://github.com/jrykn/save-buddy.git';
const args = process.argv.slice(2);

if (args[0] === 'uninstall' || args[0] === 'remove') {
  if (!existsSync(INSTALL_DIR)) {
    console.log('save-buddy is not installed.');
    process.exit(0);
  }
  execSync('node uninstall.js', { cwd: INSTALL_DIR, stdio: 'inherit' });
  process.exit(0);
}

if (args[0] === 'update') {
  if (!existsSync(INSTALL_DIR)) {
    console.log('save-buddy is not installed. Run npx save-buddy to install.');
    process.exit(1);
  }
  console.log('Updating save-buddy...');
  execSync('git pull', { cwd: INSTALL_DIR, stdio: 'inherit' });
  execSync('npm install', { cwd: INSTALL_DIR, stdio: 'inherit' });
  execSync('node install.js', { cwd: INSTALL_DIR, stdio: 'inherit' });
  console.log('\nUpdated. Restart Claude Code to apply.');
  process.exit(0);
}

// Default: install
if (existsSync(join(INSTALL_DIR, 'package.json'))) {
  console.log(`save-buddy already installed at ${INSTALL_DIR}`);
  console.log('Updating and re-running installer...');
  try {
    execSync('git pull', { cwd: INSTALL_DIR, stdio: 'inherit' });
  } catch {
    // Not a git repo or offline - continue with existing files
  }
  execSync('npm install', { cwd: INSTALL_DIR, stdio: 'inherit' });
  execSync('node install.js', { cwd: INSTALL_DIR, stdio: 'inherit' });
} else {
  console.log(`Installing save-buddy to ${INSTALL_DIR}`);
  execSync(`git clone "${REPO_URL}" "${INSTALL_DIR}"`, { stdio: 'inherit' });
  execSync('npm install', { cwd: INSTALL_DIR, stdio: 'inherit' });
  execSync('node install.js', { cwd: INSTALL_DIR, stdio: 'inherit' });
}

console.log('\nDone! Restart Claude Code and type /buddy to see your companion.');
