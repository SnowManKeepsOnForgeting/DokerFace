# DokerFace 技术架构与实现路线

## 1. 架构目标

本架构以 [Feature.md](./Feature.md) 为业务基线，针对以下实际规模设计：

- 总账户少于 50 个，同时在线人数通常不超过 10 人。
- 单房间 2 至 8 名玩家，仅支持无限注德州扑克。
- 单机部署，推荐 2 核 CPU、4GB 内存。
- 进行中的牌局保存在服务端内存；服务重启时未完成比赛作废。
- 服务端权威判定发牌、合法操作、底池和结算。
- 优先采用成熟开源组件，不自行实现已有可靠方案。

首个可玩版本的房间规则已经定稿：小盲始终为大盲的一半，前注关闭且兼容字段
`ante` 只能为 `0`；固定手数模式中相同筹码共享名次，并列玩家的 Elo 实际结果为
`S=0.5`；等待中的房主离开时转移给最早加入的玩家，空房间关闭。观战容量、中途加入、
补充筹码、主动离座和历史保留周期仍需单独定稿，运行时不得自行推断这些行为。

架构选择模块化单体，而不是微服务。HTTP API、实时连接、房间协调器和 PokerKit 适配器运行在同一个 Python 进程中，PostgreSQL 负责持久数据。该方案减少部署组件，并确保同一房间的内存状态不会跨进程分裂。

## 2. 总体架构

```text
Browser
├── React UI
├── REST client
└── Socket.IO client
        │
        ▼
Caddy (HTTPS / static files / reverse proxy)
        │
        ▼
FastAPI + python-socketio (single process)
├── Auth & Admin
├── Player/Profile/Leaderboard
├── Room Registry
├── Match Actor (one task per running match)
│   ├── PokerKit Adapter
│   ├── Decision Timer
│   ├── Snapshot Builder
│   └── Match Coordinator
├── Chat Service
├── Statistics Reducer
└── Rating Service
        │
        ▼
PostgreSQL
```

HTTP 用于登录、资料、后台、排行榜和历史查询；Socket.IO 用于大厅变化、房间状态、牌局操作、聊天和断线重连。

## 3. 技术栈

### 后端

