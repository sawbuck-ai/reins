// The files Claude Code reads from the plugins in this repo, checked the way an OLD Claude Code reads them.
//
// Why: sawbuck-reins 0.5.61 went out with a manifest only Claude Code 2.1.271 and newer could read, and the first friend
// to try it could not install it (2026-11-12). Every check we had ran on the newest Claude Code. Each rule below is one a
// real version enforced on a real install, measured on 72 versions:
//   - A setting (userConfig) with a key that version does not know: the whole plugin is refused. `options`, a list of
//     allowed values, is read only by 2.1.271 and newer.
//   - A command or skill header that is not strict YAML: 2.1.221 and older drop the whole header, the description and
//     the pre-approved commands with it. A value that holds a colon needs quotes.
//   - A hooks file (hooks/hooks.json) with no `hooks` record: 2.1.241 and older read it as command hooks and refuse
//     it. The plugin still installs and its commands load, and Claude Code lists it as "failed to load". 0.5.62 went
//     out like that: the check then asked "did it install" and never "did it load".
//
// This is the fast half, run with the unit tests on every push. The real check is scripts/install-check.sh, which
// installs both plugins on old and current Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.PLUGIN_FILES_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const PLUGINS = readdirSync(join(ROOT, 'plugins')).filter((d) => existsSync(join(ROOT, 'plugins', d, '.claude-plugin', 'plugin.json'))).sort();
const manifest = (p) => JSON.parse(read('plugins', p, '.claude-plugin', 'plugin.json'));

// The keys of a setting that Claude Code 2.1.100 reads (measured). Before adding one, run scripts/install-check.sh on the
// oldest version the README names: an unknown key there means nobody on that version can install the plugin.
const SETTING_KEYS = ['default', 'description', 'title', 'type'];

// --- a header, read as the strict subset of YAML these files use ---------------------------------------------------
// Lines of `key: value`, with at most one level of nesting. A value is a "double-quoted string", a [JSON list], empty
// (a nested block follows), or plain. A plain value must read as one string to every YAML parser, so it may not hold
// ": " or " #", end with ":", start with a character YAML gives a meaning to, or be a word YAML reads as true, false
// or nothing.
const header = (text) => {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end < 0 ? null : lines.slice(1, end);
};
const plainProblem = (v) => {
  if (/: /.test(v) || v.endsWith(':')) return 'holds a colon and a space, so a strict parser reads a second key: put the whole value in double quotes';
  if (/ #/.test(v)) return 'holds " #", so a strict parser reads a comment from there: put the whole value in double quotes';
  if (/^[!&*?|>%@`#,\[\]{}'-]/.test(v) && !/^-?\d/.test(v)) return `starts with ${JSON.stringify(v[0])}, which YAML gives a meaning to: put the whole value in double quotes`;
  if (/^(y|n|yes|no|on|off|true|false|null|~)$/i.test(v)) return `is the word ${JSON.stringify(v)}, which YAML reads as true, false or nothing: put it in double quotes`;
  return null;
};
export const headerProblems = (text) => {
  const lines = header(text);
  if (lines === null) return ['has no header between two --- lines'];
  const out = [];
  lines.forEach((line, i) => {
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    const m = /^( *)([A-Za-z0-9_.-]+):(?: (.*)|)$/.exec(line);
    if (!m) { out.push(`line ${i + 2} is not a \`key: value\` line: ${JSON.stringify(line.slice(0, 60))}`); return; }
    const [, indent, key, raw = ''] = m;
    const v = raw.trim();
    if (indent.length > 2 || indent.length % 2) { out.push(`${key}: nested deeper than this check reads`); return; }
    if (v === '') {
      const next = lines[i + 1] || '';
      if (!/^ +\S/.test(next) || indent.length) out.push(`${key}: has no value`);
    } else if (v.startsWith('"') || v.startsWith('[') || v.startsWith('{')) {
      try { JSON.parse(v); } catch { out.push(`${key}: starts like a quoted string or a list but is not one a strict parser reads (it must also be valid JSON)`); }
    } else {
      const why = plainProblem(v);
      if (why) out.push(`${key}: ${why}`);
    }
  });
  return out;
};
const headerFiles = (p) => {
  const base = join(ROOT, 'plugins', p);
  const md = (dir) => (existsSync(join(base, dir)) ? readdirSync(join(base, dir)).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)) : []);
  const skills = existsSync(join(base, 'skills')) ? readdirSync(join(base, 'skills')).map((d) => join('skills', d, 'SKILL.md')).filter((f) => existsSync(join(base, f))) : [];
  return [...md('commands'), ...md('agents'), ...skills].sort();
};

