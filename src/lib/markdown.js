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
 *   {type:'user/message',  data:{content:[{type:'text',text}], source:{kind:'user'}}, surfaceOp:'append'}
 *   {type:'assistant/message', data:{message:{content:[{type:'text'|'reasoning'|…, text}]}}, surfaceOp:'append'}
 *
 * Everything else — chunk rows (`text-chunks` / `reasoning-chunks` /
 * `tool-call-chunks`), `step/*`, `request/*`, `tool/*`, `model/selection`,
 * `system/message`, and any future event type — is log-only and skipped.
 */

const IMAGE_OMITTED_PLACEHOLDER = '[image omitted]';
const INCOMPLETE_MARKER = '> _Response incomplete._';
const FALLBACK_DOCUMENT_TITLE = 'DSH Conversation';

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
 * Collapse raw session events into ordered `{humans, assistant}` turns.
 *
 * @param {unknown} events - the `events` array of `sessionQuery.readSession`.
 * @returns {{title: string|null, entries: object[], stats: object}}
 */
export function extractConversation(events) {
  const stats = {
    events: 0,
    turns: 0,
    humanTurns: 0,
    humanMessages: 0,
    injectedUserMessages: 0,
    assistantMessages: 0,
    finalAssistants: 0,
    skipped: 0,
  };

  const entries = [];
  let title = null;
  let current = null;

  const openTurn = () => {
    current = { humans: [], assistants: [] };
    stats.turns++;
    return current;
  };
  const closeTurn = () => {
    if (current === null) return;
    if (current.humans.length > 0) {
      stats.humanTurns++;
      entries.push({
        humans: current.humans,
        assistant: current.assistants.length > 0
          ? current.assistants[current.assistants.length - 1]
          : null,
      });
    }
    current = null;
  };

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
      closeTurn();
      openTurn();
      continue;
    }
    if (type === 'turn/end') {
      closeTurn();
      continue;
    }

    // Replacement-origin surface copies are model-only shadowing, not transcript.
    if (raw.surfaceOp !== undefined && raw.surfaceOp !== 'append') {
      stats.skipped++;
      continue;
    }

    if (type === 'user/message') {
      const message = isRecord(raw.data) ? raw.data : undefined;
      const source = message === undefined ? undefined : message.source;
      const kind = isRecord(source) ? source.kind : undefined;
      if (kind !== undefined && kind !== 'user') {
        stats.injectedUserMessages++;
        continue;
      }
      const text = textOf(message === undefined ? undefined : message.content);
      if (current === null) openTurn();
      current.humans.push(text !== '' ? text : IMAGE_OMITTED_PLACEHOLDER);
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
      if (current === null) openTurn();
      current.assistants.push(text);
      stats.assistantMessages++;
      continue;
    }

    stats.skipped++;
  }

  // A trailing open turn (EOF before `turn/end`) is normal for a live session.
  closeTurn();
  for (const entry of entries) if (entry.assistant !== null) stats.finalAssistants++;

  return { title, entries, stats };
}

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

/** Close a fenced code block left open at the end of one message. */
export function protectMarkdownFences(message) {
  let open = null;
  for (const line of message.split(/\r?\n/)) {
    if (open === null) open = openingFence(line);
    else if (closesFence(line, open)) open = null;
  }
  if (open === null) return message;
  const newline = message.endsWith('\n') ? '' : '\n';
  return `${message}${newline}${open.character.repeat(open.length)}`;
}

function roleSection(role, message) {
  return `> **${role}**\n\n${protectMarkdownFences(message)}`;
}

/** Escape a value used inside an inline code span of the document header. */
function inlineCode(value) {
  return `\`${String(value).replace(/`/gu, '\u2019')}\``;
}

/**
 * Render the extracted conversation as Markdown.
 *
 * @param {object[]} entries - extraction output.
 * @param {{title?: string|null, sessionId?: string|null, cwd?: string|null}} meta
 * @returns {string}
 */
export function renderConversation(entries, meta = {}) {
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
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const human of entry.humans) sections.push(roleSection('User', human));
    if (entry.assistant !== null) sections.push(roleSection('Assistant', entry.assistant));
    else sections.push(INCOMPLETE_MARKER);
  }

  if (sections.length === 0) {
    headerLines.push('> _This session has no messages yet._', '');
    return `${headerLines.join('\n')}\n`;
  }
  return `${headerLines.join('\n')}---\n\n${sections.join('\n\n---\n\n')}\n`;
}
