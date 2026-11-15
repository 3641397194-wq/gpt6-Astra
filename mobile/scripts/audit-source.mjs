// SPDX-License-Identifier: GPL-3.0-only
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', 'www', 'work', 'dist', '.git', '.gradle', '.idea', 'build']);
const findings = [], checked = [];
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,})/],
  ['provider-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/],
  ['personal-windows-path', /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>]+/i],
  ['private-network-ip', /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['credential-in-url', /https?:\/\/[^/\s:@]+:[^/\s@]+@/],
];
async function visit(folder, relative = '') {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const rel = path.posix.join(relative, entry.name), file = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) { findings.push({ file: rel, rule: 'symlink' }); continue; }
    if (entry.isDirectory()) { await visit(file, rel); continue; }
    if (/^(?:local|keystore|signing)\.properties$/.test(entry.name) || /\.(?:jks|keystore|p12|pfx|pem|key|dpapi|log|dmp)$/.test(entry.name) || entry.name.startsWith('.env')) {
      findings.push({ file: rel, rule: 'private-file' }); continue;
    }
    const data = await fs.readFile(file); checked.push({ file: rel, sha256: createHash('sha256').update(data).digest('hex') });
    if (/\.(?:png|webp|jpe?g|jar)$/.test(entry.name)) continue;
    const text = data.toString('utf8');
    // Test fixtures and the audit scanner itself deliberately contain non-working examples.
    if (rel.startsWith('tests/') || rel.includes('/src/test/') || rel.includes('/src/androidTest/') || rel === 'scripts/audit-source.mjs') continue;
    for (const [rule, pattern] of patterns) if (pattern.test(text)) findings.push({ file: rel, rule });
  }
}
await visit(root);
const source = JSON.parse(await fs.readFile(path.join(root, 'vendor/chatbox/SOURCE.json'), 'utf8'));
for (const item of source.files) {
  const hash = createHash('sha256').update(await fs.readFile(path.join(root, 'vendor/chatbox', item.local))).digest('hex');
  if (hash !== item.sha256) findings.push({ file: `vendor/chatbox/${item.local}`, rule: 'upstream-hash-mismatch' });
}
await fs.mkdir(path.join(root, 'work'), { recursive: true });
await fs.writeFile(path.join(root, 'work/source-audit.json'), JSON.stringify({ ok: !findings.length, files: checked.length, findings, scope: 'mobile source allowlist; tests are synthetic; no Git history or OCR claim' }, null, 2));
console.log(JSON.stringify({ ok: !findings.length, files: checked.length, findings }));
if (findings.length) process.exitCode = 1;
