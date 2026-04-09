---
name: buddy
description: Show your companion, pet it, check stats, or toggle reactions. Routes to save-buddy MCP server tools.
---

Route the user's command to the appropriate buddy MCP tool:

- `/buddy` or `/buddy show` - Call the `buddy_show` MCP tool. It returns a pre-rendered companion card. Display it exactly as returned in a code block.
- `/buddy pet` - Call the `buddy_pet` MCP tool and display the returned reaction.
- `/buddy stats` - Call the `buddy_stats` MCP tool and display the returned JSON.
- `/buddy mute` or `/buddy off` - Call the `buddy_mute` MCP tool with `{"muted": true}`.
- `/buddy unmute` or `/buddy on` - Call the `buddy_mute` MCP tool with `{"muted": false}`.
- `/buddy react` - Call the `buddy_react` MCP tool with recent conversation context.

Do not recreate the companion card layout yourself. The `buddy_show` tool already returns the full formatted ASCII card.
