// Tests for the optional layers: search by meaning (embed.mjs) and live references (lsp.mjs).
// Both skip when their dependency is not on this machine; neither is required by the rest.
// node --test tests/live.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const em = await import(pathToFileURL(path.join(here, '..', 'tools', 'embed.mjs')).href);
const lsp = await import(pathToFileURL(path.join(here, '..', 'tools', 'lsp.mjs')).href);

const haveModel = !!(await em.loadModel().catch(() => null));
const embedOpts = { skip: haveModel ? false : '@huggingface/transformers is not installed (set ATLAS_NODE_MODULES)' };

function vault() {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-'));
  const w = (slug, desc, body) => fs.writeFileSync(path.join(v, `${slug}.md`), `---\nname: ${slug}\ndescription: ${desc}\nmetadata:\n  type: project\n---\n\n${body}\n`);
  w('scelta-database', 'perché Postgres e non SQLite per il servizio', 'Postgres regge più scritture concorrenti; SQLite blocca il file.');
  w('colori-interfaccia', 'palette nera e rossa, hairline bianca', 'Lo stile segue il menu principale: nero, rosso, bordi bianchi sottili.');
  w('limite-download', 'quanto scaricare dei dati di mercato', 'Tetto di circa 5 GB per le crypto; niente scaricamenti ripetuti. <private>token segreto</private>');
  return v;
}

test('index embeds every note once and re-embeds only what changed', embedOpts, async () => {
  const v = vault();
  assert.match(await em.index(v), /indexed {3}3 notes · 3 embedded now/);
  assert.match(await em.index(v), /3 notes · 0 embedded now/);
  fs.appendFileSync(path.join(v, 'colori-interfaccia.md'), 'Aggiunta.\n');
  fs.rmSync(path.join(v, 'limite-download.md'));
  assert.match(await em.index(v), /2 notes · 1 embedded now · 1 dropped/);
});

test('search by meaning finds the note that says it in other words', embedOpts, async () => {
  const v = vault();
  await em.index(v);
  const db = await em.search(v, 'quale database abbiamo scelto e perché', 3);
  assert.equal(db[0].slug, 'scelta-database');
  const dl = await em.search(v, 'spazio su disco per i prezzi storici', 3);
  assert.equal(dl[0].slug, 'limite-download');
  const ui = await em.search(v, 'aspetto grafico dell\'app', 3);
  assert.equal(ui[0].slug, 'colori-interfaccia');
  assert.ok(!JSON.stringify(em.notesOf(v)).includes('token segreto'), 'private spans never reach the index');
});

const tsServer = lsp.findServer('typescript');
test('live references from the TypeScript server', { skip: tsServer ? false : 'typescript-language-server not found' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-'));
  fs.writeFileSync(path.join(root, 'a.ts'), 'export function retry(n: number) { return n + 1 }\nexport const other = () => 2\n');
  fs.writeFileSync(path.join(root, 'b.ts'), "import { retry } from './a'\nexport const x = retry(1)\nexport const y = retry(2)\n");
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2020"}}');
  const r = await lsp.references(root, 'a.ts', 1, 'retry');
  assert.equal(r.server, 'typescript');
  const inB = r.refs.filter((x) => x.file === 'b.ts').map((x) => x.line).sort();
  assert.deepEqual(inB, [1, 2, 3], 'the import and the two calls');
  assert.ok(!r.refs.some((x) => x.file === 'a.ts' && x.line === 1), 'the definition itself is not a reference');
});

test('no server for the language: a clear error, nothing else', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-'));
  fs.writeFileSync(path.join(root, 'x.lua'), 'function f() end\n');
  await assert.rejects(() => lsp.references(root, 'x.lua', 1, 'f'), /no language server for \.lua/);
  assert.match(lsp.check(), /typescript +typescript-language-server/);
});
