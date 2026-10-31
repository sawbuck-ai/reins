# sawbuck-reins

A Claude Code band, shown above the prompt, that surfaces Sawbuck's status for the repo
you are working in. It reads the repo's local `.sawbuck/` record each turn and shows a
quiet `🐴 sawbuck · watching` when the guide is active, lighting up to a bold
`🐴 N caught` (with the latest item) when the check has flagged a regression or a faked,
"gamed" win. It never blocks your prompt, and it hides itself in repos where Sawbuck is
not active. Pairs with `sawbuck attach --user`.
