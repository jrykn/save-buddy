#!/usr/bin/env node
// 2026-04-10: Statusline layout engine with fixed-height rendering and per-line erase.
// buddy-hud-wrapper.js - Chains any existing statusline and appends buddy sprite + bubble.

import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { bold, colorize, dim, italic, magenta } from '../server/ansi.js';
import { getCompanion, isMuted } from '../server/companion.js';
import { BUDDY_DIR, REACTION_PATH, STATE_PATH } from '../server/paths.js';
import { renderBlink, renderBubble, renderSprite } from '../server/sprites.js';
import { RARITY_STARS } from '../server/types.js';
import { visualWidth } from '../server/util.js';

const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
// 2026-04-10: Maximum buddy block height: 1 pet-heart + 5 sprite rows (with hat)
// + 1 name + 1 stars = 8. Also matches max bubble height (2 borders + 6 content).
// Defined at module scope so the catch fallback can reference it.
const BUDDY_RESERVED_HEIGHT = 8;
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
  if (!saved) return null;
  const command = saved.statusLine?.command || saved.command || '';
  if (!command) return null;
  const tokens = parseCommand(command);
  if (tokens.length === 0) return null;
  return { exe: tokens[0], args: tokens.slice(1) };
}

function renderExistingOutput(stdin) {
  const parsed = readPreviousStatusline();
  if (!parsed) return '';
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
  const visual = visualWidth(line);
  return line + ' '.repeat(Math.max(0, width - visual));
}

