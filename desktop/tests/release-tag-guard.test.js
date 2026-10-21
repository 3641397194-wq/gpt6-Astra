'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/desktop-build.yml'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const tag = `v${version}`;

function guardScript() {
  const step = workflow.indexOf('      - name: Publish release after all platforms pass');
  assert.ok(step >= 0, 'release publication step is missing');
  const start = workflow.indexOf('          version=', step);
  const end = workflow.indexOf('          shopt -s nullglob', start);
  assert.ok(start > step && end > start, 'version tag guard boundaries changed');
  return workflow.slice(start, end).replace(/^ {10}/gm, '').replace(/\r\n/g, '\n');
}

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 15000, ...options });
  assert.equal(result.status, 0, result.stderr || result.error?.message || `${command} failed`);
  return result.stdout.trim();
}

function bashPath() {
  if (process.platform !== 'win32') return 'bash';
  // Use the Bash shipped with this Git, not the unrelated system32 WSL launcher.
  const gitExec = checked('git', ['--exec-path']);
  const bash = path.resolve(gitExec, '../../../bin/bash.exe');
  assert.ok(fs.existsSync(bash), `Git Bash is missing: ${bash}`);
  return bash;
}

function fixture(t, kind) {
  const temp = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(temp, 'cc release tag '));
  t.after(() => {
    assert.equal(path.dirname(dir), temp);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const origin = path.join(dir, 'origin.git');
  const checkout = path.join(dir, 'checkout');
  const config = path.join(dir, 'empty.gitconfig');
  fs.writeFileSync(config, '');
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_COUNT: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Release Tag Fixture',
    GIT_AUTHOR_EMAIL: 'release-fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Release Tag Fixture',
    GIT_COMMITTER_EMAIL: 'release-fixture@example.invalid',
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
  };
  const git = (args, cwd = dir) => checked('git', args, { cwd, env });
  git(['init', '--bare', '--template=', origin]);
  git(['init', '--template=', checkout]);
  fs.writeFileSync(path.join(checkout, 'VERSION'), `${version}\n`);
  git(['commit', '--allow-empty', '-m', 'fixture release commit'], checkout);
  const commit = git(['rev-parse', 'HEAD'], checkout);
  git(['remote', 'add', 'origin', '../origin.git'], checkout);
  if (kind === 'different commit') git(['commit', '--allow-empty', '-m', 'fixture other commit'], checkout);
  if (kind === 'lightweight' || kind === 'different commit') git(['tag', tag], checkout);
  if (kind === 'annotated') git(['tag', '-a', tag, '-m', 'fixture annotated release'], checkout);
  if (['lightweight', 'annotated', 'different commit'].includes(kind)) {
    git(['push', 'origin', `refs/tags/${tag}`], checkout);
  }
  if (kind === 'annotated') {
    assert.notEqual(git(['rev-parse', `refs/tags/${tag}`], checkout), commit);
    assert.equal(git(['rev-parse', `refs/tags/${tag}^{}`], checkout), commit);
  }
  if (kind === 'remote failure') git(['remote', 'set-url', 'origin', '../missing-origin.git'], checkout);
  return { origin, checkout, env: { ...env, GITHUB_SHA: commit, GITHUB_REPOSITORY: 'fixture/local' }, git };
}

for (const [kind, succeeds] of [
  ['missing tag', true],
  ['lightweight', true],
  ['annotated', true],
  ['different commit', false],
  ['remote failure', false],
]) {
  test(`release version guard handles ${kind} with real Bash and a local Git origin`, (t) => {
    const f = fixture(t, kind);
    const refs = () => f.git(['--git-dir', f.origin, 'for-each-ref', '--format=%(refname) %(objectname)']);
    const before = refs();
    const publishLog = path.join(f.checkout, 'publish-actions.log');
    const script = [
      'export PATH="/usr/bin:/bin:$PATH"',
      'gh() { printf "%s\\n" "$*" >> publish-actions.log; return 97; }',
      guardScript(),
      'printf "GUARD_PASSED\\n"',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(f.checkout, 'tag-guard.sh'), script);
    const result = spawnSync(bashPath(), ['--noprofile', '--norc', '-e', 'tag-guard.sh'], {
      cwd: f.checkout,
      env: f.env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    if (succeeds) {
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /GUARD_PASSED/);
    } else {
      assert.notEqual(result.status, 0, 'the guard silently continued after failure');
      assert.doesNotMatch(result.stdout, /GUARD_PASSED/);
      if (kind === 'different commit') assert.match(result.stdout, /different commit/);
      if (kind === 'remote failure') assert.match(result.stderr, /missing-origin\.git/);
    }
    assert.equal(fs.existsSync(publishLog), false, 'the guard invoked a GitHub action');
    assert.equal(refs(), before, 'the guard modified remote refs');
  });
}
