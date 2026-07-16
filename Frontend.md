# DokerFace 前端技术框架与开发计划

## 1. 文档定位

本文以 [Feature.md](./Feature.md) 和 [Architecture.md](./Architecture.md) 为上位约束，定义
DokerFace 前端的技术选型、模块边界、状态模型、协议接入、测试门禁和开发顺序。若本文与
`Feature.md` 的产品行为冲突，以 `Feature.md` 为准；若与 `Architecture.md` 的系统边界冲突，
以 `Architecture.md` 为准并先修订本文。

当前后端已经具备账户、房间、实时牌局、历史、统计、Elo 和主要管理写操作。前端从零开始，
首个里程碑是交付可完整游玩的 MVP，而不是先搭建展示型首页。

本文不替未定产品规则作决定。观战容量和中途加入、补充筹码、主动离座仍保持关闭；邀请制
房间在邀请协议完成前不进入可选项。

## 2. 目标与原则

### 2.1 目标

- 支持 2 至 8 人桌面和移动端浏览器完成登录、建房、等待、游戏、结算和历史查询。
- 清晰展示连接、重连、等待响应、操作被拒绝和服务端重启等非理想状态。
- 牌桌只渲染服务端权威快照，不在浏览器中实现或复制扑克规则。
- REST 和 Socket.IO 协议均有可追踪、可生成、可在 CI 中检查的类型契约。
- 保持适合少于 50 个账户、约 10 名并发用户的实现复杂度，不引入微前端、SSR 或额外状态服务。
- 前端静态资源由现有 Caddy 服务托管，生产环境仍只运行 Caddy、API、PostgreSQL 三个服务。

### 2.2 强制原则

1. 客户端只提交操作意图，不乐观修改筹码、底池、发牌、行动人或胜负。
2. 牌局按钮只由私有快照中的 `legal_actions` 生成；前端校验仅改善输入体验。
3. `state_version` 决定快照新旧，动画和声音不能反向驱动业务状态。
4. 浏览器不读取或持久化会话 Cookie，不把牌局快照、底牌或密码写入 Web Storage。
5. TanStack Query 管理服务端持久数据；Zustand 管理当前连接和实时快照；组件本地状态管理短暂交互。
6. 页面、领域组件和传输层分离，页面组件不直接调用 `fetch` 或裸 `socket.emit`。
7. 所有可恢复错误都显示明确状态；禁止因重连、重复事件或乱序快照产生重复结算动画。
8. 首屏是登录页或工作型大厅，不建设营销落地页。

## 3. 技术栈

脚手架阶段选择当时受维护的稳定版本并锁定精确解析结果，提交 `pnpm-lock.yaml`。后续升级必须
独立提交并通过类型、组件、构建和端到端测试。

| 范围 | 选型 | 用途与约束 |
| --- | --- | --- |
| 运行时 | Node.js 24 LTS | 本地开发和 CI 构建，不进入浏览器运行时 |
| 包管理 | pnpm 10 + Corepack | 严格锁文件，CI 使用 `--frozen-lockfile` |
| 框架 | React 19 + TypeScript | 仅使用函数组件，开启 TypeScript strict |
| 构建 | Vite | 本地开发、静态资源构建和 API/Socket.IO 代理 |
| 路由 | React Router | 路由懒加载、鉴权和角色边界、错误页面 |
| REST 状态 | TanStack Query | 缓存、失效、分页、请求生命周期 |
| 实时状态 | Zustand | 单一 Socket.IO 会话、房间和牌局权威快照 |
| 实时传输 | socket.io-client | Cookie 认证、确认响应、断线和自动重连 |
| 表单 | React Hook Form + Zod | 登录、资料、建房和管理表单 |
| REST 契约 | openapi-typescript + openapi-fetch | 从 FastAPI OpenAPI 生成类型化请求边界 |
| 实时契约 | Pydantic JSON Schema + 生成的 Zod schema | 校验所有入站事件和 `schema_version` |
| 样式 | Tailwind CSS | 设计 token、响应式布局和状态样式 |
| 交互基础 | Radix UI | Dialog、Dropdown、Tabs、Tooltip、Toast 等可访问组件 |
| 图标 | Lucide React | 操作按钮使用统一图标和工具提示 |
| 动画 | Motion | 发牌、筹码、结算和表情；只消费状态差异 |
| 表格 | TanStack Table | 排行榜、历史和管理端数据表 |
| 单元/组件测试 | Vitest + React Testing Library + MSW | 状态归并、表单、路由和 REST 场景 |
| 端到端测试 | Playwright | 在真实 API/Socket.IO 上验证关键旅程 |
| 代码质量 | ESLint + Prettier + `tsc --noEmit` | CI 中零警告、格式稳定、严格类型检查 |

