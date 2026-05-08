# CLAUDE.md

写给参与维护本项目的 AI / 工程师。简明列出架构边界与开发约定。**面向用户的快速上手见 [README.md](README.md)。**

## 项目本质

Whale Tutor 是一个 **AI 驱动的交互式学习陪伴产品**,不是 "AI 生成的课程"。核心差异：动态路径、个体化记忆、可重新进入、产物可带走。

完整产品理念与教育学第一性原理见 [notes/background_1.md](notes/background_1.md) / [notes/background_2.md](notes/background_2.md) / [notes/background_3.md](notes/background_3.md)。完整工程架构（4 层 18 模块）见 [notes/plan.md](notes/plan.md)。

**当前阶段:v0 骨架闭环 ✅ 已跑通**(单人开发)。前后端 + AI Gateway + Pyodide + QA 全部 e2e 验证通过。范围、决策、分阶段设计见 [plan 文件](C:/Users/gyh/.claude/plans/readme-md-mvp-notes-3-background-md-luminous-shannon.md);**实际实现清单与 v0.2 路线图见本文件末尾**。

## 技术栈

- **Monorepo**: pnpm workspaces (Node ≥22, pnpm 8.15.x via corepack)
- **Web**: Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + axios
- **Server**: NestJS + Kysely + mysql2 + ConfigModule
- **共享类型**: [packages/tutor-types](packages/tutor-types)(workspace 协议引用)
- **DB**: MySQL 8.0(docker compose 启,初始化脚本走 `db/init/`)
- **AI 模型**: DeepSeek(OpenAI 兼容协议),通过 AI Gateway 抽象,可切换
- **代码沙盒**: Pyodide(浏览器端 Web Worker,服务端零参与)

## 目录结构

```
whale-tutor/
├── web/                  # Vue 前端
│   ├── src/views/        # 路由页(HomeView/OnboardingView/LearnView/ArchiveView)
│   ├── src/components/   # patterns/ 下放 4 种 Pattern 渲染卡片
│   ├── src/stores/       # Pinia(session/learner/pyodide)
│   ├── src/api/          # axios 薄封装,baseURL=/api
│   ├── src/workers/      # pyodide.worker.ts
│   └── src/router/
├── server/               # NestJS 后端
│   ├── src/database/     # Kysely 全局 provider(@Global)
│   ├── src/users/        # v0.2 认证骨架的占位示例
│   ├── src/session/      # 会话生命周期 + Pattern/Learner/Event 编排
│   ├── src/knowledge/    # 课程图谱(YAML 加载)
│   ├── src/pattern/      # Pattern 注册表 + 4 种实现
│   ├── src/learner/      # Learner Model
│   ├── src/event/        # Event Bus(唯一写入 events 表的入口)
│   └── src/ai/           # AI Gateway + prompt YAML
├── packages/
│   ├── tutor-types/      # 前后端共享 TS 类型(workspace 内部)
│   ├── cli-py/           # ★ Python pip 包(发到 PyPI)
│   │   ├── pyproject.toml
│   │   ├── whale_tutor/  # cli.py / config.py / db.py / runner.py / scaffold.py / doctor.py
│   │   ├── _bundle/      # ⚠ 构建产物,不入 git(由 build:cli-bundle 填充,含 node_modules)
│   │   └── README.md
│   └── cli-node/         # ★ npm 包(发到 npm,给已经有 Node 的用户)
│       ├── package.json  # bin: whale-tutor → bin/cli.mjs
│       ├── bin/cli.mjs   # commander 入口
│       ├── lib/          # config.mjs / db.mjs / runner.mjs / scaffold.mjs / doctor.mjs
│       ├── _bundle/      # ⚠ 构建产物,不入 git(同 cli-py 但不含 node_modules)
│       └── README.md
├── scripts/
│   └── build-cli-bundle.mjs  # 同时填两个 _bundle/(共享 server-bundle 中间产物)
├── db/init/01-schema.sql # MySQL 初始化(docker 首启 + cli-py start 时 idempotent 都跑)
├── notes/                # 产品理念 + 完整架构文档
└── docker-compose.yml
```

## 架构 5 条核心原则(任何改动都要遵守)

