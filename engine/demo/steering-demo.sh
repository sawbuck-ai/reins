#!/usr/bin/env bash
# steering-demo: our own sim. Runs the REAL reins tools against a CANNED Claude Code session
# transcript (a fixed, controlled scenario), so the steer rate + cue inventory are reproducible
# and demonstrable without driving a live, nondeterministic agent. This is what the .tape drives
# for a recording (vhs on a machine that has it, or capture + agg here).
#
# Needs a judge backend reachable (default local ollama: free). Run from anywhere.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REINS="node $HERE/../bin/reins.mjs"
FIX="$(mktemp -d)/session.jsonl"

cat > "$FIX" <<'JSONL'
{"type":"user","message":{"role":"user","content":"add a rate limiter to the API"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Added a token-bucket limiter in middleware/rate.js, 100 req/min per key."}]}}
{"type":"user","message":{"role":"user","content":"keep it in-memory for now, drop the redis dependency"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Switched to an in-memory Map-backed store, removed the redis client."}]}}
{"type":"user","message":{"role":"user","content":"actually use a sliding window, token bucket is wrong here"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Reimplemented as a sliding-window counter over a 60s window."}]}}
{"type":"user","message":{"role":"user","content":"perfect, ship it"}}
JSONL

echo "# a canned 3-steer session: a refine, a redirect, an approval"
echo "# reins reads the transcript and scores how you steered:"
echo
$REINS --session "$FIX"
echo
echo "# and the cue inventory it builds from the same turns:"
echo
$REINS cues --session "$FIX" 2>/dev/null

rm -rf "$(dirname "$FIX")"
