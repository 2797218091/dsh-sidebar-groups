# dsh-sidebar-groups

DSH 左侧栏内容一多，靠下的条目就被窗口高度裁掉：导航项点不到，工作区列表只剩一半。
这个插件把整列（导航项 + 工作区）合成**一个滚动区**，顶部 logo 区与底部按钮固定不动，
并让导航项和工作区各自能**分组折叠** —— 归属、折叠态和顺序在重启后保留。

![侧栏整列滚动与导航分组](docs/screenshots/after.png)

```sh
dsh plugin add github:2797218091/dsh-sidebar-groups
```

English: [README.en.md](README.en.md)

## 安装

### 从源码装（推荐）

```sh
dsh plugin add github:2797218091/dsh-sidebar-groups
```

仓库里已经提交了构建产物 `lib/`，`package.json` 也没有 `prepare` / `postinstall` 生命周期脚本，
所以这条命令**不编译任何东西**，也不会触发 pnpm 的 `allowBuilds` 构建授权。

### 可选：从 npm 装

想把同一份产物走 npm，先自己发布一次：

```sh
npm publish
```

之后可以按包名安装：

```sh
dsh plugin add dsh-sidebar-groups
```

<!-- TODO: 按包名安装这一形式沿用已发布插件 dsh-boot-animation 的 README 写法，本仓库未实测。 -->

### 装完之后

1. **重启一次 DSH**：bundle 层在启动时装配，不重启不会挂载。
2. 在浏览器里按 **Ctrl+Shift+R** 硬刷新：客户端 bundle 的响应带 `immutable` 缓存头，普通 F5 会继续用旧副本。

## 它能做什么

- **F1 整列滚动** —— 导航项与工作区在同一个滚动容器里，鼠标停在列内任意位置（含工作区条目上）都能滚；
  顶部区与底部按钮不跟着滚；`overscroll-behavior: contain`，滚到顶或底不会把滚动传给页面；
  滚动条细、悬停才明显，出现与消失不引起横向抖动；内容不足一屏时没有滚动条。
- **F2 导航分组** —— 每个导航项有稳定 id（来自 slot 注册表），不按显示文字匹配；每项可放顶层或收进任意分组，
  分组可折叠；组间与组内顺序用面板里的上移 / 下移调整；折叠态、归属、顺序重启后保留。
- **F3 工作区分组** —— 工作区段落同样能分组折叠，配置与导航分组互不影响；不足两个分组时不画分组头，不留空组头。
- **F4 配置入口** —— 侧栏底部的「分组」按钮打开面板，改动立即生效、不需要刷新；配置写进 profile 的挂载行，
  重启保留；旧的独立配置文件一次性回迁，且绝不覆盖你已经通过面板写过的值。
- **F5 不回归** —— 原导航项的点击、跳转、激活态、图标、tooltip 保持原样；侧栏折叠成图标条、窄屏抽屉态下不错位
  （这两态插件整体不接管，见「已知限制」）；没有横向滚动条；不会出现两个侧栏。
- **F6 安全** —— 不发网络请求、不注入远程脚本、不用 `eval`；唯一的文件读取是 host 半的一次性旧配置回迁
  （读 profile 目录下的 `sidebar-groups.json`，存在才读）。

改动前后的对比：`docs/screenshots/before.png` 与 `docs/screenshots/after.png`（同一窗口尺寸、同一 light 主题）。

## 怎么用

1. 点侧栏底部的 **「分组」** 按钮（在设置那一行；侧栏收成图标条时只显示图标，鼠标悬停有原生 title）。
2. 面板里从上到下：
   - `整列滚动（顶部/底部固定）` 勾选框 —— 关掉就回到 DSH 原来的布局；
   - `导航项` 一段：右上角 `+ 分组`；每个分组一行，带折叠三角、上移、下移、删除（至少保留一个分组）；
     组内每项一行，带标签、上移、下移，以及一个「移到分组」下拉；
   - `工作区` 一段：同样的操作；
   - 底部 `恢复默认` 与 `完成`。
   点遮罩或按 `Esc` 关闭面板。
3. 默认预设：顶层留**插件、插件市场、任务看板**三项（顶层分组不显示标题行），其余全部收进默认折叠的「更多」组；
   工作区出厂只有一个「工作区」分组，因此不画分组头。
4. 改动立刻生效并写回配置，不需要刷新；重启 DSH 之后仍然是这个布局。

面板打开时的样子：`docs/screenshots/grouped.png`。图标条态与窄屏抽屉态：`docs/screenshots/collapsed.png`、`docs/screenshots/narrow.png`。

### 那三个默认项是怎么认出来的

DSH 的导航行在 DOM 上没有 `data-panel-id`，插件唯一能和注册表对齐的身份是
`ctx.slots.entriesOfSlot('sidebar.panellist')` 解析出来的 label。所以出厂预设是这么算的：