1. **内容与模式正交**。LO 是内容(YAML),Pattern 是模式(代码 + prompt 模板)。运行时由 PathOrchestrator 组合。新增课程零修改 Pattern,新增 Pattern 零修改课程。
2. **状态与行为分离**。`learner_state` 是数据,PathOrchestrator 是行为。所有状态读写通过定义好的 service API,不绕过。
3. **AI 调用必须收口**。任何业务模块禁止直调 LLM。所有 LLM 交互走 [server/src/ai/ai-gateway.service.ts](server/src/ai/ai-gateway.service.ts) 的 `complete()`。Prompt 在 `server/src/ai/prompts/*.yaml`,代码不内嵌 prompt 字符串。
4. **事件流是数据真相**。学习者每次行为先写 `events` 表(事实表,不可变),`learner_state` 等派生表理论上可重建。新增数据需求优先想"能不能从 events 派生",而不是新建一张表。
5. **评估是抽象而非功能**。Diagnostic / Formative / Summative / Delayed / Transfer 形态不同,底层是同一套"出题 + 评判 + 更新状态"。`assessment.type` 字段已就位。

## 学习模型(v0 双阶段 + 章末测试)

每个 **LO** 内部分两阶段:

1. **必做阶段(static)** — 学习者按序做完 LO 的 `requiredInteractions`(YAML 静态预置,完整含答案)。期间 mastery 走 `untouched → exposed → practicing`。
2. **自适应阶段(adaptive)** — 必做完成后,PathOrchestrator 根据 mastery 反馈决定:
   - mastered + 高 confidence → 推进下一 LO
   - practicing 但有犹豫 → 调 `Pattern.generate()` 由 AI 用 `adaptivePatterns` 中的某种模式动态出题巩固
   - 连续错 → 回退前置 LO

每个 **Chapter** 末有 **assessment** — 同样是一组 `requiredInteractions`(静态预置,使用现有 4 种 Pattern),所有 LO 都 mastered 后才解锁。Chapter 自身的状态机:`learning → assessment → completed`。

**数据来源**:
- 必做题(LO + Chapter Assessment)的 prompt **完全静态**,YAML 写死题干/选项/答案,AI 不参与生成
- 仅在自适应阶段、AI 评估(free_recall/spot_the_bug 解释)、章末档案生成等场景调 AI Gateway

**类型边界(server-only vs 公开)**:
- [packages/tutor-types/src/domain.ts](packages/tutor-types/src/domain.ts) 中 `*Definition` 系列(`CourseDefinition` / `ChapterDefinition` / `LearningObjectiveDefinition` / `ChapterAssessmentDefinition` / `RequiredInteraction`)是 **server-only**,KnowledgeService 解析 YAML 后的内存结构,含答案/expected/rubric
- 同名无后缀的 `Course` / `Chapter` / `LearningObjective` / `ChapterAssessmentSummary` 是 **公开版**,前端通过 HTTP 拿到的就是这个,只暴露元信息和"必做题数量"
- 服务层做转换:`Definition → Public`,永远禁止把 `*Definition` 直接 `JSON.stringify` 下发

## 课程内容存储格式(YAML + $ref .md)

`server/src/knowledge/data/<course-id>/` 是课程内容的根。**结构与短字段写在 YAML,长 markdown 抽到 .md 文件用 `$ref` 引用**。

```
server/src/knowledge/data/python-basics/
  course.yaml                                    # 课程元数据
  course-description.md
  chapters/
    list_and_iter/
      chapter.yaml                               # 章节元数据 + LO 引用 + assessment 引用
      description.md
      los/
        list_basics/
          lo.yaml                                # LO 定义(结构 + $ref)
          core-explanation.md                    # coreExplanation 兜底文案
          ri-1.explanation.md                    # 必做题 1 的 explanationMd
          ri-1.rationale.md
          ri-2.explanation.md
          ri-2.rationale.md
          ...
        list_indexing/
          ...
      assessment/
        assessment.yaml                          # 章末测试
        ca-1.prompt.md
        ca-1.starter-code.md                     # 长 starter code 也可外置
```

**`$ref` 规则**:

- 路径**相对当前 YAML 文件所在目录**(不是 data/ 根),便于移动整个 LO 目录而不改引用
- 按文件后缀决定行为:
  - `.md` → 读为字符串(内联到该字段)
  - `.yaml` / `.yml` → 读为 YAML 对象(递归 resolve 其中的 $ref)
- 允许混合:同一字段在不同位置可以一处 inline 字符串、一处 `$ref`,加载器都接

