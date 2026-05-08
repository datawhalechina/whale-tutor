# Whale Tutor

**AI 驱动的 Python 交互式学习产品** — 课程作者用的命令行(Node 版)。

只需要写 YAML 和 Markdown 内容,不需要懂前后端开发。

> Python 版同源同功能:`pip install whale-tutor`(详见 [packages/cli-py/README.md](../cli-py/README.md))。本包给已经有 Node 工具链的用户用。

## 安装前置

- **Node.js ≥ 22** (https://nodejs.org/)
- **MySQL ≥ 8.0** (本机已运行,在某端口监听)

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
| `whale-tutor init` | 在当前目录 scaffold 示例课程 + 配置模板 |
| `whale-tutor start [--no-open]` | 启动 server(自动应用 schema + serve API + 静态前端) |
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
  deepseek_api_key: sk-xxxxx        # 留空则走 fallback 文案
  deepseek_api_base_url: https://api.deepseek.com
server:
  port: 3000                        # 学习者访问地址 http://localhost:<port>
```

环境变量 override 优先级最高:`DATABASE_HOST` / `DEEPSEEK_API_KEY` 等设了会盖过 yaml。

## 课程内容怎么写

`whale-tutor init` 在 `courses/python-basics/` 下生成完整的示例课程。改 working sample 比从零写快得多 — 详细约定见 [packages/cli-py/README.md](../cli-py/README.md#课程内容怎么写)(两版包同结构)。

## 故障排查

- **`whale-tutor start` 报 mysql 连不上**:检查 `whale-tutor.config.yaml` 中 host/port/user 是否对,mysql 是否在监听
- **AI 评估总是 fallback**:`whale-tutor doctor` 检查 API key 是否填了
- **浏览器 404**:确认 `whale-tutor start` 的端口跟你访问的一致(默认 3000)
- **`node` 版本过低**:`node --version` < 22,装 https://nodejs.org/ ≥ 22

## 许可

MIT