不采用 Next.js、Redux、GraphQL、微前端、Service Worker 离线牌局或浏览器扑克引擎。这些能力
不解决当前规模的问题，反而会扩大状态所有权和部署边界。

## 4. 运行时架构

```text
React Router
├── Public route: /login
└── Authenticated application shell
    ├── REST features ── TanStack Query ── typed REST client ── /api/v1
    ├── Realtime features ── Zustand ── realtime client ── /socket.io
    └── UI-only state ── component state / small UI store

Server snapshot
    -> schema validation
    -> version gate
    -> authoritative store replacement
    -> selectors
    -> table rendering
    -> visual transition derived from previous/current snapshots
```

应用只创建一个 `QueryClient` 和一个 `RealtimeClient`。`RealtimeClient` 在 `/api/v1/me` 成功后连接，
登出或收到全局 `401` 时立即断开并清空实时状态。React Strict Mode 下初始化必须幂等，不能因为
开发环境的重复 effect 建立两条连接。

## 5. 路由与页面

| 路由 | 权限 | 页面职责 |
| --- | --- | --- |
| `/login` | 公开 | 登录、记住登录、认证错误 |
| `/` | 已登录 | 重定向玩家到 `/lobby`，管理员到 `/admin/accounts` |
| `/lobby` | 已登录 | 房间列表、在线玩家入口、排行榜入口 |
| `/rooms/new` | 已登录 | 创建房间及规则摘要确认 |
| `/rooms/:roomId` | 已登录 | 加入、等待、准备、房主控制、聊天 |
| `/rooms/:roomId/table` | 房间成员 | 当前牌局、行动、结算、连接恢复 |
| `/players/:accountId` | 已登录 | 公开资料、统计、近期比赛、排位信息 |
| `/me/profile` | 已登录 | 昵称、头像文字、背景颜色、徽章主题 |
| `/leaderboard` | 已登录 | 排名、筛选、搜索、当前玩家定位 |
| `/matches/:matchId` | 已登录 | 比赛摘要和逐手牌历史 |
| `/hands/:handId` | 已登录 | 单手行动、底池、公开/本人可见底牌 |
| `/admin/accounts` | 管理员 | 账户创建、状态、角色、密码重置 |
| `/admin/matches` | 管理员 | 牌局查询和作废 |
| `/admin/ratings` | 管理员 | 排位批次和全局重置 |
| `/admin/audit` | 管理员 | 管理操作日志 |

路由守卫先等待当前用户查询完成，再决定显示页面、跳转登录或返回 `403`。浏览器返回按钮不能
重新展示已经清除的私有牌局状态。

## 6. 代码组织

使用按业务领域组织、共享层向上依赖的模块化前端。建议结构如下：