```yaml
# lo.yaml 片段
id: lo.list.basics
name: 列表的创建与表示
description: 用 [] / list() 创建,理解 len 与异质元素   # 短字段直接 inline
coreExplanation: { $ref: ./core-explanation.md }       # 长 markdown 外置
prerequisites: []
requiredInteractions:
  - id: ri.list.basics.1
    patternId: concept_check
    prompt:
      explanationMd: { $ref: ./ri-1.explanation.md }
      question:
        stem: 下列哪个表达式创建一个空列表?
        options: ["[]", "{}", "list{}", "list[]"]
        answerIndex: 0
        rationale: { $ref: ./ri-1.rationale.md }
adaptivePatterns: [concept_check, free_recall]
```

**KnowledgeService 加载流程**:

1. 读 `course.yaml`,递归处理所有 `$ref`(.yaml 加载并继续 resolve;.md 读为字符串)
2. 得到完全扁平的 `CourseDefinition` 内存对象
3. 用 ajv 对完整结构做 schema 校验
4. 失败时启动报错并指明哪个文件 / 哪个字段(便于内容作者定位)

**修改内容的工作流**:改 .md 文件 → 重启 server。v0 不做热加载;M3 末视体验决定是否加 chokidar watch。

## QA 侧支(学习者主动提问)

学习者在主学习流的**任意位置**(interaction / 嵌套 QA / LO 闲置)可以**压栈**一个 QA 线程提问 — 不影响 mastery / 必做进度 / chapter phase。

**栈式父引用**(`qa_threads` 表):
- `parent_interaction_id` 非空 → 在某道题上提问
- `parent_qa_thread_id` 非空 → 在另一个 QA 中嵌套(自引用)
- 都为空 → LO/Chapter 闲置时提问(`lo_id` 必有)

**会话式 + 嵌套**:
- 同 thread 内可追问多轮 → 在 `qa_messages` 追加 message
- 想开不同主题 → 新建 thread,`parent_qa_thread_id` 指向当前 thread
- 结束 thread = 出栈,前端回到 parent 上下文继续主学习流

**前端栈管理**:浏览器侧维护"当前所在位置栈",server 通过 `GET /api/sessions/:id/qa-threads/active` 可在重连时重建栈。

**事件流**:`qa.thread_started` / `qa.message_added` / `qa.thread_ended` 完整记录。`qa_messages.ai_call_id` 关联到 `ai_calls`,便于复盘 prompt 与成本。

**PathOrchestrator / LearnerLoState 不感知 QA**。QA 是侧支,不进入主路径决策,也不计入掌握度。但 QA 内容会进 ArchiveGenerator(QA 答案是学习产物的一部分)。

## 模块边界(写代码前必读)

### 数据库
- **事实表**(不可变,只追加): `events` / `interactions` / `responses` / `ai_calls`。**禁止 UPDATE / DELETE**。
- **派生表**(可由事件流重建,出于性能预聚合): `learners` / `sessions` / `learner_state` / `archives`。
- **v0 demo learner**: `id=1`,在 `01-schema.sql` 中通过 INSERT ON DUPLICATE 幂等预置。
- **schema 变更**: v0 不引入 migration 工具,直接改 [db/init/01-schema.sql](db/init/01-schema.sql) + `pnpm db:reset`。M3 末再评估 Atlas/Prisma migrate。

### 共享类型 [packages/tutor-types](packages/tutor-types)
- `domain.ts` — 核心领域(MasteryLevel/PatternId/LearningObjective/PathAction/...)
- `patterns.ts` — 4 种 Pattern 的 `*Prompt` / `*PromptForLearner` / `*Response`
- `api-contracts.ts` — HTTP 端点契约
- 修改后必须 `pnpm build:types`(或开 watch)。前后端 import 的是 dist/。

### Pattern 安全边界
- `*Prompt` 含答案 / expected / rubric — server-only,存 `interactions.prompt_payload`
- `*PromptForLearner` 是下发到前端的安全子集 — service 层必须 sanitize
- 评估在服务端做,前端不能拿到正确答案

### Event Bus
- 唯一写入 `events` 表的入口是 [server/src/event/event.service.ts](server/src/event/event.service.ts) 的 `emit()`。
- 其他 service 禁止直接 `db.insertInto('events')`。

