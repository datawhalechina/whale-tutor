# Whale Tutor

Monorepo（pnpm workspaces）。

```
whale-tutor/
├── web/                        # Vue 3 + Vite + TS + Element Plus
├── server/                     # NestJS + Kysely + mysql2
├── packages/
│   └── tutor-types/            # 前后端共享 TS 类型
├── db/
│   └── init/                   # MySQL 初始化 SQL（容器首启自动执行）
├── docker-compose.yml          # mysql + server
├── pnpm-workspace.yaml
└── package.json                # 公共依赖 & 脚本
```

## 环境要求

- Node.js >= 22 LTS
- pnpm >= 8（`corepack enable` 即可，`packageManager` 字段已锁到 pnpm 8.15.x）
- Docker + Docker Compose

## 初始化

```bash
pnpm install
cp .env.example .env
```

## 启动方式

### 一键拉起后端 + 数据库（生产风格）

```bash
pnpm docker:up        # docker compose up -d
pnpm docker:logs      # 看日志
pnpm docker:down      # 停掉
```

server 镜像通过 [server/Dockerfile](server/Dockerfile) 构建，首次会编译 tutor-types + server。

### 本地开发（推荐）

只用 docker 起 MySQL，前后端跑在本地以便热更新：

```bash
pnpm db:up                   # 仅启动 mysql
pnpm build:types             # 先把共享类型打包一次
pnpm dev                     # 并行启动 web (5173) 和 server (3000)
```

也可以单独启：

```bash
pnpm dev:web
pnpm dev:server
```

前端 dev server 已配置 `/api` 代理到 `http://localhost:3000`，见 [web/vite.config.ts](web/vite.config.ts)。

## 常用脚本（根目录）

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行启动 web + server |
| `pnpm build` | 递归构建所有包 |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | 各包 tsc 检查 |
| `pnpm docker:up` / `docker:down` / `docker:logs` | 整套 compose 控制 |
| `pnpm db:up` / `db:down` | 只控 mysql |
| `pnpm db:reset` | 清空 mysql 数据卷并重启（重新执行 `db/init/*.sql`） |

## 共享类型 `@whale-tutor/tutor-types`

前后端通过 workspace 协议引用：

```ts
import type { User, ApiResponse } from '@whale-tutor/tutor-types';
```

新增/修改类型后跑 `pnpm build:types`（或 `pnpm --filter @whale-tutor/tutor-types dev` 开 watch）。

## 数据库

- schema 见 [db/init/01-schema.sql](db/init/01-schema.sql)
- 容器数据持久化到 docker volume `whale-tutor-mysql-data`
- **暂未配迁移工具**，改 schema 或想清库时用 `pnpm db:reset`（= `docker compose down -v` 删卷 + `up -d mysql` 重起，会重新执行 `db/init/*.sql`）。
- ⚠️ `db:reset` 会顺带停掉所有 compose 服务（包括 server 容器，如果在跑）。本地开发只起了 mysql 时无影响；如果你在跑 `pnpm docker:up` 全栈，重置后需重新 `pnpm docker:up`。
