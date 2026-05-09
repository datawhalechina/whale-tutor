![](./static/whale-tutor-banner.jpg)

[![CI](https://github.com/datawhalechina/whale-tutor/actions/workflows/ci.yml/badge.svg)](https://github.com/datawhalechina/whale-tutor/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node](https://img.shields.io/badge/Node-≥22-green)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/datawhalechina/whale-tutor?style=social)](https://github.com/datawhalechina/whale-tutor/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discussions](https://img.shields.io/github/discussions/datawhalechina/whale-tutor)](https://github.com/datawhalechina/whale-tutor/discussions)

## ⚡ 三秒钟看懂

| 你是谁                              | 你能做什么                                             | 看哪里                                                      |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 🎓 **学生 / 学习者**                | 跟着已有课程交互式学习,卡住时 AI 出"换说法"题 + 求提示 | 找一个 [部署版](#-试一试)直接学                             |
| ✍️ **课程作者**(老师/教研/内容编辑) | 写 markdown 讲稿 → AI 一键生成完整可交互课程           | [AUTHORING.md](AUTHORING.md)                                |
| 🛠️ **开发者**                       | 加新 pattern / 新 endpoint / 新 UI / 改架构            | [CONTRIBUTING.md](CONTRIBUTING.md) + [CLAUDE.md](CLAUDE.md) |

## 它和 ChatGPT 直接对话有什么区别?

**ChatGPT 是开放对话**,没有路径设计、没有 mastery 跟踪、没有系统性推进。学完不知道学了什么,卡住没有兜底机制。

**Whale Tutor 是教学引擎**:

- 📐 **课程作者用 YAML 预设学习路径**(LO + 必做题 + adaptive 题型集),AI 在路径内动态出题 / 评估 / 兜底
- 🎯 **每个学习目标(LO)有 mastery 状态机**(untouched → exposed → practicing → mastered)
- 🔁 **答错自动触发 AI 出"换说法"题**(同一概念换场景),连续错 3 次强制回 LO 讲解兜底
- 💡 **梯度提示(StuckProtocol)**:作者写 1-5 级 hint,没写则 AI 自动生成 3 级缓存
- 💬 **侧支 QA 提问**:答题时随时 drawer 提问 / 嵌套追问,不影响主路径
- 📊 **完整事件流**:每次学习者行为入 `events` 表,支持后续个体化档案 / 班级分析 / 群体智能

适合**"我有教学体系,要帮学生系统学习"**场景,不是"零散问问题"。

## 🎬 试一试

> **共同前置(三种方式都需要)**:
>
> - **Node.js ≥ 22**:[官网下载](https://nodejs.org/zh-cn/download)(LTS 版本即可),装完跑 `node --version` 看到 `v22.x` 就 OK
> - **MySQL ≥ 8.0**:可以直接装 [MySQL 官方版](https://dev.mysql.com/downloads/installer/)(Windows/Mac/Linux 都有);或者装 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 用容器跑(开发期推荐)
> - **DeepSeek API Key**(可选,但强烈推荐):去 [DeepSeek 平台](https://platform.deepseek.com/api_keys) 申一个,没有的话 AI 评估走 fallback 文案,但 `whale-tutor build` 不可用

### 选项 1:用 CLI 装 ⭐️ 推荐(课程作者 / 试用学习者)

不需要 clone 仓库,5 分钟跑通:

```bash
# 1. 装 CLI(全局)
npm install -g whale-tutor

# 2. 在某个空目录初始化示例课程
mkdir my-course && cd my-course
whale-tutor init                            # scaffold 完整 python-basics 示例

# 3. 用任意编辑器(VSCode / Notepad / vim 都行)打开 whale-tutor.config.yaml
#    填入 mysql 连接 + (可选) DeepSeek API key

# 4. 健康检查(强烈推荐第一次跑)
whale-tutor doctor                          # 检查 node / mysql / API key

# 5. 启动 — 浏览器自动打开 http://localhost:3000
whale-tutor start
```

详细课程作者教程见 [AUTHORING.md](AUTHORING.md)。

### 选项 2:用 AI 一键生成你自己的课程

延续选项 1 的安装,把"写 yaml" 这步交给 AI:

```bash
# 1. 准备源 markdown(每章一份)
mkdir my-source && cd my-source && mkdir chapters
# 在 my-source/ 写 course.md(课程介绍)
# 在 my-source/chapters/ 写 01-xxx.md / 02-xxx.md(每章一份完整讲稿,markdown)
cd ..

# 2. AI 4 阶段生成完整 yaml/md → courses/my-source/
whale-tutor build my-source/

# 3. 校验 → 试学
whale-tutor lint && whale-tutor start
```

AI 自动拆 LO / 出 commonMisconceptions / 出 3-5 道必做题 / 出章末综合。详见 [AUTHORING.md §10](AUTHORING.md#10-whale-tutor-buildai-辅助生成课程骨架)。

### 选项 3:clone 仓库 dev 模式(开发者)

适合**想给项目贡献代码、改架构、加新 pattern** 的开发者。需要额外装 [pnpm 8](https://pnpm.io/installation)(`corepack enable && corepack prepare pnpm@8.15.9 --activate`)+ 已经准备好 [Docker Desktop](https://www.docker.com/products/docker-desktop/):

```bash
# 1. 确认前置
node --version              # ≥ v22
pnpm --version              # ≥ 8
docker --version            # 任意版本

# 2. clone + install
git clone https://github.com/datawhalechina/whale-tutor.git
cd whale-tutor
pnpm install
cp .env.example .env        # 编辑填 DEEPSEEK_API_KEY(可选)

# 3. 起 mysql + build types + 并行跑前后端
pnpm db:up                  # docker compose 起 mysql:13306
pnpm build:types            # 共享类型先 build 一次
pnpm dev                    # 并行起 web (5173) + server (3000)

# 浏览器开 http://localhost:5173
```

完整开发指南、scripts 列表、调试技巧 → [CONTRIBUTING.md §5](CONTRIBUTING.md#5-开发环境搭建)。

## ✨ 现有特性

**学习者体验**

- LO Intro 教学开场页(进入新 LO 先看核心讲解,点"开始练习"才进题)
- 4 种交互模式(`patternId`)覆盖大部分教学场景:
  - `concept_check` — 概念辨析 4 选 1
  - `code_sandbox` — 浏览器内 Pyodide 跑 Python,按测试用例 stdout 比对
  - `spot_the_bug` — 给一段含 bug 的代码,选错误行号 + 写解释,AI hybrid 评估
  - `free_recall` — 开放回忆,AI 按 rubric 关键点判覆盖度
- **梯度提示(StuckProtocol)** — 题目上方"求提示",作者写 1-5 级 hint,缺省走 AI 3 级 + cache
- **智能 PathOrchestrator** — 答错触发 AI 出同 LO 换说法题(`source='adaptive'`);连续错 3 次自动 review_lo 兜底回讲解;hint > 0 答对计入必做但不增 mastery
- **mastery 状态机**(untouched → exposed → practicing → mastered),mastered 连续错 2 次回归
- **多 LO 自动推进 + 章末测试解锁**(章末测试不进 retry)
- **多课程 / 多章节切换** — HomeView 课程卡片选课,LearnView 左侧 sidebar 列全部章节并允许跨章浏览
- **侧支 QA**(右侧 drawer 提问 + 多轮追问 + 结束回到原位)

**课程作者体验**

- **YAML + Markdown** 内容存储,`$ref` 长文外置;**修改内容不需要懂代码**
- **学科参数化** — `course.yaml` 的 `subject` 字段灌进所有 prompt,加新课程(SQL / Java / Pandas)无需改 prompt 模板
- **CLI(npm 包)** — `init / start / doctor / lint / build` 5 个命令
- **`whale-tutor build`** — 写 markdown 讲稿(每章一份 md)→ AI 4 阶段生成完整 yaml/md 课程骨架
- **`whale-tutor lint`** — 5 秒校验所有 yaml/$ref/pattern 结构

**工程基建**

- **AI Gateway** — 唯一 LLM 调用入口,DeepSeek 兼容(可切其他 OpenAI 兼容服务),ajv schema 校验 + 重试 + fallback + 成本日志
- **Event Bus** — 学习者每次行为先写 events 表(事实表,不可变),其他派生表理论上可重建
- **完整事件流** — session / lo / interaction / mastery / chapter / qa / hint 全打点

**内置示例课程**(给你看怎么写,也可直接拿来给学习者跑)

| 课程        | 章节                        | LO 数 |
| ----------- | --------------------------- | ----- |
| Python 基础 | 列表与迭代 / 字符串与格式化 | 6     |
| SQL 入门    | 查询与过滤 / 连接           | 3     |

**架构**:Vue 3 (web) + NestJS (server) + MySQL + DeepSeek (AI Gateway,可换) + Pyodide (浏览器 Python 沙盒)。完整模块边界、命名约定、5 条核心原则见 [CLAUDE.md](CLAUDE.md)。

## 🗺️ 计划中

按教学价值与实现难度排序,接受社区 PR 实现:

- **诊断 / Onboarding** — 进新 learner 先做 3-5 道诊断,定起始 LO 状态(避免 mastered 学习者从 untouched 重新走)
- **学习档案 Archive Generator** — 从事件流派生学习者个人 markdown 档案(章末由 AI 改写为漂亮的"我学了什么"),含 QA 内容
- **多 learner + 简单认证** — 邮箱登录,demo learner 当前硬编码 id=1
- **Educator Dashboard** — 班级 / 班主任 / 学员名单 CSV 上传,LO 级 mastery 汇总 + 班级薄弱点
- **延迟检验调度** — 1 周/1 月后的 mini quiz,需要 cron + Notification
- **课程作者工具增强** — `whale-tutor build --watch` 增量再生 / 课程模板市场 / hot reload
- **代码沙盒服务端 re-run** — 现在前端 Pyodide 结果可被伪造;v1 上 docker python sandbox 复跑校验
- **多模态** — 白板 / 视觉化 / 录屏分析
- **群体智能** — 基于事件流分析"哪种路径效果好",反向优化作者 yaml

完整待办与已知技术债见 [CLAUDE.md "路线图"](CLAUDE.md#v03-路线图)。

## 🤝 参与社区

- 🐛 **报 bug / 提 feature** → [GitHub Issues](https://github.com/datawhalechina/whale-tutor/issues)
- 💻 **贡献代码** → [CONTRIBUTING.md](CONTRIBUTING.md)
- ✍️ **贡献课程内容** → [AUTHORING.md](AUTHORING.md) +[CONTRIBUTING.md §3](CONTRIBUTING.md#3-贡献课程内容)
- 🌟 **觉得有意思** → 给个 star 帮项目被更多课程作者看见
- 💬 **讨论** → [GitHub Discussions](https://github.com/datawhalechina/whale-tutor/discussions) / Datawhale 微信群(待开)

新人想入手不知从哪下手,看 [`good first issue`](https://github.com/datawhalechina/whale-tutor/labels/good%20first%20issue) 标签。

## 📜 许可

[AGPL-3.0-or-later](LICENSE) — 强 copyleft。

**关键含义**(给非法律背景的读者):

- 任何人可以自由使用 / 修改 / 分发,但**修改版必须开源**
- 关键不同于 GPL:**网络部署也算分发** — 把 fork 部署成 SaaS 也必须公开源码
- 选择理由:防止公司拿去做闭源 SaaS,保证社区收益最大化

需要闭源商用许可的场景,联系 maintainer 讨论。

## 🙏 致谢

- 由 [Datawhale](https://datawhale.club) 社区维护
- AI 推理由 [DeepSeek](https://www.deepseek.com) 提供(可切换其他 OpenAI 兼容服务)
- 浏览器 Python 沙盒来自 [Pyodide](https://pyodide.org)

### Contributors

感谢每一位贡献者(代码 / 课程 / 文档 / bug 报告 / 设计讨论):

[![Contributors](https://contrib.rocks/image?repo=datawhalechina/whale-tutor)](https://github.com/datawhalechina/whale-tutor/graphs/contributors)

### Star History

[![Star History Chart](https://api.star-history.com/svg?repos=datawhalechina/whale-tutor&type=Date)](https://star-history.com/#datawhalechina/whale-tutor&Date)

<sub>学习应该是一段对话,而不是一段广播。</sub>
