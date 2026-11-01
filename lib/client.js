/*
 * DSH client-module artifact.
 *
 * Shipped in the loader's closure-factory format so a local checkout installs
 * with no build step and no third-party build dependency.
 *
 * Contract notes (verified against DSH 0.2.1-rc.2):
 *  - the Session header exposes the extensible list slot
 *    `conversation.session.header.utilities`; a session-scoped occupant receives
 *    `sessionId` plus whatever its `inject` face returns;
 *  - the canonical DSH session reference is the Markdown mention
 *    `@[label](dsh-session:<base64url(JSON.stringify(sessionId))>)`; pasting it
 *    into any DSH composer makes the Host inject that session's snapshot, which
 *    is exactly what "deep link" means here;
 *  - the working directory is the `cwd` of the Session list projection;
 *  - the shell's shared table exports `Menu` as a plain function but `Button` as
 *    a `forwardRef` object. A `typeof x === 'function'` guard therefore rejects
 *    `Button`, which is why the trigger is a plain `<button>` here (the same
 *    shape the built-in Session and Workspace rows use) and why the three
 *    actions never render as a row of separate buttons.
 *
 * Everything is feature-detected: if a future DSH renames a service, a slot, an
 * icon or the menu primitive, the affected piece degrades (or the whole menu
 * disappears) instead of raising inside the boot activation audit. The factory
 * itself allocates nothing at top level and cannot throw, and the registration
 * is guarded, so evaluating this file can never break the page boot.
 */
