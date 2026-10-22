'use strict';

const os = require('node:os');
const path = require('node:path');

// Matches @deepseek-ai/dsh-home-paths: blank env values fall back, but a
// nonblank path is preserved verbatim. Shared DSH_AGENTS_HOME is not a target.
function deepseekHarnessHome({ env = process.env, home = os.homedir(), cwd = process.cwd(), override, pathApi = path } = {}) {
  const configured = env.DSH_HOME;
  let selected = override ?? (typeof configured === 'string' && configured.trim().length > 0
    ? configured
    : pathApi.join(home, '.dsh'));
  if (selected === '~') selected = home;
  else if (selected.startsWith('~/') || selected.startsWith('~\\')) selected = pathApi.join(home, selected.slice(2));
  return pathApi.resolve(cwd, selected);
}

module.exports = { deepseekHarnessHome };
