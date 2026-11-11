// Docs must not point at files that don't exist: every relative link and every
// backticked file path in README.md, CLAUDE.md and docs/*.md is checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DOCS = ['README.md', 'CLAUDE.md', ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
// Generated, private or local-only files that don't exist in a fresh clone.
const SKIP = ['public/data/viral', '.dev.vars', 'node_modules', 'data_specification', 'query_examples'];
const FILE_LIKE = /^[\w.\-/]+\.(js|mjs|ts|json|toml|md|css|html|csv|yml|tsv|png|R)$|^[\w.\-]+\/([\w.\-]+\/)*$/;

for (const doc of DOCS) {
  test(`paths in ${doc} exist`, () => {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    const missing = [];
    for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const p = join(ROOT, dirname(doc), link.split('#')[0]);
      if (!existsSync(p)) missing.push(link);
    }
    for (const [, code] of text.matchAll(/`([^`\s]+)`/g)) {
      if (!FILE_LIKE.test(code) || SKIP.some((s) => code.startsWith(s))) continue;
      if (!existsSync(join(ROOT, code))) missing.push(code);
    }
    assert.deepEqual(missing, [], `${doc} mentions paths that don't exist`);
  });
}