### AI Gateway 调用形态
```ts
aiGateway.complete<TOut>({
  templateId: 'pattern.concept_check.generate',  // 对应 prompts/<id>.yaml
  variables: { ... },
  schema: AjvSchema,                             // 强制 JSON 输出
  sessionId?, callerTag?
}) → Promise<TOut>
```
- 失败 → 重试 1 次 → 仍失败用 prompt YAML 中的 `fallback` 文案
- 每次调用写 `ai_calls` 表(token / latency / cost / status)
- v0 同步返 JSON 全文,不做 stream

## 命名约定

- TS 全程 **camelCase**(`learnerId`, `loId`, `masteryLevel`)
- DB 列名全程 **snake_case**(`learner_id`, `lo_id`, `mastery_level`)
- 映射在 service 层完成。Kysely 类型在 [server/src/database/database.types.ts](server/src/database/database.types.ts) 维护。
- ID 字段：数据库 BIGINT 用 `number`(JS 安全范围内 v0 够用,M3 末再评估 BigInt);LO/Pattern/Event 类型 ID 用字面量字符串(`"lo.list.basics"`)
- 时间戳:
  - 事件流和派生表用 `DATETIME(3)` (毫秒精度,无时区转换)
  - `users` 表保留 `TIMESTAMP` (向后兼容)
  - TS 表达统一为 ISO 8601 string

## 开发命令

```bash
# 起 mysql + 跑前后端
pnpm db:up                          # 仅起 MySQL
pnpm build:types                    # 改了共享类型后跑
pnpm dev                            # 并行起 web (5173) 和 server (3000)

# 单独
pnpm dev:web
pnpm dev:server
pnpm --filter @whale-tutor/tutor-types dev   # watch types

# 整套
pnpm docker:up                      # mysql + server 一起
pnpm db:reset                       # 清库重建(改 schema 后用)

# 质量
pnpm typecheck
pnpm lint / pnpm lint:fix
pnpm format / pnpm format:check
```

## 常见任务模板

### 新增一个 LO
1. 在 `server/src/knowledge/data/python-basics.yaml` 加节点,字段对应 `LearningObjectiveDefinition`:
   - 元信息:`id` / `name` / `description` / `prerequisites` / `weakPrerequisites` / `estimatedDurationMin` / `difficultyBand` / `masteryCriteria`
   - 兜底/灵感:`coreExplanation`(AI 失败时的兜底文案) / `commonMisconceptions`(出题灵感 + 评估识别)
   - **必做题数组** `requiredInteractions[]`:每条带 `id`、`patternId`(4 种之一)、完整 `prompt`(含答案/expected/rubric)、可选 `note`
   - **自适应模式集** `adaptivePatterns[]`:必做完成后 AI 动态生成时可用的 pattern 集
2. **不需要改任何代码**(LO 不入库,YAML 即源)
3. 重启 server 让 KnowledgeService 重新加载

### 新增/修改章末测试
1. 在 chapter 节点下加 `assessment.requiredInteractions[]`,字段同 LO 的 requiredInteractions
2. 章末测试只有静态必做,没有自适应阶段
3. 重启 server

### 新增一种 Pattern
1. `packages/tutor-types/src/patterns.ts` 加 `*Prompt` / `*PromptForLearner` / `*Response` + 更新 `PATTERN_IDS`
2. `server/src/pattern/patterns/<new>.pattern.ts` 实现统一接口(`generate` / `evaluate` / `applicability`)
3. 在 `PatternRegistry` 中注册
4. `web/src/components/patterns/<New>Card.vue` 加渲染组件 + 加入 `patternComponentMap`
5. 在 LO YAML 的 `compatible_patterns` 中按需添加

### 新增一种事件类型
1. `packages/tutor-types/src/domain.ts` 的 `EventType` 联合中加一行
2. `EventService.emit()` 在适当业务点调用
3. **DB 不需要改动**(events.type 是 VARCHAR(64))

### 新增 AI Gateway 模板
1. `server/src/ai/prompts/<template-id>.yaml` 写 system / user / output_schema_ref / model_pref / fallback
2. 在 `packages/tutor-types`(或 server 端 schema)定义 ajv schema
3. 调用方用 `aiGateway.complete({ templateId, variables, schema })`

## 不要做的事

