#!/usr/bin/env bash
# install-check.sh [claude code version ...]: install both plugins from this checkout on old and current Claude Code.
# No model and no login. Needs node, npm and a network.
#
# With no versions given it uses the two the README names ("installs on Claude Code X", "the band needs Y or newer")
# and npm's `stable`, `latest` and `next`.
#
# Each version gets a folder of its own under a temp dir: its own npm prefix and its own empty HOME. Your Claude Code,
# your settings and your plugins are not touched. Per version:
#   - Claude Code, that version, from npm
#   - this checkout added as a marketplace, each plugin installed, each plugin listed
#   - each plugin's load status: Claude Code can install a plugin and then refuse one of its files ("failed to load")
#   - `claude plugin validate`: no command or skill header is dropped
#   - from the band's version up: the plugin validates, and the mod's own tests pass on that engine
# One line per version. Exit 0 only when every version passes.
#
# Why: sawbuck-reins 0.5.61 went out with a manifest only Claude Code 2.1.271 and newer could read, and the first friend
# to try it could not install it (2026-11-12). Every check we had ran on the newest Claude Code. And 0.5.62 installed
# everywhere and was listed as "failed to load" on Claude Code 2.1.241 and older (a hooks file with no `hooks` record):
# this check then read "Successfully installed" and never the status.
# The fast half of this check is engine/test/plugin-files.test.mjs.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PKG=@anthropic-ai/claude-code
MOD=sawbuck-reins                      # the plugin that has a hooks module (the band)
PLUGINS="sawbuck-reins sawbuck"
say(){ printf '%s\n' "$*"; }
command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { say "install-check: needs node and npm"; exit 2; }
# macOS has no `timeout`; without it a hung command hangs the check, which CI's own limit ends
run(){ if command -v timeout >/dev/null 2>&1; then timeout 300 "$@"; else "$@"; fi; }
named(){ node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8");const m=t.match(new RegExp(process.argv[2]));process.stdout.write(m?m[1]:"")' "$ROOT/README.md" "$1"; }
ge(){ node -e 'const [a,b]=process.argv.slice(1).map(v=>v.split(".").map(Number));for(let i=0;i<3;i++)if(a[i]!==b[i])process.exit(a[i]>b[i]?0:1)' "$1" "$2"; }   # $1 >= $2
# loadproblem <list as json> <list as text> <plugin id>: prints why Claude Code says the installed plugin did not load,
# or nothing. The JSON list first (an entry with errors, or not enabled); the text list where a version has no JSON one.
loadproblem(){ node -e '
const fs=require("fs"), [json,text,id]=process.argv.slice(1), flat=s=>String(s).replace(/\s+/g," ").trim();
let e=null; try{ e=JSON.parse(fs.readFileSync(json,"utf8")).find(x=>x&&x.id===id) }catch{}
if(e){ if(e.enabled===false) console.log("it is not enabled"); else if(Array.isArray(e.errors)&&e.errors.length) console.log(flat(e.errors.join("; ")).slice(0,300)); process.exit(0) }
let t=""; try{ t=fs.readFileSync(text,"utf8") }catch{}
const i=t.indexOf(id), block=i<0?"":t.slice(i).split(/\n\s*\n/)[0], at=block.search(/failed to load/i);
if(at>=0) console.log(flat(block.slice(at)).slice(0,300));
' "$1" "$2" "$3"; }

FLOOR=$(named 'installs on Claude Code (\d+\.\d+\.\d+)'); BAND=$(named 'needs (\d+\.\d+\.\d+) or newer')
[ -n "$FLOOR" ] && [ -n "$BAND" ] || { say "install-check: README.md does not name the two versions (\"installs on Claude Code X\", \"needs Y or newer\")"; exit 1; }
if [ $# -gt 0 ]; then VERSIONS="$*"; else
  tags=$(npm view "$PKG" dist-tags --json 2>/dev/null) || tags=
  more=$(printf '%s' "$tags" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s);process.stdout.write(["stable","latest","next"].map(k=>t[k]).filter(v=>/^\d+\.\d+\.\d+$/.test(v||"")).join(" "))}catch{}})')
  [ -n "$more" ] || { say "install-check: could not read Claude Code's stable, latest and next versions from npm"; exit 1; }
  VERSIONS="$FLOOR $BAND $more"
fi
VERSIONS=$(node -e 'const n=v=>v.split(".").map(Number);console.log([...new Set(process.argv.slice(1))].sort((a,b)=>{const x=n(a),y=n(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]}).join(" "))' $VERSIONS)

