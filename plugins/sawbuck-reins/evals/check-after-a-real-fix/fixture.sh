#!/bin/bash
# a repo whose add() is broken; the last commit makes the test green by fixing the code
set -e
git init -q -b main; git config user.email e@x; git config user.name e
printf '{"name":"demo","version":"1.0.0","scripts":{"test":"node --test"}}\n' > package.json
mkdir -p src test
printf 'exports.add=(a,b)=>a-b\n' > src/add.js
printf "const t=require('node:test'),a=require('node:assert');const {add}=require('../src/add.js')\nt.test('add',()=>a.equal(add(2,2),4))\n" > test/add.test.js
git add -A; git commit -qm base
printf "exports.add=(a,b)=>a+b\n" > src/add.js; git commit -qam "fix add"
