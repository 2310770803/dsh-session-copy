#!/usr/bin/env node
/**
 * Install, refresh, verify or remove dsh-session-copy in a DSH profile.
 *
 * The plugin ships as a "dual-face bundle": a Host patch (`dsh.bundle.patch`)
 * plus a browser module (`dsh.client`). DSH resolves such a bundle by looking
 * the package name up in the profile's `node_modules`, so installing means
 * (a) placing the package there and (b) listing its name in
 * `dsh.profile.bundles`. No package manager run is required, and none is
 * performed: the plugin declares no runtime dependencies, so there is nothing
 * to resolve.
 *
 * Usage
 *   node scripts/install.mjs                 install or refresh (default profile: desktop)
 *   node scripts/install.mjs --check         report installation health, change nothing
 *   node scripts/install.mjs --uninstall     remove the plugin from the profile
 *   node scripts/install.mjs --dry-run       print the plan without writing
 *
 * Options
 *   --profile <name>   DSH profile name (default: desktop)
 *   --home <path>      DSH home (default: $DSH_HOME, else ~/.dsh)
 *   --keep <n>         backups to retain (default: 10)
 *
 * Every run backs up the two files it may rewrite into
 * `<profile>/.dsh-session-copy-backup/<timestamp>/`, so a bad install is a
 * file copy away from being undone.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_NAME = 'dsh-session-copy';
const BACKUP_DIRNAME = '.dsh-session-copy-backup';
const CLIENT_EXPORT = './client';

/** Package names an earlier release of this plugin installed under. */
const LEGACY_PACKAGES = ['dsh-session-actions'];

/** Files and directories that make up the installed package. */
const PAYLOAD = ['package.json', 'cordis.patch.yml', 'icon.svg', 'locale', 'README.md', 'src', 'lib'];

// ------------------------------------------------------------------ arguments

function parseArgs(argv) {
  const options = { profile: 'desktop', home: undefined, keep: 10, check: false, uninstall: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--profile') options.profile = argv[++index];
    else if (flag === '--home') options.home = argv[++index];
    else if (flag === '--keep') options.keep = Number(argv[++index]);
    else if (flag === '--check') options.check = true;
    else if (flag === '--uninstall') options.uninstall = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--help' || flag === '-h') {
      process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
      process.exit(0);
    } else throw new Error(`unknown option ${JSON.stringify(flag)}`);
  }
  if (typeof options.profile !== 'string' || options.profile === '') throw new Error('--profile needs a name');
  if (!Number.isInteger(options.keep) || options.keep < 1) throw new Error('--keep needs a positive integer');
  return options;
}

function resolveHome(explicit) {
  if (explicit !== undefined) return resolve(explicit);
  const fromEnvironment = process.env.DSH_HOME;
  if (typeof fromEnvironment === 'string' && fromEnvironment.trim() !== '') return resolve(fromEnvironment);
  return join(homedir(), '.dsh');
}

// -------------------------------------------------------------------- helpers

function readJson(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/u, '');
  return JSON.parse(text);
}

/** Write JSON the way DSH writes manifests: two-space indent, trailing newline. */
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8');
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

