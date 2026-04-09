#!/usr/bin/env node
// 2026-04-09: Initial statusline wrapper with multi-line sprite rendering and ANSI-aware layout.
// buddy-hud-wrapper.js - Replay any existing status line, then append the buddy block on the right.

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bold, colorize, dim, italic, magenta } from '../server/ansi.js';
import { getCompanion, isMuted } from '../server/companion.js';
import { BUDDY_DIR, REACTION_PATH, STATE_PATH } from '../server/paths.js';
import { renderBlink, renderBubble, renderSprite } from '../server/sprites.js';
import { RARITY_STARS } from '../server/types.js';
import { stripAnsi, truncateAnsi } from '../server/util.js';

const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
// 2026-04-09: 5 frames matching forensics ref section 19 (Um7). Was 4 frames.
const PET_HEARTS = [
  '   \u2665    \u2665   ',
  '  \u2665  \u2665   \u2665  ',
  ' \u2665   \u2665  \u2665   ',
  '\u2665  \u2665      \u2665 ',
  '\u00b7    \u00b7   \u00b7  ',
];

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// 2026-04-09: Parse saved command into [exe, ...args] for execFileSync (no shell injection).
// Previous statusline is stored as a raw command string. We split on whitespace,
// respecting quoted arguments, to avoid passing it through a shell interpreter.
function parseCommand(raw) {
  const tokens = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function readPreviousStatusline() {
  const saved = safeReadJson(join(BUDDY_DIR, 'previous-statusline.json'));
  if (!saved) {
    return null;
  }
  const command = saved.statusLine?.command || saved.command || '';
  if (!command) return null;
  const tokens = parseCommand(command);
  if (tokens.length === 0) return null;
  return { exe: tokens[0], args: tokens.slice(1) };
}

function renderExistingOutput(stdin) {
  const parsed = readPreviousStatusline();
  if (!parsed) {
    return '';
  }

  try {
    return execFileSync(parsed.exe, parsed.args, {
      input: stdin,
      encoding: 'utf-8',
      timeout: 2000,
    });
  } catch {
    return '';
  }
}

function getReaction() {
  const payload = safeReadJson(REACTION_PATH);
  if (!payload?.text || !payload?.ts) {
    return { text: '', age: Number.POSITIVE_INFINITY };
  }
  const age = Date.now() - payload.ts;
  if (age >= 10000) {
    return { text: '', age };
  }
  return { text: String(payload.text), age };
}

function styleBubbleLines(lines, rarity, shouldDim) {
  return lines.map((line, index) => {
    const border = index === 0 || index === lines.length - 1;
    if (border) {
      return colorize(shouldDim ? dim(line) : line, rarity);
    }

    const inner = line.slice(2, -2);
    const styledInner = shouldDim ? italic(dim(inner)) : italic(inner);
    const left = colorize(shouldDim ? dim('\u2502 ') : '\u2502 ', rarity);
    const right = colorize(shouldDim ? dim(' \u2502') : ' \u2502', rarity);
    return `${left}${styledInner}${right}`;
  });
}

function rightPadAnsi(line, width) {
  const visual = stripAnsi(line).length;
  return line + ' '.repeat(Math.max(0, width - visual));
}

try {
  let stdin = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    stdin += chunk;
  }

  const existingOutput = renderExistingOutput(stdin);
  const existingLines = existingOutput.replace(/\r\n/g, '\n').trimEnd().split('\n').filter(Boolean);
  const companion = getCompanion();

  if (!companion) {
    process.stdout.write(existingOutput);
    process.exit(0);
  }

  const cols = process.stdout.columns || 120;
  if (cols < 60) {
    process.stdout.write(existingOutput);
    process.exit(0);
  }

  const state = safeReadJson(STATE_PATH);
  if (isMuted(state)) {
    process.stdout.write(existingOutput);
    process.exit(0);
  }

  const reaction = getReaction();
  const hasActiveReaction = Boolean(reaction.text);
  const tick = Math.floor(Date.now() / 500);
  const step = hasActiveReaction ? tick % 3 : IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length];
  const spriteLines = step === -1 ? renderBlink(companion) : renderSprite(companion, step);
  const shouldDim = hasActiveReaction && reaction.age > 7000;
  const cappedReaction = reaction.text ? reaction.text.slice(0, 180) : '';
  let bubbleLines = cappedReaction ? renderBubble(cappedReaction) : [];
  bubbleLines = styleBubbleLines(bubbleLines, companion.rarity, shouldDim);

  const spriteBlock = [];
  if (state?.petHeartsUntil && Date.now() < state.petHeartsUntil) {
    spriteBlock.push(magenta(PET_HEARTS[Math.floor(Date.now() / 500) % PET_HEARTS.length]));
  }

  spriteLines.forEach((line) => spriteBlock.push(line));
  spriteBlock.push(`   ${bold(colorize(companion.name, companion.rarity))}`);
  spriteBlock.push(`   ${colorize(RARITY_STARS[companion.rarity] || '', companion.rarity)}`);

  const rightBlock = [];
  if (bubbleLines.length > 0) {
    const bubbleWidth = Math.max(...bubbleLines.map((line) => stripAnsi(line).length), 34);
    const totalLines = Math.max(bubbleLines.length, spriteBlock.length);
    for (let i = 0; i < totalLines; i += 1) {
      rightBlock.push(`${rightPadAnsi(bubbleLines[i] || '', bubbleWidth)}  ${spriteBlock[i] || ''}`);
    }
  } else {
    spriteBlock.forEach((line) => rightBlock.push(line));
  }

  const rightWidth = Math.max(...rightBlock.map((line) => stripAnsi(line).length), 0);
  const leftWidth = Math.max(0, cols - rightWidth - 2);
  const totalLines = Math.max(existingLines.length, rightBlock.length);
  const output = [];

  for (let i = 0; i < totalLines; i += 1) {
    const leftRaw = existingLines[i] || '';
    const leftVisual = stripAnsi(leftRaw).length;
    const left = leftVisual <= leftWidth
      ? `${leftRaw}${' '.repeat(leftWidth - leftVisual)}`
      : truncateAnsi(leftRaw, leftWidth);
    output.push(`${left}  ${rightBlock[i] || ''}`.trimEnd());
  }

  process.stdout.write(`${output.join('\n')}\n`);
} catch {
  // 2026-04-09: Preserve existing statusline on buddy render failure (code review #21).
  try {
    const fallback = renderExistingOutput('');
    if (fallback) process.stdout.write(fallback);
  } catch {}
  process.exit(0);
}