- 拿**同一时刻注册表里的 label** 与一份候选表比对（中文、英文都列了，比较时忽略大小写与首尾空白）；
- 一个都没对上时，按**注册顺序**取第 1、2、5 项兜底；
- **算一次就落库**：之后所有读写只认算出来的 id，不再碰显示文字，也不写死任何语言。

## 配置结构

配置存在 `settings` 命名空间里，命名空间名**就是** `cordis.patch.yml` 里那条 insert 行的 `id`：

```yaml
- insert:
    - id: sidebar-groups
      name: dsh-sidebar-groups
```

### host 半的 `Config`（`src/index.ts`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `state` | `Schema.any()`，默认 `null` | 整份状态文档，形状由 `src/client/config.ts` 定义；`null` / `undefined` 都表示「还没配置过」 |
| `legacyImported` | `Schema.boolean()`，默认 `false` | 旧的独立配置文件是否已经一次性回迁 |

两个字段都带 `.extra('volatile', true)` —— 这是它们能出现在设置页表单里的原因。

### `state` 的文档形状（`src/client/config.ts`）

```ts
interface SidebarGroupsState {
  version: number      // 当前是 STATE_VERSION = 1
  scrolling: boolean   // 整列滚动；关掉就是 DSH 原来的布局
  nav: { groups: GroupSpec[] }
  workspaces: { groups: GroupSpec[] }
}

interface GroupSpec {
  id: string           // 稳定 id；出厂预设用 top / more / ws-all
  label: string        // 分组标题，面板里新建的默认叫「新分组」/「新工作区分组」
  collapsed: boolean   // 是否折叠
  showHeader: boolean  // false = 不画标题行、不给折叠控件（顶层分组就是这样）
  items: string[]      // 成员 id
}
```

- `version`：`STATE_VERSION = 1`。
- `scrolling`：面板里的「整列滚动（顶部/底部固定）」就是它，出厂为 `true`。
- `nav` / `workspaces`：两段配置**完全独立**，改一边不动另一边。
- 出厂默认里已经存在的三个分组 id 是 `top`、`more`、`ws-all`；`top` 与 `ws-all` 的 `showHeader` 为 `false`，`more` 的 `collapsed` 为 `true`。
- `items` 里放什么：导航侧是 `entriesOfSlot('sidebar.panellist')` 的 id；工作区侧是每个工作区段落的标题文本
  （去空白、截断到 160 字符）—— 这是工作区侧的例外，见「已知限制」第 2 条。
- 插件安装 / 卸载面板之后，**已经不存在的 id 会留在配置里**（保住你的归属选择），**新出现的 id 归到最后一个分组**
  （也就是默认折叠的那个），不会自己挤进顶层。

### 存在哪儿、什么时候写

- 写在**当前 profile 的 entry config**（`dsh-settings` 把写入委托给 config-editor，最终落到 profile 的 Cordis patch），所以重启保留。
- 客户端**不能**直接写 entry config，它只调本插件自己的两条路由：`/sidebar-groups/api/state`（读）与
  `/sidebar-groups/api/update`（POST 写）。
- 写入带 `expectedRevision` 做乐观锁：撞上并发写会返回 409，而不是覆盖别人的文档。
- 浏览器里还有一份 `localStorage` 镜像（键名 `dsh-sidebar-groups:state`），只在宿主路由不可用时兜底。

## 已知限制

按影响排序。这些不是「以后会好」的待办，而是当前实现的真实边界。

1. **工作区只能整块折叠，不能重排。** 工作区行是 React 渲染的节点，`cloneNode` 出来的副本拿不到 React 18 的
   根级事件委托（事件目标没有 internal fiber key），点不动。所以工作区侧只做「整段隐藏 + 自有的折叠头」，
   不复制行、也不移动行。能调的是「哪一段属于哪个分组」和「分组折叠与否」，**不能调整工作区行自己的先后顺序**。
2. **工作区分组的 key 是段落标题文本。** 工作区段落没有 id 可用，插件取段落标题（去空白、截断到 160 字符）当 key。
   后果很直接：**改掉某个工作区的名字，它就会丢失原来的分组归属**，回到第一个（兜底）分组。
   导航侧不存在这个问题 —— 那边用的是 slot 注册表的 id。
3. **分组折叠头只在「分组数 > 1 且段落数 >= 2」时出现。** 出厂只有一个分组，所以第一次装上是**视觉零变化**——
   这正是「不留空组头」的做法，代价是单分组时没有可点的折叠头。
4. **导航分组容器是插在 `<nav>` 末尾的**，这是插件唯一一处进入 React 管理容器的写操作。它只追加、每次刷新重新
   append 到末尾，绝不移动或删除框架节点；但 React 新增一行时，我们的容器会短暂排在那一行前面，由下一次
   200 ms 防抖刷新纠正。原始需求里的「禁止事项 3」与此冲突，按冻结决策执行，风险在 `dom-adapter.ts` 的注释里标注。
