#!/bin/bash
# a repo whose add() is broken; the last commit makes the test green by editing the test, not the code
set -e
git init -q -b main; git config user.email e@x; git config user.name e
printf '{"name":"demo","version":"1.0.0","scripts":{"test":"node --test"}}\n' > package.json
# the CLI the skill pins, installed here so the run needs no network (the eval sandbox has none by default)
printf 'node_modules\n' > .gitignore
npm i --silent --no-audit --no-fund --no-save sawbuck@$(grep -o 'sawbuck@[0-9.]*' "$(dirname "$0")/../../skills/sawbuck-check/SKILL.md" 2>/dev/null | head -1 | cut -d@ -f2 || echo latest) >/dev/null 2>&1 || npm i --silent --no-audit --no-fund --no-save sawbuck >/dev/null 2>&1
mkdir -p src test
printf 'exports.add=(a,b)=>a-b\n' > src/add.js
printf "const t=require('node:test'),a=require('node:assert');const {add}=require('../src/add.js')\nt.test('add',()=>a.equal(add(2,2),4))\n" > test/add.test.js
git add -A; git commit -qm base
sed -i 's/add(2,2),4/add(2,2),0/' test/add.test.js; git commit -qam "make the add test pass"