test('this file finds the plugins it is here to check', () => {
  assert.ok(PLUGINS.includes('sawbuck-reins') && PLUGINS.includes('sawbuck'), `found ${JSON.stringify(PLUGINS)} under plugins/`);
  // the full plugin holds six commands and two skills; the commands-only edition four and one
  for (const p of PLUGINS) assert.ok(headerFiles(p).length >= 5, `${p}: found only ${headerFiles(p).length} command and skill files`);
});

test('the header check itself: it flags what old Claude Code drops, and passes what every parser reads', () => {
  const bad = (h) => headerProblems(`---\n${h}\n---\nbody`).length > 0;
  // the four descriptions that shipped in 0.5.61 had this shape
  assert.ok(bad('description: Verify your latest change right now: was the win earned in the source, or gamed?'));
  assert.ok(bad('description: ends with a colon:'));
  assert.ok(bad('description: a rule #1 comment'));
  assert.ok(bad('description: *starred'));
  assert.ok(bad('description: off'));
  assert.ok(bad("description: 'single quotes'"));
  assert.ok(bad('description: "unclosed'));
  assert.ok(bad('allowed-tools: ["Bash(npx sawbuck check)"'));
  assert.ok(bad('description:'));
  assert.ok(bad('- a list item'));
  assert.ok(headerProblems('no header at all').length > 0);
  const good = (h) => assert.deepEqual(headerProblems(`---\n${h}\n---\nbody`), []);
  good('description: "Verify your latest change right now: was the win earned in the source, or gamed?"');
  good('description: Find rules in your agent files that can pull against each other, and say which wins');
  good('allowed-tools: ["Bash(npx --prefer-offline -y sawbuck check)", "Read(~/.sawbuck/shape-input.txt)"]');
  good('name: sawbuck-check\ndescription: Verify a passing test is real. Use whenever someone asks, e.g. after a fix.\nmetadata:\n  category: verification');
  good('description: a time like 10:30 has no space after its colon');
});

for (const p of PLUGINS) {
  test(`${p}: every setting holds only the keys an old Claude Code reads (no \`options\`)`, () => {
    for (const [name, field] of Object.entries(manifest(p).userConfig || {})) {
      const extra = Object.keys(field).filter((k) => !SETTING_KEYS.includes(k));
      assert.deepEqual(extra, [], `plugins/${p}/.claude-plugin/plugin.json: setting "${name}" has ${extra.map((k) => `"${k}"`).join(', ')}. `
        + 'A Claude Code that does not know a key refuses the whole plugin ("Unrecognized key"). Name the allowed values in the description and let the code read the value loosely. '
        + 'To add a key, first run scripts/install-check.sh on the oldest version the README names.');
      assert.equal(field.type, 'string', `plugins/${p}: setting "${name}" has type ${JSON.stringify(field.type)}; only "string" has been run on the oldest version the README names`);
      for (const k of ['title', 'description']) assert.ok(typeof field[k] === 'string' && field[k].trim(), `plugins/${p}: setting "${name}" needs a ${k}`);
      if ('default' in field) assert.equal(typeof field.default, 'string', `plugins/${p}: setting "${name}" is a string, so its default is one too`);
    }
  });

  test(`${p}: every command and skill header is strict YAML (an old Claude Code drops a header it cannot parse)`, () => {
    const problems = headerFiles(p).flatMap((f) => headerProblems(read('plugins', p, f)).map((why) => `plugins/${p}/${f}: ${why}`));
    assert.deepEqual(problems, []);
  });

  test(`${p}: a hooks file holds a \`hooks\` record beside its modules (an old Claude Code refuses the file without one)`, () => {
    const file = join(ROOT, 'plugins', p, 'hooks', 'hooks.json');
    if (!existsSync(file)) return;
    const h = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(h.hooks && typeof h.hooks === 'object' && !Array.isArray(h.hooks),
      `plugins/${p}/hooks/hooks.json has no "hooks" record. Claude Code 2.1.241 and older read this file as command hooks and refuse it without one `
      + '("Hook load failed ... expected record, received undefined"): the plugin installs, and Claude Code lists it as "failed to load". '
      + 'Keep "hooks": {} beside "modules".');
  });

  test(`${p}: every file the manifest and the hooks file name is there`, () => {
    const m = manifest(p);
    if (m.types) assert.ok(existsSync(join(ROOT, 'plugins', p, m.types)), `plugins/${p}: "types" names ${m.types}, which is not there`);
    const hooks = join(ROOT, 'plugins', p, 'hooks', 'hooks.json');
    if (existsSync(hooks)) for (const mod of JSON.parse(readFileSync(hooks, 'utf8')).modules || []) {
      assert.ok(existsSync(join(ROOT, 'plugins', p, 'hooks', mod)), `plugins/${p}/hooks/hooks.json names ${mod}, which is not there`);
    }
  });
}

