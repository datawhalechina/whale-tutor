# 贡献指南

欢迎给 Whale Tutor 贡献!这份文档帮你判断"你想做什么 → 走哪条路径 → 需要看哪些文档"。

> **TL;DR**:
> - **想用这个工具教自己的课**(写 yaml/markdown 内容) → [AUTHORING.md](AUTHORING.md)
> - **想给项目贡献代码 / 改 bug / 加 feature** → 继续往下看
> - **想报 bug / 提 feature 但不动代码** → 直接开 GitHub Issue

---

## 目录

1. [行为准则](#1-行为准则)
2. [报 bug / 提 feature](#2-报-bug--提-feature)
3. [贡献课程内容](#3-贡献课程内容)
4. [贡献代码](#4-贡献代码)
5. [开发环境搭建](#5-开发环境搭建)
6. [PR 提交规范](#6-pr-提交规范)
7. [架构 / 边界(改任何核心模块前必读)](#7-架构--边界改任何核心模块前必读)
8. [Good First Issue](#8-good-first-issue)
9. [许可与版权](#9-许可与版权)

---

## 1. 行为准则

我们希望这是一个**对中文教育圈和 AI 工程圈都友好**的开源项目。任何贡献者请遵守:

- 尊重不同背景(学生 / 老师 / 教研 / 工程师)的视角差异
- 用中文 / 英文都行,但讨论时给关键术语补一份对方语言的对照
- 不接受人身攻击、嘲讽性技术讨论、隐性歧视
- 严重违规(骚扰 / 仇恨言论)由 maintainer 直接 ban

参考 [Contributor Covenant 2.1](https://www.contributor-covenant.org/zh-cn/version/2/1/code_of_conduct/)。

---

## 2. 报 bug / 提 feature

**报 bug**:开 [GitHub Issue](https://github.com/datawhalechina/whale-tutor/issues/new),给至少这些信息:
- 你跑的是哪个版本(`whale-tutor --version` 或 git commit hash)
- 复现步骤(尽量最小化)
- 期望行为 vs 实际行为
- 错误日志(如果有)
- 操作系统 / Node 版本 / MySQL 版本

**提 feature**:开 Issue 描述:
- 你的使用场景(为什么需要)
- 期望的行为 / API
- 跟现有功能的关系(替换 / 增强 / 全新)

**重要**:大改动(超过 100 行 / 跨多个模块)请先开 Issue 讨论方向,别直接发 PR — 避免你写了 1000 行 maintainer 觉得方向不对要重做。

---

## 3. 贡献课程内容

**最低门槛贡献,从这里开始最容易**。

完整的课程作者教程见 [AUTHORING.md](AUTHORING.md),贡献流程:

1. fork 仓库 + clone 到本地
2. 在 `server/src/knowledge/data/` 下开新课程目录(如 `pandas-basics/`)— 或者扩展已有课程加 chapter
3. 按 [AUTHORING.md](AUTHORING.md) 写 yaml + md 内容,推荐先用 `whale-tutor build` AI 生成骨架再手改
4. 跑 `whale-tutor lint`(或 `pnpm dev:server` 看启动日志)确认结构合法
5. PR 到 main,标题用 `course: 加 pandas-basics 课程` 或 `course(python-basics): 加迭代器进阶章节`
6. PR 描述里贴一张 LearnView 截图证明能跑

**课程贡献 checklist**:
- [ ] `course.yaml` 必须有 `subject` 字段
- [ ] 所有 `$ref` 路径都对(用 `whale-tutor lint` 验证)
- [ ] 每个 LO 至少 3-5 道必做题,覆盖核心概念
- [ ] `commonMisconceptions` 不能宽泛("对 X 不熟"),必须可识别可做陷阱选项
- [ ] 章末测试覆盖该章每个 LO 至少 1 题

---

## 4. 贡献代码

**适合贡献的方向**(按门槛从低到高):

| 方向 | 难度 | 入口 |
|---|---|---|
| 文案 / 文档错别字 / 链接修复 | 🟢 低 | 直接 PR |
| 一种新的 Pattern(如 fill-in-blank / matching) | 🟡 中 | 看 [CLAUDE.md](CLAUDE.md) "新增一种 Pattern",讨论后开 PR |
| 一种新的事件类型 / 新的 endpoint | 🟡 中 | 看 [CLAUDE.md](CLAUDE.md),讨论后开 PR |
| UI 改进(dark mode / 移动端 / i18n) | 🟡 中 | 直接 PR,带截图 |
| 课程作者工具增强(`build --watch` / 题型转换器) | 🟠 高 | 先开 Issue 对齐方向 |
| 核心架构改动(PathOrchestrator / 评估机制) | 🔴 高 | **必须先开 Issue 详细讨论**,改前看 [CLAUDE.md](CLAUDE.md) 5 条核心原则 |

---

## 5. 开发环境搭建

### 前置

- Node.js ≥ 22 LTS
- pnpm ≥ 8(`corepack enable`)
- Docker + Docker Compose(用来起 MySQL,自己装也行)
- DeepSeek API key(可选;无 key 时 AI 评估走 fallback,但 free_recall 类题目永远过不了)

### 启动

```bash
git clone https://github.com/datawhalechina/whale-tutor.git
cd whale-tutor
pnpm install
cp .env.example .env             # 填入 DEEPSEEK_API_KEY(可选)

pnpm db:up                       # 起 MySQL(端口 13306)
pnpm build:types                 # 共享类型先 build 一次
pnpm dev                         # 并行起 web (5173) + server (3000)
```

打开 `http://localhost:5173`,选课开始学习。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行起 web + server |
| `pnpm build` | 递归 build 所有包 |
| `pnpm typecheck` | 全包 tsc 检查(PR 前必跑) |
| `pnpm lint` / `pnpm lint:fix` | ESLint(PR 前必跑) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm db:reset` | 删卷重启 mysql + 重跑 schema(改了 db/init/01-schema.sql 后用) |
| `pnpm build:cli-bundle` | 构建 cli-node 分发产物(发版前用) |

### 仓库结构

```
whale-tutor/
├── README.md                   # OSS 入口(给所有人)
├── AUTHORING.md                # 课程作者教程(写课程 yaml/md 内容)
├── CONTRIBUTING.md             # 贡献指南(本文件)
├── CLAUDE.md                   # 工程边界、模块约定、命名(给开发本工具的人)
├── LICENSE                     # AGPL-3.0-or-later
│
├── web/                        # Vue 3 + Vite + TS + Element Plus + Pinia(学习者前端)
├── server/                     # NestJS + Kysely + mysql2(server-side 编排 + AI Gateway)
│   └── src/
│       ├── ai/                 # AI Gateway + prompt YAML(所有 LLM 交互的唯一入口)
│       ├── build/              # `whale-tutor build` 课程生成(BuildModule)
│       ├── knowledge/          # 课程图谱 YAML 加载 + ajv 校验
│       ├── pattern/            # 4 种 Pattern 实现(generate / evaluate)
│       ├── session/            # Session + PathOrchestrator + StuckProtocol
│       ├── learner/            # mastery 状态机
│       ├── event/              # Event Bus(唯一写入 events 表入口)
│       ├── qa/                 # QA 侧支(栈式 thread)
│       └── archive/            # 学习档案聚合(LO / chapter / qa-thread → markdown)
│
├── packages/
│   ├── tutor-types/            # 前后端共享 TS 类型(workspace 内部)
│   └── cli-node/               # 课程作者 npm 包(发到 npm)
│
├── scripts/build-cli-bundle.mjs # 构建管道:填 cli-node/_bundle/(经 build/server-bundle/ 中间产物)
├── db/init/01-schema.sql       # MySQL schema(容器首启 + CLI start 时 idempotent)
└── docker-compose.yml          # MySQL + (可选) server 一起起
```

完整模块边界、命名约定、5 条核心原则见 [CLAUDE.md](CLAUDE.md)。

### 发布 cli-node 到 npm(maintainer-only)

只有有 npm 发布权限的 maintainer 才需要这个流程。普通贡献者忽略。

**前置(一次性)**

```bash
npm login                                  # 存 token 到 ~/.npmrc
git push -u origin main                    # 确保 main 分支有 upstream
```

**发版**(默认 patch,bug 修复用):

```bash
pnpm release:cli                           # 0.1.0 → 0.1.1
```

新功能 / 破坏性改动:

```bash
pnpm release:cli:minor                     # 0.1.x → 0.2.0
pnpm release:cli:major                     # 0.x.y → 1.0.0
```

**完整流水线**(由 [scripts/release-cli.mjs](scripts/release-cli.mjs) 自动跑,**任一步失败 fail-fast**):

1. 校验 git 干净 + 在 main + 有 upstream(不满足直接退,不留痕迹)
2. `pnpm build:cli-bundle` 重建 `packages/cli-node/_bundle/`
3. 在 cli-node 跑 `npm install`(只装 `node_modules/`,不动 tracked 文件)
4. **显式** bump 版本:`npm version <type> --no-git-tag-version` 只改 `package.json`,不让 npm 管 git
5. **显式** `git add packages/cli-node/package.json` + `git commit -m "release(cli): vX.Y.Z"` + `git tag -a vX.Y.Z`
6. **`git push --follow-tags`**(commit + tag 一起推)+ 验证远端 HEAD 跟本地匹配
7. `npm publish --access public`(`prepublishOnly` 钩子兜底校验 `_bundle/` 完整)

发完手工最后一步生成 release notes:

```bash
gh release create vX.Y.Z --generate-notes
```

#### 为什么 push 在 publish 之前(故意的设计)

传统 npm 流程是 publish→push,但 npm 一发出去就没法撤回(`npm unpublish` 有 72 小时窗口且条件苛刻)。如果 publish 成功 push 失败,你的 bump commit 就悬空在本地 — 必须手工补 push,而且容易忘记,**这就是上一版踩到的坑**。

反过来 push→publish:
- push 失败可以原地重试(commit + tag 已在本地,不丢)
- publish 失败也可以重试(`cd packages/cli-node && npm publish --access public`)
- bump commit **总是先入 git**,不会出现"npm 上有这个版本但 GitHub 没"的反向悬空

代价:publish 失败时 GitHub 上有 tag 但 npm 上没有 — 这种情况可见性高(用户跑 `npm install whale-tutor@X.Y.Z` 会立刻发现版本不存在),修复也只需重跑一条 publish。

#### 失败时怎么办

| 失败步 | 状态 | 修复 |
|---|---|---|
| 4-5(bump / commit / tag) | package.json 可能改了,git 状态不全 | `git checkout packages/cli-node/package.json` 撤回 + 排查 + 重跑 `pnpm release:cli` |
| 6(push) | 本地有 commit + tag,远端没 | 排查(常见:网络 / 权限),修复后跑 `git push --follow-tags`,**不要重跑整个脚本** |
| 7(publish) | commit + tag 已在 GitHub,npm 没该版本 | 修问题(常见:没 `npm login`),跑 `cd packages/cli-node && npm publish --access public` 重试 |
| 完全撤回(已 publish) | 全推送 + 已发布 | `npm unpublish whale-tutor@X.Y.Z`(72h 内)+ `git push origin :refs/tags/vX.Y.Z` 删远端 tag + `git revert <commit>` |

#### 预览(不真的发)

```bash
pnpm release:cli:dry-run     # 跑 1-5 步,跳过 6 (push) + 7 (publish)
```

预览仍然会本地 bump + commit + tag(这些是本地 git 操作,无外部副作用)。预览完想撤回:

```bash
git tag -d v$(node -p "require('./packages/cli-node/package.json').version")
git reset --hard HEAD~1
```

> CI 的 `cli-smoke` job 在每个 PR 上跑 build + init + lint + `npm pack --dry-run`,如果 PR 破坏了发布流水会被立刻发现 — 不用等到 release 才暴露。

---

## 6. PR 提交规范

### 提交前 checklist

- [ ] 跑过 `pnpm typecheck`(0 错误)
- [ ] 跑过 `pnpm lint`(0 警告 — `--max-warnings 0`)
- [ ] 改了课程内容的话,跑过 `whale-tutor lint`
- [ ] 自测过(本地 `pnpm dev` 玩一遍相关流程)
- [ ] 提交粒度合理:一个 PR 解决一件事

### Commit message 约定

用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 风格:

```
<type>(<scope>): <短描述>

<空行 + 详细说明,可选>
```

`type`:
- `feat` — 新功能
- `fix` — bug 修复
- `refactor` — 重构(不影响行为)
- `docs` — 文档
- `course` — 课程内容(scope 写课程 id,如 `course(python-basics):`)
- `test` — 测试
- `chore` — 杂项(配置 / 构建)

例:
```
feat(pattern): 加 fill-in-blank pattern
fix(session): switchChapter 后 sidebar 未刷新
docs(authoring): §5 加 hint 梯度建议
course(sql-basics): 加 group-by 章节
```

### PR 描述模板

```markdown
## 这个 PR 干了什么
<一两句>

## 为什么
<动机 / 关联 issue>

## 怎么测的
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] 本地手测的步骤(展开)

## 截图(UI 改动必填)
```

---

## 7. 架构 / 边界(改任何核心模块前必读)

[CLAUDE.md](CLAUDE.md) 是项目的工程边界文档,包含:
- **5 条核心原则**(任何改动都要遵守)
- 模块边界 / 命名约定 / 数据库 schema 语义
- "不要做的事"清单(避免新人踩坑)
- 完整 v0 → v0.3 演进路径

如果你的改动跨多个模块,**先读 CLAUDE.md "5 条核心原则"和"模块边界"**,然后再:
- 改 PathOrchestrator / 状态机 → 看 [notes/orchestrator.md](notes/orchestrator.md)(若 ungitignored)
- 改 Stuck 处理(hint / adaptive / review_lo) → 看 [notes/stuck-handling.md](notes/stuck-handling.md)

> notes/ 目前 gitignored 是开发期内部设计稿;若你需要,可以邮件 / Issue 申请 maintainer 分享。

---

## 8. Good First Issue

新人想入门的话,看 [GitHub Issues 标 `good first issue` 的](https://github.com/datawhalechina/whale-tutor/labels/good%20first%20issue)。典型方向:

- 加一种新课程(任何学科,只要能用 4 种 pattern 表达)
- README / AUTHORING / CLAUDE 文档错别字 / 翻译
- 加 dark mode / 移动端样式适配
- 加一种简单 pattern(如 ordering / matching)
- 加 i18n 框架(目前是中文 hardcoded)
- 给 build 命令加 `--watch` 模式(增量再生)
- 给 doctor 命令加 DeepSeek API key 实际 ping 验证

---

## 9. 许可与版权

本项目使用 **[GNU AGPL-3.0-or-later](LICENSE)** 协议。提交 PR 即视为同意你的贡献以同协议授权。

**AGPL-3.0 关键含义(给非法律背景的贡献者)**:
- 任何人可以自由使用 / 修改 / 分发,但**修改版必须开源**
- 关键差异于 GPL:**网络部署也算分发** — 如果你把 fork 部署成 SaaS 给用户用,你必须公开 fork 的源码
- 适合本项目的原因:防止公司拿去做闭源 SaaS,保证社区收益最大化

如果你需要把代码用在闭源场景(如商用 SaaS 不愿开源),联系 maintainer 讨论商业许可。

---

## 致谢

每一份 PR / Issue / 课程内容都是社区成长的一部分 — 谢谢你愿意花时间。

Maintainer:[@gyh](https://github.com/gyh)(Datawhale)
