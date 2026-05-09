# Whale Tutor

**AI 驱动的 Python 交互式学习产品**。区别于传统课程的"读文本+做题",学习路径是动态的、个体化的、可重新进入的。

详细产品理念见 [notes/](notes/);开发者文档(架构 / 边界 / 约定)见 [CLAUDE.md](CLAUDE.md)。

## 当前状态:v0.2 智能编排闭环 ✅

> v0.2 跑通了,智能 PathOrchestrator + StuckProtocol 都已上线。下一步 v0.3(Diagnostic / Archive / 课程作者工具),详见 [CLAUDE.md](CLAUDE.md) 末尾路线图。

**已实现**

- 1 个课程 / 1 章节 / 4 个学习目标(LO)/ 13 道必做交互 / 1 道章末综合测试
- 4 种交互模式:**概念检验** / **找 bug** / **代码沙盒**(浏览器跑 Python)/ **自由回忆**
- AI Gateway(DeepSeek)用于:答错时 AI 出"换说法"题 / 章末 free_recall 评估 / spot_the_bug 解释评估 / QA 答疑 / hint 兜底生成
- LO 教学开场页(进入新 LO 显示核心讲解 → 学习者点"开始练习"再答题)
- **梯度提示(StuckProtocol)** — 题目上方"求提示",作者可在 RI 写 1-5 级,缺省走 AI 3 级 + cache
- **智能 PathOrchestrator** — 答错触发 AI 出同 LO 换说法题(`source='adaptive'`);连续错 3 次自动 review_lo 兜底回讲解;hint > 0 答对计入必做但不增 mastery
- **学科参数化** — course.yaml 的 `subject` 字段灌进所有 prompt,加新课程(SQL / Java)无需改 prompt
- QA 侧支(右侧 drawer 提问 + 多轮追问 + 结束回到原位)
- mastery 状态机(untouched → exposed → practicing → mastered),mastered 连续错 2 次回归
- 多 LO 自动推进 + 章末测试解锁(章末测试不进 retry)

**演示流程**

打开 `http://localhost:5173` → 点"开始学习" → 走 4 个 LO → 章末综合 → 章节完成。任意时刻可以点头部"💬 问问题"提问,题目上方"💡 求提示"兜底卡住时。

```
list.basics → list.indexing → list.mutation → iter.for_over_list → 章末综合 → 🎉
```

```
Monorepo (pnpm workspaces)
├── web/                        # Vue 3 + Vite + TS + Element Plus + Pinia
├── server/                     # NestJS + Kysely + mysql2 + AI Gateway
├── packages/tutor-types/       # 前后端共享 TS 类型
├── db/init/                    # MySQL schema(容器首启执行)
├── notes/                      # 产品理念 + 完整架构文档
├── CLAUDE.md                   # 开发者必读:架构边界、约定、路线图
└── docker-compose.yml
```

## 环境要求

- Node.js >= 22 LTS
- pnpm >= 8(`corepack enable` 即可,`packageManager` 字段已锁到 pnpm 8.15.x)
- Docker + Docker Compose
- DeepSeek API key(可选 — 没有的话所有 AI 调用走 fallback 文案,不影响 e2e 但章末 free_recall 永远过不了)

## 初始化

```bash
pnpm install
cp .env.example .env
```

编辑 `.env`,填入你的 DeepSeek API key:

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
```

> 没 key 也能跑,但 AI 评估/QA 会走 fallback 文案。建议至少配一个测试 key 体验完整流程。

## 启动方式

### 本地开发(推荐)

只用 docker 起 MySQL,前后端跑在本地以便热更新:

```bash
pnpm db:up                   # 仅启动 mysql(端口 13306)
pnpm build:types             # 先把共享类型打包一次
pnpm dev                     # 并行启动 web (5173) 和 server (3000)
```

第一次起完打开 `http://localhost:5173`,看到首页"开始学习"按钮即成功。

也可以单独启:

```bash
pnpm dev:web
pnpm dev:server
```

前端 dev server 已配置 `/api` 代理到 `http://localhost:3000`,见 [web/vite.config.ts](web/vite.config.ts)。

### 一键拉起后端 + 数据库(生产风格)

```bash
pnpm docker:up        # docker compose up -d
pnpm docker:logs      # 看日志
pnpm docker:down      # 停掉
```

server 镜像通过 [server/Dockerfile](server/Dockerfile) 构建。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行启动 web + server |
| `pnpm build` | 递归构建所有包 |
| `pnpm typecheck` | 各包 tsc 检查 |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm docker:up` / `docker:down` / `docker:logs` | 整套 compose 控制 |
| `pnpm db:up` / `db:down` | 只控 mysql |
| `pnpm db:reset` | 清空 mysql 数据卷并重启(重新执行 `db/init/*.sql`) |

## 数据库

- schema 见 [db/init/01-schema.sql](db/init/01-schema.sql)(12 张表,含事件流 / 派生快照 / QA)
- 容器数据持久化到 docker volume `whale-tutor-mysql-data`
- **暂未配迁移工具**,改 schema 或想清库时用 `pnpm db:reset`(= `docker compose down -v` 删卷 + `up -d mysql` 重起,会重新执行 `db/init/*.sql`)
- ⚠️ `db:reset` 会停掉所有 compose 服务(包括 server 容器,如果在跑)。本地开发只起了 mysql 时无影响;如果你在跑 `pnpm docker:up` 全栈,重置后需重新 `pnpm docker:up`

## 课程内容

课程内容是 **YAML + markdown 文件**,不入数据库。位置:

```
server/src/knowledge/data/python-basics/
├── course.yaml                          # 课程元数据
├── chapters/list_and_iter/
│   ├── chapter.yaml
│   ├── description.md
│   ├── los/<lo-name>/                   # 每个 LO 一个目录
│   │   ├── lo.yaml                      # 元数据 + 必做题列表
│   │   ├── core-explanation.md          # LO 教学讲解
│   │   ├── ri-1.explanation.md          # 第 1 题题前引子
│   │   └── ri-1.rationale.md            # 第 1 题答案解析
│   └── assessment/                      # 章末综合测试
└── ...
```

修改 .md 内容后 `pnpm db:reset && pnpm dev:server` 让 schema 重建 + 内容重载。

校验内容能否通过 schema:

```bash
pnpm --filter @whale-tutor/server build
node server/scripts/verify-knowledge.js
```

## 共享类型 `@whale-tutor/tutor-types`

前后端通过 workspace 协议引用:

```ts
import type { LearningObjective, ServedInteraction } from '@whale-tutor/tutor-types';
```

新增/修改类型后跑 `pnpm build:types`(或 `pnpm --filter @whale-tutor/tutor-types dev` 开 watch)。

## 进一步阅读

- **架构边界、命名约定、模块职责、v0.3 路线图** — [CLAUDE.md](CLAUDE.md)
- **运行时业务逻辑(状态机 / decideNext / DB 写入语义,跨模块改动前必读)** — [notes/orchestrator.md](notes/orchestrator.md)
- **产品理念、教育学原则、交互模式库设计** — [notes/background_1.md](notes/background_1.md) → [notes/background_2.md](notes/background_2.md) → [notes/background_3.md](notes/background_3.md)
- **完整工程架构(4 层 18 模块)** — [notes/plan.md](notes/plan.md)
- **课程作者文档(写课程内容、CLI 工作流、文件引用、hint / 评价机制)** — [doc/](doc/)(待写,v0.3 任务)
