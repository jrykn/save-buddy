#!/usr/bin/env node
// 2026-04-09: Initial UserPromptSubmit hook for companion addressed-by-name detection.
// buddy-prompt.js - Record a short-lived addressed flag without writing stdout context.

import { readFileSync } from 'fs';
import { getCompanion, isMuted } from '../server/companion.js';
import { ADDRESSED_FLAG_PATH, STATE_PATH } from '../server/paths.js';
import { atomicWrite } from '../server/util.js';

let stdin = '';
process.stdin.setEncoding('utf-8');
for await (const chunk of process.stdin) {
  stdin += chunk;
}

let hookContext;
try {
  hookContext = JSON.parse(stdin);
} catch {
  process.exit(0);
}

try {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  if (isMuted(state)) {
    process.exit(0);
  }
} catch {
  if (isMuted(null)) {
    process.exit(0);
  }
}

const companion = getCompanion();
if (!companion) {
  process.exit(0);
}

const prompt = String(hookContext.prompt || '');
if (!prompt) {
  process.exit(0);
}

// 2026-04-09: Use \b word boundaries to match native KD1 behavior from forensics ref.
const escapedName = companion.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namePattern = new RegExp(`\\b${escapedName}\\b`, 'i');

if (namePattern.test(prompt)) {
  atomicWrite(ADDRESSED_FLAG_PATH, String(Date.now()));
}

process.exit(0);
