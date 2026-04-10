#!/usr/bin/env node
// 2026-04-10: Rewritten statusline layout engine with robust terminal width detection.
// buddy-hud-wrapper.js - Chains any existing statusline and appends buddy sprite + bubble.

import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { bold, colorize, dim, italic, magenta } from '../server/ansi.js';
import { getCompanion, isMuted } from '../server/companion.js';
import { BUDDY_DIR, REACTION_PATH, STATE_PATH } from '../server/paths.js';
import { renderBlink, renderBubble, renderFace, renderSprite } from '../server/sprites.js';
import { RARITY_STARS } from '../server/types.js';
import { stripAnsi, truncateAnsi, visualWidth } from '../server/util.js';

const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
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

// 2026-04-10: Robust terminal width detection. Statusline commands run as piped
// subprocesses, so process.stdout.columns is often undefined. We try multiple
// sources in order of reliability. This is critical for correct right-alignment
// when users have custom HUDs (tail-claude-hud, starship, oh-my-posh, etc.).
function detectTerminalWidth(stdinText) {
  // 1. Claude Code may pass terminal dimensions in the stdin JSON
  try {
    const data = JSON.parse(stdinText);
    if (typeof data.columns === 'number' && data.columns > 0) return data.columns;
    if (typeof data.terminalColumns === 'number' && data.terminalColumns > 0) return data.terminalColumns;
    if (typeof data.width === 'number' && data.width > 0) return data.width;
  } catch {}

  // 2. stdout columns (works when stdout IS the terminal)
  if (process.stdout.columns > 0) return process.stdout.columns;

  // 3. stderr columns (stderr is often still connected to the TTY even when stdout is piped)
  if (process.stderr.columns > 0) return process.stderr.columns;

  // 4. COLUMNS env var (set by some shells and terminal multiplexers)
  const envCols = parseInt(process.env.COLUMNS, 10);
  if (envCols > 0) return envCols;

  // 5. Try tput cols as a subprocess (works on macOS/Linux, fails gracefully on Windows)
  try {
    const result = execFileSync('tput', ['cols'], {
      encoding: 'utf-8',
      timeout: 500,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const tputCols = parseInt(result, 10);
    if (tputCols > 0) return tputCols;
  } catch {}

  // 6. Fallback - assume a reasonable modern terminal width
  return 120;
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
  // 2026-04-10: Reactions may contain newlines. Strip them for inline contexts so
  // they don't break the line-count invariant. The bubble rendering handles
  // wrapping across multiple lines naturally, but inline uses get this clean version.
  const inlineReaction = cappedReaction.replace(/\s*\n+\s*/g, ' ').trim();

  // 2026-04-10: CRITICAL - Claude Code's statusline is a fixed-height area determined
  // by the number of lines in the HUD output. If we output MORE lines than the HUD,
  // Claude Code leaks the extra lines into the terminal proper. We MUST produce
  // exactly existingLines.length lines (or pad the HUD with blank lines).
  //
  // Strategy: build a right-side buddy block constrained to the HUD's line count.
  // If the HUD is tall enough, show the full sprite + name + stars. If not, show
  // a compact inline representation (compact face + name + bubble).

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
    if (state?.petHeartsUntil && Date.now() < state.petHeartsUntil) {
      spriteBlock.push(magenta(PET_HEARTS[Math.floor(Date.now() / 500) % PET_HEARTS.length]));
    }
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

  const rightWidth = Math.max(...rightBlock.map((line) => visualWidth(line)), 0);

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
  let cols = detectTerminalWidth(stdin);
  const maxHudWidth = Math.max(...existingLines.map((l) => visualWidth(l)), 0);
  let sessionId = '';
  try {
    const data = JSON.parse(stdin);
    if (typeof data.session_id === 'string' && data.session_id.length > 0) {
      sessionId = data.session_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    }
  } catch {}
  let leftWidth = hudLines > 0 ? maxHudWidth : 0;
  if (sessionId && hudLines > 0) {
    const sessionStatePath = join(BUDDY_DIR, 'state', `lw-${sessionId}.txt`);
    let persisted = 0;
    try {
      const v = parseInt(readFileSync(sessionStatePath, 'utf-8'), 10);
      if (Number.isFinite(v) && v > 0) persisted = v;
    } catch {}
    if (maxHudWidth > persisted) {
      try {
        mkdirSync(join(BUDDY_DIR, 'state'), { recursive: true });
        writeFileSync(sessionStatePath, String(maxHudWidth));
      } catch {}
      leftWidth = maxHudWidth;
    } else {
      leftWidth = persisted;
    }
  }

  // 2026-04-10: Sanity check detected cols. If the HUD is wider than our detected
  // terminal width, the detection is unreliable (you can't have a HUD wider than
  // the terminal). This happens on Windows where piped subprocesses get stale
  // console width. Treat as unknown and skip the cap.
  if (cols > 0 && cols < maxHudWidth + 10) {
    cols = 0;
  }

  // Cap to terminal width only if we have a reliable value AND it would actually
  // cause wrapping. Never truncate the HUD - it would lose user context.
  if (cols > 0 && leftWidth + rightWidth + 2 > cols) {
    // Keep the full HUD width; the buddy will extend beyond terminal if needed.
    // Better to have the buddy wrap slightly than to truncate HUD content.
    // (In practice this rarely happens because cols sanity-check above filters it.)
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
  // sides with blanks. BUDDY_RESERVED_HEIGHT is the maximum possible buddy block
  // height: 1 pet-heart + 5 sprite rows (with hat) + 1 name + 1 stars = 8, which
  // also matches the maximum bubble height (2 borders + 6 wrapped content rows).
  const BUDDY_RESERVED_HEIGHT = 8;
  const totalLines = Math.max(hudLines, BUDDY_RESERVED_HEIGHT);

  // Pad rightBlock with blank rows so every tick has the same right-side height.
  while (rightBlock.length < totalLines) rightBlock.push('');

  const output = [];
  for (let i = 0; i < totalLines; i += 1) {
    const leftRaw = existingLines[i] || '';
    const leftVisual = visualWidth(leftRaw);
    const left = leftVisual <= leftWidth
      ? `${leftRaw}${' '.repeat(leftWidth - leftVisual)}`
      : truncateAnsi(leftRaw, leftWidth);
    const right = rightBlock[i] || '';
    if (right) {
      output.push(`${left}  ${right}`);
    } else if (leftRaw) {
      // HUD-only row (no buddy content beside it), padded to leftWidth so the
      // visual width matches buddy rows below.
      output.push(left);
    } else {
      // Fully blank padding row - emit padding spaces so it has the same visual
      // width as content rows. Prevents stale chars from previous renders showing
      // through when Claude Code's clear pass leaves trailing content.
      output.push(' '.repeat(leftWidth));
    }
  }

  // 2026-04-10: Equalize visual widths across all output lines so previous
  // renders with different per-line widths get fully overwritten by current
  // renders padded to the same width. Per Codex review, raw cursor control
  // codes (\r, \x1b[K, \x1b[2K) are NOT emitted from the wrapper - they
  // could fight with Claude Code's own statusline cursor management. The
  // contract is "emit rows of text", not "send terminal control choreography".
  const maxVisual = Math.max(...output.map((line) => visualWidth(line)), 0);
  const equalized = output.map((line) => {
    return line + ' '.repeat(Math.max(0, maxVisual - visualWidth(line)));
  });

  process.stdout.write(`${equalized.join('\n')}\n`);
} catch {
  try {
    const fallback = renderExistingOutput('');
    if (fallback) process.stdout.write(fallback);
  } catch {}
  process.exit(0);
}
