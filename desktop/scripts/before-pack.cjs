'use strict';
module.exports = async context => {
  require('./prepare-licenses.cjs').prepare();
  const arch = typeof context.arch === 'string' ? context.arch : ({ 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' })[context.arch];
  await require('./prepare-magpie.cjs').prepare(context.electronPlatformName, arch);
};