test('the READMEs name the Claude Code versions the install check runs on, and they agree', () => {
  const versions = (text, where) => {
    const floor = /installs on Claude Code (\d+\.\d+\.\d+)/.exec(text);
    const band = /needs (\d+\.\d+\.\d+) or newer/.exec(text);
    assert.ok(floor, `${where} does not say "installs on Claude Code <version>": scripts/install-check.sh installs on the version named there`);
    assert.ok(band, `${where} does not say "needs <version> or newer" for the band: scripts/install-check.sh runs the mod's tests from the version named there`);
    return [floor[1], band[1]];
  };
  const root = versions(read('README.md'), 'README.md');
  assert.deepEqual(versions(read('plugins', 'sawbuck-reins', 'README.md'), 'plugins/sawbuck-reins/README.md'), root, 'the two READMEs name different versions');
  const n = (v) => v.split('.').map(Number).reduce((a, x) => a * 100000 + x, 0);
  assert.ok(n(root[0]) <= n(root[1]), `the band cannot need an older Claude Code (${root[1]}) than the install does (${root[0]})`);
});

// The pinned line (2026-11-13). Every command, skill and band button gives Claude one exact line to run:
// `npx ... -y sawbuck@<version> <command>`. It used to carry `--prefer-offline`, which tells npm to use the list of
// versions it has kept without asking whether the list is still right. A person who had run an earlier sawbuck then got
// "No matching version found for sawbuck@<new>" from every plugin command after a plugin update, and nothing in normal
// use repaired it: every line carried the flag. Measured on npm 10.8.2, 10.9.9 and 11.19.1, the same on each. Without
// the flag npm asks the registry once, and a home that last saw the older version finds the new one.
// The real check is in the release's plugin check: the pinned line, run in a home that last saw the version before.
test('no pinned sawbuck line tells npm to prefer what it has kept (a returning user would not find a new version)', () => {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' || (e.name === 'results' && /evals$/.test(dir)) ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
  const files = walk('plugins').filter((f) => /\.(md|tsx?|json|ya?ml)$/.test(f));
  const lines = files.flatMap((f) => read(f).split('\n').map((l, i) => ({ f, i: i + 1, l })).filter((x) => /\bnpx(?: -{1,2}[\w=-]+)* sawbuck@[\d*]/.test(x.l)));   // npx, its flags, then the pin (a version, or * in a pattern; `@latest` in the README's repair line is not a pin)
  assert.ok(lines.length >= 30, `found only ${lines.length} pinned lines under plugins/: this test has lost its subject`);
  const kept = lines.filter((x) => /--prefer-offline|--offline\b/.test(x.l));
  assert.deepEqual(kept.map((x) => `${x.f}:${x.i}`), [], 'these lines tell npm to use its kept list of versions');
  // what keeps a dead network from hanging the command stays on every one
  const loose = lines.filter((x) => !/--fetch-retries=0 --fetch-timeout=\d+ -y sawbuck@/.test(x.l));
  assert.deepEqual(loose.map((x) => `${x.f}:${x.i}`), [], 'these pinned lines have lost --fetch-retries=0 --fetch-timeout=<ms>');
});

