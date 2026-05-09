# CLAUDE.md

写给参与维护本项目的 AI / 工程师。简明列出架构边界与开发约定。**面向用户的快速上手见 [README.md](README.md)。**

## 项目本质

Whale Tutor 是一个 **AI 驱动的交互式学习陪伴产品**,不是 "AI 生成的课程"。核心差异：动态路径、个体化记忆、可重新进入、产物可带走。

完整产品理念与教育学第一性原理见 [notes/background_1.md](notes/background_1.md) / [notes/background_2.md](notes/background_2.md) / [notes/background_3.md](notes/background_3.md)。完整工程架构（4 层 18 模块）见 [notes/plan.md](notes/plan.md)。**v0.2 完成后的运行时业务逻辑详解(状态机 / decideNext / DB 写入语义 / event 映射)见 [notes/orchestrator.md](notes/orchestrator.md)** — 跨模块改动前必读。**Hint / Adaptive / Review-LO 三机制如何串成一套 stuck 处理协议** 见 [notes/stuck-handling.md](notes/stuck-handling.md)。

**当前阶段:v0.2 智能编排闭环 ✅ 已跑通**(单人开发,2026-05-08)。在 v0 基础上接通 PathOrchestrator 答错→换说法 / review_lo 兜底 / hint 折扣 / `subject` 学科参数化,4 种 pattern 全部支持 adaptive `generate`。范围、决策、分阶段设计见 [plan 文件](C:/Users/gyh/.claude/plans/readme-md-mvp-notes-3-background-md-luminous-shannon.md);**v0 / v0.2 实际实现清单与 v0.3 路线图见本文件末尾**。

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
│   └── cli-node/         # ★ 课程作者 npm 包(发到 npm)
│       ├── package.json  # bin: whale-tutor → bin/cli.mjs
│       ├── bin/cli.mjs   # commander 入口:init / start / doctor / lint / build
│       ├── lib/          # config.mjs / db.mjs / runner.mjs / scaffold.mjs / doctor.mjs / lint.mjs / build.mjs
│       ├── _bundle/      # ⚠ 构建产物,不入 git(由 build:cli-bundle 填充)
│       └── README.md
├── scripts/
│   └── build-cli-bundle.mjs  # 填 cli-node/_bundle/(经 build/server-bundle/ 中间产物)
├── db/init/01-schema.sql # MySQL 初始化(docker 首启 + cli `start` idempotent 都跑)
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

## 分发形态:单 CLI(npm 包),包裹 node bundle

面向用户的目标是 **`npm install -g whale-tutor` 后 `whale-tutor start` 一键起**(用户面向的快速上手见 [packages/cli-node/README.md](packages/cli-node/README.md))。这一节解释架构边界,**不是用户教程**。

### 为什么只有一个 CLI(v0.3 决策)

v0.3 之前同时维护 **cli-py(pip 包)与 cli-node(npm 包)**,共享同一个 server bundle 中间产物。v0.3 删 cli-py,理由:

- **Node 反正必装**:server 是 NestJS,两个 CLI 最终都得 spawn `node main.js`。pip 包对用户的"零 Node"承诺是假的。
- **包大一倍**:cli-py wheel 解压后 ~37 MB,因为 pip 没法触发 npm,build 时得 `npm install --omit=dev` 把整个 node_modules 一起 ship。cli-node 仅 ~1 MB(deps 由用户 `npm install` 时拉)。
- **维护税**:每加一个命令(init / start / doctor / lint / build)都得写两份 — Python 的 click + Node 的 commander 双轨。
- **品牌信号让位**:DataWhale 受众主体是 Python 圈,`pip install` 比 `npm install -g` 更"是给我用的",但这层信号不值双 CLI 的实际开销。文档里说清楚"先装 Node 再 npm install -g"够用。

历史代价:`whale_tutor` Python 模块 + pyproject.toml + 配套 README 等都已删,git history 里仍在(`git log --all --diff-filter=D -- packages/cli-py/`)。

### 用户机器需要预装

- **Node.js ≥ 22**(server 运行时)
- **MySQL ≥ 8.0**(在某端口监听,本机或远程)
- **DeepSeek API key**(可选;无 key 时 AI 评估走 fallback,但 `whale-tutor build` 必须有 key)

### 构建管道 [scripts/build-cli-bundle.mjs](scripts/build-cli-bundle.mjs)

`pnpm build:cli-bundle` 填 `packages/cli-node/_bundle/`(经 `build/server-bundle/` 中间产物):

