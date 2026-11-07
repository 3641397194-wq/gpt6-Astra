'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const pin = require('../src/lib/visual-gateway/upstream.json');
const checksum = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function prepare(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`, asset = pin.binaries[target];
  if (!asset) throw new Error(`Magpie ${pin.version}: unsupported platform ${target}`);
  const folder = path.join(__dirname, '..', 'resources', 'magpie', target);
  const file = path.join(folder, platform === 'win32' ? 'magpie.exe' : 'magpie');
  if (fs.existsSync(file) && checksum(file) === asset.sha256) return file;
  fs.mkdirSync(folder, { recursive: true });
  const response = await fetch(`https://github.com/yetone/magpie-releases/releases/download/v${pin.version}/${asset.asset}`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Gateway download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file + '.download', { mode: 0o755 }));
  if (checksum(file + '.download') !== asset.sha256) { fs.unlinkSync(file + '.download'); throw new Error('Gateway SHA-256 mismatch'); }
  fs.renameSync(file + '.download', file); fs.chmodSync(file, 0o755);
  console.log(`Verified Magpie ${pin.version} for ${target}`); return file;
}
if (require.main === module) prepare(process.argv[2], process.argv[3]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare };
