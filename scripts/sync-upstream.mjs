import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Converter } from '@willh/opencc-js';

const upstreamPath = resolve('src/data/upstream-data.json');
const targetPath = resolve('src/data/data.json');

const converter = Converter({ from: 'cn', to: 'tw' });
const convertText = (text) => {
  if (typeof text !== 'string') return text;
  if (text === 'cn') return 'zh-tw';
  return converter(text);
};

const stableStringify = (val) => {
  if (Array.isArray(val)) {
    return `[${val.map(stableStringify).join(',')}]`;
  }
  if (val && typeof val === 'object') {
    return `{${Object.keys(val).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`).join(',')}}`;
  }
  return JSON.stringify(val);
};

const convertNode = (node) => {
  if (Array.isArray(node)) return node.map(convertNode);
  if (node && typeof node === 'object') {
    const out = {};
    Object.entries(node).forEach(([key, value]) => {
      const nextKey = key === 'cn' ? 'zh-tw' : key;
      out[nextKey] = convertNode(value);
    });
    return out;
  }
  return convertText(node);
};

const mergeArrayUnique = (base = [], incoming = []) => {
  const result = [...base];
  const seen = new Set(base.map(stableStringify));
  incoming.forEach((item) => {
    const key = stableStringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });
  return result;
};

const mergeCategories = (baseCats = {}, upstreamCats = {}) => {
  const merged = { ...baseCats };
  Object.entries(upstreamCats).forEach(([id, cat]) => {
    if (!merged[id]) {
      merged[id] = cat;
    }
  });
  return merged;
};

const mergeBanks = (baseBanks = {}, upstreamBanks = {}) => {
  const merged = { ...baseBanks };
  Object.entries(upstreamBanks).forEach(([key, bank]) => {
    if (!merged[key]) {
      merged[key] = bank;
      return;
    }
    const baseBank = merged[key];
    baseBank.options = mergeArrayUnique(baseBank.options || [], bank.options || []);
  });
  return merged;
};

const mergeTemplates = (baseTemplates = [], upstreamTemplates = []) => {
  const existingIds = new Set(baseTemplates.map((tpl) => tpl.id));
  const additions = upstreamTemplates.filter((tpl) => !existingIds.has(tpl.id));
  return [...baseTemplates, ...additions];
};

const main = () => {
  const upstreamRaw = JSON.parse(readFileSync(upstreamPath, 'utf8'));
  const upstream = convertNode(upstreamRaw);

  const base = JSON.parse(readFileSync(targetPath, 'utf8'));

  const merged = {
    ...base,
    categories: mergeCategories(base.categories, upstream.categories),
    banks: mergeBanks(base.banks, upstream.banks),
    templates: mergeTemplates(base.templates, upstream.templates)
  };

  writeFileSync(targetPath, JSON.stringify(merged, null, 2));
  console.log('Updated data.json with upstream additions.');

  const syncResult = spawnSync('node', [resolve('scripts/sync-data.mjs')], { stdio: 'inherit' });
  if (syncResult.status !== 0) {
    throw new Error('sync-data.mjs failed');
  }
};

main();
