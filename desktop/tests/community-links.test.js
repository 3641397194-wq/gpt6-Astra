'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const telegram = ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf'];
const groups = ['1057540028', '1077074552', '618179023', '1131239659'];
const { allowedExternalUrl } = require('../src/lib/external-links');
const crypto = require('node:crypto');
const { COMMUNITY, LOCAL_AGENT_PROFILES } = require('../src/shared/workbench-core');
const { PACK_IDS, renderPack, activationReply } = require('../src/lib/seat-packs');
const localSkills = require('../src/lib/local-agent-skills');

test('desktop links open the current relay and both Telegram entries without widening the host boundary', () => {
  for (const url of [...telegram, 'https://coldcoffeeai.com/', 'https://coldcoffeeai.com/keys', 'https://www.coldcoffeeai.com/', 'https://github.com/3641397194-wq/gpt6-Astra']) assert.equal(allowedExternalUrl(url), true, url);
  for (const url of ['http://t.me/coolcoffeeai', 'https://t.me/unlisted-group', 'https://t.me/coolcoffeeai?next=other', 'https://t.me/coolcoffeeai#other', 'https://t.me:444/coolcoffeeai', 'https://t.me.evil.invalid/coolcoffeeai', 'https://github.com.evil.invalid/', 'https://user:password@coldcoffeeai.com/', 'file:///example', 'javascript:alert(1)']) assert.equal(allowedExternalUrl(url), false, url);
});

for (const relative of ['README.md', 'README_EN.md', 'docs/index.html', 'docs/readme-preview.html']) {
  test(`${relative} preserves the current Telegram chat/channel and all four QQ groups`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const links = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    for (const url of telegram) assert.ok(links.includes(url), `${relative}: missing clickable community link ${url}`);
    for (const group of groups) assert.match(source, new RegExp(`\\b${group}\\b`), `${relative}: missing QQ group ${group}`);
  });
}

test('all fifteen installed model seats carry the complete four-group activation page', t => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync.native(require('node:os').tmpdir()), 'cc-community-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const welcome = activationReply().trimEnd();
  assert.deepEqual(COMMUNITY.filter(item => item.kind === 'qq').map(item => item.value), groups);
  const packs = PACK_IDS.map(id => ({ id, text: renderPack(id) }));
  for (const profile of LOCAL_AGENT_PROFILES) {
    localSkills.select(profile.id, path.join(home, profile.id));
    const plan = localSkills.preview(profile.id);
    packs.push({ id: profile.id, text: plan.pack });
    assert.equal(fs.existsSync(plan.installFile), false, 'preview must remain read-only');
  }
  assert.equal(packs.length, 15);
  for (const pack of packs) {
    assert.ok(pack.text.includes(welcome), `${pack.id}: complete canonical welcome text`);
    assert.ok(!pack.text.includes('{{ACTIVATION_REPLY}}'), `${pack.id}: unresolved activation template`);
    for (const id of groups) assert.ok(pack.text.includes(id), `${pack.id}: ${id}`);
    for (const url of telegram) assert.ok(pack.text.includes(url), `${pack.id}: ${url}`);
  }
});

test('the new QQ QR image is identical in the website, workbench and installable Harness plugin', () => {
  const expected = 'd639ffc1d4868fc491486ca091900fdbb109e1b18ea8b6f6a291c24a68cae29d';
  for (const name of ['docs/assets/qq-group-4.jpg', 'desktop/assets/community/qq-group-4.jpg', 'desktop/src/lib/harness-plugin/ui/qq-group-4.jpg']) {
    const bytes = fs.readFileSync(path.join(root, name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
  const writes = require('../src/lib/harness-install').installationWrites(path.join(root, 'desktop/work/community-home'));
  const asset = writes.writes.find(item => item.file.endsWith(path.join('ui', 'qq-group-4.jpg')));
  assert.ok(asset, 'Harness installer must actually carry the new QR asset');
  assert.equal(crypto.createHash('sha256').update(asset.data).digest('hex'), expected);
});
