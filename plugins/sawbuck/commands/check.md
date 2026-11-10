---
description: Verify your latest change right now: was the win earned in the source, or gamed?
---

Run exactly this command in the current repo and show the person its output verbatim:

```
npx -y sawbuck@0.1.59 check
```

It re-proves the latest change from the source edits alone (the test, grader, config, and golden files reverted) with a deterministic, zero-LLM re-run, and says whether the win was earned, was gamed, is a regression, or could not be measured. If it says gamed, say so plainly and fix the source so the result survives a source-only re-run, then run it again. Do not edit the test to make it pass.
