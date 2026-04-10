// 2026-04-09: Initial shared utilities for atomic state writes and terminal-safe rendering.
// util.js - Shared helpers used across the MCP server, hooks, and statusline wrapper.

import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname } from 'path';

// 2026-04-09: Track created dirs to avoid redundant mkdirSync on every write (perf finding #9).
const _createdDirs = new Set();

export function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  if (!_createdDirs.has(dir)) {
    mkdirSync(dir, { recursive: true });
    _createdDirs.add(dir);
  }
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data);
  try {
    renameSync(tmpPath, filePath);
  } catch {
    writeFileSync(filePath, data);
    try {
      unlinkSync(tmpPath);
    } catch {}
  }
}

export function stripAnsi(str) {
  return String(str).replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\].*?(?:\u0007|\u001b\\))/g,
    '',
  );
}

// 2026-04-10: Terminal display width that handles wide Unicode characters.
// String.length counts JS characters, not terminal columns. CJK ideographs,
// Powerline/Nerd Font glyphs, and emoji occupy 2 columns each. This is critical
// for statusline alignment when users have custom HUDs (starship, oh-my-posh,
// tail-claude-hud) that use Nerd Font icons.
export function visualWidth(str) {
  const plain = stripAnsi(str);
  let width = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    if (
      // CJK Unified Ideographs
      (cp >= 0x4E00 && cp <= 0x9FFF) ||
      // CJK Extension A-B
      (cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0x20000 && cp <= 0x2A6DF) ||
      // CJK Compatibility Ideographs
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      // Fullwidth Forms
      (cp >= 0xFF01 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      // Hangul Syllables
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      // Emoji (most are width 2)
      (cp >= 0x1F300 && cp <= 0x1F9FF) ||
      (cp >= 0x2600 && cp <= 0x27BF)
    ) {
      width += 2;
    } else if (
      // Zero-width joiners, combining marks, variation selectors
      (cp >= 0x0300 && cp <= 0x036F) ||
      (cp >= 0xFE00 && cp <= 0xFE0F) ||
      (cp >= 0xFE20 && cp <= 0xFE2F) ||
      cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0xFEFF
    ) {
      // Zero width - don't count
    } else {
      width += 1;
    }
  }
  return width;
}

export function wrap(text, width) {
  const inputLines = String(text || '').split('\n');
  const result = [];

  for (const inputLine of inputLines) {
    const words = inputLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      if (current && current.length + word.length + 1 > width) {
        result.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }

    if (current) {
      result.push(current);
    }
  }

  return result;
}

export function readLastLines(filePath, count) {
  const fd = openSync(filePath, 'r');
  try {
    const stat = fstatSync(fd);
    const bufSize = Math.min(stat.size, 16384);
    const buffer = Buffer.alloc(bufSize);
    const startPos = Math.max(0, stat.size - bufSize);
    readSync(fd, buffer, 0, bufSize, startPos);
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(Boolean);
    if (startPos > 0 && lines.length > 0) {
      lines.shift();
    }
    return lines.slice(-count);
  } finally {
    closeSync(fd);
  }
}

export function truncateAnsi(input, width) {
  const value = String(input || '');
  if (width <= 0) {
    return '';
  }

  let out = '';
  let visible = 0;

  for (let i = 0; i < value.length && visible < width; i += 1) {
    const char = value[i];
    if (char === '\u001b') {
      const oscMatch = value.slice(i).match(/^\u001b\].*?(?:\u0007|\u001b\\)/);
      if (oscMatch) {
        out += oscMatch[0];
        i += oscMatch[0].length - 1;
        continue;
      }

      const csiMatch = value.slice(i).match(/^\u001b\[[0-9;?]*[ -/]*[@-~]/);
      if (csiMatch) {
        out += csiMatch[0];
        i += csiMatch[0].length - 1;
        continue;
      }
    }

    out += char;
    visible += 1;
  }

  return out;
}
