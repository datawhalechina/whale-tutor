# Whale Tutor

**AI 驱动的 Python 交互式学习产品** — 课程作者用的命令行工具。

只需要写 YAML 和 Markdown 内容,不需要懂前后端开发。

## 安装前置

- **Python ≥ 3.9**
- **Node.js ≥ 22** (https://nodejs.org/)
- **MySQL ≥ 8.0** (本机已运行,在某端口监听)

## 快速开始

```bash
# 1. 装包
pip install whale-tutor

# 2. 在某个空目录初始化课程
mkdir my-course && cd my-course
whale-tutor init

# 3. 编辑配置文件,填入 mysql 连接 + (可选) DeepSeek API key
nano whale-tutor.config.yaml

# 4. 健康检查(可选,推荐第一次跑)
whale-tutor doctor

# 5. 启动 — 浏览器打开 http://localhost:3000
whale-tutor start
```

## 课程内容怎么写

`whale-tutor init` 在 `courses/python-basics/` 下生成完整的示例课程。改 working sample 比从零写快得多:

```
courses/python-basics/
├── course.yaml                          # 课程元数据
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

## 命令参考

| 命令 | 作用 |
| --- | --- |
| `whale-tutor init` | 在当前目录 scaffold 示例课程 + 配置模板 |
| `whale-tutor start` | 启动 server(自动应用 schema + 同时 serve API + 静态前端) |
| `whale-tutor doctor` | 健康检查(node 版本 / mysql 连通 / API key 是否设) |
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
  deepseek_api_key: sk-xxxxx        # 留空则走 fallback 文案
  deepseek_api_base_url: https://api.deepseek.com
server:
  port: 3000                        # 学习者访问地址 http://localhost:<port>
```

环境变量 override 优先级最高:`DATABASE_HOST` / `DEEPSEEK_API_KEY` 等设了会盖过 yaml。

## 多课程

`courses_dir` 下每个含 `course.yaml` 的子目录都会被自动加载。复制 `python-basics` 改成你的内容,改完 `whale-tutor start` 后浏览器就能切换学习不同课程。

## 故障排查

- **`whale-tutor start` 报 mysql 连不上**:检查 `whale-tutor.config.yaml` 中 host/port/user 是否对,mysql 是否在监听
- **AI 评估总是 fallback**:`whale-tutor doctor` 检查 API key 是否填了
- **浏览器 404**:确认 `whale-tutor start` 的端口跟你访问的一致(默认 3000)
- **`node` 找不到**:装 https://nodejs.org/ Node.js ≥ 22

## 许可

MIT