try {
  let stdin = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    stdin += chunk;
  }

  // 2026-04-10: Cache last good HUD output to a session-scoped file. Codex
  // review identified this: when the chained HUD command fails or times out,
  // existingOutput becomes empty, leftWidth collapses to 0, and the buddy
  // renders flush-left at column 2 instead of column ~60. The next successful
  // render puts the buddy back at col 60, leaving the col-2 ghost sprite
  // visible. By caching the last good HUD output and re-using it on failure,
  // we keep leftWidth and the buddy's column stable across HUD hiccups.
  let stdinSessionId = '';
  try {
    const data = JSON.parse(stdin);
    if (typeof data.session_id === 'string' && data.session_id.length > 0) {
      stdinSessionId = data.session_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    }
  } catch {}
  const hudCachePath = stdinSessionId
    ? join(BUDDY_DIR, 'state', `hud-${stdinSessionId}.txt`)
    : '';

  let existingOutput = renderExistingOutput(stdin);
  if (existingOutput.trim().length === 0 && hudCachePath) {
    try {
      existingOutput = readFileSync(hudCachePath, 'utf-8');
    } catch {}
  } else if (existingOutput.trim().length > 0 && hudCachePath) {
    try {
      mkdirSync(join(BUDDY_DIR, 'state'), { recursive: true });
      writeFileSync(hudCachePath, existingOutput);
    } catch {}
  }

  // 2026-04-10: Preserve blank lines (they're part of HUD layout), but treat
  // truly empty output as "no HUD" so the buddy renders standalone.
  const existingLines = existingOutput.trim().length > 0
    ? existingOutput.replace(/\r\n/g, '\n').trimEnd().split('\n')
    : [];
  const companion = getCompanion();
  const state = safeReadJson(STATE_PATH);
  const muted = !companion || isMuted(state);

  // 2026-04-10: When muted or no companion, we STILL go through the fixed-
  // height renderer below with an empty buddy block. Codex review identified
  // that the early-exit branches (which used to write raw existingOutput and
  // exit) produced 3-4 line output while the normal path produces 8, causing
  // line count fluctuation that broke Claude Code's cursor-up clearing. The
  // line count must be stable across mute toggles and config-read failures.

  const reaction = getReaction();
  const hasActiveReaction = Boolean(reaction.text);
  const cappedReaction = reaction.text ? reaction.text.slice(0, 180) : '';
  const shouldDim = hasActiveReaction && reaction.age > 7000;

  const hudLines = existingLines.length;
  const tick = Math.floor(Date.now() / 500);

  // 2026-04-10: Build the sprite block ONLY if we have an unmuted companion.
  // When muted or no companion, spriteBlock and bubbleLines stay empty and we
  // still emit a fixed-height padded HUD output. Codex review identified that
  // the early-exit branches that wrote raw existingOutput caused line count
  // fluctuation (3-4 raw vs 8 padded), which broke Claude Code's cursor-up
  // clear count and produced ghost sprites from previous renders.
  let bubbleLines = [];
  const spriteBlock = [];
  if (!muted && companion) {
    const step = hasActiveReaction ? tick % 3 : IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length];
    const spriteLines = step === -1 ? renderBlink(companion) : renderSprite(companion, step);
    bubbleLines = cappedReaction ? renderBubble(cappedReaction) : [];
    bubbleLines = styleBubbleLines(bubbleLines, companion.rarity, shouldDim);

    // Forensics reference (specs/2026-04-09-buddy-forensics-reference.md:1226):
    // native companion card rendered "species art, colored" in the rarity color.
    //
    // 2026-04-10: ALWAYS push a pet-hearts row (empty string when inactive) so
    // spriteBlock has a stable row count regardless of pet state. Code-reviewer
    // Finding 3: when hearts expired, spriteBlock shrunk from 8 to 7, the sprite
    // shifted up by one row, and users saw a 1-row vertical jitter at heart
    // fade-out. Pinning the heart row prevents the shift.
    const petHeartsActive = state?.petHeartsUntil && Date.now() < state.petHeartsUntil;
    spriteBlock.push(petHeartsActive
      ? magenta(PET_HEARTS[Math.floor(Date.now() / 500) % PET_HEARTS.length])
      : '');
    spriteLines.forEach((line) => spriteBlock.push(colorize(line, companion.rarity)));
    spriteBlock.push(`   ${bold(colorize(companion.name, companion.rarity))}`);
    spriteBlock.push(`   ${colorize(RARITY_STARS[companion.rarity] || '', companion.rarity)}`);
  }

  // 2026-04-10: Always reserve a fixed bubble area, even when there's no bubble.
  // Previously, the sprite's column shifted by ~36 chars when the bubble appeared
  // or disappeared (10s reaction timer): with bubble, sprite was at leftWidth + 2
  // + 34 + 2 = leftWidth + 38; without bubble, sprite was at leftWidth + 2. The
  // jump made the previous render's sprite content survive at the OLD column,
  // visible as a ghost sprite at a different X offset every time the bubble
  // appeared or faded. Reserving the bubble area unconditionally pins the sprite
  // column so per-row erase fully overwrites the previous render's sprite.
  const BUBBLE_RESERVED_WIDTH = 34;
  const rightBlock = [];
  const bubbleWidth = bubbleLines.length > 0
    ? Math.max(...bubbleLines.map((line) => visualWidth(line)), BUBBLE_RESERVED_WIDTH)
    : BUBBLE_RESERVED_WIDTH;
  const blockLines = Math.max(bubbleLines.length, spriteBlock.length);
  for (let i = 0; i < blockLines; i += 1) {
    rightBlock.push(`${rightPadAnsi(bubbleLines[i] || '', bubbleWidth)}  ${spriteBlock[i] || ''}`);
  }

  // 2026-04-10: Position the buddy to the right of the widest HUD line (2-char
  // gap). leftWidth must be MONOTONIC within a session: if the HUD was 110
  // chars wide on a previous tick and 50 chars wide on the current tick, we
  // must still position the buddy at column 112 (not 52), otherwise the buddy
  // shifts left and the previous render's content at column 112+ remains as a
  // visible "ghost" sprite to the right of the new render.
  //
  // Per-session scoping is critical: a previous attempt used a global
  // state file and got stale values from other sessions, shoving the buddy
  // off-screen. This version keys the state file by session_id parsed from
  // the stdin JSON. If session_id is missing, falls back to the current
  // render's max HUD width without persistence.
  const maxHudWidth = Math.max(...existingLines.map((l) => visualWidth(l)), 0);
  let leftWidth = hudLines > 0 ? maxHudWidth : 0;
  if (stdinSessionId && hudLines > 0) {
    const sessionStatePath = join(BUDDY_DIR, 'state', `lw-${stdinSessionId}.txt`);
    let persisted = 0;
    try {
      const v = parseInt(readFileSync(sessionStatePath, 'utf-8'), 10);
      if (Number.isFinite(v) && v > 0) persisted = v;
    } catch {}
    if (maxHudWidth > persisted) {
      leftWidth = maxHudWidth;
    } else if (persisted > maxHudWidth + 20) {
      // 2026-04-10: Decay toward current HUD width when persisted leftWidth
      // is significantly wider than the current HUD output. Without decay,
      // a single transient wide HUD line (e.g., long activity string) pushes
      // the buddy far right for the rest of the session, wasting screen space
      // and risking terminal line wrapping on narrow terminals. Principal
      // engineering audit finding P0: unbounded monotonic growth.
      // Decay by 10% per render, minimum maxHudWidth.
      leftWidth = Math.max(maxHudWidth, Math.floor(persisted * 0.9));
    } else {
      leftWidth = persisted;
    }
    try {
      mkdirSync(join(BUDDY_DIR, 'state'), { recursive: true });
      writeFileSync(sessionStatePath, String(leftWidth));
    } catch {}
  }

  // 2026-04-10: CRITICAL - stable line count across every render.
  // Claude Code clears the previous statusline by cursor-up-N (where N = previous
  // output's line count) and erase-to-end-of-screen. If our output count varies
  // tick-to-tick (bubble appears/disappears, pet hearts toggle, HUD data changes),
  // the cursor-up count is stale and orphan sprite lines leak into the terminal,
  // scrolling upward with each re-render. User saw duplicate sprites at different
  // offsets on screen as a result.
  //
  // Fix: always emit exactly max(hudLines, BUDDY_RESERVED_HEIGHT) lines. Pad both
  // sides with blanks.
  const totalLines = Math.max(hudLines, BUDDY_RESERVED_HEIGHT);

  // Pad rightBlock with blank rows so every tick has the same right-side height.
  while (rightBlock.length < totalLines) rightBlock.push('');

  // 2026-04-10: Unified output construction (code-reviewer Finding 1, 2, 11).
  // Every row goes through the SAME formula: left padded to leftWidth, fixed
  // 2-char gap, right padded by the equalize pass below. The previous version
  // had three branches (right present, leftRaw only, fully blank) which produced
  // rows with structurally different widths. The dead `truncateAnsi` branch is
  // also gone - leftVisual is always <= leftWidth by definition (leftWidth is
  // the max of all existingLines visualWidths), so the truncate path was unreachable.
  const output = [];
  for (let i = 0; i < totalLines; i += 1) {
    const leftRaw = existingLines[i] || '';
    const leftVisual = visualWidth(leftRaw);
    const left = `${leftRaw}${' '.repeat(Math.max(0, leftWidth - leftVisual))}`;
    const right = rightBlock[i] || '';
    output.push(`${left}  ${right}`);
  }

  // 2026-04-10: ACTUAL ROOT CAUSE of the "cut in half" sprite bug.
  //
  // Claude Code processes statusline output with:
  //   stdout.trim().split("\n").flatMap((j) => j.trim() || []).join("\n")
  //
  // This trims EVERY LINE individually. Lines that start with padding spaces
  // (buddy-only rows below the HUD) get their leading spaces stripped, slamming
  // the buddy content to column 0. The sprite renders correctly on HUD rows
  // (where content starts with non-whitespace HUD text) but jumps to the left
  // margin on rows below the HUD, cutting the sprite in half.
  //
  // Fix: prefix every line with \x1b[0m (ANSI SGR reset). The ESC character
  // (U+001B) is NOT whitespace, so .trim() stops there and preserves our
  // padding spaces. The reset has no visual effect since our content sets its
  // own attributes via colorize() calls. The trailing \x1b[K clears any stale
  // content from previous renders.
  const final = output.map((line) => '\x1b[0m' + line + '\x1b[K');
  process.stdout.write(`${final.join('\n')}\n`);
} catch {
  // 2026-04-10: Catch fallback must also emit fixed-height output with \x1b[K.
  // The previous version wrote raw existingOutput (3-4 lines) instead of the
  // normal 8 lines, causing a line count change that broke Claude Code's
  // cursor-up clearing. Emit BUDDY_RESERVED_HEIGHT blank lines with \x1b[K
  // to maintain stable line count and clear any ghost content.
  try {
    const fallback = renderExistingOutput('');
    const fallbackLines = fallback.trim().length > 0
      ? fallback.replace(/\r\n/g, '\n').trimEnd().split('\n')
      : [];
    const padded = [];
    for (let i = 0; i < BUDDY_RESERVED_HEIGHT; i += 1) {
      padded.push('\x1b[0m' + (fallbackLines[i] || '') + '\x1b[K');
    }
    process.stdout.write(`${padded.join('\n')}\n`);
  } catch {
    // Last resort: emit 8 blank lines with \x1b[K to maintain line count
    const blank = Array.from({ length: BUDDY_RESERVED_HEIGHT }, () => '\x1b[0m\x1b[K');
    process.stdout.write(`${blank.join('\n')}\n`);
  }
  process.exit(0);
}
