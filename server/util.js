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
