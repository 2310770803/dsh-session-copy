#!/usr/bin/env node
/**
 * Validate index.json and show what a host would install from it.
 *
 * The rules are not re-implemented here: when the real validator
 * (@deepseek-ai/dsh-plugin-market-index) can be resolved, it is used, because
 * "our index passes our own check" is worth nothing if the host disagrees. Pass
 * its location explicitly when it lives inside an installed DSH app:
 *
 *   node scripts/check-index.mjs --validator "C:/path/to/dsh-plugin-market-index"
 *
 * Without it, the structural fallback below still catches a missing field, an
 * unpinned commit, and a version that is not exact SemVer — it just cannot
 * promise the document matches format 1 byte for byte.
 *
 * Usage
 *   node scripts/check-index.mjs [index.json] [--validator <dir>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const validatorAt = argv.indexOf('--validator');
const validatorDir = validatorAt === -1 ? null : argv[validatorAt + 1];
const fileArg = argv.find((arg, index) => !arg.startsWith('--') && index !== validatorAt + 1);
const indexPath = resolve(PLUGIN_ROOT, fileArg ?? 'index.json');

const index = JSON.parse(readFileSync(indexPath, 'utf8'));

/** Load the host's own validator, or null when it is not available here. */
async function hostValidator() {
  const candidates = [validatorDir, '@deepseek-ai/dsh-plugin-market-index'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith('@')
        ? candidate
        : pathToFileURL(join(resolve(candidate), 'lib', 'index.js')).href;
      return await import(specifier);
    } catch {
      // Try the next candidate: a bare specifier needs node_modules on the
      // resolution path, an explicit directory needs semver beside it.
    }
  }
  return null;
}

/**
 * The subset of format 1 this file itself produces, checked without the
 * validator: enough to catch an edit that breaks the index.
 */
function structuralCheck(document) {
  const problems = [];
  if (document.format !== 1) problems.push('format must be 1');
  if (typeof document.title !== 'object' || typeof document.title?.en !== 'string') {
    problems.push('title.en is required');
  }
  const declared = new Set(Object.keys(document.metadata?.categories ?? {}));
  const names = new Set();
  for (const plugin of document.plugins ?? []) {
    if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(plugin.name ?? '')) {
      problems.push(`${String(plugin.name)} is not a valid package name`);
    }
    if (names.has(plugin.name)) problems.push(`${plugin.name} is listed twice`);
    names.add(plugin.name);
    if (plugin.metadata?.category !== undefined && !declared.has(plugin.metadata.category)) {
      problems.push(`${plugin.name} uses undeclared category ${String(plugin.metadata.category)}`);
    }
    if (typeof plugin.icon === 'string' && !plugin.icon.startsWith('data:') && !plugin.icon.startsWith('https:')) {
      problems.push(`${plugin.name} icon must be https or a data URL`);
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      problems.push(`${plugin.name} declares no versions`);
      continue;
    }
    for (const version of plugin.versions) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version.version ?? '')) {
        problems.push(`${plugin.name}: version ${String(version.version)} is not exact SemVer`);
      }
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) {
        problems.push(`${plugin.name}@${version.version}: publishTimestamp must be Unix seconds`);
      }
      if (version.source?.type === 'git') {
        if (!/^[0-9a-f]{40}$/u.test(version.source.commit ?? '')) {
          problems.push(`${plugin.name}@${version.version}: git source needs a 40-hex commit`);
        }
      } else if (version.source?.type !== 'npm') {
        problems.push(`${plugin.name}@${version.version}: source.type must be npm or git`);
      }
    }
  }
  return problems;
}

const host = await hostValidator();
const problems = structuralCheck(index);
if (problems.length > 0) {
  console.error('index.json is not valid:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

let validated = index;
if (host === null) {
  console.log('validator: not resolved — structural checks only');
  console.log('  pass --validator <dir> to run the host\'s own parser');
} else {
  validated = host.parseMarketIndex(
    index,
    'https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json',
  );
  console.log('validator: @deepseek-ai/dsh-plugin-market-index — accepted');
}

for (const plugin of validated.plugins) {
  console.log(`plugin ${plugin.name} — ${Object.entries(plugin.title ?? {}).map(([k, v]) => `${k}:${v}`).join(' / ')}`);
  console.log(`  category ${plugin.metadata.category ?? '(none)'} · keywords ${plugin.metadata.keywords.join(',')}`);
  console.log(`  icon ${plugin.icon}`);
  for (const version of plugin.versions) {
    const target = host === null
      ? `git+${version.source.url}#${version.source.commit}`
      : JSON.stringify(host.marketInstallTarget(plugin.name, version));
    console.log(`  ${version.version} (${new Date(version.publishTimestamp * 1000).toISOString()}) install → ${target}`);
    console.log(`    engines ${JSON.stringify(version.engines)}`);
  }
}

const indexUrl = 'https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json';
if (existsSync(indexPath)) console.log(`bytes ${Buffer.byteLength(readFileSync(indexPath, 'utf8'))}`);
console.log(`add in DSH: 插件 → 发现 → 索引源 → ${indexUrl}`);
console.log('OK');
