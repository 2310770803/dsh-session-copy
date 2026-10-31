#!/usr/bin/env node
/**
 * Validate the stylesheet this plugin injects into the page.
 *
 * The rules live inside a JavaScript string, so `node --check` cannot see them.
 * That matters because the failure mode is silent and expensive: a rule spliced
 * into the middle of another rule makes the CSS parser swallow every rule that
 * follows inside the swallowed block, and the only symptom is that some classes
 * quietly render as unstyled browser defaults. That exact defect shipped once —
 * the picker chips lost their styling and `node --check` was clean.
 *
 * Checks:
 *   1. braces balance;
 *   2. a declaration block never contains another block (at-rules may);
 *   3. every selector has a plausible prelude;
 *   4. a declaration never runs into the next selector;
 *   5. every class name the client assigns through `CSS` has a rule.
 *
 * Usage: node scripts/check-stylesheet.mjs [plugin-root]
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');

/** Read the concatenated string literal that `installStyle` injects. */
export function readStylesheet(root) {
  const clientPath = join(root, 'lib', 'client.js');
  if (!existsSync(clientPath)) throw new Error(`no client bundle at ${clientPath}`);
  const client = readFileSync(clientPath, 'utf8');

  const start = client.indexOf('const STYLE = ');
  const end = client.indexOf('function installStyle');
  if (start < 0 || end < 0) throw new Error('could not locate the STYLE declaration in lib/client.js');

  const css = client.slice(start, end)
    .split(/\r?\n/u)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    // An apostrophe in a comment would otherwise be read as a string delimiter.
    .match(/'[^'\n]*'/gu)
    .map((quoted) => quoted.slice(1, -1))
    .join('');

  return { css, client };
}

/** Classes the client refers to through its `CSS` map. */
function declaredClasses(client) {
  const map = /const CSS = \{([\s\S]*?)\n      \};/u.exec(client);
  if (map === null) return [];
  return [...map[1].matchAll(/:\s*'(dshSessionCopy[A-Za-z0-9]*)'/gu)].map((match) => match[1]);
}

/**
 * Walk the stylesheet and report structural problems.
 * @param {string} css
 * @returns {string[]}
 */
export function findStylesheetProblems(css) {
  const problems = [];

  /** Stack of open blocks: `{ at: boolean, prelude: string, line: number }`. */
  const stack = [];
  let prelude = '';
  let line = 1;

  for (let index = 0; index < css.length; index++) {
    const character = css[index];
    if (character === '\n') { line++; continue; }
    if (character === '{') {
      const text = prelude.trim();
      const at = text.startsWith('@');
      // A declaration block belongs to a selector; a block inside it is the
      // corruption this check exists for. At-rules may legitimately contain
      // rules, so they are exempt.
      const parent = stack[stack.length - 1];
      if (parent !== undefined && !parent.at) {
        problems.push(`nested "{" inside the declaration block of ${JSON.stringify(parent.prelude.slice(0, 40))} near line ${line}`);
      }
      if (text === '') problems.push(`empty selector before "{" near line ${line}`);
      stack.push({ at, prelude: text, line });
      prelude = '';
      continue;
    }
    if (character === '}') {
      const closed = stack.pop();
      if (closed === undefined) problems.push(`stray "}" near line ${line}`);
      prelude = '';
      continue;
    }
    if (character === ';' && stack.length > 0 && !stack[stack.length - 1].at) {
      prelude = '';
      continue;
    }
    prelude += character;
  }

  for (const open of stack) {
    problems.push(`unclosed block ${JSON.stringify(open.prelude.slice(0, 40))} opened on line ${open.line}`);
  }

  // A declaration that runs into the next selector looks like `foo:1px;.bar{`.
  const runaway = /;[ \t]*\.?[A-Za-z@][^{};]*\{/u.exec(css);
  if (runaway !== null && !/;\s*\}/u.test(runaway[0])) {
    // `@media` and friends legitimately follow a closing brace, not a `;`.
    const before = css.slice(Math.max(0, runaway.index - 60), runaway.index + 40);
    if (!/;\s*(@media|@supports|@container)/u.test(runaway[0])) {
      problems.push(`a declaration may run into the next selector near: ${JSON.stringify(before)}`);
    }
  }

  return problems;
}

function main() {
  const root = resolve(process.argv[2] ?? DEFAULT_ROOT);
  const { css, client } = readStylesheet(root);
  const problems = findStylesheetProblems(css);

  const selectors = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/gu)].map((match) => match[1]));
  const declared = declaredClasses(client);
  for (const name of declared) {
    if (!selectors.has(name)) problems.push(`class "${name}" is assigned by the client but has no rule`);
  }

  console.log(`stylesheet ${css.length} bytes · ${selectors.size} class selectors · ${declared.length} CSS keys · ${root}`);
  if (problems.length === 0) {
    console.log('OK — well-formed, and every assigned class has a rule');
    return 0;
  }
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log('  -', problem);
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
