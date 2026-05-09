# Whale Tutor

**AI 驱动的交互式学习产品** — 课程作者用的命令行(默认演示 Python,通过 `course.yaml` 的 `subject` 字段可配置任意学科:SQL / Pandas / Java …)。

只需要写 YAML 和 Markdown 内容,不需要懂前后端开发。

## 安装前置

- **Node.js ≥ 22** (https://nodejs.org/)
- **MySQL ≥ 8.0** (本机已运行,在某端口监听)
- **DeepSeek API key**(可选;无 key 时 AI 评估走 fallback 文案,完整 e2e 仍可走通,但 `whale-tutor build` 必须有 key)

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

| 命令 | 作用 |
| --- | --- |
| `whale-tutor init` | 在当前目录 scaffold 完整 python-basics 示例 + 配置文件模板 |
| `whale-tutor start [--no-open]` | 启动 server(自动应用 schema + serve API + 静态前端) |
| `whale-tutor lint` | 校验当前目录的课程 yaml/$ref/pattern 结构是否合法 |
| `whale-tutor build <source> [--force] [--output <dir>]` | 从原始 markdown(course.md + chapters/*.md)AI 生成完整课程骨架 |
| `whale-tutor doctor` | 健康检查(node 版本 / bundle / mysql 连通 / API key 是否设) |
| `whale-tutor --version` | 打印版本 |

## 配置文件 `whale-tutor.config.yaml`

```yaml
courses_dir: ./courses              # 课程内容根目录
database:                           # mysql 连接
  host: localhost
  port: 13306
  user: tutor
  password: tutor
  database: whale_tutor
ai:
  deepseek_api_key: sk-xxxxx        # 留空则 AI 评估走 fallback;build 命令必填
  deepseek_api_base_url: https://api.deepseek.com
server:
  port: 3000                        # 学习者访问地址 http://localhost:<port>
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

完整作者教程(yaml / $ref / 4 种 pattern / hint / 评价机制 / build 流程)见仓库 [doc/course-authoring.md](https://github.com/datawhalechina/whale-tutor/blob/main/doc/course-authoring.md)。

## AI 辅助生成课程(`whale-tutor build`)

如果你手头有"原始 markdown 讲稿"(每章一份 md),不想从零写 yaml,用 build:

```bash
mkdir my-source && cd my-source
mkdir chapters
# 写 course.md(课程介绍)+ chapters/01-xxx.md / 02-xxx.md(每章一份完整讲稿)
cd ..
whale-tutor build my-source/                    # AI 4 阶段生成完整 yaml/md → courses/my-source/
whale-tutor lint                                # 校验
whale-tutor start                               # 试学
```

详细约定见 [doc/course-authoring.md §10](https://github.com/datawhalechina/whale-tutor/blob/main/doc/course-authoring.md#10-whale-tutor-build)。

## 故障排查

- **`whale-tutor start` 报 mysql 连不上**:检查 `whale-tutor.config.yaml` 中 host/port/user 是否对,mysql 是否在监听
- **AI 评估总是 fallback**:`whale-tutor doctor` 检查 API key 是否填了
- **`whale-tutor build` 报错退出**:必须配置 DEEPSEEK_API_KEY(否则全部 AI 调用走 fallback,无法生成内容)
- **浏览器 404**:确认 `whale-tutor start` 的端口跟你访问的一致(默认 3000)
- **`node` 版本过低**:`node --version` < 22,装 https://nodejs.org/ ≥ 22

## 许可

MIT
