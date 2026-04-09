#!/usr/bin/env node
// 2026-04-09: Initial Stop hook with fast local fallback and detached API upgrade worker.
// buddy-stop.js - Detect coding events and trigger a companion reaction after Claude responds.

// 2026-04-09: Use shared state.js (code review finding #2). Fix addressed flag ordering (#7).
import { readFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getCompanion, isMuted } from '../server/companion.js';
import { ADDRESSED_FLAG_PATH, REACTION_PATH } from '../server/paths.js';
import { localReaction } from '../server/reactions.js';
import { readState, writeState, pushRecent } from '../server/state.js';
import { atomicWrite, readLastLines } from '../server/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FAIL_RE = /\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(?:ED)?\b|\u2717|\u2718/im;
const ERROR_RE = /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i;
const DIFF_RE = /^(@@ |diff )/m;
const LARGE_DIFF_THRESHOLD = 80;

function detectEventType(text) {
  if (!text) {
    return null;
  }
  if (TEST_FAIL_RE.test(text)) {
    return 'test-fail';
  }
  if (ERROR_RE.test(text)) {
    return 'error';
  }
  if (DIFF_RE.test(text)) {
    const changedLines = (text.match(/^[+-](?![+-])/gm) || []).length;
    if (changedLines > LARGE_DIFF_THRESHOLD) {
      return 'large-diff';
    }
  }
  return null;
}

function extractText(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => extractText(entry)).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.content === 'string') {
      return value.content;
    }
    if (Array.isArray(value.content)) {
      return value.content.map((entry) => extractText(entry)).filter(Boolean).join(' ');
    }
  }
  return '';
}

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

const state = readState();

if (isMuted(state)) {
  process.exit(0);
}

const companion = getCompanion();
if (!companion) {
  process.exit(0);
}

// 2026-04-09: Moved addressed flag consumption AFTER transcript check (code review #7).
// Previously the flag was consumed (deleted) before checking if transcript was empty,
// which lost the addressed state when the hook had no transcript to work with.
let transcript = '';
let toolOutput = '';

if (hookContext.transcript_path) {
  try {
    const recentLines = readLastLines(hookContext.transcript_path, 12);
    const messages = [];

    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);
        const role = entry.type === 'assistant' ? 'claude' : entry.type;
        if (role !== 'user' && role !== 'claude') {
          continue;
        }

        if (entry.isMeta) {
          continue;
        }

        const text = extractText(entry.message?.content ?? entry.content).trim();
        if (text) {
          messages.push(`${role}: ${text.slice(0, 300)}`);
        }

        if (entry.type === 'user' && entry.toolUseResult) {
          const toolText = extractText(entry.toolUseResult).trim();
          if (toolText) {
            toolOutput += `${toolText}\n`;
          }
        }

        const blocks = entry.message?.content ?? entry.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block?.type === 'tool_result' || block?.type === 'tool_use') {
              const textBlock = extractText(block.content);
              if (textBlock) {
                toolOutput += `${textBlock}\n`;
              }
            }
          }
        }
      } catch {}
    }

    transcript = messages.join('\n');
    if (toolOutput) {
      transcript = `${transcript}\n[tool output]\n${toolOutput.slice(-1000)}`.trim();
    }
  } catch {}
}

if (!transcript && hookContext.last_assistant_message) {
  transcript = `claude: ${String(hookContext.last_assistant_message).slice(0, 300)}`;
}

if (!transcript.trim()) {
  process.exit(0);
}

// Consume addressed flag only after we know we have a transcript to work with.
let addressed = false;
try {
  const flagTimestamp = Number.parseInt(readFileSync(ADDRESSED_FLAG_PATH, 'utf-8'), 10);
  if (Date.now() - flagTimestamp < 30000) {
    addressed = true;
  }
  unlinkSync(ADDRESSED_FLAG_PATH);
} catch {}

const reason = detectEventType(toolOutput || hookContext.last_assistant_message || transcript) || 'turn';
const fallbackReason = reason === 'turn' && addressed ? 'addressed' : reason;
const fallbackReaction = localReaction(companion, fallbackReason, Date.now());

atomicWrite(REACTION_PATH, JSON.stringify({ text: fallbackReaction, ts: Date.now() }));
state.lastReaction = fallbackReaction;
pushRecent(state, fallbackReaction);
writeState(state);

const workerPath = join(__dirname, 'buddy-react-worker.js');
const args = JSON.stringify({
  transcript: transcript.slice(0, 5000),
  reason,
  addressed,
  recent: state.recentReactions || [],
});

// 2026-04-09: Minimal env for worker (security review SEC-008).
const child = spawn(process.execPath, [workerPath, args], {
  detached: true,
  stdio: 'ignore',
  env: {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PATH: process.env.PATH,
    ...(process.env.CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } : {}),
  },
});
child.unref();

process.exit(0);
