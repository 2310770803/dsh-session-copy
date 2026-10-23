#!/usr/bin/env node
/**
 * Build a format-1 DSH plugin market index for this plugin.
 *
 * Why: DSH's Plugins -> Discover tab and the `plugin_market` agent tool read
 * "plugin market indexes" — JSON documents validated by
 * @deepseek-ai/dsh-plugin-market-index. The community catalog at
 * awesome-dsh-plugin only publishes npm entries in its own index, so a plugin
 * that is not on npm has no way into Discover through it. Format 1 does support
 * Git sources, pinned to a commit; this script emits exactly that, so the
 * plugin can be browsed and installed from Discover today:
 *
 *   Plugins -> Discover -> Index sources -> add
 *   https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json
 *
 * The pinned commit is the one named by --commit, defaulting to HEAD. Run this
 * before committing `index.json`: the file must not describe the commit that
 * contains it (its own hash would depend on itself), so it points at the last
 * commit that carries the plugin code.
 *
 * Usage
 *   node scripts/build-index.mjs                 write index.json pinned to HEAD
 *   node scripts/build-index.mjs --check         fail if index.json is stale
 *   node scripts/build-index.mjs --commit <sha>  pin an explicit commit
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_FILE = join(PLUGIN_ROOT, 'index.json');
const RAW_BASE = 'https://raw.githubusercontent.com/2310770803/dsh-session-copy/main';

/** The index's own display metadata; not read from the package manifest. */
const INDEX_TITLE = {
  en: 'dsh-session-copy',
  zh: 'dsh-session-copy',
};
const INDEX_DESCRIPTION = {
  en: 'A single-plugin index, so Discover can list this plugin before it is published to npm.',
  zh: '单插件索引：在发布到 npm 之前，也能在「发现」里浏览并安装这个插件。',
};

/** Categories this index declares; a plugin may only reference declared ids. */
const CATEGORIES = {
  session: { title: { en: 'Sessions', zh: '会话' } },
};

function git(...args) {
  return execFileSync('git', args, { cwd: PLUGIN_ROOT, encoding: 'utf8' }).trim();
}

/** The commit the index pins, unless one is named explicitly. */
function resolveCommit(argv) {
  const at = argv.indexOf('--commit');
  if (at !== -1) {
    const named = argv[at + 1];
    if (!named || !/^[0-9a-f]{40}$/u.test(named)) {
      throw new Error('--commit needs a lowercase 40-hex-digit commit SHA');
    }
    return named;
  }
  return git('rev-parse', 'HEAD');
}

/** Unix seconds of a commit, which is the closest thing a Git source has to a publish time. */
function commitTimestamp(commit) {
  return Number(git('show', '-s', '--format=%ct', commit));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The DSH requirement the host checks before installing.
 *
 * Taken from the manifest's own `engines.dsh` when present, else from the
 * lockstep `@deepseek-ai/dsh-*` peer range — both are what the host compares
 * against its version, and declaring one keeps Discover from reporting the
 * entry as "undeclared" when the code does state a requirement.
 */
function dshRequirement(manifest) {
  const declared = manifest.engines?.dsh ?? manifest.dsh?.engines?.dsh;
  if (typeof declared === 'string' && declared.trim() !== '') return declared.trim();
  const peers = Object.entries(manifest.peerDependencies ?? {});
  const lockstep = peers.filter(([name]) => /^@deepseek-ai\/dsh(?:-|$)/u.test(name));
  // Every host peer range is conjunctive in the host's own check; format 1
  // carries a single range, so the narrowest declared one is the honest summary
  // when they differ. In this package they are all the same string.
  const ranges = [...new Set(lockstep.map(([, range]) => range))];
  return ranges.length === 1 ? ranges[0] : undefined;
}

function buildIndex(commit) {
  const manifest = readJson(join(PLUGIN_ROOT, 'package.json'));
  const localeEn = readJson(join(PLUGIN_ROOT, 'locale', 'en.json'));
  const localeZh = readJson(join(PLUGIN_ROOT, 'locale', 'zh.json'));
  const dsh = dshRequirement(manifest);

  const title = {
    en: localeEn.meta?.title ?? manifest.name,
    ...localeZh.meta?.title === undefined ? {} : { zh: localeZh.meta.title },
  };
  const description = {
    en: localeEn.meta?.description ?? manifest.description,
    ...localeZh.meta?.description === undefined ? {} : { zh: localeZh.meta.description },
  };

  return {
    format: 1,
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    metadata: { categories: CATEGORIES },
    plugins: [
      {
        name: manifest.name,
        title,
        description,
        icon: `${RAW_BASE}/assets/icon-180.png`,
        author: '2310770803',
        homepage: `${manifest.homepage.split('#')[0]}#readme`,
        repository: { url: manifest.repository.url.replace(/^git\+/u, '').replace(/\.git$/u, '') },
        metadata: {
          category: 'session',
          keywords: [...(manifest.keywords ?? [])],
        },
        versions: [
          {
            version: manifest.version,
            publishTimestamp: commitTimestamp(commit),
            source: {
              type: 'git',
              url: manifest.repository.url.replace(/^git\+/u, '').replace(/\.git$/u, ''),
              commit,
            },
            ...dsh === undefined ? {} : { engines: { dsh } },
          },
        ],
      },
    ],
  };
}

const argv = process.argv.slice(2);

/** The commit an existing index.json pins, or null when there is none yet. */
function pinnedCommit() {
  try {
    const existing = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
    const commit = existing.plugins?.[0]?.versions?.[0]?.source?.commit;
    return typeof commit === 'string' && /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

if (argv.includes('--check')) {
  // Compare against the commit the file itself pins, not against HEAD: the
  // index is always committed after the code it points at, so regenerating at
  // HEAD would report every committed index as stale.
  const commit = resolveCommit(argv) === git('rev-parse', 'HEAD') && pinnedCommit() !== null
    ? pinnedCommit()
    : resolveCommit(argv);
  const expected = `${JSON.stringify(buildIndex(commit), null, 2)}\n`;
  let existing = '';
  try {
    existing = readFileSync(INDEX_FILE, 'utf8');
  } catch {
    console.error('index.json is missing — run `node scripts/build-index.mjs`');
    process.exit(1);
  }
  if (existing !== expected) {
    console.error(`index.json does not match the manifest pinned at ${commit} — regenerate it`);
    process.exit(1);
  }
  const plugin = JSON.parse(existing).plugins[0];
  console.log(`index.json is current (${plugin.name}@${plugin.versions[0].version} at ${commit})`);
} else {
  const commit = resolveCommit(argv);
  const index = buildIndex(commit);
  writeFileSync(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`wrote index.json — ${index.plugins[0].name}@${index.plugins[0].versions[0].version} pinned at ${commit}`);
  console.log(`add it in DSH: Plugins -> Discover -> Index sources -> ${RAW_BASE.replace('https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net/gh')}/index.json`);
}