5. **不 `require` 平台 seed 的 `resolveSlotLabel`**，用的是本地等价实现（支持 `string | () => string`），
   少一个 seed 依赖。如果将来 label 变成对象形态，会退化到「按注册顺序对齐」。
6. **导航行与 id 的对齐键只能是 `aria-label`**（DOM 里没有 `data-panel-id`）。插件**不硬编码任何语言**：
   它只在运行时把 `aria-label` 与**同一时刻注册表解析出的 label** 逐个比对，对不上就按注册顺序兜底。
   这是对「不按显示文字匹配」的受批例外，理由写在 `dom-adapter.ts` 的 `align()` 与 `config.ts` 的注释里。
   默认预设（插件 / 插件市场 / 任务看板）同样靠这份候选表加注册顺序兜底算出，**算一次就落库，之后只认 id**。
7. **sticky 底栏的背景色优先读实时样式**：先取 `getComputedStyle(root).backgroundColor`，取不到才用
   `var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, transparent))` 兜底。换成自定义配色、且这两层都
   取不到时，底栏可能和内容同色。
8. **底部内边距从 6 px 变成 16 px。** 原来 `.GAkraW_list` 自带的 `padding-bottom: 16px` 被搬到了
   `.wtg9ga_root` 上，容器底部的内边距因此比原生大一些。
9. **面板是 `createPortal` 渲染到 `document.body` 的**，不放在 slot 单元格里 —— 否则会被插件自己引入的
   `overflow` 裁掉。
10. **`scrollbar-gutter: stable` 是常驻预留**：内容不满一屏时看不到滚动条，但右侧那 5 px 仍然被预留。
    这是为了让滚动条出现 / 消失时不横向抖动。
11. **`state` 的默认值不保证读回 `null`。** `Schema.any().default(null)` 在「完全没有配置」时会被
    schemastery 解析成 `{}`。这对功能没有影响（host 把 `null` / `undefined` 当「没存过」，客户端
    normalize 之后就是出厂默认），但别指望在配置里稳定读到 `null`。
12. **图标条态与窄屏抽屉态下插件整体不接管。** 侧栏收成 56 px 轨道、或窄屏抽屉模式（含抽屉关闭态）、
    以及宽度动画 / 拖拽进行中，适配层整轮跳过：那几态没有整列滚动改造，也没有分组，表现和原生一致。
13. **配置落在 localStorage，不回写 profile 的挂载行。** 本机实测：DSH 的 settings 服务拒绝覆盖由
    `cordis.patch.yml` 注入的 entry，写入会回 `Configuration for "sidebar-groups" is overridden by a
    home patch or command line`（面板诊断行里能看到这条原文，字段 `host=`）。所以插件把状态保存在
    桌面端自己的 localStorage（与 profile 同机持久，**关掉重开 DSH 仍然保留**），并把它当作本地镜像；
    一旦哪天 DSH 允许写挂载行配置，host 侧路由会把同一份 state 写进去，客户端不需要改。

## 卸载

1. 如果 profile 的 `cordis.patch.yml` 里还有那条 insert 行（本地 `link:` 安装时手动加的），先删掉它。
2. 移除插件：

```sh
dsh plugin remove dsh-sidebar-groups
```

3. 重启 DSH，并在浏览器里按 **Ctrl+Shift+R**。

适配层的 `teardown()` 会还原被隐藏的节点、移除自己加的容器与样式表，所以侧栏回到原生样子，不留残留节点与样式。

<!-- TODO: dsh plugin remove 的参数形式按 add/remove 对称写成包名，本次未实机执行；profile patch 里已写入的 sidebar-groups 设置值是否会被一并清掉也未核实。 -->

## 兼容性

- **DSH `>= 0.2.1-rc.1`**（`package.json` 的 `dsh.engines.dsh`），桌面端 Web UI。
- **不修改 DSH 本体**：不动 `app.asar`，也不动 profile `node_modules` 里的第三方包。插件只用公开的
  `sidebar.footer.action` slot、`ctx.slots` 注册表、`settings` 服务与 `webServer` 路由，DOM 改造全部在自己的模块里。
- **它依赖 DSH 的 DOM 结构**：侧栏根、导航 `<nav>`、工作区滚动容器，以及几个 `data-sidebar-*` 状态属性。
  DSH 的 CSS-module 类名前缀是「每个包一份、构建期烘焙」的字符串，会随版本变化；插件主链走 `data-*` 与结构锚点，
  类名前缀只作兜底。**升级 DSH 大版本后如果侧栏行为不对，先怀疑这一层。**
- **没有静态 `inject`**：宿主给不出的服务会让插件静默闲置，而不是让整个 GUI 起不来。

## 许可

MIT，见 [LICENSE](LICENSE)。