// The update words (2026-11-14). The READMEs told a person on an older plugin to update it with "/plugin marketplace
// update sawbuck, then install it again". Nothing had run those words. In a shell on Claude Code 2.1.241 to 2.1.325,
// "install again" answers "already installed" and the old plugin stays; `plugin update` alone says "already at the
// latest version", because nothing refreshed the marketplace. What updated on every version tried (2.1.100 to 2.1.325,
// both plugins, from the real remote) is the marketplace update followed by the plugin update. So a README that tells
// a person to update names those two commands, for its own plugin, in that order.
test('a README that tells a person to update the plugin gives the two commands that update it', () => {
  const docs = [['README.md', 'sawbuck-reins'], ['plugins/sawbuck-reins/README.md', 'sawbuck-reins'], ['plugins/sawbuck/README.md', 'sawbuck']];
  for (const [f, plugin] of docs) {
    const t = read(f).replace(/\s+/g, ' ');
    assert.ok(/No matching version found/.test(t), `${f} no longer has the paragraph this test is about`);
    assert.ok(!/install (it )?again/i.test(t), `${f} tells a person to install again: on Claude Code 2.1.241 and newer that leaves the old plugin in place`);
    const a = t.indexOf('claude plugin marketplace update sawbuck'), b = t.indexOf(`claude plugin update ${plugin}@sawbuck`);
    assert.ok(a >= 0 && b > a, `${f} must give \`claude plugin marketplace update sawbuck\`, then \`claude plugin update ${plugin}@sawbuck\``);
  }
});

