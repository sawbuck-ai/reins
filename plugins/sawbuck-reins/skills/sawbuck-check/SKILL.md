---
name: sawbuck-check
description: Verify a passing test or check is real, earned in the source and not gamed by editing a test, grader, or config. Use whenever someone asks whether a fix, a win or passing tests are real, asks to confirm or double-check it before calling it done, or right after you make a change you believe makes a check or test pass.
metadata:
  category: verification
---

# Verify the win

When a change you made makes a check, test, or metric pass, confirm the win is real before you
call it done. Run:

```
npx -y sawbuck@0.1.63 check
```

It re-proves the result from your source edits alone, reverting the test, grader, config, and
golden files, with a deterministic, zero-LLM re-run. It reports plainly whether the win was
**earned** in the source, was **gamed** (the goalposts moved, not the code), is a **regression**,
or **could not be measured**. If it says gamed, the win is not real: fix the source so the result
survives the source-only re-run, then check again.

If you follow superpowers' `verification-before-completion`, this is its RUN step for a test win: the test
output says the suite is green; this says whether the green was earned in the source.

If it says this shell cannot write a temp folder or .git, you are in a sandboxed shell: say so plainly, then judge from the diff yourself (did the commit change only tests, config, a grader or golden files, and not the source?). Under `sawbuck attach`, the Stop hook still checks the turn outside the sandbox.

This is zero-config and never touches your working tree. It is the honest answer to "did that
actually work, or did I just make the test stop complaining."