- ❌ 在业务代码里直接写 prompt 字符串或调 LLM API。所有 LLM 交互走 AI Gateway。
- ❌ 给事实表(`events` / `interactions` / `responses` / `ai_calls`)做 UPDATE / DELETE。
- ❌ 把答案 / expected / rubric 字段下发到前端。前端永远只见 `*PromptForLearner`。
- ❌ 把 LO / Pattern 模板 / Prompt 入库。它们是 YAML / 代码,不是数据。
  - 副作用:`ai_calls.template_id` 是裸字符串(指向 YAML 文件名),没有 FK,事实表不完全自包含 — 复盘历史调用的 prompt 内容需要回 git history。**这是 v0 有意识的取舍**(单人开发 + git 即版本控制),不是遗漏。v0.2 若需 prompt A/B 测试或运行时切换才考虑加 `ai_prompt_templates` 表 + `template_version_id` 字段。在那之前不要给 `ai_calls.template_id` 加 FK。
- ❌ 在 `learner_state` 表外维护掌握度状态(避免数据真相分散)。
- ❌ 引入第二个数据库连接(全程 Kysely + `KYSELY` 全局 provider)。
- ❌ 凭空造文档文件(如 README/STATUS/CHANGELOG)。除非用户明确要求或文档约定,否则改代码即可。

## v0 → v0.2 → v1 的演进路径(为什么这样设计)

[plan 文件](C:/Users/gyh/.claude/plans/readme-md-mvp-notes-3-background-md-luminous-shannon.md) 的"留给 v0.2 / v1 的接口"列了 8 个扩展点。在改任何核心模块前先看一遍,确认改动不会破坏这些边界。

## 分发形态:双 CLI(pip 与 npm),包裹同一份 node bundle

面向用户的目标是 **`pip install whale-tutor` 或 `npm install -g whale-tutor` 后 `whale-tutor start` 一键起**(用户面向的快速上手见 [packages/cli-py/README.md](packages/cli-py/README.md) / [packages/cli-node/README.md](packages/cli-node/README.md))。这一节解释架构边界,**不是用户教程**。

### 为什么有两个 CLI

| 包 | 目标用户 | 安装命令 | 包体积 |
|---|---|---|---|
| `packages/cli-py` (pip) | 教研/教育圈,装过 Python 但不熟 Node | `pip install whale-tutor` | wheel ~8 MB / 解压后 ~37 MB(含 node_modules) |
| `packages/cli-node` (npm) | 已经有 Node 工具链的开发者 | `npm install -g whale-tutor` | tarball ~1 MB / 装完 ~50 MB(其中 ~48 MB 由 npm 在用户机器上 `npm install` 恢复) |

两包功能完全相同(init / start / doctor),共享同一个 server bundle 中间产物。**两边都是包装器** — 真正运行的是同一份 NestJS server,业务逻辑只一份(server 源码),没有重写。

### 用户机器需要预装

- **Node.js ≥ 22**(server 运行时,两版都需要)
- **MySQL ≥ 8.0**(在某端口监听,本机或远程)
- **Python ≥ 3.9**(只 cli-py 需要)

### 构建管道 [scripts/build-cli-bundle.mjs](scripts/build-cli-bundle.mjs)

`pnpm build:cli-bundle` 一次性填两个 `_bundle/`(共享 `build/server-bundle/` 中间产物):

```
_bundle/
├── server/
│   ├── dist/                  ← 复制自 server/dist (NestJS 多文件 build,不能 single-bundle)
│   ├── _local/tutor-types/    ← 拷过来的 workspace 包(含 dist + package.json)
│   ├── package.json           ← workspace:* 重写成 file:./_local/tutor-types
│   └── node_modules/          ← ★ 仅 cli-py 路线:build 时 npm install --omit=dev,平铺
├── web/                       # ServeStaticModule rootPath = web/dist
├── db/init/01-schema.sql      # CLI start 时自动应用
├── templates/python-basics/   # whale-tutor init scaffold 源
└── MANIFEST.json              # build 时间 + git commit + node 版本
```

**两个路线的差异**:

- **cli-py**: build 时跑 `npm install --omit=dev` 在 bundle 内填出 `node_modules/`(因为 pip 包发出去后没法再让 pip 触发 npm),整包 ~37 MB。
- **cli-node**: 不跑 `npm install`。`packages/cli-node/package.json` 自己声明 server 的所有 runtime 依赖(从 `server/package.json` 同步过来),`@whale-tutor/tutor-types` 用 `file:./_bundle/server/_local/tutor-types` 引用。用户 `npm install -g whale-tutor` 时 npm 自动把 nest 等装到 `cli-node/node_modules/`,server 主进程被 spawn 时模块解析向上走能找到。tarball ~1 MB。