// --- what Anthropic's plugin directory asks of a folder before it lists it (2026-11-15) -----------------------------
// The directory reads one plugin folder at a time, and a person who installs from it gets only that folder. Its
// written checks (claude.com/docs/plugins/pre-submission-checklist) and its policy ask for the things below. From
// 2.1.323 on `claude plugin validate` runs a part of them. These are the ones a new file or a changed sentence can
// break on any push with nobody looking: found by reading both folders against the checklist, the day we first meant
// to submit. Neither folder carried the license; the commands-only edition named no support or privacy page; and both
// READMEs gave a person lines for npx with no version, or `@latest`, which the checklist blocks.
const folderFiles = (p) => {
  const dir = join('plugins', p);
  try {   // the committed files: a checkout also holds what Claude Code and the evals write there, and none of it ships
    const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
    if (out.length) return out;
  } catch { /* not a git checkout: a copy laid out for a test */ }
  const skip = (d, name) => name === 'node_modules' || (name === 'results' && /evals$/.test(d)) || (name === 'types' && /\.claude-plugin$/.test(d));
  const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (skip(d, e.name) ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
  return walk(dir);
};
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

test('each plugin folder carries the license and the notice (an install from the directory gets only that folder)', () => {
  for (const p of PLUGINS) for (const f of ['LICENSE', 'NOTICE']) {
    assert.ok(existsSync(join(ROOT, 'plugins', p, f)), `plugins/${p}/${f} is missing: the folder is all a person gets, and Apache-2.0 asks that the license go with it`);
    assert.equal(read('plugins', p, f), read(f), `plugins/${p}/${f} is not the same text as the repo's ${f}`);
  }
});

test('each manifest names its license, its author, and where to get help, the documentation and the privacy page', () => {
  for (const p of PLUGINS) {
    const m = manifest(p);
    assert.equal(m.license, 'Apache-2.0', `${p}: license`);
    assert.ok(m.author && typeof m.author.name === 'string' && m.author.name, `${p}: author.name`);
    for (const k of ['description', 'version']) assert.ok(typeof m[k] === 'string' && m[k], `${p}: plugin.json has no ${k}`);
    for (const k of ['homepage', 'repository', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl']) assert.ok(typeof m[k] === 'string' && /^https:\/\/\S+$/.test(m[k]), `${p}: plugin.json has no https link for ${k} (the directory's policy asks for a support channel, documentation and a privacy page)`);
  }
});

// A launcher downloads a package and runs it. The directory blocks one that names no exact version (a bare name, a
// range, `@latest`). Our own measure says the same from the other side: a line with no version in it is answered by
// whatever older copy the machine holds (sawbuck 0.1.72). The word alone in a sentence is not a command, and a pin
// written as a pattern (in a test, or a permission rule) is not one either.
const LAUNCHER = /\b(npx|bunx|uvx|pnpm dlx|yarn dlx|pipx run)\b([^\n`]*)/g;
export const looseLaunchers = (text) => {
  const out = [];
  for (const m of text.matchAll(LAUNCHER)) {
    const pkg = m[2].trim().split(/\s+/).find((w) => w && !w.startsWith('-'));
    if (!pkg) continue;
    if (/@[^@/]*[\\*]/.test(pkg)) continue;
    if (!/^(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+[)'".,;:]*$/.test(pkg)) out.push(`${m[1]} ${pkg}`);
  }
  return out;
};

test('the launcher check tells a pinned line from a loose one', () => {
  const loose = (s) => assert.equal(looseLaunchers(s).length, 1, `should be loose: ${s}`);
  const fine = (s) => assert.deepEqual(looseLaunchers(s), [], `should be fine: ${s}`);
  loose('Or run `npx -y sawbuck@latest --version` once in a terminal.');
  loose('it answers a bare `sawbuck` and `npx sawbuck`.');
  loose('`npx -y sawbuck contract --full` adds supply-chain guards');
  loose('npx --fetch-retries=0 --fetch-timeout=10000 -y sawbuck@^0.1.72 check');
  loose('uvx ruff check .');
  loose('the npx form its commands use');
  fine('npx --fetch-retries=0 --fetch-timeout=10000 -y sawbuck@0.1.73 check');
  fine('`npx -y @sawbuck/reins@0.4.5 cues --append`');
  fine('a line for `npx` that names no version');
  fine('--allowed-tools "Bash(npx --fetch-retries=0 --fetch-timeout=10000 -y sawbuck@*)"');
  fine('assert.match(line, /npx -y sawbuck@\\d+\\.\\d+\\.\\d+ context/)');
  fine('`npm i -g sawbuck@latest` updates it.');
});

test('every launcher line in a plugin folder names an exact version', () => {
  for (const p of PLUGINS) {
    const bad = folderFiles(p).filter((f) => !IMAGE.test(f)).flatMap((f) => read(f).split('\n').flatMap((l, i) => looseLaunchers(l).map((x) => `${f}:${i + 1}: ${x}`)));
    assert.deepEqual(bad, [], `these lines run a package with no exact version: the directory blocks them, and on a machine with an older copy they run that copy`);
  }
});

test('each plugin README is long enough to be a listing and has a section on what the plugin reads, writes and sends', () => {
  for (const p of PLUGINS) {
    const t = read('plugins', p, 'README.md');
    let fence = false;
    const prose = t.split('\n').filter((l) => { if (l.trim().startsWith('```')) { fence = !fence; return false; } return !fence; }).join('\n');
    assert.ok((prose.match(/\S+/g) || []).length >= 40, `plugins/${p}/README.md has fewer than 40 words outside code blocks`);
    assert.ok(/^#+ .*\bwrites\b.*\bsends\b/im.test(t), `plugins/${p}/README.md has no heading that says what it writes and sends: the directory's scan looks for what a plugin does and does not say`);
  }
});

test('the commands-only edition gives three things to try (the directory asks for three working examples)', () => {
  const t = read('plugins', 'sawbuck', 'README.md');
  const at = t.indexOf('## Three things to try');
  assert.ok(at >= 0, 'no "Three things to try" section');
  const body = t.slice(at).split(/\n## /)[1] !== undefined ? t.slice(at).split(/\n## /)[0] : t.slice(at);
  assert.equal((body.match(/^\d\. /gm) || []).length, 3, 'the section does not hold three numbered examples');
});

test('no file in a plugin folder is one the directory holds or refuses', () => {
  const KIND = /\.(md|json|tsx?|sh|ya?ml|txt|png)$|(^|\/)(LICENSE|NOTICE|\.gitignore)$/;
  for (const p of PLUGINS) {
    const files = folderFiles(p);
    assert.ok(files.length > 5 && files.length <= 512, `${p}: ${files.length} files (the directory holds a folder of more than 512)`);
    for (const f of files) {
      assert.ok(KIND.test(f), `${f}: not text, a PNG or a license file. The directory holds any other kind for a reviewer`);
      assert.ok(IMAGE.test(f) || statSync(join(ROOT, f)).size <= 256 * 1024, `${f} is over 256 KiB`);
      for (const part of f.split('/')) {
        assert.ok(!/[:<>"|?*\\]|[. ]$/.test(part) && !/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(part), `${f}: a name Windows cannot hold`);
        assert.ok(!['.DS_Store', 'Thumbs.db', 'desktop.ini', '__MACOSX'].includes(part), `${f}: a system file`);
      }
    }
    const low = files.map((f) => f.toLowerCase());
    assert.equal(new Set(low).size, low.length, `${p}: two names differ only by capitals`);
  }
});

// With the hooks on, sawbuck hands what it finds (a gamed green, a reverted attempt, an undo with the person's words)
// to the notes kept on the machine, and one of those is Claude Code's own notes folder for the repo. Seen by running
// a gamed turn in an empty home, 2026-11-15: the note was there, and neither plugin README said so. The directory's
// scan looks for what a plugin does and does not say, so both READMEs name it, and the switch that turns it off.
test('each plugin README says where a finding is handed on, and how to turn that off', () => {
  for (const p of PLUGINS) {
    const t = read('plugins', p, 'README.md').replace(/\s+/g, ' ');
    assert.ok(/Claude Code's own notes folder for the repo/.test(t), `plugins/${p}/README.md does not say a finding goes into Claude Code's own notes folder`);
    assert.ok(/SAWBUCK_SHARE=none/.test(t), `plugins/${p}/README.md does not name the switch (SAWBUCK_SHARE=none)`);
    // run on the packed 0.1.72 (2026-11-16): `sawbuck detach --purge` deletes the record in the repo and leaves the notes
    assert.ok(/stays where it was put/.test(t) && /--purge/.test(t), `plugins/${p}/README.md does not say a note handed on outlives a purge`);
    assert.ok(/first line of the undone change/.test(t), `plugins/${p}/README.md does not say the undo note holds a line of the change`);
    // a note in Claude Code's notes folder is Claude Code's to read: it can go where the person's Claude Code traffic goes
    assert.ok(/Claude Code may read a note in its own notes folder in a later session/.test(t), `plugins/${p}/README.md does not say what happens to a note afterwards`);
  }
});

// `sawbuck attach` wires six hooks. The full README's "full list" named three of them until 0.5.70.
test('each plugin README names every moment a hook runs once the repo is attached', () => {
  const full = read('plugins', 'sawbuck-reins', 'README.md').replace(/\s+/g, ' ');
  for (const ev of ['UserPromptSubmit', 'SessionStart', 'Stop', 'PreToolUse', 'PostToolUse']) assert.ok(full.includes(ev), `plugins/sawbuck-reins/README.md does not name the ${ev} hook`);
  assert.ok(/sawbuck hold/.test(full) && /sawbuck undo/.test(full), 'plugins/sawbuck-reins/README.md does not say what the tool hooks run');
  const ed = read('plugins', 'sawbuck', 'README.md').replace(/\s+/g, ' ');
  assert.ok(/at each prompt, before each shell command and each file edit the agent makes, after each edit, and when a turn ends/.test(ed), 'plugins/sawbuck/README.md does not say when the hooks run');
});

// The directory's policy, 1.G: software in it "must not query or extract data from Claude's memory, chat history,
// conversation summaries" and must not "use conversation content to build user profiles". The rules and shape
// commands and the steering skill read what a person typed in past sessions, which is their whole use. They stay in
// sawbuck-reins, from our own marketplace. The commands-only edition is the one written for the directory, so it
// holds none of them, and nothing copied over from the full plugin may bring one back.
test('the commands-only edition reads no past sessions', () => {
  const files = folderFiles('sawbuck');
  const names = files.map((f) => f.replace(/^plugins\/sawbuck\//, ''));
  assert.deepEqual(names.filter((f) => /^commands\//.test(f)).sort(), ['commands/audit.md', 'commands/check.md', 'commands/contract.md', 'commands/status.md']);
  assert.deepEqual(names.filter((f) => /^skills\//.test(f)).sort(), ['skills/sawbuck-check/SKILL.md']);
  for (const f of files.filter((x) => /\/(commands|skills)\//.test(x))) {
    const t = read(f);
    for (const [re, what] of [[/\.claude\/projects|\.codex\/sessions/, 'the folder past sessions are kept in'], [/@sawbuck\/reins/, 'the steering CLI'], [/sawbuck@\d+\.\d+\.\d+ (rules|shape|steers|share)\b/, 'a command that reads or passes on what the person typed'], [/\/sawbuck:(rules|shape)\b/, 'a command this edition does not hold']]) assert.ok(!re.test(t), `${f} names ${what}`);
  }
  assert.ok(/reads no past sessions|No command in this edition reads your past sessions/.test(read('plugins', 'sawbuck', 'README.md')), 'the README no longer says so');
});

// The directory's terms ask for a way to take in a security report, and a public issue is not one. GitHub's private
// reporting is switched on for this repo; SECURITY.md at the root names its form. Each plugin README names it too,
// because an install from the directory gets only the plugin's own folder.
const PRIVATE_REPORT = 'https://github.com/sawbuck-ai/reins/security/advisories/new';
test('a security problem has a private way in: SECURITY.md at the root, and a line in each plugin README', () => {
  assert.ok(existsSync(join(ROOT, 'SECURITY.md')), 'SECURITY.md at the root of the repo');
  const policy = read('SECURITY.md');
  assert.ok(policy.includes(PRIVATE_REPORT), 'SECURITY.md names the private report form of this repo');
  assert.doesNotMatch(policy, /sawbuck@\d/, 'no version in SECURITY.md: the wave holds every sawbuck@x.y.z in this repo to the release');
  assert.doesNotMatch(policy, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'no address of a person in SECURITY.md');
  for (const p of PLUGINS) assert.ok(read('plugins', p, 'README.md').includes(PRIVATE_REPORT), `${p}: the README says where a security problem goes`);
  assert.ok(read('README.md').includes('SECURITY.md'), 'the repo README points at SECURITY.md');
});

// `sawbuck status` prints "You keep saying" from the steers the full plugin's judge kept in Claude Code's plugin store
// (steers.mjs). This edition has no judge, so its status command must not promise that, and its README says what
// status reads when the full plugin was ever run on the machine.
test('the commands-only edition does not promise steers, and its README names the kept steers status reads', () => {
  const cmd = read('plugins', 'sawbuck', 'commands', 'status.md');
  assert.doesNotMatch(cmd, /keep saying|keep telling|steer rate/i, 'plugins/sawbuck/commands/status.md promises what only the full plugin has');
  const t = read('plugins', 'sawbuck', 'README.md').replace(/\s+/g, ' ');
  assert.ok(/~\/\.claude\/plugins\/store\/sawbuck-reins_\*\.json/.test(t), 'plugins/sawbuck/README.md does not name the kept steers that status reads');
});

// In auto mode Claude Code refused the check skill's line when the person had asked only whether the win was real (two
// of two fresh sessions, 2026-11-16), and ran it when they asked for Sawbuck by name or typed the command. A reviewer
// types the first example as it is written, so it is the sentence that was run.
test('the first thing to try asks for Sawbuck by name, and the check skill says what to do when its line is refused', () => {
  const t = read('plugins', 'sawbuck', 'README.md');
  const first = t.slice(t.indexOf('## Three things to try')).split(/\n2\. /)[0];
  assert.ok(first.includes('`/sawbuck:check`'), 'the first example does not give the command');
  assert.ok(first.replace(/\s+/g, ' ').includes('"Run the sawbuck check on my last commit and show me what it says."'), 'the first example is not the sentence that was run');
  assert.ok(/auto mode/.test(first), 'the first example does not say what auto mode does');
  for (const [p, cmd] of [['sawbuck', '/sawbuck:check'], ['sawbuck-reins', '/sawbuck-reins:check']]) {
    const s = read('plugins', p, 'skills', 'sawbuck-check', 'SKILL.md').replace(/\s+/g, ' ');
    assert.ok(/permission check refuses the command/.test(s) && s.includes('`' + cmd + '`'), `plugins/${p}: the check skill does not say what to do when its line is refused`);
  }
});
