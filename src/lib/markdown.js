/**
 * Session events -> clean Markdown.
 *
 * This module is deliberately *tolerant*: a DSH release may add, rename or
 * re-shape session events at any time, and this plugin must never be the reason
 * a user cannot start the application or read their own conversation. Every
 * unreadable record is counted and skipped instead of raising.
 *
 * Recognized event shapes (verified against session format v4):
 *   {type:'session/title', data:{title}}
 *   {type:'turn/start',    data:{turn}}
 *   {type:'turn/end',      data:{turn, reason}}
 *   {type:'user/message',  data:{content:[{type:'text',text}], source:{kind:'user'|'compact-checkpoint'|…}}, surfaceOp:'append'}
 *   {type:'assistant/message', data:{message:{content:[{type:'text'|'reasoning'|…, text}]}}, surfaceOp:'append'}
 *   {type:'compaction/summary', data:{summary:[{type:'text',text}], compactionId}}
 *
 * Everything else — chunk rows (`text-chunks` / `reasoning-chunks` /
 * `tool-call-chunks`), `step/*`, `request/*`, `tool/*`, `model/selection`,
 * `system/message`, and any future event type — is log-only and skipped.
 *
 * Two behaviours here are load-bearing and were each a bug once:
 *
 *  1. A turn may contain many `assistant/message` events (one per model step,
 *     interleaved with tool calls). Keeping only the last one silently dropped
 *     41% of the assistant text on a real session, and lost every intermediate
 *     step of a long agentic turn. All of them are emitted, in order.
 *
 *  2. The Host injects its own context as `user/message` records that are not
 *     the human talking: skill catalogs, time context, tool-job notices, and —
 *     the important one — `compact-checkpoint`, which IS the conversation after
 *     compaction. Dropping that one makes a compacted session export with the
 *     conversation missing, which reads as "copy is broken". Checkpoints and
 *     summaries are surfaced as explicit transcript markers instead.
 */

const IMAGE_OMITTED_PLACEHOLDER = '[image omitted]';
const INCOMPLETE_MARKER = '> _Response incomplete._';
const FALLBACK_DOCUMENT_TITLE = 'DSH Conversation';

/** Checkpoint summaries can be tens of thousands of characters; keep a usable prefix. */
const CHECKPOINT_EXCERPT_CHARACTERS = 2400;

/** Control / bidi / zero-width characters that must not reach a Markdown title. */
const UNSAFE_TITLE_CHARACTER =
  /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Join the visible `text` blocks of one message body. */
function textOf(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type !== 'text') continue;
    if (typeof block.text !== 'string') continue;
    if (block.text.trim() === '') continue;
    parts.push(block.text);
  }
  return parts.join('\n\n');
}

/** Read the latest usable `session/title` payload. */
function readTitle(event) {
  const data = isRecord(event.data) ? event.data : undefined;
  const candidate = data === undefined ? undefined : data.title;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (trimmed === '' || UNSAFE_TITLE_CHARACTER.test(trimmed)) return null;
  return trimmed;
}

/**
 * `source.kind` of a `user/message`, which distinguishes the human from the
 * Host's own injections. The human is `'user'` or has no source at all; every
 * other kind is machine-authored context.
 */
function userMessageKind(event) {
  const data = isRecord(event.data) ? event.data : undefined;
  const source = data === undefined ? undefined : data.source;
  if (!isRecord(source)) return 'user';
  return typeof source.kind === 'string' ? source.kind : 'user';
}

/**
 * Context the Host injects as a user-role message but that no reader wants in a
 * pasted transcript. Everything not listed here is treated as content that must
 * be preserved: an unfamiliar future kind is safer to keep than to drop.
 */
const NOISE_KINDS = new Set([
  'skill-catalog',
  'time-context',
  'tool-jobs',
  'subagent-settled',
  'model-selection',
  'plugin:hindsight',
  'plugin:memory',
  'plugin:system',
]);

/** Kinds that carry the compacted conversation and must survive into the export. */
const CHECKPOINT_KINDS = new Set(['compact-checkpoint', 'compaction-summary']);

function excerpt(text) {
  const characters = Array.from(text);
  if (characters.length <= CHECKPOINT_EXCERPT_CHARACTERS) return text;
  return `${characters.slice(0, CHECKPOINT_EXCERPT_CHARACTERS).join('')}\n\n_…checkpoint trimmed for length…_`;
}

/**
 * Collapse raw session events into an ordered list of transcript items.
 *
 * Items are `{role:'user'|'assistant', text}` and `{role:'checkpoint', text}`;
 * a checkpoint marks where the Host compacted the conversation, so the reader
 * can tell an intentional summary from a lost history.
 *
 * @param {unknown} events - the `events` array of `sessionQuery.readSession`.
 * @returns {{title: string|null, items: object[], stats: object}}
 */