(() => {
// The wrapper exists so the guard below can use a binding: a top-level `const`
// in a classic script lands in the shared global lexical environment, and a
// revisioned re-load (HMR) would then die on "Identifier has already been
// declared". The IIFE keeps every binding script-local, exactly like the
// bundler output this file imitates.
const loader = typeof window === 'undefined' ? undefined : window.__ModuleLoader__;
if (loader === undefined || loader === null || typeof loader.load !== 'function') return;
loader.load({
  id: 'dsh-session-copy',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const safeRequire = (id) => {
      try {
        const value = require(id);
        return value === undefined ? null : value;
      } catch {
        return null;
      }
    };

    const React = safeRequire('react');
    const jsxRuntime = safeRequire('react/jsx-runtime');
    const primitives = safeRequire('@deepseek-ai/dsh-client-ui-primitives') ?? {};

    const jsx = jsxRuntime !== null && typeof jsxRuntime.jsx === 'function' ? jsxRuntime.jsx : null;
    const jsxs = jsxRuntime !== null && typeof jsxRuntime.jsxs === 'function' ? jsxRuntime.jsxs : null;

    const SLOT_NAME = 'conversation.session.header.utilities';
    const PLUGIN_ID = 'session-copy';
    const SNAPSHOT_ROUTE = '/api/session-copy.snapshot'.slice(1);
    const NOTICE_MS = 2800;
    const MAX_LABEL_CHARACTERS = 120;
    /**
     * Deadline for one snapshot read. Converting a multi-megabyte session log is
     * real Host work; this bounds how long the button can stay "in flight"
     * before the user gets an error they can act on.
     */
    const SNAPSHOT_TIMEOUT_MS = 45000;

    const STYLE_ID = 'dsh-session-copy/menu';
    const STYLE = '.dshSessionCopyWrap{position:relative;display:inline-flex;align-items:center}'
      // The trigger is the Host's own ghost button; only its slot geometry is ours.
      + '.dshSessionCopyNode{position:relative;display:inline-flex;align-items:center}'
      + '.dshSessionCopyPopover{position:absolute;top:calc(100% + 6px);right:0;z-index:45;display:flex;flex-direction:column;'
      + 'gap:1px;min-width:208px;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;'
      + 'background:var(--dsw-alias-bg-base,#fff);box-shadow:0 12px 28px rgba(0,0,0,.18)}'
      + '.dshSessionCopyItem{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;border-radius:7px;'
      + 'background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);'
      + 'font-size:12.5px;line-height:18px;text-align:left;white-space:nowrap;'
      + 'transition:background-color .12s ease,color .12s ease}'
      + '.dshSessionCopyItem:hover,.dshSessionCopyItem:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}'
      + '.dshSessionCopyItem:active{background:var(--dsw-alias-interactive-bg-hover);opacity:.85}'
      + '.dshSessionCopyItemIcon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyItemIcon svg{width:14px;height:14px}'
      + '.dshSessionCopyNotice{position:absolute;top:calc(100% + 8px);right:0;z-index:40;max-width:min(440px,62vw);'
      + 'padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;'
      + 'background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);'
      + 'font-family:var(--dsw-font-family);font-size:12px;line-height:18px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}'
      + '.dshSessionCopyNoticeError{color:var(--dsw-alias-label-error,#b42318)}'
      // --- picker shell ---------------------------------------------------
      + '.dshSessionCopyMask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'
      + 'padding:24px;background:rgba(8,14,24,.44)}'
      + '.dshSessionCopyDialog{display:flex;flex-direction:column;width:min(920px,94vw);max-height:min(78vh,760px);'
      + 'border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base,#fff);'
      + 'color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-shadow:0 24px 64px rgba(0,0,0,.30);'
      + 'overflow:hidden}'
      + '@media (max-width:1040px){.dshSessionCopyDialog{width:min(94vw,100%)}}'
      + '.dshSessionCopyDialogHead{display:flex;align-items:flex-start;gap:10px;padding:13px 14px 8px 16px}'
      + '.dshSessionCopyDialogTitles{min-width:0;flex:1}'
      + '.dshSessionCopyDialogTitle{font-size:13.5px;font-weight:600;line-height:20px}'
      + '.dshSessionCopyDialogDesc{margin-top:1px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyPickerBody{display:flex;flex-direction:column;min-height:0;flex:1}'
      + '.dshSessionCopyToolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 16px 8px}'
      + '.dshSessionCopyFilter{flex:1 1 170px;min-width:120px;height:26px;padding:0 9px;box-sizing:border-box;'
      + 'border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:inherit;'
      + 'font-family:inherit;font-size:12px;line-height:18px;outline:none;'
      + 'transition:border-color .12s ease}'
      + '.dshSessionCopyFilter:focus{border-color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyOrder{display:inline-flex;flex:none;gap:4px}'
      + '.dshSessionCopyChips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px}'
      + '.dshSessionCopyCount{margin-left:auto;font-size:12px;line-height:18px;'
      + 'color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}'
      // --- timeline -------------------------------------------------------
      + '.dshSessionCopyListWrap{display:flex;flex:1 1 auto;min-height:160px;'
      + 'border-top:1px solid var(--dsw-alias-border-l2)}'
      + '.dshSessionCopyRail{position:relative;width:26px;flex:none;margin:6px 0}'
      + '.dshSessionCopyRailTrack{position:absolute;left:50%;top:4px;bottom:4px;width:1px;margin-left:-0.5px;'
      + 'background:var(--dsw-alias-border-l2)}'
      + '.dshSessionCopyRailDot{position:absolute;left:50%;width:7px;height:7px;margin-left:-3.5px;padding:0;'
      + 'border:0;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;'
      + 'transform:translateY(-50%);'
      + 'transition:background-color .12s ease,width .12s ease,height .12s ease,margin .12s ease}'
      + '.dshSessionCopyRailDot:hover{background:var(--dsw-alias-label-secondary);width:9px;height:9px;margin-left:-4.5px}'
      + '.dshSessionCopyRailDotOn{width:11px;height:11px;margin-left:-5.5px;background:var(--dsw-alias-label-primary)}'
      + '.dshSessionCopyList{position:relative;flex:1 1 auto;min-width:0;overflow-y:auto;overscroll-behavior:contain;'
      + 'padding:0 8px 8px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;'
      + 'scrollbar-gutter:stable}'
      + '.dshSessionCopyList::-webkit-scrollbar{width:12px}'
      + '.dshSessionCopyList::-webkit-scrollbar-track{background:transparent;margin:4px 0}'
      + '.dshSessionCopyList::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:999px;'
      + 'border:4px solid transparent;background-clip:content-box;min-height:40px}'
      + '.dshSessionCopyList::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary);'
      + 'background-clip:content-box;border:4px solid transparent}'
      + '.dshSessionCopyGroup{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:7px;'
      + 'margin:0 -8px;padding:4px 12px;background:var(--dsw-alias-bg-base,#fff);'
      + 'border-bottom:1px solid var(--dsw-alias-border-l2);font-size:11px;line-height:17px;'
      + 'color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}'
      + '.dshSessionCopyGroupTurn{font-weight:600;color:var(--dsw-alias-label-primary)}'
      + '.dshSessionCopyGroupCount{color:var(--dsw-alias-label-secondary);opacity:.8}'
      + '.dshSessionCopyRow{display:flex;align-items:flex-start;gap:9px;padding:6px 8px;border-radius:8px;cursor:pointer;'
      + 'outline:none;transition:background-color .12s ease}'
      + '.dshSessionCopyRow:hover{background:var(--dsw-alias-interactive-bg-hover)}'
      + '.dshSessionCopyRowOn{background:var(--dsw-alias-interactive-bg-hover)}'
      + '.dshSessionCopyRow:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:-2px}'
      + '.dshSessionCopyBox{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;flex:none;'
      + 'margin-top:2px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;'
      + 'color:var(--dsw-alias-bg-base,#fff);transition:background-color .12s ease,border-color .12s ease}'
      + '.dshSessionCopyBoxOn{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary)}'
      + '.dshSessionCopyBox svg{width:11px;height:11px}'
      + '.dshSessionCopyRowText{min-width:0;flex:1}'
      + '.dshSessionCopyRole{display:block;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;'
      + 'color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyTime{color:var(--dsw-alias-label-secondary);font-weight:400;letter-spacing:0;'
      + 'font-variant-numeric:tabular-nums}'
      + '.dshSessionCopyPreview{font-size:12px;line-height:17px;color:var(--dsw-alias-label-primary);word-break:break-word}'
      + '.dshSessionCopyRowChars{flex:none;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);'
      + 'font-variant-numeric:tabular-nums}'
      + '.dshSessionCopyEmpty{padding:26px 16px;text-align:center;font-size:12px;line-height:18px;'
      + 'color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyPickerError{padding:0 16px 8px;font-size:12px;line-height:18px;'
      + 'color:var(--dsw-alias-label-error,#b42318)}'
      + '.dshSessionCopyFoot{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;'
      + 'padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l2)}'
      + '.dshSessionCopyHint{margin-right:auto;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}'
      // --- fallback buttons, used only when the Host exports no `Button` ----
      + '.dshSessionCopyAction{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;'
      + 'border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;'
      + 'color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;'
      + 'transition:background-color .12s ease,opacity .12s ease}'
      + '.dshSessionCopyAction:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}'
      + '.dshSessionCopyAction:disabled{opacity:.45;cursor:default}'
      + '.dshSessionCopyActionPrimary{border-color:transparent;background:var(--dsw-alias-label-primary);'
      + 'color:var(--dsw-alias-bg-base,#fff);font-weight:600}'
      + '.dshSessionCopyActionPrimary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.88}'
      + '.dshSessionCopyActionSmall{height:24px;padding:0 8px;font-size:11px}'
      + '.dshSessionCopyActionIcon{padding:0;width:24px;justify-content:center;border-color:transparent}'
      + '.dshSessionCopyActionIcon svg{width:15px;height:15px}';

    function installStyle() {
      if (typeof document === 'undefined') return;
      const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
      if (existing !== null) {
        // A live module swap keeps the previous <style> element, so an outdated
        // rule set must be replaced rather than assumed to be current.
        if (existing.textContent !== STYLE) existing.textContent = STYLE;
        return;
      }
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-session-copy';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    //#region dictionaries

    const NS = 'session-copy';

    const zh = {
      'button.label': '复制与分享',
      'menu.deepLink': '复制深度链接',
      'menu.markdown': '复制 Markdown',
      'menu.markdownFile': '导出 Markdown 文件',
      'menu.selection': '选择消息…',
      'menu.workingDirectory': '复制目录',
      'notice.deepLink': '已复制深度链接',
      'notice.markdown': '已复制为 Markdown',
      'notice.workingDirectory': '已复制工作目录',
      'notice.characters': '（{n} 字符）',
      'notice.truncated': '，已按长度上限截断',
      'notice.selection': '已复制所选 {n} 条消息',
      'notice.saved': '已保存 {name}（{n} 字符）',
      'notice.savedSelection': '已保存所选 {n} 条消息为 {name}（{c} 字符）',
      'pick.export': '导出 .md',
      'pick.exporting': '导出中…',
      'notice.failed': '复制失败',
      'picker.title': '选择消息',
      'picker.description': '勾选后复制或导出为 Markdown。',
      'picker.filter': '筛选…',
      'picker.selectAll': '全选',
      'picker.clear': '清空',
      'picker.selected': '{n}/{total}',
      'picker.meter': '{n}/{total} · {c} 字',
      'picker.copying': '复制中…',
      'picker.chip.all': '全部',
      'picker.turn': '第 {n} 轮',
      'picker.turnUnknown': '更早',
      'picker.turnCount': '{n}',
      'picker.turnSelect': '整轮',
      'picker.turnClear': '取消',
      'picker.orderAsc': '正序',
      'picker.orderDesc': '倒序',
      'picker.hint': 'Shift 连选 · 空格勾选 · Ctrl+A 全选',
      'picker.copy': '复制',
      'picker.cancel': '取消',
      'picker.loading': '正在读取会话…',
      'picker.empty': '该会话还没有可复制的消息',
      'picker.noMatch': '没有匹配的消息',
      'picker.role.user': '你',
      'picker.role.assistant': '助手',
      'picker.role.checkpoint': '压缩点',
      'error.unavailable': '宿主会话服务不可用',
      'error.failed': '宿主返回错误',
      'error.empty': '该会话还没有可复制的内容',
      'error.noCwd': '该会话没有工作目录',
      'error.clipboard': '浏览器拒绝了剪贴板写入',
      'error.timeout': '读取会话超时，请重试',
      'error.noSelection': '请先勾选要复制的消息',
      'error.pickerUnsupported': '宿主还没加载支持消息选择的版本，请完全退出并重新打开 DeepSeek Harness',
      'error.download': '浏览器拒绝了文件下载',
    };

    const en = {
      'button.label': 'Copy & share',
      'menu.deepLink': 'Copy deep link',
      'menu.markdown': 'Copy Markdown',
      'menu.markdownFile': 'Export Markdown file',
      'menu.selection': 'Select messages…',
      'menu.workingDirectory': 'Copy directory',
      'notice.deepLink': 'Deep link copied',
      'notice.markdown': 'Copied as Markdown',
      'notice.workingDirectory': 'Working directory copied',
      'notice.characters': ' ({n} characters)',
      'notice.truncated': ', truncated at the length limit',
      'notice.selection': 'Copied {n} selected messages',
      'notice.saved': 'Saved {name} ({n} characters)',
      'notice.savedSelection': 'Saved {n} selected messages to {name} ({c} characters)',
      'pick.export': 'Export .md',
      'pick.exporting': 'Exporting…',
      'notice.failed': 'Copy failed',
      'picker.title': 'Select messages',
      'picker.description': 'Pick messages, then copy or export Markdown.',
      'picker.filter': 'Filter…',
      'picker.selectAll': 'Select all',
      'picker.clear': 'Clear',
      'picker.selected': '{n}/{total}',
      'picker.meter': '{n}/{total} · {c} chars',
      'picker.copying': 'Copying…',
      'picker.chip.all': 'All',
      'picker.turn': 'Turn {n}',
      'picker.turnUnknown': 'Earlier',
      'picker.turnCount': '{n}',
      'picker.turnSelect': 'Whole turn',
      'picker.turnClear': 'Clear',
      'picker.orderAsc': 'Oldest',
      'picker.orderDesc': 'Newest',
      'picker.hint': 'Shift to range · Space to toggle · Ctrl+A for all',
      'picker.copy': 'Copy',
      'picker.cancel': 'Cancel',
      'picker.loading': 'Reading the session…',
      'picker.empty': 'This session has no messages to copy yet',
      'picker.noMatch': 'No message matches that filter',
      'picker.role.user': 'You',
      'picker.role.assistant': 'Assistant',
      'picker.role.checkpoint': 'Compaction',
      'error.unavailable': 'Host session service unavailable',
      'error.failed': 'The host returned an error',
      'error.empty': 'This session has nothing to copy yet',
      'error.noCwd': 'This session has no working directory',
      'error.clipboard': 'The browser refused the clipboard write',
      'error.timeout': 'Reading the session timed out — please try again',
      'error.noSelection': 'Tick at least one message first',
      'error.pickerUnsupported': 'The Host has not loaded the build that supports message selection — quit and reopen DeepSeek Harness',
      'error.download': 'The browser refused the file download',
    };

    function detectedLanguage() {
      try {
        const candidates = [
          typeof document !== 'undefined' ? document.documentElement?.lang : undefined,
          typeof navigator !== 'undefined' ? navigator.language : undefined,
          typeof navigator !== 'undefined' ? navigator.languages?.[0] : undefined,
        ];
        for (const value of candidates) {
          if (typeof value === 'string' && value.toLowerCase().startsWith('zh')) return 'zh';
        }
      } catch {
        /* fall through to English */
      }
      return 'en';
    }

    /** Dictionary lookup with `{name}` interpolation; never throws. */
    function localMessage(key, params) {
      const dictionary = detectedLanguage() === 'zh' ? zh : en;
      const template = dictionary[key] ?? en[key] ?? key;
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/gu, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    }

    //#endregion

    //#region session reference codec
    // Mirrors @deepseek-ai/dsh-session-reference/uri.ts exactly:
    //   encode(sessionId) = 'dsh-session:' + base64url(JSON.stringify(sessionId))
    //   mention(label)    = `@[${escape(label)}](${encode(sessionId)})`
    //   escape(label)     = label.replace(/[\\\]]/gu, (m) => `\\${m}`)

    function base64url(value) {
      const bytes = new TextEncoder().encode(value);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
    }

    function encodeSessionReferenceUri(sessionId) {
      return `dsh-session:${base64url(JSON.stringify(String(sessionId)))}`;
    }

    function escapeMentionLabel(label) {
      return String(label).replace(/[\\\]]/gu, (match) => `\\${match}`);
    }

    /**
     * Characters that would force `escapeMentionLabel` to emit a backslash are
     * swapped for full-width look-alikes instead.
     *
     * The host parser accepts the escaped wire form, but the chip renderer in
     * ui-primitives scans with `@\[([^\]\n]+)\]\(dsh-session:[^)\s]+\)`, which
     * rejects any `]` that is not the closing bracket. A label that needs no
     * escaping is therefore the only shape both layers agree on. The
     * substitutions stay visually close to the originals, so the chip still
     * reads like the session title.
     */
    const LABEL_SUBSTITUTIONS = [
      [/\[/gu, '\u3010'],
      [/\]/gu, '\u3011'],
      [/\\/gu, '\uFF3C'],
    ];

    function sanitizeMentionLabel(value) {
      let text = String(value);
      for (const [pattern, replacement] of LABEL_SUBSTITUTIONS) {
        text = text.replace(pattern, replacement);
      }
      return text;
    }

    /** Flatten a title so it stays a single-line, escape-free mention label. */
    function mentionLabel(value) {
      const flat = sanitizeMentionLabel(value).replace(/\s+/gu, ' ').trim();
      const characters = Array.from(flat);
      if (characters.length <= MAX_LABEL_CHARACTERS) return flat;
      return `${characters.slice(0, MAX_LABEL_CHARACTERS - 1).join('')}\u2026`;
    }

    function sessionReferenceMention(sessionId, label) {
      const usable = label === undefined || label === null || String(label).trim() === ''
        ? sessionId
        : label;
      // A mention with an empty label is rejected by both the parser and the
      // renderer, so the session id is the guaranteed-non-empty fallback.
      const text = mentionLabel(usable) || String(sessionId);
      return `@[${escapeMentionLabel(text)}](${encodeSessionReferenceUri(sessionId)})`;
    }

    //#endregion

    //#region clipboard

    /**
     * Copy through the legacy `textarea` + `execCommand` path.
     *
     * This is the only path that works when the document has lost focus, which
     * is exactly what happens after the dropdown closes. It also accepts
     * arbitrarily long strings: `navigator.clipboard.writeText` rejects or
     * silently stalls on multi-hundred-kilobyte payloads in some Electron
     * builds, so this is not a legacy fallback but the reliable one.
     */
    function copyLegacy(text) {
      if (typeof document === 'undefined') return false;
      const area = document.createElement('textarea');
      try {
        area.value = text;
        area.setAttribute('readonly', '');
        area.setAttribute('aria-hidden', 'true');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        area.style.opacity = '0';
        area.style.pointerEvents = 'none';
        document.body.appendChild(area);
        area.focus();
        area.select();
        // Some browsers ignore `select()` on a large value; an explicit range
        // guarantees the whole document is on the clipboard.
        if (typeof area.setSelectionRange === 'function') area.setSelectionRange(0, text.length);
        return typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
      } catch {
        return false;
      } finally {
        try {
          area.remove();
        } catch {
          /* already detached */
        }
      }
    }

    /** Copy through the async Clipboard API, if this build has it. */
    async function copyModern(text) {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (clipboard === undefined || clipboard === null) return false;
      if (typeof clipboard.writeText !== 'function') return false;
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }

    /**
     * A filename that survives every filesystem this may be saved to.
     *
     * Windows and macOS both refuse a handful of characters and trailing dots or
     * spaces, and a session title is user text, so it is scrubbed rather than
     * trusted.
     */
    function safeFilename(value, fallback) {
      const raw = typeof value === 'string' ? value.trim() : '';
      const base = raw === '' ? fallback : raw;
      // eslint-disable-next-line no-control-regex
      const cleaned = String(base)
        .replace(/[\u0000-\u001F\u007F]/gu, '')
        .replace(/[\\/:*?"<>|]/gu, '-')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 80)
        .replace(/[. ]+$/u, '');
      return cleaned === '' ? fallback : cleaned;
    }

    /**
     * Save `text` as a `.md` file through a blob URL.
     *
     * Clipboard writes are what fail first on a long conversation: browsers cap
     * or refuse a single write of several hundred kilobytes, so the answer for
     * a big document is a file, not a bigger paste.
     */
    function downloadText(text, filename) {
      if (typeof document === 'undefined' || typeof Blob !== 'function'
        || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return false;
      }
      let url = null;
      try {
        url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        if (typeof anchor.click === 'function') anchor.click();
        else return false;
        anchor.remove();
        return true;
      } catch {
        return false;
      } finally {
        if (url !== null) {
          window.setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {
              /* already released */
            }
          }, 10000);
        }
      }
    }

    /**
     * Copy `text` to the clipboard, or report failure.
     *
     * Order matters and is deliberate:
     *
     *  1. The Host's own writer, when this release exports one — but only as a
     *     hint. DSH's bundled writer returns `false` as soon as
     *     `navigator.clipboard.writeText` throws and never falls back, so a
     *     failure here must not end the attempt.
     *  2. The legacy `execCommand` path, which is the one that survives long
     *     text and a blurred document.
     *  3. The async Clipboard API, for builds where `execCommand` is gone.
     *
     * The whole ladder runs twice: a clipboard write can fail transiently while
     * the window is regaining focus, and a copy that works a moment later is far
     * better than telling the user it failed.
     */
    async function copyText(text) {
      const value = String(text);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          // Yield to the event loop so any pending focus/selection change lands.
          await new Promise((resolve) => {
            window.setTimeout(resolve, 60);
          });
        }
        if (typeof primitives.writeClipboard === 'function') {
          try {
            const accepted = await primitives.writeClipboard(value);
            if (accepted === true) return true;
          } catch {
            /* the Host writer is a hint, never the only route */
          }
        }
        if (copyLegacy(value) === true) return true;
        if (await copyModern(value)) return true;
      }
      return false;
    }

    //#endregion

    function describe(error) {
      if (error instanceof Error && typeof error.message === 'string' && error.message !== '') {
        return error.message;
      }
      return String(error);
    }

    /**
     * Register the browser half.
     * @param {object} ctx DSH browser plugin context.
     */
    function apply(ctx) {
      if (jsx === null || jsxs === null || React === null) return;
      if (typeof React.useState !== 'function'
        || typeof React.useRef !== 'function'
        || typeof React.useEffect !== 'function') return;

      try {
        installStyle();
      } catch {
        /* a missing <head> only costs styling */
      }

      let boundTranslate = null;
      const tr = (key, params) => {
        if (boundTranslate !== null) {
          try {
            return boundTranslate(key, params);
          } catch {
            /* fall back to the bundled dictionaries */
          }
        }
        return localMessage(key, params);
      };

      try {
        ctx.inject(['locale'], (scope) => {
          try {
            scope.effect(() => scope.locale.register(NS, { zh, en }), 'session-copy: dictionaries');
            const bound = scope.locale.bind(NS);
            if (typeof bound === 'function') boundTranslate = bound;
          } catch {
            /* bundled dictionaries remain in charge */
          }
        });
      } catch {
        /* the locale service is optional */
      }

      const sessionsOf = () => {
        try {
          const service = ctx.get('sessions');
          return service === undefined ? undefined : service;
        } catch {
          return undefined;
        }
      };

      /** The Session list projection entry, when the Host has published it. */
      const summaryOf = (sessionId) => {
        try {
          const snapshot = sessionsOf()?.list?.getSnapshot?.();
          const byId = snapshot?.byId;
          if (byId === null || typeof byId !== 'object') return undefined;
          const entry = byId[sessionId];
          return entry === null || typeof entry !== 'object' ? undefined : entry;
        } catch {
          return undefined;
        }
      };

      const titleOf = (sessionId) => {
        const summary = summaryOf(sessionId);
        const title = summary?.title;
        if (typeof title === 'string' && title.trim() !== '') return title.trim();
        const cwd = summary?.cwd;
        if (typeof cwd === 'string' && cwd !== '') {
          const base = cwd.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop();
          if (typeof base === 'string' && base !== '') return base;
        }
        return String(sessionId);
      };

      const readSnapshot = async (sessionId, payload) => {
        const body = payload === undefined ? { sessionId } : { sessionId, ...payload };
        const response = await fetch(SNAPSHOT_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          const error = new Error(
            response.status === 503
              ? tr('error.unavailable')
              : `${tr('error.failed')}（HTTP ${response.status}${detail === '' ? '' : ` ${detail.slice(0, 160)}`}）`,
          );
          error.status = response.status;
          throw error;
        }
        const value = await response.json();
        if (value === null || typeof value !== 'object') throw new Error(tr('error.failed'));
        return value;
      };

      /**
       * Read a snapshot with a deadline.
       *
       * Building the Markdown for a very large session is real work on the Host,
       * and a request that never settles would leave the button spinning with no
       * explanation. The timeout turns that into an ordinary error the user can
       * see and retry.
       */
      const readSnapshotWithin = async (sessionId, payload) => {
        let timer = null;
        const deadline = new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error(tr('error.timeout'))), SNAPSHOT_TIMEOUT_MS);
        });
        try {
          return await Promise.race([readSnapshot(sessionId, payload), deadline]);
        } finally {
          if (timer !== null) window.clearTimeout(timer);
        }
      };

      const copy = async (text) => {
        const accepted = await copyText(text);
        if (accepted !== true) throw new Error(tr('error.clipboard'));
      };

      const actions = {
        /** Copy the canonical DSH session mention so another session can read this one. */
        async deepLink(sessionId) {
          const mention = sessionReferenceMention(sessionId, titleOf(sessionId));
          await copy(mention);
          return tr('notice.deepLink');
        },
        /** Copy the whole conversation as clean Markdown through the Host route. */
        async markdown(sessionId) {
          const snapshot = await readSnapshotWithin(sessionId);
          const markdown = snapshot.markdown;
          if (typeof markdown !== 'string' || markdown === '') throw new Error(tr('error.empty'));
          await copy(markdown);
          const characters = tr('notice.characters', { n: markdown.length });
          // Say so when the Host trimmed the document, otherwise a truncated
          // transcript looks like a copy that silently lost its tail.
          return snapshot.truncated === true
            ? `${tr('notice.markdown')}${characters}${tr('notice.truncated')}`
            : `${tr('notice.markdown')}${characters}`;
        },
        /** Save the whole conversation as a `.md` file. */
        async markdownFile(sessionId) {
          const snapshot = await readForFile(sessionId);
          const name = `${safeFilename(snapshot.title ?? titleOf(sessionId), 'dsh-conversation')}.md`;
          if (downloadText(snapshot.markdown, name) !== true) throw new Error(tr('error.download'));
          return tr('notice.saved', { name, n: String(snapshot.markdown.length) });
        },
        /** Save only the ticked messages as a `.md` file. */
        async selectionFile(sessionId, selection) {
          if (!Array.isArray(selection) || selection.length === 0) {
            throw new Error(tr('error.noSelection'));
          }
          const snapshot = await readForFile(sessionId, selection);
          const base = safeFilename(snapshot.title ?? titleOf(sessionId), 'dsh-conversation');
          const name = `${base}-excerpt.md`;
          if (downloadText(snapshot.markdown, name) !== true) throw new Error(tr('error.download'));
          const count = typeof snapshot.messages === 'number' ? snapshot.messages : selection.length;
          return tr('notice.savedSelection', {
            n: String(count),
            name,
            c: String(snapshot.markdown.length),
          });
        },
        /** Copy the session working directory. */
        async workingDirectory(sessionId) {
          let cwd = summaryOf(sessionId)?.cwd;
          if (typeof cwd !== 'string' || cwd === '') {
            const snapshot = await readSnapshotWithin(sessionId);
            cwd = snapshot.cwd;
          }
          if (typeof cwd !== 'string' || cwd === '') throw new Error(tr('error.noCwd'));
          await copy(cwd);
          return `${tr('notice.workingDirectory')}\uff1a${cwd}`;
        },
      };

      /** Copy only the messages the user ticked in the picker. */
      actions.selectionMarkdown = async (sessionId, selection) => {
        if (!Array.isArray(selection) || selection.length === 0) {
          throw new Error(tr('error.noSelection'));
        }
        const snapshot = await readSnapshotWithin(sessionId, { selection });
        const markdown = snapshot.markdown;
        if (typeof markdown !== 'string' || markdown === '') throw new Error(tr('error.empty'));
        await copy(markdown);
        const count = typeof snapshot.messages === 'number' ? snapshot.messages : selection.length;
        const characters = tr('notice.characters', { n: markdown.length });
        return snapshot.truncated === true
          ? `${tr('notice.selection', { n: count })}${characters}${tr('notice.truncated')}`
          : `${tr('notice.selection', { n: count })}${characters}`;
      };

      /**
       * Fetch a document for saving to disk.
       *
       * `unclamped` tells the Host to skip the clipboard length cap, which is
       * the whole point: a file is the only way to hand over a conversation that
       * is too big to paste.
       */
      const readForFile = async (sessionId, selection) => {
        const payload = selection === undefined
          ? { unclamped: true }
          : { unclamped: true, selection };
        const snapshot = await readSnapshotWithin(sessionId, payload);
        const markdown = snapshot.markdown;
        if (typeof markdown !== 'string' || markdown === '') throw new Error(tr('error.empty'));
        return snapshot;
      };

      /** Fetch the pickable message list for one session. */
      const readEntries = async (sessionId) => {
        const snapshot = await readSnapshotWithin(sessionId, { mode: 'entries' });
        // A Host older than the picker ignores `mode` and answers with a
        // Markdown document. Without this guard that missing array reads as
        // "this session has no messages", which is a misleading dead end: the
        // real cause is that the Host half has not been reloaded yet (the
        // browser half hot-swaps, the Host half only changes on a restart).
        if (!Array.isArray(snapshot.entries)) {
          throw new Error(tr('error.pickerUnsupported'));
        }
        return {
          entries: snapshot.entries,
          total: typeof snapshot.total === 'number' ? snapshot.total : snapshot.entries.length,
        };
      };

      //#region menu component

      /**
       * The header carries exactly one button. Its three actions live behind a
       * dropdown, never beside it: the native `Menu` primitive (portal, collision
       * handling, outside-pointer and Escape dismissal) is used when this DSH
       * release ships it, and the self-contained popover below reproduces the same
       * single-trigger shape when it does not. Neither path depends on
       * `primitives.Button`, which is not part of every release's shared table.
       */
      const Menu = typeof primitives.Menu === 'function' ? primitives.Menu : null;
      /**
       * The Host's own `Button` primitive.
       *
       * It is a `forwardRef` object, not a function — the reason this plugin used
       * a plain `<button>` before — but a truthiness check is all React needs, and
       * using it means every control here gains the Host's variants, sizes, focus
       * ring and hover treatment for free, and cannot drift from them.
       */
      const Button = primitives.Button ?? null;
      const IconCopy = primitives.IconCopyOutlineRegular ?? primitives.IconEllipsisOutlineRegular ?? null;
      const IconLink = primitives.IconLinkOutlineRegular ?? null;
      const IconDocument = primitives.IconDeliverDocRegular ?? null;
      const IconChecklist = primitives.IconChecklistOutlineRegular ?? IconDocument;
      const IconDownload = primitives.IconDownloadOutlineRegular ?? IconDocument;
      const IconFolder = primitives.IconFolderOpenRegular ?? null;
      const IconClose = primitives.IconCloseOutlineRegular ?? null;
      const IconCheck = primitives.IconCheckOutlineRegular ?? null;

      /**
       * `picker` marks the item that opens the multi-select dialog instead of
       * copying straight away. QQ/WeChat-style multi-select needs a list the user
       * sees before anything is copied, so it cannot share the one-shot path.
       */
      const ITEMS = [
        { id: 'deepLink', label: 'menu.deepLink', icon: IconLink },
        { id: 'markdown', label: 'menu.markdown', icon: IconDocument },
        { id: 'markdownFile', label: 'menu.markdownFile', icon: IconDownload },
        { id: 'selection', label: 'menu.selection', icon: IconChecklist, picker: true },
        { id: 'workingDirectory', label: 'menu.workingDirectory', icon: IconFolder },
      ];

      /**
       * Class names used by the parts the Host has no primitive for: the
       * popover, the picker's own container chrome, the timeline rail and rows.
       * Every actual button is the Host's `Button`, so it needs no class here —
       * only the fallback path does, which is what `action*` is for.
       */
      const CSS = {
        wrap: 'dshSessionCopyWrap',
        node: 'dshSessionCopyNode',
        popover: 'dshSessionCopyPopover',
        item: 'dshSessionCopyItem',
        itemIcon: 'dshSessionCopyItemIcon',
        notice: 'dshSessionCopyNotice',
        noticeError: 'dshSessionCopyNoticeError',
        chips: 'dshSessionCopyChips',
        box: 'dshSessionCopyBox',
        boxOn: 'dshSessionCopyBoxOn',
        rowOn: 'dshSessionCopyRowOn',
        hint: 'dshSessionCopyHint',
        rail: 'dshSessionCopyRail',
        railTrack: 'dshSessionCopyRailTrack',
        railDot: 'dshSessionCopyRailDot',
        railDotOn: 'dshSessionCopyRailDotOn',
        listWrap: 'dshSessionCopyListWrap',
        group: 'dshSessionCopyGroup',
        groupTurn: 'dshSessionCopyGroupTurn',
        groupCount: 'dshSessionCopyGroupCount',
        time: 'dshSessionCopyTime',
        order: 'dshSessionCopyOrder',
        mask: 'dshSessionCopyMask',
        dialog: 'dshSessionCopyDialog',
        dialogHead: 'dshSessionCopyDialogHead',
        dialogTitles: 'dshSessionCopyDialogTitles',
        dialogTitle: 'dshSessionCopyDialogTitle',
        dialogDesc: 'dshSessionCopyDialogDesc',
        pickerBody: 'dshSessionCopyPickerBody',
        toolbar: 'dshSessionCopyToolbar',
        filter: 'dshSessionCopyFilter',
        count: 'dshSessionCopyCount',
        list: 'dshSessionCopyList',
        row: 'dshSessionCopyRow',
        rowText: 'dshSessionCopyRowText',
        role: 'dshSessionCopyRole',
        preview: 'dshSessionCopyPreview',
        rowChars: 'dshSessionCopyRowChars',
        empty: 'dshSessionCopyEmpty',
        pickerError: 'dshSessionCopyPickerError',
        foot: 'dshSessionCopyFoot',
        action: 'dshSessionCopyAction',
        actionPrimary: 'dshSessionCopyActionPrimary',
        actionSmall: 'dshSessionCopyActionSmall',
        actionIcon: 'dshSessionCopyActionIcon',
      };

      /**
       * Render a Host button, or an equivalent fallback when this release has no
       * `Button` primitive.
       *
       * Call sites pass the Host's props (`variant`, `size`, `icon`, …) and stay
       * written the same on both paths; only the element differs.
       */
      const uiButton = (props) => {
        if (Button !== null && Button !== undefined) return jsx(Button, props);
        const { variant, size, icon, className, children, ...rest } = props;
        const classes = [CSS.action];
        if (variant === 'primary') classes.push(CSS.actionPrimary);
        if (size === 'sm') classes.push(CSS.actionSmall);
        if (typeof className === 'string' && className !== '') classes.push(className);
        return jsxs('button', {
          type: 'button',
          ...rest,
          className: classes.join(' '),
          children: [icon === undefined ? null : jsx('span', { className: CSS.actionIcon, children: icon }), children],
        });
      };

      /** Keys the custom popover moves focus with. */
      const MOVE_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

      function SessionActionsMenu(props) {
        const sessionId = props.sessionId;
        const [open, setOpen] = React.useState(false);
        const [notice, setNotice] = React.useState(null);
        /**
         * The multi-select dialog. `null` means closed; otherwise
         * `{status, entries, selected, filter, total, error, busy}`.
         * `selected` holds item indices, which is exactly what the Host route
         * expects back in `selection`.
         */
        const [picker, setPicker] = React.useState(null);
        const wrapRef = React.useRef(null);
        const popoverRef = React.useRef(null);
        /** Per-session entry lists, so reopening the dialog is instant. */
        const entriesCacheRef = React.useRef({});
        const dialogRef = React.useRef(null);
        const filterRef = React.useRef(null);
        const timerRef = React.useRef(null);
        const epochRef = React.useRef(0);

        React.useEffect(() => () => {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }, []);

        const announce = (entry) => {
          const epoch = ++epochRef.current;
          setNotice(entry);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            if (epochRef.current === epoch) {
              timerRef.current = null;
              setNotice(null);
            }
          }, NOTICE_MS);
        };

        const run = async (id) => {
          setOpen(false);
          try {
            const text = await actions[id](sessionId);
            announce({ tone: 'ok', text });
          } catch (error) {
            announce({ tone: 'error', text: `${tr('notice.failed')}\uff1a${describe(error)}` });
          }
        };

        //#region message picker

        const closePicker = () => setPicker(null);

        /** Elements inside the dialog that should participate in the Tab loop. */
        const focusableInDialog = () => {
          const root = dialogRef.current;
          if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return [];
          return Array.from(root.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'))
            .filter((node) => node.disabled !== true);
        };

        /** Move focus into the list, so the arrow keys have somewhere to go. */
        const focusFirstRow = () => {
          const root = dialogRef.current;
          if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return;
          const row = root.querySelector('[data-session-copy-row]');
          if (row !== null && row !== undefined && typeof row.focus === 'function') row.focus();
        };

        /** Escape closes; Tab cycles inside the dialog instead of escaping it. */
        const onDialogKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            closePicker();
            return;
          }
          if (event.key !== 'Tab') return;
          const nodes = focusableInDialog();
          if (nodes.length === 0) return;
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          const active = typeof document === 'undefined' ? null : document.activeElement;
          if (event.shiftKey === true && active === first) {
            event.preventDefault();
            if (typeof last.focus === 'function') last.focus();
          } else if (event.shiftKey !== true && active === last) {
            event.preventDefault();
            if (typeof first.focus === 'function') first.focus();
          }
        };

        // Land the caret in the filter as soon as the list is there: typing to
        // narrow is the first thing anyone does with hundreds of rows.
        React.useEffect(() => {
          if (picker === null) return;
          if (picker.status !== 'ready') return;
          const node = filterRef.current;
          if (node !== null && node !== undefined && typeof node.focus === 'function') node.focus();
        }, [picker === null ? 'closed' : picker.status]);

        /**
         * Load the pickable list, reusing a result already fetched for this
         * session. Reopening the dialog after a cancel is instant instead of
         * paying the Host round-trip again.
         */
        const openPicker = async () => {
          setOpen(false);
          const cached = entriesCacheRef.current[sessionId];
          if (cached !== undefined) {
            setPicker({
              status: 'ready', entries: cached.entries, total: cached.total,
              selected: [], filter: '', role: 'all', anchor: null, error: '', busy: false,
              activeGroup: 0, newestFirst: false,
            });
            return;
          }
          setPicker({
            status: 'loading', entries: [], total: 0, selected: [],
            filter: '', role: 'all', anchor: null, error: '', busy: false, activeGroup: 0,
            newestFirst: false,
          });
          try {
            const value = await readEntries(sessionId);
            entriesCacheRef.current[sessionId] = value;
            setPicker((current) => (current === null ? current : {
              ...current,
              status: 'ready',
              entries: value.entries,
              total: value.total,
            }));
          } catch (error) {
            setPicker((current) => (current === null
              ? current
              : { ...current, status: 'error', error: describe(error) }));
          }
        };

        const patchPicker = (patch) => setPicker((current) => (current === null ? current : { ...current, ...patch }));

        const roleLabel = (role) => {
          const key = `picker.role.${role}`;
          const label = tr(key);
          return label === key ? role : label;
        };

        /** Rows surviving the role chip and the filter box. */
        const pickerVisible = (() => {
          if (picker === null) return [];
          const needle = picker.filter.trim().toLowerCase();
          return picker.entries.filter((entry) => {
            if (picker.role !== 'all' && entry.role !== picker.role) return false;
            if (needle === '') return true;
            return entry.preview.toLowerCase().includes(needle)
              || roleLabel(entry.role).toLowerCase().includes(needle);
          });
        })();

        const selectedSet = new Set(picker === null ? [] : picker.selected);
        const selectedCharacters = picker === null
          ? 0
          : picker.entries.reduce((sum, entry) => (selectedSet.has(entry.index) ? sum + entry.characters : sum), 0);

        /** Which roles are actually present, for the filter chips. */
        const roleCounts = (() => {
          const counts = { all: 0, user: 0, assistant: 0, checkpoint: 0 };
          if (picker === null) return counts;
          for (const entry of picker.entries) {
            counts.all++;
            if (entry.role in counts) counts[entry.role]++;
          }
          return counts;
        })();

        const setSelected = (indices) => patchPicker({ selected: indices, error: '' });

        const toggleEntry = (index) => setPicker((current) => {
          if (current === null) return current;
          const next = current.selected.includes(index)
            ? current.selected.filter((value) => value !== index)
            : [...current.selected, index];
          return { ...current, selected: next, anchor: index, error: '' };
        });

        /**
         * Shift-click adds every visible row between the anchor and this one —
         * the range gesture every chat app has. Only visible rows are covered,
         * so a range inside a filtered list stays inside that filter.
         */
        const selectRangeTo = (index) => {
          if (picker === null || picker.anchor === null) return null;
          const order = pickerVisible.map((entry) => entry.index);
          const from = order.indexOf(picker.anchor);
          const to = order.indexOf(index);
          if (from < 0 || to < 0) return null;
          const low = Math.min(from, to);
          const high = Math.max(from, to);
          return order.slice(low, high + 1);
        };

        const onRowActivate = (entry, event) => {
          if (picker === null) return;
          if (event !== undefined && event !== null && event.shiftKey === true) {
            const range = selectRangeTo(entry.index);
            if (range !== null) {
              setPicker((current) => (current === null ? current : {
                ...current,
                selected: [...new Set([...current.selected, ...range])],
                error: '',
              }));
              return;
            }
          }
          toggleEntry(entry.index);
        };

        /** Arrow/Home/End move between rows; Ctrl/Cmd+A ticks everything visible. */
        const onPickerKeyDown = (event) => {
          if (picker === null) return;
          if ((event.ctrlKey === true || event.metaKey === true) && (event.key === 'a' || event.key === 'A')) {
            event.preventDefault();
            setSelected(pickerVisible.map((entry) => entry.index));
            return;
          }
          const move = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
          if (!move.includes(event.key)) return;
          const root = event.currentTarget;
          if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return;
          const rows = Array.from(root.querySelectorAll('[data-session-copy-row]'));
          if (rows.length === 0) return;
          event.preventDefault();
          const at = rows.indexOf(document.activeElement);
          let next = 0;
          if (event.key === 'ArrowUp') next = at <= 0 ? rows.length - 1 : at - 1;
          else if (event.key === 'End') next = rows.length - 1;
          else if (event.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % rows.length;
          const target = rows[next];
          if (target !== undefined && typeof target.focus === 'function') target.focus();
        };

        /** Copy just the ticked messages. */
        const submitSelection = async () => {
          const current = picker;
          if (current === null || current.busy) return;
          if (current.selected.length === 0) {
            patchPicker({ error: tr('error.noSelection') });
            return;
          }
          patchPicker({ busy: true, error: '' });
          try {
            const text = await actions.selectionMarkdown(sessionId, current.selected.slice());
            setPicker(null);
            announce({ tone: 'ok', text });
          } catch (error) {
            setPicker((latest) => (latest === null
              ? latest
              : { ...latest, busy: false, error: describe(error) }));
          }
        };

        /** Save the ticked messages to a file instead of the clipboard. */
        const exportSelection = async () => {
          const current = picker;
          if (current === null || current.busy) return;
          if (current.selected.length === 0) {
            patchPicker({ error: tr('error.noSelection') });
            return;
          }
          patchPicker({ busy: true, error: '' });
          try {
            const text = await actions.selectionFile(sessionId, current.selected.slice());
            setPicker(null);
            announce({ tone: 'ok', text });
          } catch (error) {
            setPicker((latest) => (latest === null
              ? latest
              : { ...latest, busy: false, error: describe(error) }));
          }
        };

        const chip = (id, count) => uiButton({ variant: picker.role === id ? 'primary' : 'ghost', size: 'sm',
          type: 'button',
          'aria-pressed': picker.role === id,
          onClick: () => patchPicker({ role: id }),
          children: `${id === 'all' ? tr('picker.chip.all') : roleLabel(id)} ${count}`,
        });

        const pickerChips = picker === null ? null : jsx('div', {
          className: CSS.chips,
          children: ['all', 'user', 'assistant', 'checkpoint']
            .filter((id) => id === 'all' || roleCounts[id] > 0)
            .map((id) => chip(id, roleCounts[id])),
        });

        /** Filter box, bulk actions and the live selection meter. */
        const pickerToolbar = picker === null ? null : jsxs('div', {
          className: CSS.toolbar,
          children: [
            jsx('input', {
              ref: filterRef,
              type: 'text',
              className: CSS.filter,
              value: picker.filter,
              placeholder: tr('picker.filter'),
              'aria-label': tr('picker.filter'),
              onChange: (event) => patchPicker({ filter: event.target.value }),
              onKeyDown: (event) => {
                // ArrowDown is the conventional way out of a filter box and into
                // its results; without it the arrow keys only work after a click.
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                focusFirstRow();
              },
            }),
            uiButton({ variant: 'ghost', size: 'sm',
              disabled: pickerVisible.length === 0,
              onClick: () => setSelected(pickerVisible.map((entry) => entry.index)),
              children: tr('picker.selectAll'),
            }),
            uiButton({ variant: 'ghost', size: 'sm',
              disabled: picker.selected.length === 0,
              onClick: () => setSelected([]),
              children: tr('picker.clear'),
            }),
            jsxs('span', {
              className: CSS.order,
              children: [
                uiButton({ variant: picker.newestFirst === true ? 'ghost' : 'primary', size: 'sm',
                  'aria-pressed': picker.newestFirst !== true,
                  title: tr('picker.orderAsc'),
                  onClick: () => patchPicker({ newestFirst: false, activeGroup: 0 }),
                  children: tr('picker.orderAsc'),
                }),
                uiButton({ variant: picker.newestFirst === true ? 'primary' : 'ghost', size: 'sm',
                  'aria-pressed': picker.newestFirst === true,
                  title: tr('picker.orderDesc'),
                  onClick: () => patchPicker({ newestFirst: true, activeGroup: 0 }),
                  children: tr('picker.orderDesc'),
                }),
              ],
            }),
            jsx('span', {
              className: CSS.count,
              children: picker.selected.length === 0
                ? tr('picker.selected', { n: 0, total: picker.entries.length })
                : tr('picker.meter', {
                  n: picker.selected.length,
                  total: picker.entries.length,
                  c: selectedCharacters.toLocaleString(),
                }),
            }),
          ],
        });

        //#region timeline

        /** `HH:MM` in the viewer's locale, or null when the log has no time. */
        const formatClock = (ms) => {
          if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
          try {
            return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          } catch {
            return null;
          }
        };

        /**
         * `Oct 23` / `10月23日` — the calendar day, so a timeline that spans days
         * is readable without hovering. The year is left out on purpose: a
         * session is a conversation, not an archive.
         */
        const formatDay = (ms) => {
          if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
          try {
            return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          } catch {
            return null;
          }
        };

        /** A full, unambiguous stamp for a tooltip. */
        const formatStamp = (ms) => {
          if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
          try {
            return new Date(ms).toLocaleString();
          } catch {
            return '';
          }
        };

        /**
         * Group the visible rows by turn.
         *
         * A turn is the unit the timeline is about: it is what a reader
         * recognises as "that exchange", and it is what the rail's markers point
         * at. Rows with no turn (an old log, or a record written before the first
         * `turn/start`) fall into a single leading group labelled with a dash, so
         * nothing is ever dropped from the list just because it cannot be placed.
         */
        const pickerGroups = (() => {
          const groups = [];
          for (const entry of pickerVisible) {
            const key = typeof entry.turn === 'number' ? entry.turn : null;
            const last = groups[groups.length - 1];
            if (last !== undefined && last.turn === key) {
              last.entries.push(entry);
              if (typeof entry.time === 'number') {
                if (last.start === null) last.start = entry.time;
                last.end = entry.time;
              }
            } else {
              groups.push({
                turn: key,
                entries: [entry],
                start: typeof entry.time === 'number' ? entry.time : null,
                end: typeof entry.time === 'number' ? entry.time : null,
              });
            }
          }
          return groups;
        })();

        /**
         * The groups in the order they are rendered.
         *
         * Newest-first reverses the groups *and* the rows inside each group, so
         * within one turn the latest message is still the nearest one. Selection
         * is unaffected: it keys off each entry's `index`, not its position.
         */
        const newestFirst = picker !== null && picker.newestFirst === true;
        const orderedGroups = newestFirst !== true
          ? pickerGroups
          : pickerGroups
            .slice()
            .reverse()
            .map((group) => ({ ...group, entries: group.entries.slice().reverse() }));

        /** Every row index in one group, in list order. */
        const groupIndices = (group) => group.entries.map((entry) => entry.index);

        /** How many of a group's rows are ticked. */
        const groupChecked = (group) => group.entries.reduce(
          (count, entry) => (selectedSet.has(entry.index) ? count + 1 : count), 0,
        );

        /** Tick a whole turn, or clear it when it is already fully ticked. */
        const toggleGroup = (group) => {
          const indices = groupIndices(group);
          const allOn = indices.every((index) => selectedSet.has(index));
          setPicker((current) => {
            if (current === null) return current;
            const keep = new Set(current.selected);
            if (allOn) for (const index of indices) keep.delete(index);
            else for (const index of indices) keep.add(index);
            return { ...current, selected: [...keep].sort((a, b) => a - b), error: '' };
          });
        };

        /**
         * `10月23日 13:20–13:26`, or `10月23日 23:50 – 10月24日 00:12` when one
         * turn crosses midnight. The date is always shown: readers look for "the
         * one from the 23rd", not "the one at 13:20".
         */
        const groupRange = (group) => {
          const from = formatClock(group.start);
          if (from === null) return '';
          const fromDay = formatDay(group.start);
          const to = formatClock(group.end);
          const prefix = fromDay === null ? '' : `${fromDay} `;
          if (to === null || to === from) return `${prefix}${from}`;
          const toDay = formatDay(group.end);
          if (toDay === null || toDay === fromDay) return `${prefix}${from}–${to}`;
          return `${prefix}${from} – ${toDay} ${to}`;
        };

        const groupLabel = (group) => (group.turn === null
          ? tr('picker.turnUnknown')
          : tr('picker.turn', { n: group.turn }));

        /** Jump the list to one group, used by the rail. */
        const scrollToGroup = (index) => {
          const root = dialogRef.current;
          if (root === null || root === undefined || typeof root.querySelector !== 'function') return;
          const node = root.querySelector(`[data-session-copy-group="${index}"]`);
          const list = root.querySelector(`.${CSS.list}`);
          if (node === null || node === undefined || list === null || list === undefined) return;
          // Group headers stick to the top, so landing exactly on offsetTop is
          // what puts the header — not its first row — at the top of the view.
          if (typeof list.scrollTo === 'function') list.scrollTo({ top: node.offsetTop, behavior: 'smooth' });
          else list.scrollTop = node.offsetTop;
        };

        /**
         * Track which turn the reader is looking at.
         *
         * The header is sticky, so "the group whose header is pinned" is the
         * group whose top is at or above the scroll position. Walking from the
         * end makes the first match the current one.
         */
        const onListScroll = (event) => {
          const root = event === null || event === undefined ? null : event.currentTarget;
          if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return;
          const headers = root.querySelectorAll('[data-session-copy-group]');
          if (headers.length === 0) return;
          const top = root.scrollTop + 4;
          let active = 0;
          for (let index = headers.length - 1; index >= 0; index--) {
            if (headers[index].offsetTop <= top) { active = index; break; }
          }
          if (active !== picker.activeGroup) patchPicker({ activeGroup: active });
        };

        const pickerRail = (() => {
          if (orderedGroups.length === 0) return null;
          const span = Math.max(orderedGroups.length - 1, 1);
          return jsxs('div', {
            className: CSS.rail,
            'aria-hidden': 'true',
            children: [
              jsx('span', { className: CSS.railTrack }),
              ...orderedGroups.map((group, index) => {
                const top = orderedGroups.length === 1 ? 50 : (100 * index) / span;
                return jsx('button', {
                  type: 'button',
                  className: index === picker.activeGroup
                    ? `${CSS.railDot} ${CSS.railDotOn}`
                    : CSS.railDot,
                  style: { top: `${top}%` },
                  tabIndex: -1,
                  'aria-label': `${groupLabel(group)} ${groupRange(group)}`.trim(),
                  title: [`${groupLabel(group)} ${groupRange(group)}`.trim(), formatStamp(group.start)]
                    .filter((text) => text !== '').join(' · '),
                  onClick: () => scrollToGroup(index),
                }, `rail-${index}`);
              }),
            ],
          });
        })();

        const groupHeader = (group, index) => {
          const checked = groupChecked(group);
          const all = checked === group.entries.length;
          return jsxs('div', {
            className: CSS.group,
            'data-session-copy-group': String(index),
            children: [
              jsx('span', { className: CSS.groupTurn, children: groupLabel(group) }),
              groupRange(group) === '' ? null : jsx('span', { children: groupRange(group) }),
              jsx('span', {
                className: CSS.groupCount,
                children: tr('picker.turnCount', { n: group.entries.length }),
              }),
              uiButton({ variant: all ? 'primary' : 'ghost', size: 'sm',
                className: all ? `${CSS.groupToggle} ${CSS.groupToggleOn}` : CSS.groupToggle,
                onClick: () => toggleGroup(group),
                title: all ? tr('picker.turnClear') : tr('picker.turnSelect'),
                children: all ? tr('picker.turnClear') : tr('picker.turnSelect'),
              }),
            ],
          });
        };

        //#endregion

        const pickerRow = (entry) => {
          const checked = selectedSet.has(entry.index);
          return jsxs('div', {
            className: checked ? `${CSS.row} ${CSS.rowOn}` : CSS.row,
            role: 'checkbox',
            'aria-checked': checked,
            tabIndex: 0,
            'data-session-copy-row': '',
            onClick: (event) => onRowActivate(entry, event),
            onKeyDown: (event) => {
              if (event.key !== ' ' && event.key !== 'Enter') return;
              event.preventDefault();
              toggleEntry(entry.index);
            },
            children: [
              jsx('span', {
                className: checked ? `${CSS.box} ${CSS.boxOn}` : CSS.box,
                'aria-hidden': 'true',
                children: checked && IconCheck !== null ? jsx(IconCheck, {}) : null,
              }),
              jsxs('span', {
                className: CSS.rowText,
                children: [
                  jsxs('span', {
                    className: CSS.role,
                    title: formatStamp(entry.time),
                    children: [
                      roleLabel(entry.role),
                      formatClock(entry.time) === null
                        ? null
                        : jsx('span', { className: CSS.time, children: ` · ${formatClock(entry.time)}` }),
                    ],
                  }),
                  jsx('span', { className: CSS.preview, children: entry.preview }),
                ],
              }),
              jsx('span', { className: CSS.rowChars, children: entry.characters.toLocaleString() }),
            ],
          });
        };

        const pickerList = (() => {
          if (picker === null) return null;
          if (picker.status === 'loading') {
            return jsx('div', { className: CSS.empty, children: tr('picker.loading') });
          }
          if (picker.entries.length === 0) {
            return jsx('div', { className: CSS.empty, children: tr('picker.empty') });
          }
          if (pickerVisible.length === 0) {
            return jsx('div', { className: CSS.empty, children: tr('picker.noMatch') });
          }
          const rows = [];
          orderedGroups.forEach((group, index) => {
            rows.push(groupHeader(group, index), ...group.entries.map((entry) => pickerRow(entry)));
          });
          return jsxs('div', {
            className: CSS.listWrap,
            children: [
              pickerRail,
              jsx('div', {
                className: CSS.list,
                onKeyDown: onPickerKeyDown,
                onScroll: onListScroll,
                children: rows,
              }),
            ],
          });
        })();

        const pickerFoot = picker === null ? null : jsxs('div', {
          className: CSS.foot,
          children: [
            jsx('span', { className: CSS.hint, children: tr('picker.hint') }),
            uiButton({ variant: 'ghost',
              onClick: closePicker,
              children: tr('picker.cancel'),
            }),
            uiButton({ variant: 'outline',
              disabled: picker.busy || picker.selected.length === 0,
              onClick: () => {
                void exportSelection();
              },
              children: picker.busy ? tr('pick.exporting') : tr('pick.export'),
            }),
            uiButton({ variant: 'primary',
              disabled: picker.busy || picker.selected.length === 0,
              onClick: () => {
                void submitSelection();
              },
              children: picker.busy ? tr('picker.copying') : tr('picker.copy'),
            }),
          ],
        });

        const pickerBody = picker === null ? null : jsxs('div', {
          className: CSS.pickerBody,
          children: [
            pickerToolbar,
            pickerChips,
            pickerList,
            picker.error === '' ? null : jsx('div', { className: CSS.pickerError, children: picker.error }),
          ],
        });

        /**
         * The dialog frame is this plugin's own, not the Host's `Modal`.
         *
         * `Modal` applies its own width to its frame, which on a wide screen left
         * the picker a narrow, very tall column and put the scrollbar on the frame
         * instead of on the message list — and the plugin's width rules never
         * applied in that path. Rendering the frame here keeps the proportions and
         * the scroll container identical on every Host version. What `Modal` would
         * have supplied is covered explicitly: mask dismissal, Escape, an initial
         * focus target and a Tab loop.
         */
        const pickerNode = picker === null ? null : jsx('div', {
          className: CSS.mask,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closePicker();
          },
          children: jsxs('div', {
            ref: dialogRef,
            className: CSS.dialog,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': tr('picker.title'),
            onKeyDown: onDialogKeyDown,
            children: [
              jsxs('div', {
                className: CSS.dialogHead,
                children: [
                  jsxs('div', {
                    className: CSS.dialogTitles,
                    children: [
                      jsx('div', { className: CSS.dialogTitle, children: tr('picker.title') }),
                      jsx('div', { className: CSS.dialogDesc, children: tr('picker.description') }),
                    ],
                  }),
                  uiButton({ variant: 'ghost', size: 'sm',
                    'aria-label': tr('picker.cancel'),
                    onClick: closePicker,
                    icon: IconClose === null ? '\u00d7' : jsx(IconClose, {}),
                  }),
                ],
              }),
              pickerBody,
              pickerFoot,
            ],
          }),
        });

        //#endregion


        // The custom popover owns the interactions `Menu` would otherwise provide.
        const custom = Menu === null;
        React.useEffect(() => {
          if (!open || !custom || typeof document === 'undefined') return undefined;
          const close = () => setOpen(false);
          const onPointerDown = (event) => {
            const node = wrapRef.current;
            if (node === null) return;
            const target = event.target;
            if (typeof Node !== 'undefined' && target instanceof Node && node.contains(target)) return;
            close();
          };
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          };
          document.addEventListener('pointerdown', onPointerDown, true);
          document.addEventListener('keydown', onKeyDown, true);
          const popover = popoverRef.current;
          const first = popover === null ? null : popover.querySelector('[role="menuitem"]');
          if (first !== null && typeof first.focus === 'function') first.focus();
          return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
          };
        }, [open, custom]);

        /** Arrow/Home/End navigation inside the custom popover. */
        const moveFocus = (event) => {
          if (!MOVE_KEYS.includes(event.key)) return;
          const popover = popoverRef.current;
          const items = popover === null ? [] : Array.from(popover.querySelectorAll('[role="menuitem"]'));
          if (items.length === 0) return;
          event.preventDefault();
          const index = items.indexOf(document.activeElement);
          let next = 0;
          if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
          else if (event.key === 'End') next = items.length - 1;
          else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
          const target = items[next];
          if (typeof target.focus === 'function') target.focus();
        };

        const noticeNode = notice === null ? null : jsx('span', {
          className: notice.tone === 'error' ? `${CSS.notice} ${CSS.noticeError}` : CSS.notice,
          role: 'status',
          'aria-live': 'polite',
          children: notice.text,
        });

        const label = tr('button.label');
        const trigger = uiButton({ variant: 'ghost', size: 'sm',
          'aria-label': label,
          title: label,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
          icon: IconCopy === null ? '\u22ef' : jsx(IconCopy, {}),
        });

        let node;
        if (Menu !== null) {
          node = jsx(Menu, {
            open,
            align: 'end',
            side: 'bottom',
            dense: true,
            portal: true,
            anchor: trigger,
            items: ITEMS.map((item) => ({
              id: item.id,
              label: tr(item.label),
              ...(item.icon === null ? {} : { icon: jsx(item.icon, {}) }),
            })),
            onSelect: (id) => {
              // The picker item opens a dialog; the rest copy immediately.
              if (ITEMS.some((item) => item.id === id && item.picker === true)) void openPicker();
              else void run(id);
            },
            onClose: () => setOpen(false),
          });
        } else {
          node = jsxs('span', {
            className: CSS.node,
            children: [
              trigger,
              open ? jsx('div', {
                ref: popoverRef,
                className: CSS.popover,
                role: 'menu',
                onKeyDown: moveFocus,
                children: ITEMS.map((item) => jsxs('button', {
                  type: 'button',
                  role: 'menuitem',
                  className: CSS.item,
                  onClick: () => {
                    if (item.picker === true) void openPicker();
                    else void run(item.id);
                  },
                  children: [
                    item.icon === null ? null : jsx('span', {
                      className: CSS.itemIcon,
                      children: jsx(item.icon, {}),
                    }),
                    jsx('span', { children: tr(item.label) }),
                  ],
                }, item.id)),
              }) : null,
            ],
          });
        }

        return jsxs('span', { className: CSS.wrap, ref: wrapRef, children: [node, noticeNode, pickerNode] });
      }

      //#endregion

      try {
        ctx.inject(['slots'], (scope) => {
          try {
            scope.slots.inject(SLOT_NAME, () => scope.slots.register({
              name: SLOT_NAME,
              id: PLUGIN_ID,
              order: -1,
              inject: () => ({ actions, tr }),
            }, SessionActionsMenu));
          } catch (error) {
            warn(error);
          }
        });
      } catch (error) {
        warn(error);
      }
    }

    function warn(error) {
      try {
        // eslint-disable-next-line no-console
        console.warn('[dsh-session-copy]', error);
      } catch {
        /* nothing else to do */
      }
    }

    exports.apply = apply;
    /** The Session header slot is the only service this plugin needs. */
    exports.inject = [];
    return module.exports;
  },
});
})();