```
_bundle/
├── server/
│   ├── dist/                  ← 复制自 server/dist(NestJS 多文件 build,不能 single-bundle)
│   ├── _local/tutor-types/    ← 拷过来的 workspace 包(含 dist + package.json)
│   └── package.json           ← workspace:* 重写成 file:./_local/tutor-types
├── web/                       # ServeStaticModule rootPath = web/dist
├── db/init/01-schema.sql      # CLI start 时自动应用
├── templates/python-basics/   # whale-tutor init scaffold 源
└── MANIFEST.json              # build 时间 + git commit + node 版本
```

**关键细节**(踩过的坑):

1. **server 不嵌 node_modules**:`packages/cli-node/package.json` 自己声明 server 的所有 runtime 依赖(从 `server/package.json` 同步过来),`@whale-tutor/tutor-types` 用 `file:./_bundle/server/_local/tutor-types` 引用。用户 `npm install -g whale-tutor` 时 npm 把 nest 等装到 `cli-node/node_modules/`,server 主进程被 spawn 时模块解析向上走能找到。
2. **workspace:\* 改 file: 协议**:`@whale-tutor/tutor-types: workspace:*` 在 monorepo 外解析不了。把 tutor-types 拷到 `_bundle/server/_local/` 并改写顶层 `packages/cli-node/package.json` 依赖声明为 `file:`。
3. **NestJS 不能 single-bundle**:`@nestjs/common` 用了 `Reflect.metadata` + 装饰器,esbuild/webpack bundle 后 DI 经常坏。保持多文件 dist 是 v0 的妥协。
4. **课程模板源**:`server/src/knowledge/data/python-basics` 同时被两处用 — monorepo dev 模式直接读源,CLI `init` scaffold 出来给作者改。这是有意的"working sample"复用。
5. **cli-node 不在 pnpm workspace**:它的 `dependencies` 里有 `file:./_bundle/...` 路径,bundle 还没构建时 pnpm 解析失败,所以在 [pnpm-workspace.yaml](pnpm-workspace.yaml) 中显式 `!packages/cli-node` 排除。安装方式:`pnpm build:cli-bundle && cd packages/cli-node && npm install`。
6. **历史:为什么 server-bundle/ 中间产物保留** — v0.3 之前 cli-py 和 cli-node 共享它,删 cli-py 后只剩 cli-node 消费,但拆出中间产物便于以后若要支持 docker image / standalone tarball 等额外分发形式时复用。删了也不会出错,但保留无害。

### 两个运行模式(monorepo dev vs CLI 用户)

server 启动逻辑用环境变量分叉,**同一份代码两种部署**:

| 行为 | env 没设(monorepo dev) | env 已设(CLI 用户) |
|---|---|---|
| 课程目录 | `__dirname/data` | `WHALE_TUTOR_COURSES_DIR` 指向用户 cwd 下 `courses/` |
| 静态文件 | 不 serve(vite dev server 顶在前面) | `WHALE_TUTOR_WEB_DIR` 触发 `ServeStaticModule` serve `web/dist` |
| Schema bootstrap | docker-entrypoint-initdb.d 容器首启自动跑 | CLI 在启 node 之前 idempotent 探测 + 应用(env trigger 是双保险) |
| API 前缀 | `/api`(`globalPrefix('api')`) | `/api`(同前) |

Dev 期 `pnpm dev` 走 Vite proxy `/api → :3000` + 不 strip prefix,因为 server 现在带 globalPrefix 跟生产同。

### CLI 模块边界

| 文件 | 职责 |
|---|---|
| `bin/cli.mjs` | commander 入口,5 个子命令 |
| `lib/config.mjs` | 读 `whale-tutor.config.yaml` + env override → 转 dict 给 node 子进程 |
| `lib/db.mjs` | mysql2 multipleStatements,探测 events 表缺失则跑 schema |
| `lib/runner.mjs` | child_process.spawn server + SIG 转发 + net 轮询端口 ready + open 浏览器 |
| `lib/scaffold.mjs` | `init` 命令:cpSync template 到目标目录 |
| `lib/lint.mjs` | spawn server with `WHALE_TUTOR_VALIDATE_ONLY=1` |
| `lib/build.mjs` | spawn server with `WHALE_TUTOR_BUILD_MODE=1` + 输入输出 env |
| `lib/doctor.mjs` | 健康检查(node / bundle / mysql / API key 4 项,kleur 输出) |

**不要在 CLI 里写业务逻辑**(评估、出题、AI 调用、mastery 状态…)。CLI 只负责"读配置 + 探测/应用 schema + spawn 子进程 + 信号转发 + 开浏览器"。所有教学语义都在 NestJS server,只一份。

