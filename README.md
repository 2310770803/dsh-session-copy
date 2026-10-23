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

### From the plugin market

The repository also publishes a single-plugin [plugin market index][index] — the
format DSH's **Plugins → Discover** tab and the `plugin_market` agent tool read.
That is what makes the plugin searchable inside DSH before it exists on npm:

1. Turn on the market's Discover surface once, in **Settings → Plugins**:
   `@deepseek-ai/dsh-experimental-plugin-market-bundle` ships with DSH, switched
   off.
2. **Plugins → Discover → Index sources →** add
   `https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json`
3. Search for "session copy" and install.

The index pins an exact commit rather than a branch, so what Discover installs
is reproducible; `node scripts/build-index.mjs` regenerates `index.json` from
`package.json` and `locale/`, and `node scripts/check-index.mjs` validates the
result with the host's own parser. The index must name the commit *before* the
one that carries it, which is why the pinned SHA is not the file's own commit.

The plugin is also listed in the [awesome-dsh-plugin][awesome] catalog, whose
entry is one YAML file in that repository — `data/plugins/2310770803__dsh-session-copy.yml`.
Because that catalog prefers a prebuilt tarball over a build-from-source
install, every release attaches one:

```bash
dsh plugin --profile web add \
  https://github.com/2310770803/dsh-session-copy/releases/latest/download/dsh-session-copy.tgz
```

The asset name is deliberately version-free. A `releases/latest/download/` URL
resolves `latest` at request time but takes the filename literally, so a
versioned filename would work until the next release and then quietly 404; the
release workflow re-uploads `dsh-session-copy.tgz` on every tag to keep that
URL stable. Installing from source instead — `gh repo` / `git+https` — still
works, it just needs a build-approval step.

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

### 从插件市场安装

仓库还发布了一份单插件 [插件市场索引][index]——就是 DSH **插件 → 发现** 和 `plugin_market` 工具读取的 format 1 文档。正因为有它，插件还没上 npm 时也能在 DSH 里被搜到：

1. 先在「设置 → 插件」里打开市场所需的 `@deepseek-ai/dsh-experimental-plugin-market-bundle`（DSH 自带，默认关闭）；
2. **插件 → 发现 → 索引源** 添加
   `https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json`；
3. 搜「session copy」即可安装。

索引固定的是具体 commit 而不是分支，所以装下来的版本可复现。`node scripts/build-index.mjs` 依据 `package.json` 与 `locale/` 重新生成 `index.json`，`node scripts/check-index.mjs` 用宿主自己的解析器校验结果；索引指向的必须是它前面那个 commit，因此锁定的 SHA 不会等于该文件自身的提交。

插件同时收录在 [awesome-dsh-plugin][awesome] 目录中，条目就是该仓库里的一个 YAML 文件：`data/plugins/2310770803__dsh-session-copy.yml`。该目录优先用预构建 tarball 而不是源码构建，所以每次发版都会附一个：

```bash
dsh plugin --profile web add \
  https://github.com/2310770803/dsh-session-copy/releases/latest/download/dsh-session-copy.tgz
```

资产名刻意不带版本号：`releases/latest/download/` 只在请求时解析 `latest`，文件名是照字面取的，所以带版本号的名字提交当天有效、下一次发版就开始 404，而且不会有人察觉。发布流程会在每个 tag 上重传 `dsh-session-copy.tgz`，让这个链接始终有效。从源码装（`git+https`）同样可用，只是需要一步构建授权。

[index]: https://cdn.jsdelivr.net/gh/2310770803/dsh-session-copy@main/index.json
[awesome]: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
