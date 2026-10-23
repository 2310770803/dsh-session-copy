# dsh-session-copy

English | [中文](#中文)

One copy button in the DSH Web session header. Click it to open a small menu with
three actions:

| Action | What lands on the clipboard |
| --- | --- |
| **Copy deep link** | `@[title](dsh-session:<base64url(session id)>)` — the canonical DSH session mention. Pasting it into any composer makes the Host attach that session's snapshot, so another conversation can read this one. |
| **Copy as Markdown** | The whole conversation rendered as clean Markdown (headings per turn, tool calls and attachments folded into the transcript), produced by the Host-side read route. |
| **Copy working directory** | The `cwd` of the session, resolved from the Session list projection and falling back to the Host snapshot. |

The button is a single 28 px icon that follows the header's secondary-label
color, so it disappears into the toolbar until hovered. Everything is
feature-detected against the shared client module table: if a future DSH release
drops the `Menu` primitive, the same three actions render in a self-contained
popover instead of degrading into a row of flat buttons.

## Display metadata

The Settings → Plugins card reads this package's metadata without evaluating
`lib/client.js`:

- `locale/en.json` and `locale/zh.json` — `meta.title` / `meta.description`;
- `package.json` `name` / `description` as the fallback;
- `package.json` `icon` (`./icon.svg`) for the card artwork.

## Install

```bash
node scripts/install.mjs --check    # report profile health, change nothing
node scripts/install.mjs            # install or refresh in the desktop profile
node scripts/install.mjs --uninstall
```

The script copies the payload into
`<DSH home>/profiles/<profile>/node_modules/dsh-session-copy`, adds the package
to `dsh.profile.bundles`, and records a `file:../../plugins/dsh-session-copy`
dependency. It also removes a stale `dsh-session-actions` install left by the
previous package name. Restart DeepSeek Harness afterwards: the Loader composes
its entry list at boot.

## Layout

| Path | Role |
| --- | --- |
| `src/plugin.js` | Host half: registers the read-only snapshot route on `webServer`. |
| `src/lib/route.js` | The `/api/session-copy.snapshot` handler, its trust fence and body limits. |
| `src/lib/markdown.js` | Session events → Markdown rendering. |
| `lib/client.js` | Browser half, shipped prebuilt in the loader's closure-factory format. |
| `cordis.patch.yml` | Inserts the `session-copy` row into the Web profile. |
| `locale/`, `icon.svg` | Plugin-list title, description and artwork. |

---

## 中文

在 DSH Web 会话标题栏放一个复制按钮，点开后是三项操作：

- **复制深度链接**：写入 `@[标题](dsh-session:…)` 这段标准会话提及，粘到任何输入框里都能让宿主把这次会话的快照带进去，其他对话因此可以引读本次会话。
- **复制为 Markdown**：由宿主侧只读路由把整段对话渲染成干净的 Markdown（含工具调用与附件摘要）。
- **复制工作目录**：写入该会话的 `cwd`。

按钮只有一个 28px 图标，跟随标题栏次要文字色，悬停才浮现。所有能力都做了特性探测：若将来 DSH 去掉共享的 `Menu` 原语，三个操作会改用自绘弹层，而不会退化成三个平铺按钮。

设置 → 插件 里的卡片名称与说明来自 `locale/zh.json` 的 `meta.title` / `meta.description`，图标来自 `package.json` 的 `icon` 字段，所以不需要加载客户端代码就能显示。

安装与卸载见上方命令；改名后请重启 DeepSeek Harness，Loader 的条目列表在启动时组装。
