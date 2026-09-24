/**
 * Dead-link checker for the docs tree (verification aid, not a CI gate).
 *
 * Scans all docs markdown for relative links and verifies the target file
 * exists. Also understands the rspress site-absolute form
 * /seal-editor/docs/<path> by mapping it back onto docs/<path>.
 *
 * Usage: node scripts/check-doc-links.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const docsRoot = path.join(root, 'docs');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(md|mdx)$/.test(entry)) yield full;
  }
}

const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
const broken = [];
let checked = 0;

for (const file of walk(docsRoot)) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = linkRe.exec(src))) {
    let target = m[1].trim();
    // strip anchor
    const hashIdx = target.search(/#/);
    if (hashIdx !== -1) target = target.slice(0, hashIdx);
    if (!target) continue;
    if (/^(https?:|mailto:|data:)/.test(target)) continue;

    let resolved;
    if (target.startsWith('/seal-editor/docs/')) {
      resolved = path.join(docsRoot, target.slice('/seal-editor/docs/'.length));
    } else if (target.startsWith('/')) {
      continue; // other site-absolute paths (e.g. /storybook) — out of scope
    } else {
      resolved = path.resolve(path.dirname(file), target);
    }
    checked += 1;
    if (!existsSync(resolved) && !existsSync(`${resolved}.md`)) {
      broken.push(`${path.relative(root, file)} -> ${m[1]}`);
    }
  }
}

console.log(`checked ${checked} links under docs/`);
if (broken.length) {
  console.log(`BROKEN (${broken.length}):`);
  for (const b of broken) console.log('  ' + b);
  process.exit(1);
} else {
  console.log('all links resolve');
}
