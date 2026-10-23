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

    const STYLE_ID = 'dsh-session-copy/menu';
    const STYLE = '.dshSessionCopyWrap{position:relative;display:inline-flex;align-items:center}'
      + '.dshSessionCopyButton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:0;'
      + 'border:0;border-radius:8px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyButton svg{width:15px;height:15px}'
      + '.dshSessionCopyButton:hover,.dshSessionCopyButton[aria-expanded="true"]{color:var(--dsw-alias-label-primary);'
      + 'background:var(--dsw-alias-interactive-bg-hover)}'
      + '.dshSessionCopyNode{position:relative;display:inline-flex;align-items:center}'
      + '.dshSessionCopyPopover{position:absolute;top:calc(100% + 6px);right:0;z-index:45;display:flex;flex-direction:column;gap:2px;'
      + 'min-width:188px;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;'
      + 'background:var(--dsw-alias-bg-base,#fff);box-shadow:0 12px 28px rgba(0,0,0,.18)}'
      + '.dshSessionCopyItem{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;border-radius:6px;'
      + 'background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:12px;'
      + 'line-height:18px;text-align:left;white-space:nowrap}'
      + '.dshSessionCopyItem:hover,.dshSessionCopyItem:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}'
      + '.dshSessionCopyItemIcon{display:inline-flex;align-items:center;flex:none;color:var(--dsw-alias-label-secondary)}'
      + '.dshSessionCopyItemIcon svg{width:14px;height:14px}'
      + '.dshSessionCopyNotice{position:absolute;top:calc(100% + 8px);right:0;z-index:40;max-width:min(440px,62vw);padding:6px 10px;'
      + 'border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);'
      + 'color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:12px;line-height:18px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}'
      + '.dshSessionCopyNoticeError{color:var(--dsw-alias-label-error,#b42318)}';

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
      'menu.markdown': '复制为 Markdown',
      'menu.workingDirectory': '复制工作目录',
      'notice.deepLink': '已复制深度链接',
      'notice.markdown': '已复制为 Markdown',
      'notice.workingDirectory': '已复制工作目录',
      'notice.characters': '（{n} 字符）',
      'notice.failed': '复制失败',
      'error.unavailable': '宿主会话服务不可用',
      'error.failed': '宿主返回错误',
      'error.empty': '该会话还没有可复制的内容',
      'error.noCwd': '该会话没有工作目录',
      'error.clipboard': '浏览器拒绝了剪贴板写入',
    };

    const en = {
      'button.label': 'Copy & share',
      'menu.deepLink': 'Copy deep link',
      'menu.markdown': 'Copy as Markdown',
      'menu.workingDirectory': 'Copy working directory',
      'notice.deepLink': 'Deep link copied',
      'notice.markdown': 'Copied as Markdown',
      'notice.workingDirectory': 'Working directory copied',
      'notice.characters': ' ({n} characters)',
      'notice.failed': 'Copy failed',
      'error.unavailable': 'Host session service unavailable',
      'error.failed': 'The host returned an error',
      'error.empty': 'This session has nothing to copy yet',
      'error.noCwd': 'This session has no working directory',
      'error.clipboard': 'The browser refused the clipboard write',
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

    const clipboardWriter = typeof primitives.writeClipboard === 'function'
      ? primitives.writeClipboard
      : async (text) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
          }
        } catch {
          /* fall through to the legacy path */
        }
        try {
          const area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.top = '-1000px';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const accepted = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
          area.remove();
          return accepted;
        } catch {
          return false;
        }
      };

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

      const readSnapshot = async (sessionId) => {
        const response = await fetch(SNAPSHOT_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
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

      const copy = async (text) => {
        const accepted = await clipboardWriter(text);
        if (accepted === false) throw new Error(tr('error.clipboard'));
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
          const snapshot = await readSnapshot(sessionId);
          const markdown = snapshot.markdown;
          if (typeof markdown !== 'string' || markdown === '') throw new Error(tr('error.empty'));
          await copy(markdown);
          return `${tr('notice.markdown')}${tr('notice.characters', { n: markdown.length })}`;
        },
        /** Copy the session working directory. */
        async workingDirectory(sessionId) {
          let cwd = summaryOf(sessionId)?.cwd;
          if (typeof cwd !== 'string' || cwd === '') {
            const snapshot = await readSnapshot(sessionId);
            cwd = snapshot.cwd;
          }
          if (typeof cwd !== 'string' || cwd === '') throw new Error(tr('error.noCwd'));
          await copy(cwd);
          return `${tr('notice.workingDirectory')}\uff1a${cwd}`;
        },
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
      const IconCopy = primitives.IconCopyOutlineRegular ?? primitives.IconEllipsisOutlineRegular ?? null;
      const IconLink = primitives.IconLinkOutlineRegular ?? null;
      const IconDocument = primitives.IconDeliverDocRegular ?? null;
      const IconFolder = primitives.IconFolderOpenRegular ?? null;

      const ITEMS = [
        { id: 'deepLink', label: 'menu.deepLink', icon: IconLink },
        { id: 'markdown', label: 'menu.markdown', icon: IconDocument },
        { id: 'workingDirectory', label: 'menu.workingDirectory', icon: IconFolder },
      ];

      const CSS = {
        wrap: 'dshSessionCopyWrap',
        node: 'dshSessionCopyNode',
        button: 'dshSessionCopyButton',
        popover: 'dshSessionCopyPopover',
        item: 'dshSessionCopyItem',
        itemIcon: 'dshSessionCopyItemIcon',
        notice: 'dshSessionCopyNotice',
        noticeError: 'dshSessionCopyNoticeError',
      };

      /** Keys the custom popover moves focus with. */
      const MOVE_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

      function SessionActionsMenu(props) {
        const sessionId = props.sessionId;
        const [open, setOpen] = React.useState(false);
        const [notice, setNotice] = React.useState(null);
        const wrapRef = React.useRef(null);
        const popoverRef = React.useRef(null);
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
        const trigger = jsx('button', {
          type: 'button',
          className: CSS.button,
          'aria-label': label,
          title: label,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
          children: IconCopy === null ? '\u22ef' : jsx(IconCopy, {}),
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
              void run(id);
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
                    void run(item.id);
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

        return jsxs('span', { className: CSS.wrap, ref: wrapRef, children: [node, noticeNode] });
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