**关键细节**(踩过的坑):

1. **不用 pnpm deploy 用 npm install**(仅 cli-py 路线):pnpm 默认嵌套 `.pnpm/` 软链结构,Windows MAX_PATH(260 字符)会触发 `hatchling` 打包失败。npm 的平铺 node_modules 跨平台都安全。
2. **workspace:\* 改 file: 协议**:`@whale-tutor/tutor-types: workspace:*` 在 monorepo 外解析不了。两个路线都把 tutor-types 拷到 `_local/` 并改写依赖声明为 `file:` — cli-py 改的是 bundle 内的 `server/package.json`,cli-node 改的是顶层 `packages/cli-node/package.json`。
3. **NestJS 不能 single-bundle**:`@nestjs/common` 用了 `Reflect.metadata` + 装饰器,esbuild/webpack bundle 后 DI 经常坏。保持多文件 dist + node_modules 是 v0 的妥协。
4. **课程模板源**:`server/src/knowledge/data/python-basics` 同时被三处用 — monorepo dev 模式直接读源,两版 CLI 各自 `init` scaffold 出来给作者改。这是有意的"working sample"复用。
5. **cli-node 不在 pnpm workspace**:它的 `dependencies` 里有 `file:./_bundle/...` 路径,bundle 还没构建时 pnpm 解析失败,所以在 [pnpm-workspace.yaml](pnpm-workspace.yaml) 中显式 `!packages/cli-node` 排除。安装方式:`pnpm build:cli-bundle && cd packages/cli-node && npm install`。

### 两个运行模式(monorepo dev vs pip 用户)

server 启动逻辑用环境变量分叉,**同一份代码两种部署**:

| 行为 | env 没设(monorepo dev) | env 已设(pip 用户) |
|---|---|---|
| 课程目录 | `__dirname/data` | `WHALE_TUTOR_COURSES_DIR` 指向用户 cwd 下 `courses/` |
| 静态文件 | 不 serve(vite dev server 顶在前面) | `WHALE_TUTOR_WEB_DIR` 触发 `ServeStaticModule` serve `web/dist` |
| Schema bootstrap | docker-entrypoint-initdb.d 容器首启自动跑 | CLI 在启 node 之前 idempotent 探测 + 应用(env trigger 是双保险) |
| API 前缀 | `/api`(`globalPrefix('api')`) | `/api`(同前) |

Dev 期 `pnpm dev` 走 Vite proxy `/api → :3000` + 不 strip prefix,因为 server 现在带 globalPrefix 跟生产同。

### CLI 边界(两版同构)

| 模块 | cli-py | cli-node |
|---|---|---|
| 入口 | `cli.py` (click) | `bin/cli.mjs` (commander) |
| 配置 | `config.py` | `lib/config.mjs` |
| Schema 探测/应用 | `db.py` (mysql-connector multi=True) | `lib/db.mjs` (mysql2 multipleStatements) |
| 子进程编排 | `runner.py` (subprocess.Popen + signal 转发 + threading 轮询 webbrowser) | `lib/runner.mjs` (child_process.spawn + SIG 转发 + net 轮询 + open via cmd/open/xdg-open) |
| Init scaffold | `scaffold.py` (importlib.resources + shutil) | `lib/scaffold.mjs` (cpSync) |
| Doctor 健康检查 | `doctor.py` (rich Table) | `lib/doctor.mjs` (kleur) |

两版命令行参数、行为、错误信息保持对齐。改一边一般也要改另一边。

**不要在 CLI 里写业务逻辑**(评估、出题、AI 调用、mastery 状态…)。两个 CLI 都只负责"读配置 + 探测/应用 schema + spawn 子进程 + 信号转发 + 开浏览器"。所有教学语义都在 NestJS server,只一份。

### 发版流程

**前置**: `pnpm build:cli-bundle`(同时填充两个 `_bundle/`)

**cli-py → TestPyPI**:
1. `cd packages/cli-py && python -m build`(生成 wheel + sdist)
2. `twine upload --repository testpypi dist/*`
3. 干净环境 `pip install -i https://test.pypi.org/simple/ whale-tutor` 验证

