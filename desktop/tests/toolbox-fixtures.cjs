'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
function workspace() { const root = path.resolve(__dirname, '../work/toolbox-fixtures'); fs.mkdirSync(root, { recursive: true }); return fs.mkdtempSync(path.join(root, 'case-')); }
function peFixture() {
  const b = Buffer.alloc(0x600); b.write('MZ'); b.writeUInt32LE(0x80, 0x3c); b.write('PE\0\0', 0x80); b.writeUInt16LE(0x8664, 0x84); b.writeUInt16LE(1, 0x86); b.writeUInt16LE(0xf0, 0x94);
  const o = 0x98; b.writeUInt16LE(0x20b, o); b.writeUInt32LE(0x1000, o + 16); b.writeBigUInt64LE(0x140000000n, o + 24); b.writeUInt32LE(0x400, o + 60); b.writeUInt16LE(0x4140, o + 70); b.writeUInt32LE(16, o + 108); b.writeUInt32LE(0x1080, o + 120); b.writeUInt32LE(40, o + 124);
  const s = o + 0xf0; b.write('.text', s); b.writeUInt32LE(0x200, s + 8); b.writeUInt32LE(0x1000, s + 12); b.writeUInt32LE(0x200, s + 16); b.writeUInt32LE(0x400, s + 20); b.writeUInt32LE(0x60000020, s + 36);
  b[0x400] = 0x74; b[0x401] = 0x05; b[0x402] = 0xc3; b.write('flag{original_fixture_only}', 0x420);
  b.writeUInt32LE(0x1100, 0x480); b.writeUInt32LE(0x10d0, 0x48c); b.writeUInt32LE(0x1100, 0x490); b.write('kernel32.dll', 0x4d0); b.writeBigUInt64LE(0x1140n, 0x500); b.writeBigUInt64LE(0x8000000000000042n, 0x508); b.write('CHECK_FN', 0x542); Buffer.from('license_fixture\0', 'utf16le').copy(b, 0x580); return b;
}
function elfFixture(little = true, bits = 64) {
  const b = Buffer.alloc(256); b.set([0x7f, 69, 76, 70, bits === 64 ? 2 : 1, little ? 1 : 2, 1]);
  const u16 = (n, o) => little ? b.writeUInt16LE(n, o) : b.writeUInt16BE(n, o), u32 = (n, o) => little ? b.writeUInt32LE(n, o) : b.writeUInt32BE(n, o), u64 = (n, o) => little ? b.writeBigUInt64LE(BigInt(n), o) : b.writeBigUInt64BE(BigInt(n), o);
  u16(3, 16); u16(bits === 64 ? 62 : 3, 18); u32(1, 20);
  if (bits === 64) { u64(0x1080, 24); u64(64, 32); u16(64, 52); u16(56, 54); u16(2, 56); u16(64, 58); u32(1, 64); u32(5, 68); u64(0, 72); u64(0x1000, 80); u64(256, 96); u64(256, 104); u32(0x6474e551, 120); u32(6, 124); }
  else { u32(0x1080, 24); u32(52, 28); u16(52, 40); u16(32, 42); u16(2, 44); u16(40, 46); u32(1, 52); u32(0, 56); u32(0x1000, 60); u32(256, 68); u32(256, 72); u32(5, 76); u32(0x6474e551, 84); u32(6, 108); }
  b.write('ELF_FIXTURE', 190); return b;
}
async function webFixture() {
  const requests = []; const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'); requests.push(req.url);
    if (url.pathname === '/slow') { setTimeout(() => res.end('slow'), 1500).unref(); return; }
    if (url.pathname === '/big') return res.end('X'.repeat(10000));
    if (url.pathname === '/') { const q = url.searchParams.get('q') || ''; if (q.startsWith('https://')) { res.writeHead(302, { location: q }); return res.end(); } if (q.includes("'") && !q.includes('CC_')) { res.statusCode = 500; return res.end('SQL syntax error near input'); } res.setHeader('content-type', 'text/html'); res.setHeader('set-cookie', 'session=fixture-only'); return res.end(`<title>Original fixture</title><a href="/hello">Hello</a><a href="https://example.invalid/">External</a><form action="/api"></form><div>${q}</div>`); }
    if (url.pathname === '/hello') return res.end('<title>Hello</title>world'); if (url.pathname === '/admin') return res.end('admin fixture'); if (url.pathname === '/api') return res.end('{"ok":true}'); if (url.pathname === '/redir') { res.writeHead(302, { location: 'https://example.invalid/' }); return res.end(); } res.end('missing ' + url.pathname);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { server, requests, port: server.address().port, url: `http://127.0.0.1:${server.address().port}/`, close: () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
module.exports = { workspace, peFixture, elfFixture, webFixture };