### 发版流程

**前置**: `pnpm build:cli-bundle`(填充 `packages/cli-node/_bundle/`)

**cli-node → npm**:
1. `cd packages/cli-node && npm install`(本地解析 `file:` 依赖,确认能工作)
2. `npm publish --dry-run` 看 tarball 内容
3. `npm publish`(登录 npm 账号 + name 没被占用)

bundle 自身不入 git(`packages/cli-node/.gitignore` 排除 `_bundle/`)。`package.json` 的 `files` 字段把 `bin / lib / _bundle` 打进 tarball。

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
- ✅ **答错重做 UX** — 按 next decision 分流文案("换种说法再试一道" / "去看讲解" / "查看结果" / "下一题")+ warning 色
- ✅ **QA Drawer** — 右侧滑出,markdown 消息 + Ctrl+Enter 发送 + 单 thread 追问 + 结束此次提问
- ✅ **HintBar(v0.2)** — 题目上方"求提示"按钮,展开折叠展示已用 hints,章末测试隐藏
- ✅ **Review-LO overlay(v0.2)** — server 返 review_lo decision 时全屏 LoIntroCard 兜底,"我看完了" → ack endpoint

### 内容
- ✅ Python 基础 / 列表与迭代 — 4 个 LO 全部完整内容(YAML + 含教学讲解的 .md):`list.basics` / `list.indexing` / `list.mutation` / `iter.for_over_list`

> v0.2/v0.3 期内容扩展见对应章节("多课程/多章节"清单)。