W=$(mktemp -d "${TMPDIR:-/tmp}/sawbuck-install-check.XXXXXX") || exit 2
trap 'rm -rf "$W"' EXIT
export npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false DISABLE_AUTOUPDATER=1 CI=1
bad=0
for v in $VERSIONS; do
  d=$W/$v; mkdir -p "$d/prefix" "$d/home" "$d/work"; why=""; note=""
  # one version in a subshell: its own npm prefix first on PATH, so `claude` below is this version and no other
  ( export NPM_CONFIG_PREFIX="$d/prefix" PATH="$d/prefix/bin:$PATH" HOME="$d/home"
    npm i -g "$PKG@$v" >"$d/npm.txt" 2>&1 || { echo "npm could not install Claude Code $v: $(tail -2 "$d/npm.txt" | tr -s ' \n' ' ' | cut -c1-200)" >"$d/why"; exit 0; }
    [ "$(claude --version 2>/dev/null | cut -d' ' -f1)" = "$v" ] || { echo "the claude on PATH is not $v" >"$d/why"; exit 0; }
    for p in $PLUGINS; do
      export HOME="$d/home-$p"; mkdir -p "$HOME"; cd "$d/work" || exit 0
      run claude plugin marketplace add "$ROOT" >"$d/$p-add.txt" 2>&1 </dev/null
      run claude plugin install "$p@sawbuck" >"$d/$p-install.txt" 2>&1 </dev/null
      run claude plugin list >"$d/$p-list.txt" 2>&1 </dev/null
      run claude plugin list --json >"$d/$p-list.json" 2>/dev/null </dev/null
      grep -q 'Successfully installed' "$d/$p-install.txt" && grep -q "$p@sawbuck" "$d/$p-list.txt" \
        || echo "$p does not install: $(tr -s ' \n' ' ' <"$d/$p-install.txt" | sed 's/.*Failed to install/Failed to install/' | cut -c1-320)" >>"$d/why"
      # installed is not loaded: an old Claude Code installs a plugin and then refuses one of its files
      lp=$(loadproblem "$d/$p-list.json" "$d/$p-list.txt" "$p@sawbuck")
      [ -z "$lp" ] || echo "$p installs, and then Claude Code says it failed to load: $lp" >>"$d/why"
      HOME="$d/home" run claude plugin validate "$ROOT/plugins/$p" >"$d/$p-validate.txt" 2>&1 </dev/null; echo $? >"$d/$p-validate.exit"
      if grep -q 'frontmatter failed to parse' "$d/$p-validate.txt"; then
        echo "$p: this version drops the header of $(awk '/^Validating /{f=$NF} /frontmatter failed to parse/{n=split(f,a,"/"); print a[n-1] "/" a[n]}' "$d/$p-validate.txt" | sort -u | tr '\n' ' ')(quote the value that holds a colon)" >>"$d/why"
      fi
    done
    if ge "$v" "$BAND"; then
      [ "$(cat "$d/$MOD-validate.exit")" = 0 ] || echo "$MOD does not validate, and the README says the band works from $BAND: $(grep -E '❯' "$d/$MOD-validate.txt" | head -2 | tr -s ' \n' ' ' | cut -c1-240)" >>"$d/why"
      # the mod's own tests on this engine, on a copy: the test command writes its types beside the plugin
      cp -R "$ROOT/plugins/$MOD" "$d/mod" && HOME="$d/home" run claude plugin test "$d/mod" >"$d/test.txt" 2>&1 </dev/null
      pass=$(sed -n 's/^ *\([0-9][0-9]*\) pass.*/\1/p' "$d/test.txt" | tail -1); fail=$(sed -n 's/^ *\([0-9][0-9]*\) fail.*/\1/p' "$d/test.txt" | tail -1)
      if [ "${pass:-0}" -gt 0 ] && [ "${fail:-1}" = 0 ]; then echo "validates, and the mod's $pass tests pass" >"$d/note"
      else echo "the mod's tests do not pass (${pass:-0} pass, ${fail:-?} fail), and the README says the band works from $BAND: $(grep -E '^\(fail\)' "$d/test.txt" | head -3 | tr -s ' \n' ' ' | cut -c1-240)" >>"$d/why"; fi
    fi
  )
  [ -f "$d/why" ] && why=$(cat "$d/why"); [ -f "$d/note" ] && note=$(cat "$d/note")
  if [ -z "$why" ]; then say "ok   Claude Code $v: installs and loads $(echo $PLUGINS | sed 's/ / and /')${note:+; $note}"
  else bad=1; say "FAIL Claude Code $v:"; printf '%s\n' "$why" | sed 's/^/       /'; fi
done
if [ "$bad" = 0 ]; then say "INSTALL CHECK PASSED on Claude Code $VERSIONS (the README names $FLOOR for the install and $BAND for the band)"
else say "INSTALL CHECK FAILED"; exit 1; fi