```text
frontend/
├── public/
├── scripts/
│   ├── generate-openapi.mjs
│   └── generate-realtime-schemas.mjs
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers.tsx
│   │   ├── router.tsx
│   │   └── query-client.ts
│   ├── routes/
│   │   ├── login/
│   │   ├── lobby/
│   │   ├── room/
│   │   ├── table/
│   │   ├── player/
│   │   ├── leaderboard/
│   │   ├── history/
│   │   └── admin/
│   ├── features/
│   │   ├── auth/
│   │   ├── rooms/
│   │   ├── game/
│   │   ├── chat/
│   │   ├── profiles/
│   │   ├── statistics/
│   │   ├── ratings/
│   │   ├── history/
│   │   └── admin/
│   ├── game-table/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── selectors/
│   │   └── transitions/
│   ├── realtime/
│   │   ├── client.ts
│   │   ├── contracts.generated.ts
│   │   ├── schemas.generated.ts
│   │   ├── store.ts
│   │   └── snapshot-reducer.ts
│   ├── api/
│   │   ├── client.ts
│   │   ├── errors.ts
│   │   ├── query-keys.ts
│   │   └── schema.generated.d.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── AppShell.tsx
│   │   ├── Avatar.tsx
│   │   └── RankBadge.tsx
│   ├── lib/
│   ├── styles/
│   └── main.tsx
├── tests/
│   ├── fixtures/
│   ├── e2e/
│   └── support/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

依赖方向：`routes -> features/game-table -> realtime/api/components -> lib`。`api` 和 `realtime`
不能导入页面组件；领域模块之间通过公开函数、hooks 和类型协作，禁止跨目录读取内部 store 字段。

## 7. REST 数据设计

### 7.1 类型与客户端

- 后端 OpenAPI 是 REST 类型的唯一来源，生成文件禁止手工编辑。
- `openapi-fetch` 统一设置同源基础地址和 `credentials: "include"`。
- 错误适配器把 FastAPI `detail`、网络错误和未知响应转换为稳定的 `ApiError`。
- 开发与 CI 执行契约生成后检查 `git diff --exit-code`，防止后端 schema 已变而生成物未提交。
- 表单 Zod schema负责交互级约束；最终约束仍以服务端响应为准。

### 7.2 Query 所有权

建议 query key：

```text
['session', 'me']
['players', { offset, limit }]
['player', accountId]
['player-statistics', accountId]
['player-matches', accountId, { offset, limit }]
['rooms']
['room', roomId]
['leaderboard', { offset, limit, filters }]
['match', matchId]
['hand', handId]
['admin', 'accounts', filters]
['admin', 'matches', filters]
['admin', 'audit', filters]
```

登录成功后设置 `['session', 'me']`；登出清空全部私有缓存。资料更新后失效本人资料、玩家列表和
排行榜。手牌/比赛结算事件只做精确 query invalidation，不把 REST 实体复制进 Zustand。

认证请求不自动重试。普通 GET 可对瞬时网络错误做有限退避；写操作默认不自动重试，避免用户
看不到的重复管理操作。

## 8. 实时状态与协议

### 8.1 Store 边界

Zustand store 只保存：

- 连接状态：`idle | connecting | connected | reconnecting | disconnected | replaced | failed`。
- 当前 `roomId`、最新 `RoomSnapshot` 和加入/准备/开始操作的 pending 状态。
- 当前 match 的公共快照、同版本本人私有快照和最后一次结算事件。
- 当前待确认的游戏命令及最后一次拒绝原因。
- 有上限的当前房间聊天消息和短生命周期表情队列。

表单输入、弹窗开关、hover、选中的 tab 和加注输入保留在组件内。自定义快捷语句可以作为
不敏感偏好写入 `localStorage`；任何底牌和牌局快照不得持久化，也不增加关闭表情或特效的选项。

### 8.2 快照归并规则

1. 每个入站 payload 先验证 schema 和 `schema_version`；失败时记录诊断并请求完整快照。
2. 不同 `match_id` 的游戏快照不能合并。进入新 match 时原子清除旧 match 的私有数据和动画队列。
3. 同一 match 中，低于当前 `state_version` 的快照直接丢弃。
4. 公共快照可以推进版本；同版本私有快照补充本人底牌和 `legal_actions`。
5. 同版本公共快照不能覆盖已经收到的私有字段；手牌 ID 变化时必须清除上一手底牌。
6. 重复的结算事件以 `(event name, match_id, hand_id, state_version)` 去重。
7. 组件使用 selector 读取派生视图，不能直接拼接公共和私有对象。

### 8.3 命令生命周期

发送 `game:action` 时生成 UUID `command_id`，并固定保存完整 envelope：

```text
idle
  -> pending (禁用全部行动按钮)
  -> acknowledged + newer/equal authoritative snapshot
  -> settled

pending
  -> rejected (显示可理解错误并请求快照)
  -> ack timeout (使用同一 command_id 最多重发一次)
  -> connection lost (保留诊断，不生成新 command_id)
