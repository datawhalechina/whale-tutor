# Whale Tutor

**AI 驱动的交互式学习产品** — 课程作者用的命令行(默认演示 Python,通过 `course.yaml` 的 `subject` 字段可配置任意学科:SQL / Pandas / Java …)。

只需要写 YAML 和 Markdown 内容,不需要懂前后端开发。

## 安装前置

- **Node.js ≥ 22** (https://nodejs.org/)
- **MySQL ≥ 8.0** (本机已运行,在某端口监听)
- **DeepSeek API key**(可选;无 key 时 AI 评估走 fallback 文案,完整 e2e 仍可走通,但 `whale-tutor build` / `generate` 必须有 key)

## 快速开始

```bash
# 1. 装包
npm install -g whale-tutor

# 2. 在某个空目录初始化课程
mkdir my-course && cd my-course
whale-tutor init

# 3. 编辑配置文件,填入 mysql 连接 + (可选) DeepSeek API key
nano whale-tutor.config.yaml

# 4. 健康检查(可选,推荐第一次跑)
whale-tutor doctor

# 5. 启动 — 浏览器自动打开 http://localhost:3000
whale-tutor start
```

不想全局装也可以一次性跑:

```bash
npx whale-tutor init
npx whale-tutor start
```

## 命令参考

| 命令                                                    | 作用                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `whale-tutor init`                                      | 在当前目录 scaffold 完整 python-basics 示例 + 配置文件模板   |
| `whale-tutor start [--no-open]`                         | 启动 server(自动应用 schema + serve API + 静态前端)          |
| `whale-tutor lint`                                      | 校验当前目录的课程 yaml/$ref/pattern 结构是否合法            |
| `whale-tutor generate`                                  | **(高层)** 交互式问答,AI 一键生成完整课程(讲稿 + LO + 题)    |
| `whale-tutor build <source> [--force] [--output <dir>]` | **(底层)** 从已写好的 markdown 讲稿 AI 生成课程骨架(LO + 题) |
| `whale-tutor doctor`                                    | 健康检查(node 版本 / bundle / mysql 连通 / API key 是否设)   |
| `whale-tutor --version`                                 | 打印版本                                                     |

## 配置文件 `whale-tutor.config.yaml`

```yaml
courses_dir: ./courses # 课程内容根目录
database: # mysql 连接
  host: localhost
  port: 13306
  user: tutor
  password: tutor
  database: whale_tutor
ai:
  deepseek_api_key: sk-xxxxx # 留空则 AI 评估走 fallback;build 命令必填
  deepseek_api_base_url: https://api.deepseek.com
server:
  port: 3000 # 学习者访问地址 http://localhost:<port>
```

环境变量 override 优先级最高:`DATABASE_HOST` / `DEEPSEEK_API_KEY` 等设了会盖过 yaml。

## 课程内容怎么写

`whale-tutor init` 在 `courses/python-basics/` 下生成完整的示例课程。改 working sample 比从零写快得多:

```
courses/python-basics/
├── course.yaml                          # 课程元数据(含 subject: Python)
├── chapters/
│   └── list_and_iter/
│       ├── chapter.yaml                 # 章节元数据 + LO 引用 + 章末测试
│       ├── description.md
│       ├── los/
│       │   └── list_basics/             # 一个 LO 一个目录
│       │       ├── lo.yaml              # LO 定义(必做题在这里)
│       │       ├── core-explanation.md  # LO 教学讲解
│       │       └── ri-1.explanation.md
│       └── assessment/                  # 章末综合测试
└── ...
```

**核心约定**:

- YAML 里写**结构**(题型 / 选项 / 答案 / 学习目标)
- Markdown 里写**长内容**(讲解 / 题干 / 反馈),用 `{ $ref: ./xxx.md }` 引用
- 多课程并存:`courses_dir` 下每个含 `course.yaml` 的子目录都会被自动加载

完整作者教程(yaml / $ref / 4 种 pattern / hint / 评价机制 / build 流程)见仓库 [AUTHORING.md](https://github.com/datawhalechina/whale-tutor/blob/main/AUTHORING.md)。

## AI 辅助生成课程

两个命令两层抽象 — 都是 AI 帮你做苦力,区别在于"讲稿是 AI 写还是你自己写":

### 一键生成(没 markdown 讲稿,推荐起步)

```bash
whale-tutor generate                            # 交互式问答 → AI 写讲稿 + 拆 LO + 出题
```

会问 5 个问题(课程名 / ai 还是 manual / 主题 / 受众 / 章节数),AI 完成后:

- AI 写的 markdown 讲稿留在 `<course-id>-source/` 目录,可手改后重跑 build 优化
- 完整可学课程在 `courses/<course-id>/`

### 从已写好的讲稿生成(只让 AI 拆 LO + 出题)

```bash
mkdir my-source && cd my-source && mkdir chapters
# 写 course.md(课程介绍)+ chapters/01-xxx.md / 02-xxx.md(每章一份完整讲稿)
cd ..
whale-tutor build my-source/                    # AI 4 阶段拆 LO + 出题 → courses/my-source/
whale-tutor lint && whale-tutor start
```

详细约定见 [AUTHORING.md §10](https://github.com/datawhalechina/whale-tutor/blob/main/AUTHORING.md#10-whale-tutor-generate--build-ai-辅助生成课程)。

## 故障排查

- **`whale-tutor start` 报 mysql 连不上**:检查 `whale-tutor.config.yaml` 中 host/port/user 是否对,mysql 是否在监听
- **AI 评估总是 fallback**:`whale-tutor doctor` 检查 API key 是否填了
- **`whale-tutor build` / `generate` 报错退出**:必须配置 DEEPSEEK_API_KEY(否则全部 AI 调用走 fallback,无法生成内容)
- **浏览器 404**:确认 `whale-tutor start` 的端口跟你访问的一致(默认 3000)
- **`node` 版本过低**:`node --version` < 22,装 https://nodejs.org/ ≥ 22

## 许可

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html) — 强 copyleft。任何修改/分发(包括以 SaaS 形式部署)都需要按 AGPL-3.0 公开源码。
