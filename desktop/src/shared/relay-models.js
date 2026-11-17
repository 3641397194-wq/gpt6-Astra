'use strict';

((root, build) => {
  const models = build();
  if (typeof module === 'object' && module.exports) module.exports = models;
  else root.ColdCoffeeRelayModels = models;
})(globalThis, () => {
  const families = Object.freeze([
    Object.freeze({ key: 'astra', name: 'GPT-6.2 Astra', mark: 'A' }),
    Object.freeze({ key: 'sol', name: 'GPT-6.2 Sol', mark: 'S' }),
  ]);
  const modelKey = value => typeof value === 'string' ? value.toLowerCase().replace(/[-. _]/g, '') : '';
  const nameFromId = id => typeof id === 'string' ? id.slice(id.indexOf('/') + 1) : '';
  const candidates = model => typeof model === 'string'
    ? [model, nameFromId(model)]
    : model && !model.group ? [model.name, nameFromId(model.name), nameFromId(model.id)] : [];

  function familyFor(model) {
    const keys = candidates(model).map(modelKey);
    return families.find(family => keys.includes(`gpt62${family.key}`));
  }

  function label(model) {
    return familyFor(model)?.name || (typeof model === 'string' ? model : model?.name || model?.id || '');
  }

  function rank(model) {
    const family = familyFor(model);
    if (family) return families.indexOf(family);
    const legacy = candidates(model).map(modelKey);
    if (legacy.includes('gpt6astra')) return 2;
    if (legacy.includes('gpt61sol')) return 3;
    if (legacy.includes('deepseekflash')) return 4;
    return 5;
  }

  function prefer(models, previous = '') {
    const idOf = model => typeof model === 'string' ? model : model.id;
    return models.find(model => idOf(model) === previous)
      || models.reduce((best, model) => !best || rank(model) < rank(best) ? model : best, undefined);
  }

  return Object.freeze({ families, familyFor, label, prefer });
});
