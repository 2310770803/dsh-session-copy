#!/usr/bin/env node
/**
 * Prove the index is findable: run the host's own search code over it.
 *
 * check-index.mjs answers "is this a valid index". This answers the different
 * question a submitter actually cares about — "does typing a word into Discover
 * surface my plugin". It uses two real host modules rather than imitating them:
 *
 *   parseMarketIndex  @deepseek-ai/dsh-plugin-market-index — what Discover runs
 *                     on a fetched document. It also fills defaults such as
 *                     metadata.labels, so searching the raw file would test a
 *                     document the running app never sees.
 *   MarketSearch      @deepseek-ai/dsh-plugin-market — the class Discover
 *                     builds per index and calls select() on per query.
 *
 * MiniSearch, the third-party indexer underneath, is stubbed. The field list,
 * boosts, prefix and tokenizer all come from the section extracted out of the
 * host module, so the stub follows the host's configuration instead of
 * inventing one. A pass therefore means the host's own ranking would return the
 * plugin for that query; it is not a claim about MiniSearch's exact scoring.
 *
 * Usage
 *   node scripts/search-index.mjs --market <dir> [--validator <dir>] [query...]
 *
 *   --market     directory containing @deepseek-ai/dsh-plugin-market (its lib/)
 *   --validator  directory containing @deepseek-ai/dsh-plugin-market-index
 *   queries      terms to try; defaults to a representative set
 *
 * Both host packages live inside an installed DSH app; extract them from
 * resources/app.asar under dsh/node_modules/@deepseek-ai/.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_FILE = join(PLUGIN_ROOT, 'index.json');
const INDEX_URL = 'https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json';

const DEFAULT_QUERIES = [
  'session copy',
  'copy',
  'session',
  'clipboard',
  'markdown',
  'deep link',
  'header',
  '2310770803',
  '会话复制',
  '复制菜单',
];

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? null : argv[at + 1];
};
const marketDir = valueOf('--market');
const validatorDir = valueOf('--validator');

if (marketDir === null) {
  console.error('--market <dir> is required: point it at a directory holding @deepseek-ai/dsh-plugin-market');
  process.exit(1);
}

const queries = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--market' && argv[index - 1] !== '--validator');
if (queries.length === 0) queries.push(...DEFAULT_QUERIES);

const raw = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));

/** Parse the document exactly as the host does, so defaults are present. */
async function validatedIndex() {
  if (validatorDir === null) return normalize(raw);
  try {
    const mod = await import(pathToFileURL(join(resolve(validatorDir), 'lib', 'index.js')).href);
    return mod.parseMarketIndex(raw, new URL(INDEX_URL));
  } catch (error) {
    console.warn(`validator not usable (${error.message}) — normalizing the raw document instead`);
    return normalize(raw);
  }
}

/**
 * The defaults parseMarketIndex fills in. Without them the search half throws
 * on `metadata.labels` before it can index anything, so a missing validator
 * would look like a search failure. Only the fields the tokenizer indexes are
 * defaulted; everything that decides validity still comes from check-index.mjs.
 */
function normalize(document) {
  return {
    ...document,
    metadata: {
      categories: {},
      labels: {},
      ...document.metadata,
    },
    plugins: (document.plugins ?? []).map((plugin) => ({
      ...plugin,
      title: plugin.title ?? {},
      description: plugin.description ?? {},
      metadata: { labels: [], keywords: [], ...plugin.metadata },
    })),
  };
}

const index = await validatedIndex();

/** The search half of the market module, lifted out of its bundle. */
function loadMarketSearch() {
  const source = readFileSync(join(resolve(marketDir), 'lib', 'index.js'), 'utf8');
  // The constants the tokenizer closes over come first; the class follows.
  const start = source.indexOf('const CJK =');
  const end = source.indexOf('//#endregion', start);
  if (start === -1 || end === -1) throw new Error('could not locate the search section in the market module');
  const section = source.slice(start, end);

  const MiniSearch = class {
    constructor(options) {
      this.options = options;
      this.docs = new Map();
    }
    addAllAsync(docs) {
      for (const doc of docs) this.docs.set(doc.id, doc);
      return Promise.resolve();
    }
    search(query) {
      const terms = searchTerms(query).map((term) => term.toLowerCase());
      const { fields, searchOptions } = this.options;
      const hits = [];
      for (const [id, doc] of this.docs) {
        // The host asks MiniSearch to combine terms with AND, so a document
        // that matches only one word of a multi-word query is not a hit. Get
        // this wrong and the check passes on queries the app would not answer.
        let total = 0;
        let matchedEveryTerm = true;
        for (const term of terms) {
          let best = 0;
          for (const field of fields) {
            // The host tokenizes document text with the same function it uses
            // for queries, which is what makes CJK searches work at all.
            const words = searchTerms(String(doc[field] ?? '')).map((word) => word.toLowerCase());
            const boost = searchOptions.boost[field] ?? 1;
            if (words.includes(term)) best = Math.max(best, boost * 2);
            else if (searchOptions.prefix && words.some((word) => word.startsWith(term))) best = Math.max(best, boost);
          }
          if (best === 0) matchedEveryTerm = false;
          total += best;
        }
        if (matchedEveryTerm && total > 0) hits.push({ id, score: total });
      }
      return hits.sort((a, b) => b.score - a.score);
    }
  };

  const factory = new Function('MiniSearch', `${section}\nreturn { searchTerms, MarketSearch }`);
  return factory(MiniSearch);
}

const { searchTerms, MarketSearch } = loadMarketSearch();
const search = new MarketSearch(index);
await search.build();

const category = index.metadata?.categories?.[index.plugins[0]?.metadata?.category ?? '']?.title ?? {};
console.log(`index: ${index.plugins.length} plugin(s) · category ${JSON.stringify(category)}`);

let missed = 0;
for (const query of queries) {
  // This is the shape Discover passes: text, label filters, and an order.
  const hits = await search.select({ text: query, labels: [], sort: { kind: 'relevance' } });
  const names = hits.map((hit) => hit.name);
  const found = names.includes(index.plugins[0].name);
  if (!found) missed += 1;
  console.log(`${found ? 'found' : 'MISS '}  ${query.padEnd(14)} → ${hits.length} hit(s)${names.length > 0 ? `: ${names.join(', ')}` : ''}`);
}

if (missed === 0) console.log('OK — every query returns the plugin');
else console.log(`FAIL — ${missed} quer${missed === 1 ? 'y' : 'ies'} did not`);
process.exit(missed === 0 ? 0 : 1);
