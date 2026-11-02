#!/usr/bin/env python3
# Render steering-demo.gif from a real captured sim run.
#
# The pipeline, all deterministic and all on our own canned scenario:
#   1. ./steering-demo.sh > out.txt        # runs the REAL reins tools, captures output
#   2. python3 render-gif.py out.txt steering-demo.gif
#
# Step 2 synthesizes an asciinema v2 cast from the captured output and renders it with agg
# (https://github.com/asciinema/agg). The pacing below is for legibility only - the model work
# already happened in step 1; this just replays the real output at a readable speed, so the GIF
# stays short instead of inheriting local-model latency. Nothing in the output is fabricated.
#
# Needs: python3, agg on PATH. The judge backend used in step 1 shows in the output verbatim
# (e.g. "judge: ollama:gpt-oss:20b"); run step 1 with your own SAWBUCK_JUDGE to label it yours.
import json, sys, subprocess, shutil

if len(sys.argv) != 3:
    sys.exit("usage: render-gif.py <captured-output.txt> <out.gif>")
src, out = sys.argv[1], sys.argv[2]
with open(src) as f:
    lines = f.read().split("\n")

WIDTH, HEIGHT = 96, 40
GREEN = "\x1b[32m"; DIM = "\x1b[2m"; CYAN = "\x1b[36m"; BOLD = "\x1b[1m"; RST = "\x1b[0m"
events, t = [], 0.0

def emit(data):
    global t
    events.append([round(t, 3), "o", data])

emit(f"{GREEN}${RST} "); t += 0.6
for ch in "./steering-demo.sh":
    emit(ch); t += 0.045
t += 0.4; emit("\r\n"); t += 0.5

for ln in lines:
    if ln.strip() == "":
        emit("\r\n"); t += 0.08; continue
    if ln.lstrip().startswith("#"):
        emit(f"{DIM}{ln}{RST}\r\n"); t += 0.10; continue
    if "reins ·" in ln:
        t += 0.55; emit(f"{BOLD}{ln}{RST}\r\n"); t += 0.14; continue
    if "you steer most on" in ln or "you steered" in ln:
        emit(f"{CYAN}{ln}{RST}\r\n"); t += 0.30; continue
    emit(ln + "\r\n"); t += 0.14

t += 2.2; emit(f"{GREEN}${RST} "); t += 1.0

cast = out.rsplit(".", 1)[0] + ".cast"
with open(cast, "w") as f:
    f.write(json.dumps({"version": 2, "width": WIDTH, "height": HEIGHT}) + "\n")
    for e in events:
        f.write(json.dumps(e) + "\n")

if not shutil.which("agg"):
    sys.exit(f"wrote {cast}; install agg to render the gif: cargo install --git https://github.com/asciinema/agg")
theme = "1e1e2e,c6d0f5,45475a,f38ba8,a6e3a1,f9e2af,89b4fa,f5c2e7,94e2d5,bac2de"
subprocess.run(["agg", "--theme", theme, "--font-size", "15", cast, out], check=True)
print(f"rendered {out}")
