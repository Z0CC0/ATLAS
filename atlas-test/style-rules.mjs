#!/usr/bin/env node
/**
 * ATLAS bench — the output-style rows need the rules as an output style.
 *
 * The question of 2026-10-15: do the rules work as well when they arrive once, as a
 * Claude Code output style written into the system prompt, as they do injected by the
 * session-start hook and re-stated every turn by the tracker (27-32 tokens a turn)?
 * The text has to be the same, or the comparison measures two rulesets. So the style
 * file is not written by hand: it is the exact output of `hooks/atlas-activate.js` at
 * the given state, which is what the hook injects, with the frontmatter an output
 * style needs on top.
 *
 *   node style-rules.mjs            writes ~/.claude/output-styles/atlas-bench-low.md and -high.md
 *   node style-rules.mjs --remove   deletes them
 *
 * Reads the rules from ../atlas (the built plugin in this repository), the same file
 * generate.mjs swaps into the install for the atlas rows.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..', 'atlas');
const STYLES = join(homedir(), '.claude', 'output-styles');
const NAMES = { low: 'atlas-bench-low', high: 'atlas-bench-high' };

if (process.argv.includes('--remove')) {
  for (const n of Object.values(NAMES)) { const f = join(STYLES, `${n}.md`); if (existsSync(f)) { unlinkSync(f); console.log('removed', f); } }
  process.exit(0);
}

// A throwaway config dir, so the hook's state file does not touch the user's.
const cfgDir = mkdtempSync(join(tmpdir(), 'atlas-style-'));
const cfg = createRequire(import.meta.url)(join(PLUGIN, 'hooks', 'atlas-config.js'));
mkdirSync(STYLES, { recursive: true });
for (const [level, name] of Object.entries(NAMES)) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfgDir, CLAUDE_PLUGIN_ROOT: PLUGIN };
  // where the hook keeps this project's state, asked to the plugin itself
  const flag = execFileSync('node', ['-e', "const c=require(process.argv[1]);c.setProject(process.cwd());console.log(c.flagPath())", join(PLUGIN, 'hooks', 'atlas-config.js')], { encoding: 'utf8', env }).trim();
  mkdirSync(dirname(flag), { recursive: true });
  writeFileSync(flag, `${level}:off:off`);
  // without --part the hook prints the whole text, as the bench and the tests read it
  const rules = execFileSync('node', [join(PLUGIN, 'hooks', 'atlas-activate.js')], { encoding: 'utf8', env, input: JSON.stringify({ cwd: process.cwd() }) });
  if (!rules.trim()) throw new Error(`the hook printed nothing at ${level}`);
  const body = rules.replace(/\s+$/, '') + '\n';
  const file = join(STYLES, `${name}.md`);
  writeFileSync(file, `---\nname: ${name}\ndescription: ATLAS rules at ${level}, as an output style, for the bench of 2026-10-15\n---\n\n${body}`);
  console.log(`${file}: ${Buffer.byteLength(body, 'utf8')} bytes of rules at ${level}`);
}
void cfg;
rmSync(cfgDir, { recursive: true, force: true });