/** Replace a file atomically so an interrupted run never leaves a truncated manifest. */
function replaceFile(path, contents) {
  const temporary = `${path}.session-copy.tmp`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

function backup(profileDir, files, keep, dryRun) {
  const present = files.filter((file) => existsSync(file));
  if (present.length === 0) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const directory = join(profileDir, BACKUP_DIRNAME, stamp);
  if (!dryRun) {
    mkdirSync(directory, { recursive: true });
    for (const file of present) cpSync(file, join(directory, basename(file)));
    pruneBackups(profileDir, keep);
  }
  return directory;
}

function pruneBackups(profileDir, keep) {
  const root = join(profileDir, BACKUP_DIRNAME);
  if (!existsSync(root)) return;
  const entries = readdirSync(root)
    .map((name) => ({ name, path: join(root, name) }))
    .filter((entry) => {
      try {
        return statSync(entry.path).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries.slice(0, Math.max(0, entries.length - keep))) {
    rmSync(entry.path, { recursive: true, force: true });
  }
}

/** Refuse to delete anything that is not exactly a package we installed. */
function assertOwnedInstallDir(target, name = PACKAGE_NAME) {
  const parts = resolve(target).split(sep);
  const ok = parts.at(-1) === name && parts.at(-2) === 'node_modules';
  if (!ok) throw new Error(`refusing to modify ${JSON.stringify(target)}: not a node_modules/${name} directory`);
}

/** The exact shape DSH's client-modules scan validates, checked before we write anything. */
function inspectPayload() {
  const manifestPath = join(PLUGIN_ROOT, 'package.json');
  const manifest = readJson(manifestPath);
  const problems = [];
  if (manifest.name !== PACKAGE_NAME) problems.push(`package.json name must be ${PACKAGE_NAME}`);
  const bundle = manifest.dsh?.bundle;
  if (bundle === undefined) problems.push('package.json is missing dsh.bundle');
  else {
    const declared = typeof bundle.patch === 'string' ? [bundle.patch] : bundle.patch;
    if (!Array.isArray(declared) || declared.length === 0) problems.push('dsh.bundle.patch must name at least one file');
    else for (const file of declared) {
      if (typeof file !== 'string') problems.push('dsh.bundle.patch entries must be strings');
      else if (!existsSync(join(PLUGIN_ROOT, file))) problems.push(`dsh.bundle.patch target is missing: ${file}`);
    }
  }
  const client = manifest.dsh?.client;
  if (client === undefined) problems.push('package.json is missing dsh.client');
  else {
    if (client.platform !== 'web') problems.push(`dsh.client.platform must be "web", found ${JSON.stringify(client.platform)}`);
    if (client.inject !== undefined && (!Array.isArray(client.inject) || client.inject.some((entry) => typeof entry !== 'string'))) {
      problems.push('dsh.client.inject must be an array of strings');
    }
    const exported = manifest.exports?.[CLIENT_EXPORT];
    const relative = typeof exported === 'string' ? exported : exported?.default;
    if (typeof relative !== 'string') problems.push(`exports[${JSON.stringify(CLIENT_EXPORT)}] must be a string or an object with a string default`);
    else if (!existsSync(join(PLUGIN_ROOT, relative))) problems.push(`the client bundle is missing: ${relative}`);
  }
  return { manifest, problems };
}

// ------------------------------------------------------------------ operations

function plan(options) {
  const home = resolveHome(options.home);
  const profileDir = join(home, 'profiles', options.profile);
  const manifestPath = join(profileDir, 'package.json');
  const patchPath = join(profileDir, 'cordis.patch.yml');
  const installDir = join(profileDir, 'node_modules', PACKAGE_NAME);
  return { home, profileDir, manifestPath, patchPath, installDir };
}

function copyPayload(installDir, dryRun) {
  if (!dryRun) {
    assertOwnedInstallDir(installDir);
    rmSync(installDir, { recursive: true, force: true });
    mkdirSync(installDir, { recursive: true });
    for (const entry of PAYLOAD) {
      const from = join(PLUGIN_ROOT, entry);
      if (existsSync(from)) cpSync(from, join(installDir, entry), { recursive: true });
    }
  }
}

function install(options) {
  const { profileDir, manifestPath, patchPath, installDir } = plan(options);
  if (!existsSync(manifestPath)) {
    throw new Error(`no DSH profile manifest at ${manifestPath}; pass --home/--profile or start DSH once to create the profile`);
  }

  const { manifest: payloadManifest, problems } = inspectPayload();
  if (problems.length > 0) throw new Error(`the plugin payload is not installable:\n  - ${problems.join('\n  - ')}`);

  const profile = readJson(manifestPath);
  profile.dsh ??= {};
  profile.dsh.profile ??= {};
  const declared = Array.isArray(profile.dsh.profile.bundles) ? [...profile.dsh.profile.bundles] : [];
  // A renamed package must not stay listed under its old name: the Loader would
  // try to mount a bundle whose files no longer exist, and the scan would fail.
  const retiredBundles = declared.filter((entry) => LEGACY_PACKAGES.includes(entry));
  const bundles = declared.filter((entry) => !LEGACY_PACKAGES.includes(entry));
  const alreadyListed = bundles.includes(PACKAGE_NAME);
  if (!alreadyListed) bundles.push(PACKAGE_NAME);
  profile.dsh.profile.bundles = bundles;

  profile.dependencies ??= {};
  // A relative `file:` specifier keeps the profile manifest self-consistent
  // without ever resolving to a registry copy. The plugin declares no runtime
  // dependencies and marks every DSH peer optional, so even a full
  // `pnpm install` here cannot project a shadowing @deepseek-ai/* package.
  const dependency = `file:../../plugins/${PACKAGE_NAME}`;
  const dependencyChanged = profile.dependencies[PACKAGE_NAME] !== dependency;
  profile.dependencies[PACKAGE_NAME] = dependency;
  const retiredDependencies = LEGACY_PACKAGES.filter(
    (name) => Object.prototype.hasOwnProperty.call(profile.dependencies, name),
  );
  for (const name of retiredDependencies) delete profile.dependencies[name];

  const backupDir = backup(profileDir, [manifestPath, patchPath], options.keep, options.dryRun);

  if (!options.dryRun) {
    // Order matters: the package must exist in node_modules *before* its name
    // reaches dsh.profile.bundles, because a listed bundle whose client bundle
    // is missing is a client-modules composition failure.
    copyPayload(installDir, false);
    for (const name of LEGACY_PACKAGES) {
      const legacyDir = join(profileDir, 'node_modules', name);
      if (!existsSync(legacyDir)) continue;
      assertOwnedInstallDir(legacyDir, name);
      rmSync(legacyDir, { recursive: true, force: true });
    }
    replaceFile(manifestPath, `${JSON.stringify(profile, undefined, 2)}\n`);
  }

  const retired = [...new Set([...retiredBundles, ...retiredDependencies])];
  process.stdout.write([
    `${options.dryRun ? 'would install' : 'installed'} ${PACKAGE_NAME}@${payloadManifest.version}`,
    `  profile        ${profileDir}`,
    `  package        ${installDir}`,
    `  bundles        ${bundles.join(', ')}`,
    `  dependency     ${PACKAGE_NAME}: ${dependency}${dependencyChanged ? '' : ' (unchanged)'}`,
    retired.length === 0 ? '  retired        (nothing)' : `  retired        ${retired.join(', ')}`,
    backupDir === undefined ? '  backup         (nothing to back up)' : `  backup         ${backupDir}`,
    '',
  ].join('\n'));
}

function uninstall(options) {
  const { profileDir, manifestPath, patchPath, installDir } = plan(options);
  if (!existsSync(manifestPath)) throw new Error(`no DSH profile manifest at ${manifestPath}`);

  const profile = readJson(manifestPath);
  const bundles = Array.isArray(profile.dsh?.profile?.bundles) ? [...profile.dsh.profile.bundles] : [];
  const listed = bundles.includes(PACKAGE_NAME);
  const nextBundles = bundles.filter((entry) => entry !== PACKAGE_NAME);
  if (listed) {
    profile.dsh.profile.bundles = nextBundles;
    // `bundles` drives the client-modules scan; if it is left empty DSH still
    // needs the key present, so keep the array rather than deleting it.
  }
  const hadDependency = Object.prototype.hasOwnProperty.call(profile.dependencies ?? {}, PACKAGE_NAME);
  if (hadDependency) delete profile.dependencies[PACKAGE_NAME];

  const backupDir = backup(profileDir, [manifestPath, patchPath], options.keep, options.dryRun);

  if (!options.dryRun) {
    // Uninstall reverses the install order: the name leaves the bundle list
    // first, so no boot ever sees a listed bundle with missing files.
    if (listed || hadDependency) replaceFile(manifestPath, `${JSON.stringify(profile, undefined, 2)}\n`);
    if (existsSync(installDir)) {
      assertOwnedInstallDir(installDir);
      rmSync(installDir, { recursive: true, force: true });
    }
  }

  process.stdout.write([
    `${options.dryRun ? 'would remove' : 'removed'} ${PACKAGE_NAME}`,
    `  profile        ${profileDir}`,
    `  bundles        ${nextBundles.join(', ') || '(none)'}`,
    `  package        ${existsSync(installDir) && options.dryRun ? installDir : '(deleted)'}`,
    backupDir === undefined ? '  backup         (nothing to back up)' : `  backup         ${backupDir}`,
    '',
  ].join('\n'));
}

function check(options) {
  const { home, profileDir, manifestPath, installDir } = plan(options);
  const lines = [];
  const fail = [];
  const note = (ok, label, detail) => {
    lines.push(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
    if (!ok) fail.push(label);
  };

  note(existsSync(PLUGIN_ROOT), 'source checkout', PLUGIN_ROOT);
  const { problems } = inspectPayload();
  note(problems.length === 0, 'payload matches the dsh.client contract', problems.join('; ') || undefined);

  note(existsSync(manifestPath), 'profile manifest', manifestPath);
  note(existsSync(profileDir), 'profile directory', profileDir);
  if (!existsSync(manifestPath)) {
    process.stdout.write(`${lines.join('\n')}\n`);
    return 1;
  }

  const profile = readJson(manifestPath);
  const bundles = profile.dsh?.profile?.bundles;
  note(Array.isArray(bundles) && bundles.includes(PACKAGE_NAME), 'listed in dsh.profile.bundles');
  note(existsSync(installDir), 'installed package directory', installDir);

  if (existsSync(installDir)) {
    const installed = join(installDir, 'package.json');
    note(existsSync(installed), 'installed manifest');
    if (existsSync(installed)) {
      const manifest = readJson(installed);
      const relative = manifest.exports?.[CLIENT_EXPORT];
      const clientRel = typeof relative === 'string' ? relative : relative?.default;
      note(typeof clientRel === 'string' && existsSync(join(installDir, clientRel)), 'installed client bundle', clientRel);
      note(manifest.dsh?.client?.platform === 'web', 'installed dsh.client.platform is "web"');
      note(manifest.dsh?.bundle !== undefined, 'installed dsh.bundle is declared');
      // The plugin list reads these without evaluating the client bundle, so a
      // missing locale file silently drops the card back to the package name.
      const englishLocale = join(installDir, 'locale', 'en.json');
      note(existsSync(englishLocale), 'installed English display metadata', 'locale/en.json');
      if (existsSync(englishLocale)) {
        const meta = readJson(englishLocale).meta ?? {};
        note(typeof meta.title === 'string' && meta.title !== '', 'locale meta.title', meta.title);
        note(typeof meta.description === 'string' && meta.description !== '', 'locale meta.description');
      }
      const icon = typeof manifest.icon === 'string' ? join(installDir, manifest.icon) : undefined;
      note(icon !== undefined && existsSync(icon), 'installed package icon', manifest.icon);
    }
  }

  // A renamed package leaves its old name behind in both the bundle list and
  // node_modules unless the install cleans it up; either one ends in a boot
  // entry pointing at files that no longer exist.
  for (const name of LEGACY_PACKAGES) {
    note(!existsSync(join(profileDir, 'node_modules', name)), `no leftover ${name} install`);
    note(!(Array.isArray(bundles) && bundles.includes(name)), `no leftover ${name} bundle entry`);
  }

  // A physical @deepseek-ai/dsh* copy inside the profile shadows the built-ins
  // and is the documented way this class of plugin bricks a boot.
  const shadowRoot = join(profileDir, 'node_modules', '@deepseek-ai');
  if (existsSync(shadowRoot)) {
    const shadowed = readdirSync(shadowRoot).filter((name) => name.startsWith('dsh'));
    note(shadowed.length === 0, 'no shadowing @deepseek-ai/dsh* copy in the profile',
      shadowed.length === 0 ? undefined : shadowed.join(', '));
  } else {
    note(true, 'no shadowing @deepseek-ai/dsh* copy in the profile');
  }

  note(existsSync(home), 'DSH home', home);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (fail.length > 0) process.stdout.write(`\n${fail.length} check(s) failed.\n`);
  return fail.length === 0 ? 0 : 1;
}

// ------------------------------------------------------------------------ main

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) process.exitCode = check(options);
  else if (options.uninstall) uninstall(options);
  else install(options);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${PACKAGE_NAME}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
