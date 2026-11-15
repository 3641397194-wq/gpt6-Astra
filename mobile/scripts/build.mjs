// SPDX-License-Identifier: GPL-3.0-only
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
await fs.mkdir(path.join(root, 'www/assets'), { recursive: true });
await fs.mkdir(path.join(root, 'www/legal'), { recursive: true });
await fs.mkdir(path.join(root, 'work'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/app.js')], bundle: true,
  outfile: path.join(root, 'www/app.js'), format: 'esm', target: 'chrome100',
  minify: true, sourcemap: false, legalComments: 'eof', charset: 'utf8',
});
await build({
  entryPoints: [path.join(root, 'src/core.js')], bundle: true,
  outfile: path.join(root, 'work/core.mjs'), format: 'esm', platform: 'node', target: 'node22',
});
for (const name of ['index.html', 'app.css']) await fs.copyFile(path.join(root, 'src', name), path.join(root, 'www', name));
for (const name of ['hero.webp', 'icon.png']) await fs.copyFile(path.join(root, 'assets', name), path.join(root, 'www/assets', name));
for (let number = 1; number <= 4; number++) {
  const name = `qq-group-${number}.jpg`;
  await fs.copyFile(path.join(root, 'assets', name), path.join(root, 'www/assets', name));
}
for (const name of await fs.readdir(path.join(root, 'legal'))) {
  if (!/\.(?:txt|md)$/.test(name)) continue;
  await fs.copyFile(path.join(root, 'legal', name), path.join(root, 'www/legal', name));
}
await fs.copyFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(root, 'www/legal/THIRD_PARTY_NOTICES.md'));
for (const [module, filename, out] of [['marked', 'LICENSE', 'Marked-LICENSE.txt'], ['dompurify', 'LICENSE', 'DOMPurify-LICENSE.txt']]) {
  await fs.copyFile(path.join(root, 'node_modules', module, filename), path.join(root, 'www/legal', out));
}
const manifest = JSON.parse(await fs.readFile(path.join(root, 'vendor/chatbox/SOURCE.json'), 'utf8'));
for (const file of manifest.files) {
  const bytes = await fs.readFile(path.join(root, 'vendor/chatbox', file.local));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Pinned Chatbox source differs: ${file.local}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await fs.writeFile(path.join(root, 'www/build-info.json'), JSON.stringify({
  product: 'ColdCoffee Mobile', version: pkg.version,
  upstream: { repository: manifest.repository, revision: manifest.revision },
}, null, 2) + '\n');
console.log(`Built ColdCoffee Mobile ${pkg.version}; pinned upstream hashes verified; no user directories read.`);