export function extractConversation(events) {
  const stats = {
    events: 0,
    turns: 0,
    humanMessages: 0,
    assistantMessages: 0,
    checkpoints: 0,
    injectedUserMessages: 0,
    skipped: 0,
  };

  const items = [];
  let title = null;

  for (const raw of Array.isArray(events) ? events : []) {
    stats.events++;
    if (!isRecord(raw)) {
      stats.skipped++;
      continue;
    }
    const type = typeof raw.type === 'string' ? raw.type : '';

    if (type === 'session/title') {
      const candidate = readTitle(raw);
      if (candidate !== null) title = candidate;
      continue;
    }
    if (type === 'turn/start') {
      stats.turns++;
      continue;
    }
    if (type === 'turn/end') continue;

    // A Host-side compaction summary: the model's own record of what the
    // conversation was before it was trimmed. Emitted as a visible marker.
    if (type === 'compaction/summary') {
      const data = isRecord(raw.data) ? raw.data : undefined;
      const text = textOf(data === undefined ? undefined : data.summary);
      if (text !== '') {
        items.push({ role: 'checkpoint', text: excerpt(text), kind: 'compaction' });
        stats.checkpoints++;
      } else {
        stats.skipped++;
      }
      continue;
    }

    // Replacement-origin surface copies are model-only shadowing, not transcript.
    if (raw.surfaceOp !== undefined && raw.surfaceOp !== 'append') {
      stats.skipped++;
      continue;
    }

    if (type === 'user/message') {
      const data = isRecord(raw.data) ? raw.data : undefined;
      const kind = userMessageKind(raw);
      if (CHECKPOINT_KINDS.has(kind)) {
        const text = textOf(data === undefined ? undefined : data.content);
        if (text !== '') {
          items.push({ role: 'checkpoint', text: excerpt(text), kind });
          stats.checkpoints++;
        } else {
          stats.skipped++;
        }
        continue;
      }
      if (NOISE_KINDS.has(kind)) {
        stats.injectedUserMessages++;
        continue;
      }
      const text = textOf(data === undefined ? undefined : data.content);
      items.push({ role: 'user', text: text !== '' ? text : IMAGE_OMITTED_PLACEHOLDER });
      stats.humanMessages++;
      continue;
    }

    if (type === 'assistant/message') {
      const data = isRecord(raw.data) ? raw.data : undefined;
      const content = data === undefined
        ? undefined
        : isRecord(data.message)
          ? data.message.content
          : data.content;
      const text = textOf(content);
      if (text === '') {
        stats.skipped++;
        continue;
      }
      // Every step, not just the final one: an agentic turn has many.
      items.push({ role: 'assistant', text });
      stats.assistantMessages++;
      continue;
    }

    stats.skipped++;
  }

  return { title, items, stats };
}

//#region fence balancing
// A fenced block opened in one message and "closed" by a synthetic closer in
// that same message leaves the *next* message's fences mismatched, which is how
// a transcript ends up with dozens of stray ``` markers. Fences are therefore
// balanced once, over the assembled document, not per message.

function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (match === null) return null;
  const run = match[1];
  if (run[0] === '`' && match[2].includes('`')) return null;
  return { character: run[0], length: run.length };
}

function closesFence(line, open) {
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return match !== null && match[1][0] === open.character && match[1].length >= open.length;
}

/** Whether `text` leaves a fenced block open at its end. */
export function leavesFenceOpen(text) {
  let open = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (open === null) open = openingFence(line);
    else if (closesFence(line, open)) open = null;
  }
  return open;
}

/** Close a fenced code block left open at the end of one message. */
export function protectMarkdownFences(message) {
  const open = leavesFenceOpen(message);
  if (open === null) return message;
  const newline = message.endsWith('\n') ? '' : '\n';
  return `${message}${newline}${open.character.repeat(open.length)}`;
}
//#endregion

function roleSection(role, message) {
  return `> **${role}**\n\n${protectMarkdownFences(message)}`;
}

function checkpointSection(item) {
  return `> **Conversation compacted**\n>\n> _The Host replaced earlier turns with this summary to free context. `
    + `Everything above this point is what the model still sees; the original wording was trimmed by DSH, not by this plugin._\n\n`
    + protectMarkdownFences(item.text);
}

/** Escape a value used inside an inline code span of the document header. */
function inlineCode(value) {
  return `\`${String(value).replace(/`/gu, '\u2019')}\``;
}

/**
 * Render the extracted conversation as Markdown.
 *
 * @param {object[]} items - extraction output.
 * @param {{title?: string|null, sessionId?: string|null, cwd?: string|null, truncated?: boolean}} meta
 * @returns {string}
 */
export function renderConversation(items, meta = {}) {
  const documentTitle = typeof meta.title === 'string' && meta.title !== ''
    ? meta.title
    : FALLBACK_DOCUMENT_TITLE;

  const headerLines = [`# ${documentTitle}`, ''];
  const metaLines = [];
  if (typeof meta.sessionId === 'string' && meta.sessionId !== '') {
    metaLines.push(`> Session: ${inlineCode(meta.sessionId)}`);
  }
  if (typeof meta.cwd === 'string' && meta.cwd !== '') {
    metaLines.push(`> Working directory: ${inlineCode(meta.cwd)}`);
  }
  if (metaLines.length > 0) headerLines.push(...metaLines, '');

  const sections = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item.role === 'checkpoint') sections.push(checkpointSection(item));
    else if (item.role === 'user') sections.push(roleSection('User', item.text));
    else if (item.role === 'assistant') sections.push(roleSection('Assistant', item.text));
  }

  if (sections.length === 0) {
    headerLines.push('> _This session has no messages yet._', '');
    return `${headerLines.join('\n')}\n`;
  }

  const body = `${headerLines.join('\n')}---\n\n${sections.join('\n\n---\n\n')}\n`;
  return meta.truncated === true ? `${body}\n> _Transcript truncated to fit the clipboard._\n` : body;
}

/**
 * Trim a rendered document to `limit` characters on a section boundary, so a
 * huge session still produces a coherent copy instead of a cut-off code fence.
 *
 * @param {string} markdown
 * @param {number} limit
 * @returns {{markdown: string, truncated: boolean}}
 */
export function clampMarkdown(markdown, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return { markdown, truncated: false };
  if (markdown.length <= limit) return { markdown, truncated: false };
  const boundary = markdown.lastIndexOf('\n\n---\n\n', limit);
  const cut = boundary > limit / 2 ? boundary : limit;
  return {
    markdown: `${markdown.slice(0, cut)}\n\n> _Transcript truncated to fit the clipboard._\n`,
    truncated: true,
  };
}
