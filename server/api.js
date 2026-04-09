// 2026-04-09: Initial buddy_react client with cooldown, token safety, and local state updates.
// api.js - Call the Anthropic buddy_react endpoint using Claude Code OAuth credentials.

// 2026-04-09: Use shared state.js (code review finding #2).
import axios from 'axios';
import { readFileSync } from 'fs';
import { CONFIG_PATH, CREDS_PATH } from './paths.js';
import { readState, writeState } from './state.js';

const ENDPOINT_BASE = 'https://api.anthropic.com';
const BETA_HEADERS = ['ccr-byoc-2025-07-29', 'oauth-2025-04-20'];
const COOLDOWN_MS = 30000;
const MAX_RECENT = 3;
// 2026-04-09: Validate orgUuid format (security review SEC-002).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function getLastCallTime() {
  return Number(readState().lastCallTime || 0);
}

function setLastCallTime(timestamp) {
  const state = readState();
  state.lastCallTime = timestamp;
  writeState(state);
}

function readCredentials() {
  return readJson(CREDS_PATH)?.claudeAiOauth ?? null;
}

function readOrgUuid() {
  const uuid = readJson(CONFIG_PATH)?.oauthAccount?.organizationUuid ?? null;
  if (uuid && !UUID_RE.test(uuid)) {
    console.error('[save-buddy] Invalid organization UUID format');
    return null;
  }
  return uuid;
}

function isExpired(value) {
  if (!value) {
    return false;
  }

  if (typeof value === 'number') {
    return Date.now() > value;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Date.now() > parsed : false;
}

export async function callBuddyReact(companion, transcript, reason, recent, addressed) {
  const now = Date.now();
  const bypassCooldown = Boolean(addressed) || (reason || 'turn') !== 'turn';
  if (!bypassCooldown && now - getLastCallTime() < COOLDOWN_MS) {
    return null;
  }

  const creds = readCredentials();
  const orgUuid = readOrgUuid();
  if (!creds?.accessToken || !orgUuid) {
    return null;
  }

  if (isExpired(creds.expiresAt)) {
    console.error('[save-buddy] OAuth token expired. Waiting for Claude Code to refresh it.');
    return null;
  }

  const url = `${ENDPOINT_BASE}/api/organizations/${orgUuid}/claude_code/buddy_react`;
  const payload = {
    name: String(companion.name || '').slice(0, 32),
    personality: String(companion.personality || '').slice(0, 200),
    species: companion.species,
    rarity: companion.rarity,
    stats: companion.stats,
    transcript: String(transcript || '').slice(0, 5000),
    reason: reason || 'turn',
    recent: (recent || []).slice(0, MAX_RECENT).map((entry) => String(entry).slice(0, 200)),
    addressed: Boolean(addressed),
  };

  for (const betaHeader of BETA_HEADERS) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'anthropic-beta': betaHeader,
          'User-Agent': 'save-buddy/1.0.0',
        },
        timeout: 10000,
      });

      setLastCallTime(Date.now());
      return response.data?.reaction?.trim() || null;
    } catch (error) {
      const status = error.response?.status ?? 'network';
      if (status === 400 || status === 401) {
        continue;
      }
      console.error(`[save-buddy] buddy_react failed: status=${status}`);
      return null;
    }
  }

  console.error('[save-buddy] buddy_react: all beta header variants failed');
  return null;
}