```

重试必须复用完全相同的 `command_id`、`match_id`、`hand_id`、`state_version`、`action` 和 `amount`，
利用后端幂等回放。客户端不得把一次未知结果的操作改成新命令重新发送。收到新快照后仍以服务端
状态为准。

### 8.4 连接与恢复

- 初次认证完成后连接 Socket.IO；同源生产环境不向 `auth` 字段复制 Cookie。
- 每次 `connect` 后等待/接收 `room:snapshot`。若其中有 `match_id`，立即发送
  `game:request-snapshot`。
- `disconnect` 时保持最后一帧只读显示，覆盖连接状态并禁用操作；不清空桌面造成闪烁。
- `connect_error` 若由认证失效导致，重新请求 `/api/v1/me`；确认 `401` 后统一退出。
- 重连后不回放本地事件日志，不自动重放除同一个 pending command 之外的旧操作。
- 倒计时以服务端绝对截止时间显示，到零后仅禁用按钮并等待服务端快照，客户端不自行弃牌。

所有客户端事件都使用 Socket.IO acknowledgement 和超时封装。房间、聊天和管理型实时操作根据
ack 的 `ok/error` 显示结果，不假定 `emit` 即成功。

## 9. 牌桌与交互设计约束

### 9.1 布局

- 牌桌是固定宽高比的响应式工作区，2 至 8 人分别使用预定义座位坐标。
- 当前玩家固定在视觉下方，其余座位按服务端 seat 相对旋转，不改变实际 seat 编号。
- 公共牌、主池/边池、行动人、倒计时和操作栏具有稳定尺寸，内容变化不能推动整体布局。
- 窄屏优先保住本人手牌、操作栏、公共牌、底池和倒计时；行动记录与聊天切换为抽屉或标签页。
- 表情动画避开手牌、公共牌、筹码、操作按钮和倒计时的保留区域。

### 9.2 操作控件

- `fold`、`check_or_call`、`bet_or_raise`、`show`、`muck` 只在 legal action 存在时显示。
- 跟注按钮文案和金额由服务端 `min_amount/max_amount` 生成，不在浏览器推导下注规则。
- 加注使用数值输入、步进按钮和滑杆的组合，范围完全取自服务端；提交前再次取当前快照版本。
- pending 时所有操作入口保持固定尺寸并禁用，防止双击和布局跳动。
- 操作拒绝映射为用户可读提示；未知错误保留错误代码，便于排查。

### 9.3 视觉系统与可访问性

- 大厅、资料和管理页采用安静、紧凑、易扫描的工作型界面；牌桌可以更具表现力但不牺牲信息层级。
- 使用语义颜色区分成功、警告、危险、连接和行动状态，不用单一色相覆盖整个应用。
- 卡片、弹窗和面板圆角不超过 8px；页面区段不堆叠嵌套卡片。
- 图标按钮使用 Lucide 图标和 tooltip；二元配置使用 switch/checkbox，枚举使用 select/radio。
- 头像文字水平垂直居中、允许换行，并用容器测量限制最长内容，不使用视口宽度缩放字体。
- 键盘可完成登录、建房、准备和牌局操作；焦点状态清晰，Dialog 正确锁定和恢复焦点。
- 尊重系统 `prefers-reduced-motion`，减少位移动画但不隐藏结算信息。

## 10. 协议开工门禁

现有后端内核可运行，但以下前端需求尚无完整读取协议。应先以小提交补齐契约和后端测试，再开始
依赖这些数据的 UI。不能通过前端猜测、N+1 请求或快照 diff 长期绕过。

### 10.1 MVP 前必须处理

| 缺口 | 当前影响 | 建议契约 |
| --- | --- | --- |
| 大厅房间响应没有当前人数/观战人数，且未发送 `lobby:rooms-updated` | 大厅不能按需求实时展示容量 | 扩展房间摘要并在创建、加入、离开、开始、结束时发布大厅更新 |
| 游戏快照没有本手 `actions` | 刷新或重连后无法恢复实时行动记录 | 将 actor 已有的 `HandActionSnapshot` 放入公共快照 |
| 结算事件没有类型化底池分配、亮牌和牌型名称 | 结算层无法完整展示赢家与牌型 | 扩展 hand-settled payload，或定义结算后读取手牌历史的稳定流程和牌型字段 |
| 被踢玩家离开 Socket.IO room 后收不到新房间快照 | 被踢页面会停留在旧状态 | 踢出前向目标 SID 发送 `room:kicked`，再离开房间 |
| 管理端没有账户列表读取 API | 已有管理写操作但没有可管理的数据表 | 增加带登录名、角色、状态、资料和分页的管理员账户列表 |
| 普通 HTTP 写操作没有 Architecture 所述 CSRF 协议 | 前端无法发送 CSRF token | 明确采用 token/header 方案并实现，或正式修订架构约束 |
| 缺少实时 schema 导出命令 | TypeScript 事件类型容易漂移 | 后端导出 Pydantic JSON Schema，CI 检查生成物一致 |

为改善倒计时准确性，游戏快照还应增加 `server_time`，前端据此估算时钟偏移。没有该字段时可先
显示近似倒计时，但服务端仍是唯一超时裁决者。

### 10.2 完整功能前处理

| 缺口 | 关联页面 |
| --- | --- |
| 在线玩家状态和大厅在线列表 | 大厅、公开资料 |
| 玩家当前排位、最高分、排位变化历史 API | 个人成长页 |
| 排行榜缺少头像、昵称、徽章、胜率、最近变化和服务端筛选/搜索 | 排行榜 |
| 管理员牌局列表、房间列表、聊天查询、审计日志读取 API，以及强制下线/关闭异常房间命令 | 管理页 |
| 公告的存储和读取协议 | 管理页、应用壳 |
| `show_remaining_board`、`auto_start` 已存储但没有运行时行为 | 创建房间 |
| 三套徽章主题的稳定 ID、展示名称和图片资产尚未定义 | 个人资料、排行榜 |

账户量低于 50 时，排行榜首版可把 `/players?limit=100` 与 leaderboard 在前端按 `account_id` 合并，
但胜率、最近分差和排位历史仍需要后端 API。该合并只能作为有明确删除计划的过渡实现。

### 10.3 未定规则的 UI 策略

- `visibility=invite`、`spectators_allowed`、`allow_mid_match_join`、`allow_rebuys`、
  `allow_voluntary_leave` 不在表单展示。
- 创建房间时对这些必填兼容字段显式提交安全值 `false`；不能让用户误以为功能已经生效。
- 产品规则确认后先更新 `Feature.md` 和后端协议，再单独开放对应 UI。

## 11. 测试策略

### 11.1 单元测试

重点测试纯逻辑：

- 公共/私有快照同版本归并、旧版本拒绝、换手清除底牌。
- 命令 pending、同 ID 重试、ack/rejection/timeout 状态转换。
- seat 相对布局、牌面格式化、段位阈值展示和统计空分母文案。
- API 错误和 Socket.IO error code 到界面文案的映射。
- 截止时间和时钟偏移计算使用 fake timers，不能依赖真实等待。

### 11.2 组件与路由测试

- 登录、建房交叉字段校验、资料编辑和管理确认弹窗。
- 2/3/6/8 人牌桌 fixture 在不同 viewport 下不溢出、不遮挡。
- 只有当前行动玩家且收到 legal actions 时显示操作控件。
- `401`、`403`、空数据、加载、断线、重连和 schema 不兼容状态。
- MSW 只模拟 REST；实时层通过实现相同接口的确定性 fake client 注入。

### 11.3 端到端测试

Playwright 使用真实 PostgreSQL、API 和 Socket.IO，至少覆盖：

1. 管理员创建两个玩家，玩家分别登录。
2. 玩家创建房间，另一玩家加入，双方准备，房主开局。
3. 完成一手牌并验证行动记录、筹码、底池和结算一致。
4. 行动期间刷新页面，恢复同一 `match_id`、最新版本和本人底牌。
5. 重复 `command_id` 不产生两次扣款或两次动画。
6. 比赛完成后历史、统计和排行榜刷新。
7. 管理员重置排位并验证所有账户返回 1000。
8. 非管理员无法进入或调用管理功能。

多浏览器测试通过 Playwright 多 context 实现，不能用同一 context 的多个 tab 代表不同账户，因为
会话 Cookie 和“每账户单连接”策略会相互影响。

### 11.4 视觉与可访问性门禁

- Playwright 截图覆盖桌面、窄屏和移动端横竖屏；至少包含 2 人和 8 人桌。
- 对牌桌截图执行关键区域像素/边界检查，保证牌面已渲染且操作区不被遮挡。
- 使用 axe 检查登录、建房、等待室、牌桌关键控制和管理弹窗。
- CI 不依赖动画完成时间；测试模式关闭非必要动画，但保留最终布局。

## 12. 开发计划

下列工作量以一名熟悉 React/TypeScript 的工程师有效开发日估算，不是日历承诺；不包含未定产品规则
的讨论时间。每个阶段都按“类型/纯逻辑 -> 组件 -> 页面 -> 测试 -> 文档”的顺序形成小提交。

### F0：协议收口与前端基线（3-5 日）

工作：

- 处理 10.1 中的 MVP 协议缺口，并为新字段/事件增加后端测试。
- 创建 Vite + React + TypeScript 工程，锁定依赖。
- 配置 strict TypeScript、ESLint、Prettier、Vitest、Playwright 和路径别名。
- 建立 OpenAPI/实时 schema 生成脚本和契约漂移 CI。
- 建立设计 token、基础字体、错误边界和测试 providers。

验收：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过；生成物可重复；没有
业务页面占位文案冒充完成功能。

### F1：应用壳、认证与 API 基础（2-3 日）

工作：

- 实现类型化 REST client、`ApiError`、query keys 和全局 `401` 处理。
- 实现登录、退出、当前用户、鉴权路由和管理员路由。
- 实现响应式应用壳、导航、Toast、Dialog 和通用加载/空/错误状态。
- 增加 Avatar、RankBadge、ConnectionStatus 等基础组件。

验收：刷新后可恢复 Cookie 会话；退出后 Query cache 和实时私有状态均清空；玩家不能进入管理路由。

### F2：大厅、建房与公开资料基础（3-4 日）

工作：

- 实现房间列表、状态/容量/规则摘要、刷新和大厅实时更新。
- 实现创建房间表单和跨字段校验，隐藏未定或尚未实现的规则。
- 实现玩家列表、公开资料入口、个人资料编辑和头像渲染。
- 房间创建成功后导航并通过 Socket.IO 加入。

验收：所有 `RoomRules` 已定范围均有边界测试；密码只存在于表单提交生命周期；头像长文本和 emoji
不破坏布局。

### F3：实时客户端、等待室与聊天（3-4 日）

工作：

- 实现单例 RealtimeClient、事件 schema 校验、ack 超时和 Zustand store。
- 实现加入/离开/准备/开始/踢人、房主转移和等待室座位。
- 实现文字、快捷语句、自定义快捷语句和定向/全桌表情。
- 实现断线、连接替换、被踢和房间关闭状态。

验收：两个真实浏览器账户可从加入走到开局；重复挂载不创建双连接；被踢用户立即离开旧页面；
聊天和表情只在当前房间显示。

### F4：权威牌桌 MVP（6-8 日）

工作：

- 实现 2 至 8 人预定义座位布局、公共牌、本人底牌、庄位、筹码、下注和主/边池。
- 实现 street、行动人、连接状态、倒计时和本手行动记录。
- 实现 fold/check-call/bet-raise/show/muck 控件与加注输入。
- 实现 snapshot reducer、pending command、拒绝处理和同 ID 有限重试。
- 用状态差异触发发牌、筹码和行动过渡，不做游戏状态预测。

验收：固定 fixture 和真实双人局均可完成一手；任何时刻牌面/筹码来自服务端；2/8 人桌在目标
viewport 无重叠；操作按钮和金额与 `legal_actions` 完全一致。

### F5：结算、重连与历史（3-4 日）

工作：

- 实现手牌结算、赢家/底池分配、比赛结算和继续等待/离开。
- 实现刷新、短断网、切换网络后的快照恢复和过期事件拒绝。
- 实现比赛列表、比赛详情、单手行动/底池记录和底牌隐私展示。
- 结算事件精确失效历史、统计和排行榜 query。

验收：Playwright 双账户完成一手、刷新重连和整场结算；其他玩家未亮底牌不会出现在 DOM、日志、
缓存或截图中。完成本阶段即达到首个可完整游玩的 MVP。

### F6：统计、排位与排行榜（4-5 日）

工作：

- 补齐排位读取协议，实现详细统计、样本不足、近期战绩和排位变化。
- 实现排行榜分页、昵称/ID 搜索、段位筛选和有对局记录切换。
- 高亮当前玩家，并展示相邻名次分差和下一段位分差。
- 在主题 ID、展示名称和图片资产定稿后，实现三套徽章主题的稳定映射和预览。

验收：排序与后端稳定 tie-break 一致；页面显示分数四舍五入但不改变原始精度；零分母不显示误导性
`0%`。

### F7：管理端（4-6 日）

工作：

- 补齐管理查询协议，实现账户列表、创建、停用、恢复、软删除、角色和密码重置。
- 实现牌局查询/作废、房间和聊天查询、排位重置、审计日志。
- 所有高风险操作使用明确对象名称和影响范围的确认 Dialog。
- mutation 成功后精确失效相关 query；失败时保留表单和服务端错误。

验收：权限在路由和 API 两层生效；不能通过 UI 删除最后一名管理员；排位重置和牌局作废后的列表
与服务端重放结果一致。

### F8：部署与上线加固（3-4 日）

工作：

- Caddy 增加静态目录、SPA fallback、缓存头和 `/api`、`/socket.io` 优先反代。
- CI 构建前端静态产物并制作包含产物的 Caddy 镜像；生产服务器不执行 Node 构建。
- 增加 frontend workflow、bundle 预算、依赖许可证检查和 Playwright 流水线。
- 在 2 vCPU/4GB 环境运行 10 客户端持续测试，记录前端错误、连接次数和恢复结果。
- 完成桌面/移动截图、可访问性、键盘操作和真实浏览器验收。

验收：Compose 仍只有三个服务；直接访问任意前端路由可由 SPA fallback 打开；API 和 WebSocket
代理不被静态 fallback 截获；健康检查和现有备份流程不受影响。

## 13. 里程碑与提交策略

### 13.1 里程碑

| 里程碑 | 包含阶段 | 可交付结果 | 估算 |
| --- | --- | --- | --- |
| M1 基础可导航 | F0-F2 | 登录、大厅、建房、资料 | 8-12 日 |
| M2 可玩 MVP | F3-F5 | 双人至八人等待室、完整牌局、重连、历史 | 12-16 日 |
| M3 产品完整 | F6-F7 | 统计、排行榜、完整管理端 | 8-11 日 |
| M4 可部署版本 | F8 | CI 构建、Caddy 托管、浏览器验收 | 3-4 日 |

总计约 31-43 个有效开发日。多人并行时，牌桌状态模型和实时协议仍应由一个明确负责人维护，避免
两个实现同时定义权威状态归并规则。

### 13.2 Git 提交粒度

建议提交节点示例：

```text
Bootstrap frontend toolchain
Generate REST API contracts
Generate realtime event contracts
Add authenticated application shell
Implement login session flow
Add room creation form
Render lobby room summaries
Add Socket.IO connection lifecycle
Implement waiting room controls
Add room chat and emotes
Merge versioned game snapshots
Render responsive poker table
Add server-driven game actions
Recover active games after reconnect
Show hand settlement and history
Add player statistics views
Build deterministic leaderboard
Add administrator account console
Serve frontend assets through Caddy
Add frontend end-to-end coverage
```

每个提交只包含一个可验证行为；生成文件与生成器可以同提交，依赖升级不得混入功能提交。提交前
至少执行受影响测试，阶段结束执行完整前端质量命令和相关后端测试。

## 14. 完成定义

一个前端功能只有同时满足以下条件才算完成：

- 行为符合 `Feature.md`，未替开放产品问题作隐式决定。
- REST/Socket.IO 类型来自可复现契约，入站实时事件经过版本和 schema 校验。
- loading、empty、error、unauthorized、disconnected 和 reconnecting 状态均已设计。
- 桌面和目标移动 viewport 无文本溢出、控件跳动或关键元素遮挡。
- 单元/组件测试覆盖状态边界，关键用户旅程有真实端到端覆盖。
- 不泄漏 Cookie、密码、未公开底牌或其他玩家私有快照。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- 相关文档、契约生成物和部署说明已同步，并形成独立可回滚提交。

## 15. 建议开发命令

脚手架建立后统一提供以下命令：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm contracts:generate
pnpm contracts:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

本地 Vite 将 `/api` 和 `/socket.io` 代理到 API，浏览器始终使用相对 URL。这样本地与生产代码都走
Cookie 会话，不需要把 API 地址、会话 token 或 CORS 特例编译进业务组件。