**cli-node → npm**:
1. `cd packages/cli-node && npm install`(本地解析 file: 依赖,确认能工作)
2. `npm publish --dry-run` 看 tarball 内容
3. `npm publish` (登录 npm 账号 + name 没被占用)

bundle 自身不入 git(`.gitignore` 各自排除 `_bundle/`)。cli-py 用 hatchling 的 `force-include` 把 `_bundle` 打进 wheel;cli-node 用 `package.json` 的 `files` 字段把 `bin / lib / _bundle` 打进 tarball。

## v0 已实现清单(2026-05 更新)

### 后端
- ✅ **AI Gateway** — DeepSeek OpenAI 兼容协议 + ajv schema 校验 + 重试 + fallback + cost log;3 个 prompt 模板(`free_recall.evaluate` / `spot_the_bug.evaluate_explanation` / `qa.answer`)
- ✅ **Knowledge Module** — YAML + `$ref` 递归 + ajv 校验 + 内存缓存;1 个课程 / 4 个 LO / 13 道必做交互 / 1 章末测试
- ✅ **4 种 Pattern**:
  - `concept_check` — 确定性(选项匹配)
  - `code_sandbox` — 确定性(信任前端 Pyodide runResults)
  - `spot_the_bug` — 半确定性(行号匹配 + AI 评估解释)
  - `free_recall` — AI 评估(覆盖 rubric 点)
- ✅ **Session Manager + Path Orchestrator** — 多 LO 推进(prereq 检查 + 数组顺序)+ 必做完成→章末测试转换
- ✅ **Event Bus** — 唯一写入入口,完整事件流(session/lo/interaction/mastery/chapter/qa)
- ✅ **Learner Model** — mastery 状态机(untouched→exposed→practicing→mastered)
- ✅ **QA 侧支** — 5 个 endpoint,栈式 thread 模型(嵌套能力 store 已支持但 UI 未暴露)

### 前端
- ✅ **基础架构** — Vue 3 + Pinia + Element Plus + vue-router + axios + marked/dompurify
- ✅ **LO Intro 教学环节** — 进入新 LO 先显示核心讲解,点"开始练习"才进题
- ✅ **4 种 Pattern Card** — ConceptCheckCard / CodeSandboxCard / SpotTheBugCard / FreeRecallCard
- ✅ **Pyodide Web Worker** — classic worker + importScripts 加载 CDN,HomeView 进入时预热
- ✅ **答错重做 UX** — "再试一次"文案 + warning 色 + retry hint(server 行为不变,纯 UI)
- ✅ **QA Drawer** — 右侧滑出,markdown 消息 + Ctrl+Enter 发送 + 单 thread 追问 + 结束此次提问

### 内容
- ✅ Python 基础 / 列表与迭代 — 4 个 LO 全部完整内容(YAML + 含教学讲解的 .md):`list.basics` / `list.indexing` / `list.mutation` / `iter.for_over_list`

