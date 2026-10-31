# Sawbuck plugins

A Claude Code plugin marketplace for Sawbuck.

## Install

```
/plugin marketplace add sawbuck-ai/reins
/plugin install sawbuck-reins@sawbuck
```

(`sawbuck` is the marketplace name defined in `.claude-plugin/marketplace.json`.)

## Plugins

- **sawbuck-reins**: the above-prompt guide band (shows `watching` or `N caught` by reading the repo's `.sawbuck` record, never blocks the prompt) plus five slash commands: `/sawbuck-check` (verify your latest change now), `/sawbuck-watch` (arm the Stop hook), `/sawbuck-context` (ranked history for the files you touch), `/sawbuck-debt` (the repo's live suppression debt), and `/sawbuck-status` (the inventory: everything it has accumulated here in one view).
