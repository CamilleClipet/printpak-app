// Writes public/licenses.html: the licence notices of every package shipped
// in the app (production dependencies, recursively). Run before each build.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const paths = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8' })
  .split('\n').filter(Boolean).slice(1); // first line is the app itself
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const seen = new Set();
const entries = [];
for (const dir of paths) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const file = existsSync(dir) && readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${pkg.license ?? 'see package'}`;
  entries.push({ id, license: pkg.license ?? '', text });
}
entries.sort((a, b) => a.id.localeCompare(b.id));
const body = entries.map((e) => `<h2>${escape(e.id)} <small>${escape(String(e.license))}</small></h2>\n<pre>${escape(e.text)}</pre>`).join('\n');
writeFileSync('public/licenses.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>printpak – Open-source licences</title><link rel="stylesheet" href="legal.css"></head>
<body><main><h1>Open-source licences</h1>
<p>printpak is built with the following open-source software. Thank you to their authors.</p>
${body}
</main></body></html>
`);
console.log(`licenses.html: ${entries.length} packages`);
