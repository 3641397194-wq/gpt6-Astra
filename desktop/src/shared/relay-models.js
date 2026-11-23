'use strict';

((root, build) => {
  const models = build();
  if (typeof module === 'object' && module.exports) module.exports = models;
  else root.ColdCoffeeRelayModels = models;
})(globalThis, () => {
  const families = Object.freeze([
    Object.freeze({ key: 'astra', name: 'GPT-6.2 Astra', mark: 'A', rank: 0, match: k => k === 'gpt62astra' }),
    Object.freeze({ key: 'sol', name: 'GPT-6.2 Sol', mark: 'S', rank: 1, match: k => k === 'gpt62sol' }),
    Object.freeze({ key: 'glm54', name: 'GLM-5.4', mark: 'G', rank: 2, match: k => k === 'glm54' }),
    Object.freeze({ key: 'fable52', name: 'Claude Fable 5.2', mark: 'F', rank: 3, match: k => k === 'claudefable52' || k === 'fable52' }),
    Object.freeze({ key: 'gemini4', name: 'Gemini 4', mark: '4', rank: 4, match: k => /^gemini4(?:carbon|neon|hydrogen|argon)?$/.test(k) }),
  ]);
  const modelKey = value => typeof value === 'string' ? value.toLowerCase().replace(/[-. _]/g, '') : '';
  const nameFromId = id => typeof id === 'string' ? id.slice(id.indexOf('/') + 1) : '';
  const candidates = model => typeof model === 'string'
    ? [model, nameFromId(model)]
    : model && !model.group ? [model.name, nameFromId(model.name), nameFromId(model.id)] : [];

  function familyFor(model) {
    const keys = candidates(model).map(modelKey);
    return families.find(family => keys.some(family.match));
  }

  function label(model) {
    return familyFor(model)?.name || (typeof model === 'string' ? model : model?.name || model?.id || '');
  }

  function rank(model) {
    const family = familyFor(model);
    if (family) return family.rank;
    const legacy = candidates(model).map(modelKey);
    if (legacy.includes('gpt6astra')) return 5;
    if (legacy.includes('gpt61sol')) return 6;
    if (legacy.includes('deepseekflash')) return 7;
    return 8;
  }

  function prefer(models, previous = '') {
    const idOf = model => typeof model === 'string' ? model : model.id;
    return models.find(model => idOf(model) === previous)
      || models.reduce((best, model) => !best || rank(model) < rank(best) ? model : best, undefined);
  }

  return Object.freeze({ families, familyFor, label, prefer });
});