### 分发 (双 CLI:pip + npm)
- ✅ **packages/cli-py/** — Python CLI(pip),`whale-tutor init / start / doctor` 三命令(click + rich)
- ✅ **packages/cli-node/** — Node CLI(npm),同名同三命令(commander + kleur);包体积 1.7 MB(对比 cli-py 37 MB,差额由 npm install 在用户机器上恢复)
- ✅ **scripts/build-cli-bundle.mjs** — 一次性填充两个 `_bundle/`,共享 `build/server-bundle/` 中间产物
- ✅ **server 双模式适配** — `WHALE_TUTOR_COURSES_DIR` / `WHALE_TUTOR_WEB_DIR` env trigger 课程目录外置 + 静态文件 serve;monorepo dev 模式行为不变
- ✅ **Schema idempotent bootstrap** — CLI 启 node 前探测 events 表,缺则跑 01-schema.sql
- ✅ **API globalPrefix /api** — server 加全局前缀,前端 dev/prod 同 origin;vite proxy 不再 strip
- ✅ **e2e 验证通过**(2026-05-08):
  - cli-py: 干净 venv `pip install -e .` → init → doctor 全绿 → start 自动 schema + :3000 + 开浏览器
  - cli-node: `npm install` → 直接 `node bin/cli.mjs init / doctor / start --no-open` → :3000 同样可用

### 跳过 / 占位的(v0.2 路线图)

下一段路线图详列。

## v0.2 路线图

按教学价值排序。带 ⭐ 的是 plan §"留给 v0.2 / v1 的接口"中已铺好接口的项。

### 高优先级(核心教学价值)

1. **PathOrchestrator 智能化** ⭐
   - 当前 v0 答错→重发同题。plan §决策表的 `wrong | exposed | practicing | mastered` 各分支均未实现
   - 需要新 prompt template `concept_check.regenerate`(拿原 ri 的 commonMisconceptions / coreExplanation 上下文,生成"换说法的同 LO 题")
   - PathOrchestrator 加 `wrong` 分支:`exposed wrong → 换说法` / `practicing wrong → 提示后重试` / `mastered wrong×2 → 降级`
   - 这一步同时激活 `interactions.source='adaptive'` 完整路径(目前所有 interaction 都是 static)

2. **StuckProtocol 真实实现** ⭐
   - `responses.hint_level` 字段已铺(0-4),api-contracts 中 `RequestHintRequest/Response` 已设计,无 endpoint
   - 加 4 级梯度提示(引导问题 → 概念提示 → 部分解答 → 完整解答),前端"求提示"按钮

3. **Diagnostic Engine + Onboarding** ⭐
   - 进入新 learner 时先做 3-5 道诊断,定起始 LO 状态(避免 mastered 学习者从 untouched 重新走)
   - api-contracts 中 `GetDiagnosticResponse` / `SubmitDiagnosticRequest` 已设计

4. **Archive Generator(章末/课末档案)**
   - 从 events 流派生学习者个人 markdown 档案 — 章末由 AI Gateway 改写为漂亮的"我学了什么"
   - 包含 QA 内容(plan 设计中明确说 QA 进档案)
   - 多种导出格式留 v1(Anki / Cheat Sheet / Notebook)

### 中优先级(B 端价值)

5. **Educator Dashboard + 班级管理** ⭐
   - 班级 / 班主任 / 学员名单 CSV 上传
   - LO 级 mastery 汇总 + 班级薄弱点
   - 100 人 MVP 真实部署前的关键能力

6. **认证系统** ⭐
   - users 表骨架已铺,`learners.user_id` 字段为 v0.2 关联留接口
   - 邮箱登录最简版即可,不做手机/SSO

7. **延迟检验调度 + Notification**
   - 1 周/1 月后的 mini quiz,需要 cron + 邮件
   - `assessments.type = 'delayed'` 字段已就位

### 低优先级(打磨 / 防漏)

8. **Lazy serve interaction** — 当前 `SessionService.start()` 立即创建第一道 interaction(LO Intro 阶段也创建了 row)。改为前端点"开始练习"才调 `POST /sessions/:id/serve-next` 创建,避免"幽灵 interaction"。v0 临时修复:archive 过滤无 response 的 row + start 时 abandon 之前 active session
9. **代码沙盒服务端 re-run** — 现在前端 `runResults` 可被伪造,v0 不防作弊;v1 上 docker python sandbox 复跑校验
9. **代码编辑器升级** — textarea → codemirror/monaco(语法高亮 + 缩进辅助)
10. **跨 session 主动接住** — `lookupLearnerId` 已实现,但"距上次 > 24h 自动插激活题"逻辑未做
11. **AI 调用关联性补全** — `qa_messages.ai_call_id` 当前全 null;让 AI Gateway 返 callId,补关联
12. **Pyodide 命名空间隔离改进** — 当前每次跑 testCase 重置 globals,但 import 的 module 残留;考虑 worker reset

### v1 起规划(不在 v0.2)

- 多课程支持(SQL / Pandas / PyTorch),跨课程能力图谱迁移
- 群体智能(基于事件流的"哪种路径效果好"分析)
- Pattern 自动选择策略(基于群体数据训练,替换规则状态机)
- 多模态(白板 / 视觉化 / 录屏分析)
- 生产部署 / 监控 / SLO / 成本优化

## 已知技术债(更新中)

- `ai_calls.template_id` 是裸字符串(v0 取舍,详见上方"不要做的事")
- `qa_messages.ai_call_id` 当前总为 null
- mastery 状态机的 `applied` 等级目前理论存在但无路径触发
- v0 demo learner 硬编码 `id=1`,加认证后才能去掉
- `commonMisconceptions` 字段是 server-only 但目前 v0 未在 prompt 中真正利用,要等 PathOrchestrator 智能化才发挥价值
