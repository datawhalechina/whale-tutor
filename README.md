# Whale Tutor

**AI 驱动的交互式学习产品**(默认演示 Python,通过 `course.yaml` 的 `subject` 字段可配置任意学科)。区别于传统课程的"读文本+做题",学习路径是动态的、个体化的、可重新进入的。

详细产品理念见 [notes/](notes/);开发者文档(架构 / 边界 / 约定)见 [CLAUDE.md](CLAUDE.md);课程作者文档见 [doc/course-authoring.md](doc/course-authoring.md)。

## 当前状态:v0.3 课程作者工具闭环 ✅

> v0.2 智能编排已跑通(StuckProtocol + PathOrchestrator);v0.3 把焦点切到课程作者侧 — `whale-tutor lint` / `whale-tutor build`(AI 从原始 markdown 生成完整课程)/ 多课程支持都已上线。剩余 v0.3 工作(Diagnostic / Archive)详见 [CLAUDE.md](CLAUDE.md) 末尾路线图。

**已实现**

- 内置 2 门课程 / 4 章节 / 9 个学习目标(LO)/ ~30 道必做交互 / 4 道章末测试:
  - **Python 基础**(`python-basics`):列表与迭代(4 LO) + 字符串与格式化(2 LO)
  - **SQL 入门**(`sql-basics`):查询与过滤(2 LO) + 连接(1 LO),验证学科参数化跨语种生效
- 4 种交互模式:**概念检验** / **找 bug** / **代码沙盒**(浏览器跑 Python)/ **自由回忆**
- AI Gateway(DeepSeek)用于:答错时 AI 出"换说法"题 / 章末 free_recall 评估 / spot_the_bug 解释评估 / QA 答疑 / hint 兜底生成 / **`whale-tutor build` 4 阶段课程生成**
- LO 教学开场页(进入新 LO 显示核心讲解 → 学习者点"开始练习"再答题)
- **梯度提示(StuckProtocol)** — 题目上方"求提示",作者可在 RI 写 1-5 级,缺省走 AI 3 级 + cache
- **智能 PathOrchestrator** — 答错触发 AI 出同 LO 换说法题(`source='adaptive'`);连续错 3 次自动 review_lo 兜底回讲解;hint > 0 答对计入必做但不增 mastery
- **学科参数化** — course.yaml 的 `subject` 字段灌进所有 prompt,加新课程(SQL / Java)无需改 prompt
- **多课程 / 多章节切换** — HomeView 课程卡片选课,LearnView 左侧 sidebar 列全部章节并允许跨章浏览
- QA 侧支(右侧 drawer 提问 + 多轮追问 + 结束回到原位)
- mastery 状态机(untouched → exposed → practicing → mastered),mastered 连续错 2 次回归
- **课程作者 CLI**(双发行:pip + npm)— `init / start / doctor / lint / build` 五命令,完整文档 [doc/course-authoring.md](doc/course-authoring.md)

**演示流程**

打开 `http://localhost:5173` → 选课程(Python 或 SQL)→ 点"开始学习" → 走完该课所有 LO → 章末综合 → 章节完成。任意时刻可以点头部"💬 问问题"提问,题目上方"💡 求提示"兜底卡住时。

```
[Python] list.basics → list.indexing → list.mutation → iter.for_over_list → 章末 → 字符串与格式化 → 🎉
[SQL]    select 子句 → where 过滤 → 章末 → inner join → 🎉
```

```
Monorepo (pnpm workspaces)
├── web/                        # Vue 3 + Vite + TS + Element Plus + Pinia
├── server/                     # NestJS + Kysely + mysql2 + AI Gateway + BuildModule
├── packages/
│   ├── tutor-types/            # 前后端共享 TS 类型(workspace 内部)
│   └── cli-node/               # 课程作者 CLI(发到 npm,init / start / doctor / lint / build)
├── scripts/build-cli-bundle.mjs # 构建管道:填 cli-node/_bundle/(经 build/server-bundle/ 中间产物)
├── db/init/                    # MySQL schema(容器首启执行)
├── notes/                      # 产品理念 + 完整架构文档
├── doc/course-authoring.md     # 给课程作者的教程
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

课程内容是 **YAML + markdown 文件**,不入数据库。dev 模式下从 `server/src/knowledge/data/` 加载;CLI 用户从自己 cwd 的 `courses/` 加载(由 `WHALE_TUTOR_COURSES_DIR` env 切换)。

```
server/src/knowledge/data/
├── python-basics/                       # 内置 Python 课
│   ├── course.yaml                      # 课程元数据(含 subject: Python)
│   └── chapters/<chapter-slug>/
│       ├── chapter.yaml
│       ├── description.md
│       ├── los/<lo-name>/               # 每个 LO 一个目录
│       │   ├── lo.yaml                  # 元数据 + 必做题列表
│       │   ├── core-explanation.md      # LO 教学讲解
│       │   ├── ri-1.explanation.md      # 第 1 题题前引子
│       │   └── ri-1.rationale.md        # 第 1 题答案解析
│       └── assessment/                  # 章末综合测试
└── sql-basics/                          # 内置 SQL 课(同结构,subject: SQL)
```

只改内容不改代码:`pnpm dev:server` 重启即可(YAML/MD 内存加载,不涉及 schema)。改了 schema 才需要 `pnpm db:reset`。

**课程作者工作流(给非开发者)**:用 [packages/cli-node](packages/cli-node/) 提供的 `whale-tutor` 命令(`npm install -g whale-tutor`),见 [doc/course-authoring.md](doc/course-authoring.md):
- `whale-tutor init` — scaffold 完整 python-basics 示例
- `whale-tutor build <source>` — 从原始 markdown AI 生成完整 yaml/md(详见 [§10](doc/course-authoring.md#10-whale-tutor-build))
- `whale-tutor lint` — 校验 yaml/$ref/pattern 结构
- `whale-tutor start` — 启动学习环境

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
- **课程作者指南(yaml/$ref、4 种题型、hint、评价、CLI 工作流、`whale-tutor build` AI 生成)** — [doc/course-authoring.md](doc/course-authoring.md)
- **stuck 处理协议(hint / adaptive / review_lo 三机制如何串成兜底)** — [notes/stuck-handling.md](notes/stuck-handling.md)
