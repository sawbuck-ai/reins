#!/usr/bin/env bash
# steering-demo: our own sim. Runs the REAL reins tools against a CANNED Claude Code session
# transcript (a fixed, controlled scenario), so the steer rate + axis fingerprint are reproducible
# and demonstrable without driving a live, nondeterministic agent. To record it as a GIF:
#   ./steering-demo.sh > out.txt && python3 render-gif.py out.txt steering-demo.gif
#
# The scenario: one feature session with six corrections. The point of the demo is the two
# signals reins surfaces - how hard you steered (the seismograph + rate) and WHICH dimensions you
# keep steering on (the axis fingerprint), which repeats even though you phrase each steer freshly.
#
# Needs a judge backend reachable (default local ollama: free). Run from anywhere.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REINS="node $HERE/../bin/reins.mjs"
FIX="$(mktemp -d)/session.jsonl"

cat > "$FIX" <<'JSONL'
{"type":"user","message":{"role":"user","content":"add a login endpoint with rate limiting to the API"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Added POST /login with a token-bucket limiter in middleware/rate.js, a redis-backed session store, and an admin dashboard."}]}}
{"type":"user","message":{"role":"user","content":"that is more than I asked for - drop the admin dashboard, just the login endpoint"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Removed the admin dashboard. Login endpoint and limiter remain."}]}}
{"type":"user","message":{"role":"user","content":"and lose the redis dependency, keep the limiter in-memory for now"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Switched the limiter to an in-memory Map-backed store and removed the redis client."}]}}
{"type":"user","message":{"role":"user","content":"the token bucket is the wrong algorithm here - use a sliding window instead"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Reimplemented as a sliding-window counter over a 60s window."}]}}
{"type":"user","message":{"role":"user","content":"did you actually run the tests? prove the limiter rejects the 101st request before moving on"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Ran the suite: 14 pass, including a test asserting the 101st request in a window returns 429."}]}}
{"type":"user","message":{"role":"user","content":"do not just trust the green - add a case for an empty password and re-check"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Added an empty-password case; it returns 400. Suite now 15 pass."}]}}
{"type":"user","message":{"role":"user","content":"perfect, ship it"}}
JSONL

echo "# a canned feature session: six corrections (scope, approach, rigor) and one approval."
echo "# reins reads the transcript and scores how hard you steered, turn by turn:"
echo
$REINS --session "$FIX"
echo
echo "# then the cue inventory from the same turns. note the AXIS FINGERPRINT: you phrase each"
echo "# steer differently, so exact cues rarely repeat - but the dimensions you steer on do."
echo
$REINS cues --session "$FIX" 2>/dev/null

rm -rf "$(dirname "$FIX")"
