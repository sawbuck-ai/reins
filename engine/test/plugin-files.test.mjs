// The files Claude Code reads from the plugins in this repo, checked the way an OLD Claude Code reads them.
//
// Why: sawbuck-reins 0.5.61 went out with a manifest only Claude Code 2.1.271 and newer could read, and the first friend
// to try it could not install it (2026-11-12). Every check we had ran on the newest Claude Code. Each rule below is one a
// real version enforced on a real install, measured on 72 versions:
//   - A setting (userConfig) with a key that version does not know: the whole plugin is refused. `options`, a list of
//     allowed values, is read only by 2.1.271 and newer.
//   - A command or skill header that is not strict YAML: 2.1.221 and older drop the whole header, the description and
//     the pre-approved commands with it. A value that holds a colon needs quotes.
//
// This is the fast half, run with the unit tests on every push. The real check is scripts/install-check.sh, which
// installs both plugins on old and current Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  for (const p of PLUGINS) assert.ok(headerFiles(p).length >= 6, `${p}: found only ${headerFiles(p).length} command and skill files`);
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