### 分发 (单 CLI:npm)
- ✅ **packages/cli-node/** — Node CLI,`whale-tutor init / start / doctor` 三命令(commander + kleur);包体积 ~1 MB
- ✅ **scripts/build-cli-bundle.mjs** — 填充 `cli-node/_bundle/`(经 `build/server-bundle/` 中间产物)
- ✅ **server 双模式适配** — `WHALE_TUTOR_COURSES_DIR` / `WHALE_TUTOR_WEB_DIR` env trigger 课程目录外置 + 静态文件 serve;monorepo dev 模式行为不变
- ✅ **Schema idempotent bootstrap** — CLI 启 node 前探测 events 表,缺则跑 01-schema.sql
- ✅ **API globalPrefix /api** — server 加全局前缀,前端 dev/prod 同 origin;vite proxy 不再 strip
- ✅ **e2e 验证通过**(2026-05-08):cli-node `npm install` → `node bin/cli.mjs init / doctor / start --no-open` → :3000 可用

> v0.3 删 Python CLI(`packages/cli-py/`),改为单 CLI 架构。理由见上方"分发形态"节。

## v0.2 已实现清单(2026-05-08 更新)

详细业务逻辑(状态机 / decideNext / DB 写入 / event 映射)见 [notes/orchestrator.md](notes/orchestrator.md)。

### StuckProtocol(梯度提示)
- ✅ **新 endpoint** `POST /api/sessions/:id/hints { interactionId, targetLevel }`
- ✅ **静态优先 + AI 兜底**:作者在 RI yaml 写 `hints: [...]`(1-5 元素)直接返;没写则 AI Gateway `pattern.hint` 一次生成 3 级,按 RI id `Map<riId, Promise<string[]>>` in-memory cache 防并发重复
- ✅ **`responses.hint_level`** 由 submit 自动接入(前端 store `currentHintLevel` 注入 body)
- ✅ **章末测试 UI 隐藏 hint button**(server 不强制,前端按 chapter phase 切)
- ✅ **events 发射** `hint.requested` / `hint.served`

### PathOrchestrator 智能化
- ✅ **Schema 变更**(改 [01-schema.sql](db/init/01-schema.sql) + db:reset):`learner_state.pending_retry_ri_id` + `interactions.parent_required_interaction_id`
- ✅ **Mastery 状态机重写** — hint 折扣(用 hint 答对不增 cc) + adaptive 答对归属原 RI(parent → mandatoryCompletedIds) + retry 状态推进 + chapter assessment 不参与 retry(`enableRetry: false`)
- ✅ **decideNext Rule 0** — `pending != null && cw < 3` → adaptive;`cw >= 3` → review_lo
- ✅ **`Pattern.generate`** 4 个 pattern 全部实现 + 4 个新 prompt yaml(`pattern.regenerate.{concept_check,free_recall,spot_the_bug,code_sandbox}`)
- ✅ **Sanity check** — spot_the_bug 验 bug line ≤ 代码行数;code_sandbox 验 setupCode 含 `print(`、expectedOutput 非空
- ✅ **Review-LO 兜底** — `POST /api/sessions/:id/acknowledge-review-lo` 清 cw + pending,decideNext 重算回到原 RI
- ✅ **AI 失败自动降级** — generate 返 null → `lo.regressed{no_generator}` + decision 降级 review_lo
- ✅ **events 发射** `lo.regressed`(以前未发,现在两种 reason:`no_generator` / `review_lo_acknowledged`)

### 学科参数化
- ✅ **`CourseDefinition.subject`** 字段(server-only,Public Course Omit 掉),`course.yaml` 顶层必填
- ✅ **所有 8 个 prompt yaml** 用 `{{subject}}` 变量(原本 hardcoded "Python");caller 全部从 `KnowledgeService.getSubjectByLoId/RiId` 取
- ✅ **代码 fence 去 language**(`spot_the_bug.evaluate_explanation` 等),让 prompt 学科无关

### 类型系统
- ✅ **Public 类型派生**(`Course = Omit<CourseDefinition, 'chapters' | 'subject'> & {chapters: Chapter[]}` 等),Definition 加字段会强迫 reviewer 思考要不要进 Public

### 多课程 / 多章节 + 课程作者工具
- ✅ **`whale-tutor lint`** — 双 CLI 都有,spawn server with `WHALE_TUTOR_VALIDATE_ONLY=1` 跑 ajv 校验,5 秒返结果
- ✅ **多 chapter session 编排** — `pickStartingLo` 找首个未完成章节;sidebar 列全部章节并允许点切换(`POST /api/sessions/:id/switch-chapter`,session.current_lo_id 改写)
- ✅ **多 course HomeView picker** — `GET /api/courses` 返 `CourseSummary[]`,首页卡片选课;支持 `python-basics` 与 `sql-basics` 并存
- ✅ **内容扩展** — Python 加 `string_and_format` 章(2 LO);新增 SQL 课(`select_and_filter` 2 LO + `joins` 1 LO)— 用 `subject: SQL` 验证学科参数化
- ✅ **课程作者文档** — [AUTHORING.md](AUTHORING.md) 740+ 行 step-by-step 指南(yaml/$ref/4 种 pattern/hint/评价/工作流/排查)

## v0.3 已实现清单(2026-05-09 更新)

### 分发架构精简 — 删 cli-py
- ✅ **删除 `packages/cli-py/`**(整个 Python CLI 包)+ 相关 build 路径 + workspace/eslint 配置;只保留 `packages/cli-node/`(npm 包)
- ✅ **理由**:Node 反正必装(server 是 NestJS),pip 包多绕一层 subprocess + 包大 30+ MB(因为 pip 不能触发 npm,build 时得把 node_modules 一起 ship)+ 双 CLI 每加一个命令(init/start/doctor/lint/build)都要写两份,维护税不划算
- ✅ **`scripts/build-cli-bundle.mjs`** 简化:不再产 cli-py 路径 + 不再跑 `npm install --omit=dev` 嵌入 node_modules
- ✅ **CLI 命令补齐**:cli-node 上 5 个命令全(init / start / doctor / lint / build)

### `whale-tutor build` — AI 辅助生成课程骨架
- ✅ **新命令**:`whale-tutor build <source> [--force] [--output <dir>]`,输入 `course.md + chapters/*.md` → AI 生成完整 yaml/md 课程
- ✅ **4 阶段 pipeline**(每阶段独立 prompt yaml + ajv schema 校验 + 重试):
  - `build.course_meta` — 提取 id/name/subject/description(1 次)
  - `build.chapter_outline` — 每章 AI 拆 2-5 LO + 切 coreExplanation(N 次)
  - `build.lo_full` — 每 LO 出 commonMisconceptions + masteryCriteria + 3-5 道 concept_check RI(M 次)
  - `build.assessment` — 每章出 5-7 道章末综合(N 次)
  - 总调用 = 1 + 2N + M;3 章 12 LO ≈ 19 次 ≈ $0.05
- ✅ **`server/src/build/`** — `BuildModule` 不依赖 mysql/web/其他业务模块,只需 ConfigModule + AiGatewayService(KYSELY 提供 null,recordCall 自动 skip)
- ✅ **AI 生成约定**:全部 `concept_check`(成功率最高,作者后续可手改 pattern);id 命名 `lo.<chapter-slug>.<lo-slug>` 等确定性派生
- ✅ **失败语义**:AI 返 fallback object 时 build 直接报错退出(不静默兜底,质量优先)
- ✅ **e2e 验证通过**(2026-05-09):单章 1.7K 字测试源 → 3 LO + 14 RI + 6 assessment,2 分钟跑完,过 lint
- ✅ **文档** — [AUTHORING.md §10](AUTHORING.md#10-whale-tutor-buildai-辅助生成课程骨架) 完整使用指南 + 限制说明

## v0.3 路线图

按教学价值排序。带 ⭐ 的是 plan §"留给 v0.2 / v1 的接口"中已铺好接口的项。

### 高优先级(核心教学价值)

1. **Diagnostic Engine + Onboarding** ⭐
   - 进入新 learner 时先做 3-5 道诊断,定起始 LO 状态(避免 mastered 学习者从 untouched 重新走)
   - api-contracts 中 `GetDiagnosticResponse` / `SubmitDiagnosticRequest` 已设计

2. **Archive Generator(章末/课末档案)**
   - 从 events 流派生学习者个人 markdown 档案 — 章末由 AI Gateway 改写为漂亮的"我学了什么"
   - 包含 QA 内容(plan 设计中明确说 QA 进档案)
   - 多种导出格式留 v1(Anki / Cheat Sheet / Notebook)

3. **课程作者工具**(剩余项)
   - ~~`whale-tutor lint`~~ ✅ v0.2 已完成
   - ~~`whale-tutor build`~~ ✅ v0.3 已完成
   - 待办:`whale-tutor build --watch` 增量再生(改 1 章 md 不重写整课)
   - 待办:`whale-tutor build` 输出后的"AI 拆 LO 不理想"修复回环(目前作者只能手改 yaml)

### 中优先级(B 端价值)

4. **Educator Dashboard + 班级管理** ⭐
   - 班级 / 班主任 / 学员名单 CSV 上传
   - LO 级 mastery 汇总 + 班级薄弱点
   - 100 人 MVP 真实部署前的关键能力

5. **认证系统** ⭐
   - users 表骨架已铺,`learners.user_id` 字段为 v0.2 关联留接口
   - 邮箱登录最简版即可,不做手机/SSO

6. **延迟检验调度 + Notification**
   - 1 周/1 月后的 mini quiz,需要 cron + 邮件
   - `assessments.type = 'delayed'` 字段已就位

### 低优先级(打磨 / 防漏)

7. **Lazy serve interaction** — 当前 `SessionService.start()` 立即创建第一道 interaction(LO Intro 阶段也创建了 row)。改为前端点"开始练习"才调 `POST /sessions/:id/serve-next` 创建,避免"幽灵 interaction"
8. **代码沙盒服务端 re-run** — 现在前端 `runResults` 可被伪造,不防作弊;v1 上 docker python sandbox 复跑校验
9. **代码编辑器升级** — textarea → codemirror/monaco(语法高亮 + 缩进辅助)
10. **跨 session 主动接住** — `lookupLearnerId` 已实现,但"距上次 > 24h 自动插激活题"逻辑未做
11. **AI 调用关联性补全** — `qa_messages.ai_call_id` 当前全 null;让 AI Gateway 返 callId,补关联
12. **Pyodide 命名空间隔离改进** — 当前每次跑 testCase 重置 globals,但 import 的 module 残留;考虑 worker reset
13. **`assessment_completed_ids` 名空间隔离** — 章末 RI id 当前会写进 LO 的 `mandatory_completed_ids`(v0 行为,无害但脏);v0.3 清理

### v1 起规划(不在 v0.3)

- 多课程支持(SQL / Pandas / PyTorch),跨课程能力图谱迁移 — `subject` 参数化已铺底
- 群体智能(基于事件流的"哪种路径效果好"分析)
- Pattern 自动选择策略(基于群体数据训练,替换规则状态机)
- 多模态(白板 / 视觉化 / 录屏分析)
- 生产部署 / 监控 / SLO / 成本优化

## 已知技术债(更新中)

- `ai_calls.template_id` 是裸字符串(v0 取舍,详见上方"不要做的事")
- `qa_messages.ai_call_id` 当前总为 null
- mastery 状态机的 `applied` 等级目前理论存在但无路径触发
- v0 demo learner 硬编码 `id=1`,加认证后才能去掉
- adaptive 题不缓存(每次 retry 都重调 AI),成本随 retry 频次线性增长
- `mandatory_completed_ids` 章末 RI id 名空间污染(见 [notes/orchestrator.md](notes/orchestrator.md) §10)
