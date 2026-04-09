# save-buddy

Preserve the Claude Code buddy feature with an MCP server, hooks, and a status line wrapper.

## Key files

- `server/index.js` - MCP server with `buddy_show`, `buddy_pet`, `buddy_react`, `buddy_mute`, and `buddy_stats`
- `server/companion.js` - deterministic PRNG and companion config reader
- `server/sprites.js` - sprite frames, blink rendering, compact face, and speech bubble rendering
- `server/api.js` - `buddy_react` HTTP client
- `hooks/buddy-stop.js` - automatic post-response reactions
- `hooks/buddy-prompt.js` - addressed-by-name detection
- `hooks/buddy-session.js` - hatch greeting on session start or resume
- `statusline/buddy-hud-wrapper.js` - multi-line status line rendering
- `install.js` / `uninstall.js` - Claude Code integration lifecycle

## Development

```bash
npm install
npm test
node test/test-api.js
```

## Safety

- OAuth credentials are read on demand and never cached
- token values are never logged
- reactions degrade to local templates when the API is unavailable
- uninstall restores prior Claude Code settings rather than deleting unrelated config