| 用途 | 选型 | 原因 |
| --- | --- | --- |
| 语言 | Python 3.12+ | 可直接集成 PokerKit，生态成熟，当前规模性能充足 |
| 依赖管理 | [uv](https://github.com/astral-sh/uv) | 开源、速度快，生成可复现锁文件 |
| HTTP API | [FastAPI](https://github.com/fastapi/fastapi) | 类型化 API、异步支持和自动 OpenAPI 文档 |
| 数据模型 | [Pydantic](https://github.com/pydantic/pydantic) | 请求、响应、配置和实时消息校验 |
| 实时通信 | [python-socketio](https://github.com/miguelgrinberg/python-socketio) | 提供房间广播、确认响应、心跳和自动重连 |
| 扑克规则 | [PokerKit](https://github.com/uoftcprg/pokerkit) | MIT 许可，提供无限注德州状态、行动和牌型/底池逻辑 |
| ORM | [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy) 2.x async | 成熟、明确的事务边界和 PostgreSQL 支持 |
| 数据迁移 | [Alembic](https://github.com/sqlalchemy/alembic) | 与 SQLAlchemy 配套的标准迁移工具 |
| 数据库驱动 | asyncpg | 成熟的异步 PostgreSQL 驱动 |
| 密码存储 | pwdlib + Argon2 | 避免明文密码；不额外引入复杂密码规则或多因素认证 |
| 日志 | structlog | 输出结构化日志，便于按房间、比赛和账户检索 |

### 前端

| 用途 | 选型 | 原因 |
| --- | --- | --- |
| 框架 | [React](https://github.com/facebook/react) + TypeScript | 组件生态成熟，适合实时牌桌和后台页面 |
| 构建工具 | [Vite](https://github.com/vitejs/vite) | 配置轻、开发反馈快 |
| 路由 | [React Router](https://github.com/remix-run/react-router) | 登录、大厅、房间、资料、排行榜和管理页路由 |
| REST 数据 | [TanStack Query](https://github.com/TanStack/query) | 缓存资料、历史、排行榜和后台查询 |
| 实时状态 | [Zustand](https://github.com/pmndrs/zustand) | 保存当前房间连接和服务端牌局快照 |
| 实时客户端 | socket.io-client | 与 python-socketio 协议一致，提供自动重连 |
| 表单 | React Hook Form + Zod | 房间规则、登录和后台表单校验 |
| UI 基础 | [Radix UI](https://github.com/radix-ui/primitives) + [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 使用可访问的交互组件，同时保持牌桌界面可定制 |
| 图标 | [Lucide React](https://github.com/lucide-icons/lucide) | 统一按钮和状态图标 |
| 动画 | [Motion](https://github.com/motiondivision/motion) | 发牌、筹码、表情和状态过渡 |
| 表格 | TanStack Table | 排行榜、账户管理和牌局记录 |
| REST 类型生成 | openapi-typescript | 从 FastAPI OpenAPI 生成前端类型，减少重复定义 |

### 测试与质量

| 范围 | 选型 |
| --- | --- |
| Python 单元/集成测试 | pytest + pytest-asyncio |
| 状态机性质测试 | Hypothesis |
| PostgreSQL 集成测试 | testcontainers-python |
| 前端单元测试 | Vitest + React Testing Library |
| 浏览器端到端测试 | Playwright |
| Python 代码检查 | Ruff + Pyright |
| TypeScript 代码检查 | ESLint + Prettier + TypeScript strict mode |

所有依赖必须固定版本并提交锁文件。PokerKit 只能通过项目适配器引用，避免其 API 变化扩散到房间和网络层。引入依赖前检查许可证、维护状态、发布记录和测试情况；仓库公开但缺少许可证的代码不得复制进项目。

## 4. 开源组件复用边界

### 直接复用

- PokerKit：单手牌状态、牌型计算、合法行动基础、下注、全押和底池结算。
- Socket.IO：实时连接、房间广播、心跳、确认响应和客户端自动重连。
- FastAPI/Pydantic：HTTP 协议和数据校验。
- SQLAlchemy/Alembic/PostgreSQL：数据访问、事务和迁移。
- React 生态组件：页面、表单、表格、图标和动画。

### 项目自行实现

- 房间创建、座位、准备、房主转移和邀请逻辑。
- 赢家通杀与固定手数两种整场比赛模式。
- 盲注按手牌数量翻倍。
- 决策计时、超时弃牌和不限时房间的断线 60 秒兜底。
- 服务端状态版本、操作序号、快照裁剪和断线恢复。
- 聊天、快捷语句和定向/全屏表情。
- 玩家统计、多人 Elo、排行榜和管理员段位重置。
- 后台账户、作废牌局和审计日志。

不引入 Redis、Celery、Kafka、Kubernetes 或独立游戏服务。当前规模不需要这些组件，它们会破坏单机内存牌局的简单性。

## 5. PokerKit 集成设计

### 适配器边界

除 `app/game_engine/pokerkit_adapter.py` 外，其他模块不得直接导入 PokerKit。适配器提供稳定的项目接口：

```python
class PokerEngineAdapter(Protocol):
    def create_hand(self, config, seats, stacks, button) -> HandState: ...
    def legal_actions(self, account_id) -> list[LegalAction]: ...
    def apply_action(self, account_id, action) -> EngineResult: ...
    def public_snapshot(self) -> PublicHandSnapshot: ...
    def private_snapshot(self, account_id) -> PrivateHandSnapshot: ...
    def is_complete(self) -> bool: ...
    def settlement(self) -> HandSettlement: ...
```

动作映射原则：

- `FOLD` 映射到 PokerKit 的弃牌操作。
- `CHECK` 与 `CALL` 映射到 check/call 操作。
- `BET` 与 `RAISE` 统一传入加注后的总下注额，避免增量和总额混淆。
- `ALL_IN` 先由适配器计算目标总额，再交给 PokerKit 校验。
- `SHOW`/`MUCK` 仅在允许亮牌的结算阶段执行。

### 必须验证的规则差异

PokerKit 是底层规则库，不应未经验证直接视为与 Feature 完全一致。实现前先建立契约测试：

- 2 人局庄位、小盲、大盲和翻牌前/后的行动顺序。
- 翻牌前首次加注和后续最小加注增量。
- 未达到完整加注额的短筹码全押不能重新开放加注。
- 3 至 8 人、多名玩家不同金额全押时的多层边池。
- 平局分池及余数筹码按庄位顺时针分配。
- 无人跟注部分的筹码退还。
- A-2-3-4-5 顺子和公共牌组成最佳五张牌。
- 因所有对手弃牌而提前结束。
- 赢家选择亮牌和展示未发出的剩余公共牌。

如果 PokerKit 默认规则与 Feature 不一致，只在适配器或结算后处理层修正，并为差异保留测试，不修改第三方包源码。

### 整场比赛协调器

`MatchCoordinator` 管理多手牌生命周期，PokerKit 每次只负责一手：

```text
创建比赛
→ 随机座位和初始庄位
→ 计算当前盲注等级
→ 使用 PokerKit 创建一手牌
→ 按合法行动推进
→ 保存手牌和统计事件
→ 更新筹码、庄位和淘汰状态
→ 检查赢家通杀/固定手数结束条件
→ 完成比赛、统计和 Elo 结算
```

盲注等级使用纯函数计算：

```text
level = floor((当前手数 - 1) / 翻倍频率)
small_blind = 初始小盲 × 2 ^ level
big_blind = 初始大盲 × 2 ^ level
```

筹码统一使用 64 位整数，防止盲注翻倍后溢出。

## 6. 实时牌局并发模型

每场进行中的比赛创建一个 `MatchActor`，内部包含一个 `asyncio.Queue` 和一个处理任务。玩家操作、计时器到期、断线和管理员关闭房间都转换为命令并进入同一个队列，按顺序处理。

```text
Socket.IO command
        │
        ▼
validate session and envelope
        │
        ▼
MatchActor queue
        │
        ▼
version/idempotency check
        │
        ▼
PokerKit Adapter
        │
        ▼
increment version and broadcast snapshots
```

该模型避免玩家操作与超时任务同时修改牌局。不能用多个线程直接操作同一个 PokerKit 状态对象。

每个客户端命令包含：

```json
{
  "command_id": "uuid",
  "match_id": "uuid",
  "hand_id": "uuid",
  "state_version": 18,
  "action": "RAISE",
  "amount": 240
}
```

服务器保存近期 `command_id`，重复命令返回第一次的处理结果，不再次扣除筹码。成功处理后 `state_version + 1`。

### 快照安全

- 公共快照包含座位、昵称、筹码、公共牌、下注、底池和行动状态。
- 私有快照只向对应账户增加该玩家的底牌和可执行操作。
- 观战者永远只收到公共快照。
- 已弃牌且未主动亮出的底牌不进入其他玩家的历史响应。
- 前端不预测发牌或筹码结果，只可在提交操作后暂时禁用按钮。

## 7. HTTP 与实时协议

### REST API

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/players
GET    /api/v1/players/{account_id}
PATCH  /api/v1/me/profile
GET    /api/v1/players/{account_id}/matches
GET    /api/v1/players/{account_id}/statistics

GET    /api/v1/rooms
POST   /api/v1/rooms
GET    /api/v1/rooms/{room_id}

GET    /api/v1/leaderboard
GET    /api/v1/matches/{match_id}
GET    /api/v1/hands/{hand_id}

POST   /api/v1/admin/accounts
PATCH  /api/v1/admin/accounts/{account_id}
POST   /api/v1/admin/accounts/{account_id}/reset-password
POST   /api/v1/admin/rating-resets
POST   /api/v1/admin/matches/{match_id}/void
GET    /api/v1/admin/audit-logs
```

### Socket.IO 事件

客户端到服务端：

```text
room:join
room:leave
room:ready
room:start
room:kick
game:action
game:request-snapshot
chat:send
emote:send
```

服务端到客户端：

```text
lobby:rooms-updated
room:snapshot
game:public-snapshot
game:private-snapshot
game:action-rejected
game:hand-settled
game:match-settled
chat:message
emote:received
```

所有事件使用 Pydantic 模型校验并带 `schema_version`。REST 类型由 OpenAPI 生成；实时事件模型由 Pydantic 导出 JSON Schema，再生成 TypeScript 类型。

## 8. 身份与权限

- `account_id` 使用 PostgreSQL identity/bigserial，从 1 递增且永久不变。
- 登录名唯一，显示昵称可重复。
- 密码使用 Argon2 哈希，不设置额外复杂度规则。
- 登录成功后签发随机不可预测的 opaque session token。
- 浏览器只保存 `HttpOnly + Secure + SameSite=Lax` Cookie；数据库只保存 token 哈希。
- 普通 HTTP 写操作校验 CSRF；Socket.IO 连接校验 Cookie、Origin、账户状态和单连接规则。
- 管理员操作统一经过 RBAC 检查并写入审计日志。
- 管理员停用或强制下线账户时，撤销全部会话并关闭实时连接。

## 9. 数据模型

### 账户和会话

- `accounts`：ID、登录名、密码哈希、角色、状态、创建时间、最后登录时间。
- `profiles`：账户 ID、显示昵称、头像文字、头像背景颜色、段位徽章主题。
- `sessions`：token 哈希、账户 ID、过期时间、撤销时间、最后活动时间。

### 房间和比赛

- `rooms`：房间 ID、房主、名称、可见性、密码哈希、规则 JSONB、状态、创建时间。
- `matches`：比赛 ID、房间规则快照、模式、状态、开始/结束时间、作废原因。
- `match_players`：比赛、账户、座位、昵称快照、初始/最终筹码、名次、退出原因。
- `hands`：手牌 ID、比赛、手数、庄位、盲注、公共牌、状态和结算摘要。
- `hand_players`：手牌、账户、底牌、是否弃牌/全押/亮牌、投入和赢得筹码。
- `actions`：手牌、序号、状态版本、账户、街道、操作、金额和时间。
- `pots`：手牌、池序号、金额、参与账户和赢家。

### 统计、排位和聊天

- `player_stats`：累计计数器和派生比例，不直接保存无法重建的浮点结果。
- `rating_batches`：管理员重置批次、创建时间和执行管理员。
- `ratings`：账户在当前批次的当前分、最高分和完成场次。
- `rating_changes`：比赛前分数、变化量、比赛后分数和批次。
- `chat_messages`：房间、账户、类型、内容和时间。
- `admin_audit_logs`：管理员、操作、目标、前后摘要和时间。

房间运行态、PokerKit 对象、倒计时和当前命令队列不写入数据库。等待房间只保存基本配置；服务重启后座位和准备状态重新建立。

## 10. 统计与排位实现

### 统计

手牌完成后，`StatisticsReducer` 从已确认的动作事件计算增量计数：

- dealt hands、won hands、profitable matches。
- VPIP、PFR、3-Bet 机会数与发生数。
- showdown 机会数、到达数、获胜数。
- fold、all-in、pot size 和位置计数。

比例在查询时通过计数器计算，分母为 0 时返回数据不足。统计计算版本写入手牌记录，后续修改口径时可以从 `actions` 重建。

### Elo

`RatingCalculator` 是无数据库依赖的纯函数，严格实现 Feature 中的多人 Elo 公式。比赛结束时在一个 PostgreSQL 事务内：

1. 锁定当前 `rating_batch` 和参赛者评分行。
2. 使用比赛开始前的评分计算所有变化。
3. 写入 `rating_changes`。
4. 更新 `ratings` 当前分、最高分和批次场次。
5. 提交后广播排行榜变化。

管理员作废已经结算的比赛时，不能只反向扣除原变化，因为后续比赛的预期胜率受其影响。系统应按时间顺序重放当前批次内所有有效比赛，重新计算全部评分；账户少于 50 时该操作成本很低。

管理员一键重置段位时创建新 `rating_batch`，为所有未停用账户写入 `1000` 分。旧批次保持只读，供审计追溯。

## 11. 前端状态设计

- TanStack Query 管理账户资料、排行榜、历史和管理后台等持久数据。
- Zustand 只管理当前 Socket.IO 连接、房间快照、牌局快照和临时 UI 状态。
- 每次收到完整快照时按 `state_version` 替换本地牌局状态；拒绝比当前版本旧的消息。
- 游戏操作按钮只根据服务端返回的 `legal_actions` 渲染。
- 加注输入限制由服务端快照提供的最小值、最大值和当前跟注额驱动，客户端校验仅改善体验。
- 发牌和筹码动画使用状态变化前后的差异触发，不反向驱动游戏状态。
- 桌面为固定比例响应式区域，2 至 8 个座位使用预定义布局，不用视口字体缩放。

## 12. 目录结构

```text
DokerFace/
├── backend/
│   ├── app/
│   │   ├── api/                 # FastAPI routes
│   │   ├── realtime/            # Socket.IO handlers and schemas
│   │   ├── auth/
│   │   ├── rooms/
│   │   ├── matches/
│   │   ├── game_engine/         # PokerKit adapter only
│   │   ├── statistics/
│   │   ├── rating/
│   │   ├── admin/
│   │   ├── db/
│   │   └── main.py
│   ├── migrations/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── components/
│   │   ├── game-table/
│   │   ├── realtime/
│   │   ├── api/
│   │   └── assets/
│   ├── tests/
│   └── package.json
├── deploy/
│   ├── Caddyfile
│   ├── compose.yml
│   ├── backup.sh
│   ├── restore.sh
│   └── README.md
├── .github/
│   └── workflows/backend.yml
├── Feature.md
└── Architecture.md
```

## 13. 测试策略

### 规则契约测试

先于 WebSocket 和 UI 完成。使用固定牌堆和固定操作序列测试 PokerKit 适配器，覆盖 Feature 中所有关键规则。适配器升级 PokerKit 版本时必须先通过这些测试。

### 性质测试

Hypothesis 随机生成合法筹码、座位和行动序列，验证：

- 一手内所有玩家筹码与所有底池总和守恒。
- 同一张牌不会出现两次。
- 只有当前行动玩家能操作。
- 已弃牌玩家不会赢得底池。
- 玩家只能赢得自己有资格参与的底池。
- Elo 全场变化总和在精度范围内为 0。

### 集成测试

- 登录、会话撤销、管理员权限。
- 创建/加入/准备/开始房间。
- 两个 Socket.IO 客户端同时操作时仍串行结算。
- 刷新后只恢复本人底牌和最新状态。
- 重复 `command_id` 不重复扣筹码。
- 超时与玩家操作同时到达时只有一个生效。
- 比赛完成后手牌、统计和 Elo 在同一业务流程正确落库。
- 作废比赛后评分重放结果一致。

### 端到端测试

Playwright 至少覆盖登录、创建房间、两名玩家开局、完整一手牌、断线重连、比赛结算、排行榜更新和管理员段位重置。

## 14. 实现路线

### 阶段 0：PokerKit 可行性验证

- 建立最小 Python 项目并固定 PokerKit 版本。
- 完成适配器原型和规则契约测试。
- 验证短筹码全押、边池、余数筹码、heads-up 和亮牌规则。
- 只有契约测试通过后才进入房间和 UI 开发。

交付物：可在命令行运行的单手牌状态机、测试报告和已记录的规则差异。

### 阶段 1：项目基础与账户

- 建立前后端目录、锁文件、代码检查和测试流水线。
- 配置 PostgreSQL、SQLAlchemy 和 Alembic。
- 实现管理员初始化、登录、会话、账户和公开资料。
- 完成 Caddy 和 Docker Compose 的本地部署骨架。

### 阶段 2：整场比赛领域层

- 实现 `MatchCoordinator`、盲注升级、两种结束模式和座位轮换。
- 实现事件、快照和公开/私有信息裁剪。
- 保存已完成手牌与比赛结果。
- 完成纯领域层测试，不接 WebSocket。

### 阶段 3：大厅、房间与实时通信

- 接入 python-socketio，完成连接认证和单账户连接替换。
- 实现大厅房间列表、创建/加入/准备/房主操作。
- 实现 `MatchActor` 命令队列、操作序号和状态版本。
- 实现计时器、超时弃牌和简化断线恢复。

### 阶段 4：可玩牌桌前端

- 实现登录、大厅、等待房间和 2 至 8 人牌桌。
- 实现公共牌、底牌、筹码、底池、行动记录和操作控件。
- 使用服务端合法操作驱动按钮和加注输入。
- 添加发牌、筹码和结算动画，并完成桌面/移动端布局测试。

完成后形成首个可完整游玩的 MVP。

### 阶段 5：统计、排位和排行榜

- 实现统计 reducer 和资料页统计。
- 实现多人 Elo、段位区间和排行榜。
- 实现管理员段位重置批次和作废比赛后的评分重放。
- 加入排位变化历史和当前批次最高分。

### 阶段 6：聊天、表情、观战与复盘

- 实现公开房间聊天、快捷语句和自定义快捷语句。
- 实现定向/全屏表情动画。
- 实现只读观战快照和历史牌局复盘。
- 完成头像文字、头像背景颜色和段位徽章主题管理。

### 阶段 7：上线加固

- 完成全量规则、并发、断线和权限测试。
- 配置数据库备份、日志轮转、健康检查和恢复演练。
- 在 2 核 4GB 环境进行 10 个客户端的持续牌局测试。
- 检查依赖许可证、锁文件和安全更新。
- 发布前冻结 PokerKit 版本，禁止未经契约测试的自动升级。

## 15. 部署方案

推荐单机配置：

```text
2 vCPU
4GB RAM
40GB SSD
5Mbps+ network
64-bit Linux
```

Docker Compose 只运行三个服务：

- `caddy`：HTTPS、前端静态资源和反向代理。
- `api`：FastAPI + Socket.IO，固定一个 Uvicorn worker。
- `postgres`：PostgreSQL 单实例。

API 必须保持单 worker。启动多个 worker 会产生彼此独立的房间内存和 PokerKit 状态，导致同一房间玩家看到不同牌局。当前规模通过异步单进程即可满足性能要求。

生产部署要求：

- 前端在 CI 中构建，不在小内存服务器上执行生产构建。
- PostgreSQL 使用持久卷并每日备份；头像只保存文字和颜色，不产生上传文件。
- Caddy 正确代理 Socket.IO WebSocket 连接。
- Docker 设置进程自动重启；重启后未完成比赛按 Feature 作废。
- 日志按大小和时间轮转，避免动作日志占满磁盘。
- 更新前禁止创建新房间并等待现有比赛结束。
- 监控 CPU、内存、磁盘、数据库连接、Socket 数量和活动比赛数。

## 16. 架构约束

以下约束在首版不得绕过：

1. 客户端不决定发牌、合法行动、筹码或胜负。
2. PokerKit 仅通过适配器使用。
3. 每场比赛只有一个命令队列写入状态。
4. 牌局快照必须区分公共信息和账户私有信息。
5. 排位结算和管理员重置必须使用数据库事务。
6. 未完成的比赛不结算排位和正式统计。
7. 后端只运行一个承载牌局状态的进程。
8. 第三方依赖升级必须通过规则契约和端到端测试。
