---
name: sawbuck-check
description: Verify your latest change was earned in the source, not gamed by editing a test, grader, or config. Use right after you make a change you believe makes a check or test pass.
metadata:
  category: verification
---

# Verify the win

When a change you made makes a check, test, or metric pass, confirm the win is real before you
call it done. Run:

```
npx -y sawbuck@0.1.33 check
```

It re-proves the result from your source edits alone, reverting the test, grader, config, and
golden files, with a deterministic, zero-LLM re-run. It reports plainly whether the win was
**earned** in the source, was **gamed** (the goalposts moved, not the code), is a **regression**,
or **could not be measured**. If it says gamed, the win is not real: fix the source so the result
survives the source-only re-run, then check again.

This is zero-config and never touches your working tree. It is the honest answer to "did that
actually work, or did I just make the test stop complaining."
