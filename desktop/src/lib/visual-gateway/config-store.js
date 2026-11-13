'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);

// Only the workbench's own gateway settings use recovery. Client configuration
// is still validated by the connector and never reset by this helper.
function readConfig(file, fallback, validate = object) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { value: fallback, recovered: false };
    throw new Error('网关配置读取失败，请检查文件权限后重试', { cause: error });
  }
  try {
    const value = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (validate(value)) return { value, recovered: false };
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  // Rename first, so failure to preserve the original also prevents reset.
  // This filename is excluded by the repository and package backup patterns.
  try { fs.renameSync(file, file + '.bak-corrupt-' + crypto.randomUUID()); }
  catch (error) { throw new Error('网关配置备份失败，原文件已保留，请检查文件权限后重试', { cause: error }); }
  return { value: fallback, recovered: true };
}

module.exports = { readConfig, object };
