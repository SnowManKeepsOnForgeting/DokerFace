# DokerFace

[English](README.md) | 中文

DokerFace 是一个服务端权威的 2-8 人无限注德州扑克平台。项目由 FastAPI/Socket.IO
后端、React 前端、PostgreSQL 数据库和 Caddy 反向代理组成。

## 目录结构

- `backend/`：Python 3.12 后端、Alembic 迁移和测试
- `frontend/`：React + TypeScript + Vite 前端
- `deploy/`：Docker Compose、Caddy、备份和恢复脚本
- `Feature.md`、`Architecture.md`、`Frontend.md`：产品和技术设计文档

## 使用 Docker Compose 部署

### 前置条件

- Docker Engine 及 Docker Compose v2
- 可用的 2 vCPU / 4 GB RAM Linux 主机（生产环境建议）
- 已开放应用端口（默认 `8080`）；PostgreSQL 默认只绑定到本机 `127.0.0.1:5432`

### 首次部署

在项目根目录执行：

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env`，至少修改以下敏感配置：

```dotenv
POSTGRES_PASSWORD=使用高强度随机密码
DOKERFACE_BOOTSTRAP_ADMIN_LOGIN=admin
DOKERFACE_BOOTSTRAP_ADMIN_PASSWORD=使用高强度随机密码
```

启动数据库，等待数据库健康检查通过，然后执行迁移并启动 API 与 Caddy：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d postgres
docker compose --env-file deploy/.env -f deploy/compose.yml run --build --rm api alembic upgrade head
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d api caddy
```

访问地址：

- Web/API 入口：<http://localhost:8080>
- 存活检查：<http://localhost:8080/api/v1/health/live>
- 数据库就绪检查：<http://localhost:8080/api/v1/health/ready>

首次启动时，只有在数据库中尚不存在管理员账户时，才会使用
`DOKERFACE_BOOTSTRAP_ADMIN_LOGIN` 和 `DOKERFACE_BOOTSTRAP_ADMIN_PASSWORD` 创建管理员。
管理员已经存在时，这两个变量不会覆盖现有账户。

### 更新部署

拉取包含新迁移的版本后，先构建临时 API 容器并升级数据库，再启动新版本服务：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml run --build --rm api alembic upgrade head
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d api caddy
```

查看服务状态和日志：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f api
```

停止服务但保留数据库数据：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

不要使用 `down -v`，除非确认要删除 PostgreSQL 数据卷。

### 备份与恢复

备份脚本会生成压缩的 PostgreSQL dump 和 SHA-256 校验文件，默认保留最近 14 份：

```bash
KEEP_COUNT=14 deploy/backup.sh
sha256sum -c deploy/backups/*.sql.gz.sha256
```

备份文件位于 `deploy/backups/`，该目录已加入 Git 忽略。生产环境可以通过 cron 每日执行，
例如：

```cron
15 3 * * * cd /srv/dokerface && /srv/dokerface/deploy/backup.sh >> /var/log/dokerface-backup.log 2>&1
```

恢复会覆盖当前数据库内容，必须显式确认；恢复前先停止 API 和 Caddy：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml stop api caddy
CONFIRM_RESTORE=yes deploy/restore.sh deploy/backups/dokerface-YYYYMMDDTHHMMSSZ.sql.gz
docker compose --env-file deploy/.env -f deploy/compose.yml start api caddy
```

### 生产环境注意事项

- 不要将 `deploy/.env` 提交到 Git，也不要使用示例密码。
- 初始管理员登录后应立即修改密码；后续账户管理使用管理员 API。
- 初始架构只运行一个 API worker，因为房间和进行中的牌局状态保存在 API 进程内存中。
- Compose 已配置容器日志轮转（单文件 10 MiB，最多 5 个文件）；主机级日志归档由部署方负责。

## 本地开发

后端需要 Python 3.12 和 uv：

```bash
cd backend
uv sync --dev
uv run uvicorn app.main:app --reload
```

后端 API 前缀为 `/api/v1`。运行质量检查：

```bash
uv run --locked ruff format .
uv run --locked ruff check .
uv run --locked pyright
uv run --locked pytest -q
```

前端开发：

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

前端开发服务器默认运行在 <http://localhost:5173>；如需访问本地 API，请确保
`DOKERFACE_CORS_ORIGINS` 包含该地址。

## 许可证与产品文档

当前仓库为私有项目。产品约束、架构边界和前端路线分别以 `Feature.md`、`Architecture.md`
和 `Frontend.md` 为准。
