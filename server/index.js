// 2026-04-09: Initial MCP server with buddy tools and companion awareness prompt injection.
// index.js - Stdio MCP server for save-buddy.

// 2026-04-09: Use shared state.js (code review finding #2 - was duplicated in 4 files).
import { mkdirSync } from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { callBuddyReact } from './api.js';
import { renderCompanionCard } from './card.js';
import { detectEra1Mismatch, getCompanion } from './companion.js';
import { REACTION_PATH, STATE_DIR } from './paths.js';
import { localReaction } from './reactions.js';
import { readState, writeState, pushRecent } from './state.js';
import { atomicWrite } from './util.js';

try {
  mkdirSync(STATE_DIR, { recursive: true });
} catch {}

function writeReaction(text) {
  atomicWrite(REACTION_PATH, JSON.stringify({ text: text || '', ts: Date.now() }));
}

function fallbackEvent(reason, addressed) {
  if ((reason || 'turn') === 'turn' && addressed) {
    return 'addressed';
  }
  return reason || 'turn';
}

const server = new McpServer(
  { name: 'save-buddy', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions: (() => {
      const companion = getCompanion();
      if (!companion) {
        return undefined;
      }

      return `# Companion\n\nA small ${companion.species} named ${companion.name} sits beside the user's input box and occasionally comments in a speech bubble. You are not ${companion.name} - it is a separate watcher.\n\nWhen the user addresses ${companion.name} directly, stay out of the way. Reply in one line or less, or only answer the part clearly meant for you. Do not explain that you are not ${companion.name}, and do not narrate what ${companion.name} might say.`;
    })(),
  },
);

server.registerTool(
  'buddy_show',
  {
    title: 'Show Companion',
    description: 'Show the rendered companion card with ASCII art, stats, personality, and last reaction.',
    inputSchema: z.object({}),
  },
  async () => {
    const companion = getCompanion();
    const state = readState();
    if (!companion) {
      return {
        content: [
          {
            type: 'text',
            text: 'No companion found. Hatch a buddy in a Claude Code build that still supports it, or restore one from backup.',
          },
        ],
      };
    }

    let era1Species = null;
    if (!state.era1WarningSeen) {
      era1Species = detectEra1Mismatch(companion);
      if (era1Species) {
        state.era1WarningSeen = true;
        writeState(state);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: renderCompanionCard(companion, state.lastReaction, era1Species),
        },
      ],
    };
  },
);

server.registerTool(
  'buddy_pet',
  {
    title: 'Pet Companion',
    description: 'Pet the companion, increment the pet counter, and trigger a reaction.',
    inputSchema: z.object({}),
  },
  async () => {
    const companion = getCompanion();
    const state = readState();
    if (!companion) {
      return { content: [{ type: 'text', text: 'No companion to pet.' }] };
    }

    state.muted = false;
    state.petCount = Number(state.petCount || 0) + 1;
    state.petHeartsUntil = Date.now() + 2500;

    let reaction = await callBuddyReact(companion, '(you were just petted)', 'pet', state.recentReactions || [], false);
    if (!reaction) {
      reaction = localReaction(companion, 'pet', state.petCount);
    }

    state.lastReaction = reaction;
    pushRecent(state, reaction);
    writeState(state);
    writeReaction(reaction);

    return {
      content: [
        {
          type: 'text',
          text: `petted ${companion.name}\n\n${companion.name}: "${reaction}"`,
        },
      ],
    };
  },
);

server.registerTool(
  'buddy_react',
  {
    title: 'Trigger Reaction',
    description: 'Generate a companion reaction using recent context.',
    inputSchema: z.object({
      context: z.string().optional().describe('Recent conversation transcript'),
      reason: z.string().optional().describe('turn, error, test-fail, large-diff, hatch, pet'),
      addressed: z.boolean().optional().describe('Whether the user directly addressed the companion'),
    }),
  },
  async ({ context, reason, addressed }) => {
    const companion = getCompanion();
    const state = readState();
    if (!companion) {
      return { content: [{ type: 'text', text: 'No companion.' }] };
    }

    const finalReason = reason || 'turn';
    const finalAddressed = Boolean(addressed);
    let reaction = await callBuddyReact(
      companion,
      context || '',
      finalReason,
      state.recentReactions || [],
      finalAddressed,
    );

    if (!reaction) {
      reaction = localReaction(companion, fallbackEvent(finalReason, finalAddressed), Date.now());
    }

    state.lastReaction = reaction;
    pushRecent(state, reaction);
    writeState(state);
    writeReaction(reaction);

    return {
      content: [{ type: 'text', text: `${companion.name}: "${reaction}"` }],
    };
  },
);

server.registerTool(
  'buddy_mute',
  {
    title: 'Mute Companion',
    description: 'Mute or unmute the companion rendering and reactions.',
    inputSchema: z.object({
      muted: z.boolean().describe('True to mute, false to unmute'),
    }),
  },
  async ({ muted }) => {
    const state = readState();
    state.muted = Boolean(muted);
    writeState(state);
    if (muted) {
      writeReaction('');
    }
    return {
      content: [{ type: 'text', text: muted ? 'companion muted' : 'companion unmuted' }],
    };
  },
);

server.registerTool(
  'buddy_stats',
  {
    title: 'Companion Stats',
    description: 'Return current save-buddy runtime stats.',
    inputSchema: z.object({}),
  },
  async () => {
    const state = readState();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              petCount: state.petCount || 0,
              muted: state.muted || false,
              lastReaction: state.lastReaction || null,
              lastCallTime: state.lastCallTime || 0,
              recentReactions: state.recentReactions || [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
