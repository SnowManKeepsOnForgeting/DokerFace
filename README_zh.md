# DokerFace

[English](README.md) | 中文

DokerFace 是一个服务端权威的 2-8 人无限注德州扑克平台。项目由 FastAPI/Socket.IO
后端、React 前端、PostgreSQL 数据库和 Caddy 反向代理组成。

## 目录结构

- `backend/`：Python 3.12 后端、Alembic 迁移和测试
- `frontend/`：React + TypeScript + Vite 前端
- `deploy/`：Docker Compose、Caddy、备份和恢复脚本
- `Feature.md`、`Architecture.md`、`Frontend.md`：产品和技术设计文档

## 运行方式概览

本项目有三种常用运行方式：

| 场景 | 访问地址 | `DOKERFACE_ENVIRONMENT` | HTTPS | 适用范围 |
| --- | --- | --- | --- | --- |
| 本地开发 | 前端 `http://localhost:5173`，API `http://localhost:8080` | `development` | 否 | 日常开发和调试 |
| 本机 Compose 验证 | `http://localhost:8080` | `development` | 否 | 验证完整容器部署 |
| 公网生产服务器 | `https://你的域名` | `production` | 是 | 正式使用 |

仓库中的 `deploy/Caddyfile` 和 `deploy/compose.yml` 默认用于本机 Compose 验证。公网生产
部署需要按下文修改域名和端口。

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

前端开发服务器默认运行在 <http://localhost:5173>，开发模式下 API 位于
<http://localhost:8080>。确保后端配置中的 `DOKERFACE_CORS_ORIGINS` 包含这两个本地地址。

## 本机 Docker Compose 验证

### 前置条件

- Docker Engine 及 Docker Compose v2
- 已开放应用端口（默认 `8080`）；PostgreSQL 默认只绑定到本机 `127.0.0.1:5432`

### 首次启动

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

本机验证时保持以下配置：

```dotenv
DOKERFACE_ENVIRONMENT=development
DOKERFACE_CORS_ORIGINS=["http://localhost:5173","http://localhost:8080"]
HTTP_PORT=8080
```

构建并启动整个服务栈：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

一次性的 `migrate` 服务会等待 PostgreSQL 就绪并应用所有尚未执行的 Alembic 迁移。
只有迁移成功后 API 才会启动。

访问地址：

- Web/API 入口：<http://localhost:8080>
- 存活检查：<http://localhost:8080/api/v1/health/live>
- 数据库就绪检查：<http://localhost:8080/api/v1/health/ready>

首次启动时，只有在数据库中尚不存在管理员账户时，才会使用
`DOKERFACE_BOOTSTRAP_ADMIN_LOGIN` 和 `DOKERFACE_BOOTSTRAP_ADMIN_PASSWORD` 创建管理员。
管理员已经存在时，这两个变量不会覆盖现有账户。

## 公网生产服务器部署

建议使用至少 2 vCPU / 4 GB RAM 的 Linux 主机，并准备一个已经解析到服务器公网 IP 的
域名。服务器需要对公网开放 TCP 80、TCP 443；如需 HTTP/3，再开放 UDP 443。PostgreSQL
端口不应对公网开放。

### 生产配置差异

将 `deploy/Caddyfile` 第一行的 `:80` 改为真实域名，例如：

```caddyfile
poker.example.com {
```

Caddy 会为该域名自动申请和续期 HTTPS 证书。域名必须已经正确解析，且服务器的 80/443
端口可以从公网访问。

将 `deploy/compose.yml` 中 Caddy 的端口映射从：

```yaml
ports:
  - "${HTTP_PORT:-8080}:80"
```

改为：

```yaml
ports:
  - "80:80"
  - "443:443"
  - "443:443/udp"
```

服务器上的 `deploy/.env` 使用生产配置：

```dotenv
DOKERFACE_ENVIRONMENT=production
DOKERFACE_CORS_ORIGINS=["https://poker.example.com"]
```

把示例域名替换为真实域名。`production` 会让登录 Cookie 带上 `Secure` 属性，浏览器只会
通过 HTTPS 发送该 Cookie；它本身不会自动开启 HTTPS，因此必须和上述 Caddy 配置一起使用。

首次启动命令与本机 Compose 相同：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

验证生产服务：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps -a
docker compose --env-file deploy/.env -f deploy/compose.yml logs migrate
docker compose --env-file deploy/.env -f deploy/compose.yml logs caddy
curl -f https://poker.example.com/api/v1/health/live
curl -f https://poker.example.com/api/v1/health/ready
```

## 更新已部署版本

生产更新前应确认没有正在进行的牌局，因为活动房间和牌局保存在 API 进程内存中，API
重启会使未完成牌局作废。先创建数据库备份，再拉取并部署明确的 Git tag 或 commit：

```bash
KEEP_COUNT=14 deploy/backup.sh
git fetch --tags origin
git status --short
git checkout <新版本的-tag-或-commit>
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

该命令会重新构建前后端镜像，并在 API 启动前执行 `alembic upgrade head`。没有待执行迁移
时，该步骤也是安全的。`deploy/.env` 不受 Git 更新影响，不要将其提交到仓库。

查看服务状态和日志：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps -a
docker compose --env-file deploy/.env -f deploy/compose.yml logs migrate
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f api
```

`migrate` 容器显示为 `Exited (0)` 属于正常情况；它是一次性任务，而不是常驻服务。

停止服务但保留数据库数据：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

不要使用 `down -v`，除非确认要删除 PostgreSQL 数据卷。

## 备份与恢复

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
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

## 生产环境注意事项

- 不要将 `deploy/.env` 提交到 Git，也不要使用示例密码。
- 初始管理员登录后应立即修改密码；后续账户管理使用管理员 API。
- 初始架构只运行一个 API worker，因为房间和进行中的牌局状态保存在 API 进程内存中。
- Compose 已配置容器日志轮转（单文件 10 MiB，最多 5 个文件）；主机级日志归档由部署方负责。

## 许可证与产品文档

当前仓库为私有项目。产品约束、架构边界和前端路线分别以 `Feature.md`、`Architecture.md`
和 `Frontend.md` 为准。
