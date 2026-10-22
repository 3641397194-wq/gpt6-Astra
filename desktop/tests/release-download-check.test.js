'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('public release verification rejects HTML/error pages and samples native installers without credentials', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['-B', '-m', 'unittest', 'discover', '-s', 'tools/tests', '-p', 'test_verify_release_downloads.py'],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});
