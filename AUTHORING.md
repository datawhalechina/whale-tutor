# 课程作者指南

> 写给:**只懂 YAML 和 Markdown**、想给学习者做一门 Python(或其他学科)交互式课程的老师 / 教研人员。
>
> 你不需要懂 JavaScript、TypeScript、NestJS、SQL,也不需要会写代码评估逻辑。
>
> 大约 20 分钟读完,跑通示例。之后你能做的:**改 YAML 改 Markdown 加自己的内容**,刷新就能学。

---

## 目录

1. [5 分钟跑起来](#1-5-分钟跑起来)
2. [大局观:课程结构](#2-大局观课程结构)
3. [课程目录详解(每个文件做什么)](#3-课程目录详解每个文件做什么)
4. [`$ref` — 把长 markdown 抽出去](#4-ref--把长-markdown-抽出去)
5. [4 种交互模式(题型)](#5-4-种交互模式题型)
6. [hint 机制(求提示)](#6-hint-机制求提示)
7. [评价机制(系统怎么判对错)](#7-评价机制系统怎么判对错)
8. [日常工作流](#8-日常工作流)
9. [常见错误 + 排查](#9-常见错误--排查)
10. [`whale-tutor generate` & `build`:AI 辅助生成课程](#10-whale-tutor-generate--build-ai-辅助生成课程)

---

## 1. 5 分钟跑起来

### 安装前置

- **Node.js ≥ 22**(<https://nodejs.org>)
- **MySQL ≥ 8.0**(本机或远程,在某端口监听)
- **DeepSeek API key**(可选,没填的话 AI 评估走 fallback 文案,但你能完整体验流程;`whale-tutor build` 必须有 key)

### 第一次:复制示例课程,启动看效果

```bash
# 1. 装 CLI(npm 包)
npm install -g whale-tutor

# 2. 在某个空目录初始化
mkdir my-course && cd my-course
whale-tutor init                       # 复制完整 python-basics 示例 + 配置模板

# 3. 编辑 whale-tutor.config.yaml(填 mysql 连接 + DeepSeek API key)
# ... vim / nano / VSCode 随便 ...

# 4. 体检(可选,推荐)
whale-tutor doctor                     # node / mysql / api key 4 项

# 5. 启动 — 浏览器自动打开 http://localhost:3000
whale-tutor start
```

打开浏览器 → 点"开始学习" → 走完 4 个 LO + 章末测试 → 章节完成 🎉

**这就是你的学习者会看到的**。现在你的任务是把里面的内容换成你自己的。

### 之后:改内容 → 重启 → 看效果

```bash
# 改 yaml / md 文件...
# Ctrl+C 停 server
whale-tutor lint                       # 校验改完没破坏结构
whale-tutor start                      # 重启
```

`whale-tutor lint` 是你的安全网 — 改完点一下,5 秒内告诉你哪里写错了。**强烈推荐每次改完先 lint,再 start**。

---

## 2. 大局观:课程结构

学习者眼里的"一门课"其实是 4 层:

```
Course (一门课,e.g. "Python 基础")
└── Chapter (一章,e.g. "列表与迭代")
    ├── LO × N (Learning Objective,学习目标)
    │   └── RequiredInteraction × M (RI,必做题)
    └── ChapterAssessment (章末综合测试)
        └── RequiredInteraction × K
```

**学习路径**:

- 进 LO → 看核心讲解 → 答 LO 内的必做题(按顺序)→ 全部答对 → 进下一个 LO
- 一章所有 LO 都做完 → 解锁章末综合测试
- 章末测试也做完 → 章节完成

**你要做的**:

- 写 Course 元信息(name, subject, description)
- 把每章拆成几个 LO(每个 LO 是"学完能做到 X" 的一个具体技能)
- 给每个 LO 写讲解 + 3-5 道必做题
- 给每章末写一组综合测试题(覆盖该章所有 LO)

**LO 应该多大?** 经验值:学习者花 15-30 分钟能学完 + 答完必做题。再大就拆开。

**必做题应该多少道?** 经验值:每个 LO 3-5 道。覆盖核心知识点 + 1-2 道易错陷阱。

---

## 3. 课程目录详解(每个文件做什么)

`whale-tutor init` 复制出来的目录长这样(只列一个 LO 的细节):

```
courses/
└── python-basics/                                    ← 一门课的根
    ├── course.yaml                                   ← 课程元信息(必)
    ├── course-description.md                         ← 课程长描述(可选,被 course.yaml $ref)
    └── chapters/
        └── list_and_iter/                            ← 一章一目录
            ├── chapter.yaml                          ← 章元信息 + LO 列表 + assessment 引用
            ├── description.md                        ← 章长描述
            ├── los/
            │   └── list_basics/                      ← 一个 LO 一个目录
            │   │   ├── lo.yaml                       ← LO 元信息 + 必做题数组
            │   │   ├── core-explanation.md           ← LO 教学讲解(进 LO 第一屏看到)
            │   │   ├── ri-1.explanation.md           ← 第 1 道题前的引子
            │   │   ├── ri-1.rationale.md             ← 第 1 道题答案解析
            │   │   ├── ri-2.explanation.md
            │   │   ├── ri-2.rationale.md
            │   │   ├── ri-3.explanation.md
            │   │   └── ri-3.rationale.md
            │   ├── list_indexing/                    ← 第 2 个 LO,同样结构
            │   ├── list_mutation/
            │   └── iter_for_over_list/
            └── assessment/                           ← 章末测试
                ├── assessment.yaml                   ← 测试元信息 + 综合题数组
                └── ca-1.explanation.md
```

**约定**(默认即合理,不打破能省心):

- 每个 LO 一个目录,目录名小写下划线;`lo.yaml` 是固定文件名
- 每道题对应 `ri-<N>.<purpose>.md`(N 是题号,purpose 是 explanation / rationale / starter-code / hint-1 等)
- 文件夹名可自由(如 `list_basics`),但 LO id 在 yaml 里另外指定(如 `lo.list.basics`)

### 3.1 `course.yaml`

```yaml
id: python-basics # 全局唯一,英文小写连字符
name: Python 基础 # 学习者看到的标题
subject: Python # ★ 学科名,会传给所有 AI prompt(影响出题语气)
description: { $ref: ./course-description.md }
chapters:
  - { $ref: ./chapters/list_and_iter/chapter.yaml }
```

**`subject` 字段(v0.2 新增)** — 让你做 SQL / Java / Pandas 课时不用改任何 prompt 模板。AI 看到 "你是 SQL 教学评估助手" 而不是 "Python"。

### 3.2 `chapter.yaml`

```yaml
id: ch.list_and_iter
name: 列表与迭代
description: { $ref: ./description.md }
learningObjectives:
  - { $ref: ./los/list_basics/lo.yaml }
  - { $ref: ./los/list_indexing/lo.yaml }
  - { $ref: ./los/list_mutation/lo.yaml }
  - { $ref: ./los/iter_for_over_list/lo.yaml }
assessment: { $ref: ./assessment/assessment.yaml }
```

**LO 顺序就是学习顺序**(数组顺序 = 推进顺序)。同时 LO 自身也声明 `prerequisites`(强依赖 LO id 列表),系统会确保 prereq 先完成才解锁该 LO。

### 3.3 `lo.yaml`(最重要)

```yaml
id: lo.list.basics # 全局唯一,推荐 lo.<topic>.<subtopic> 形式
name: 列表的创建与表示 # 学习者看到
description: 用 [] 与 list() 创建列表,理解 len 与异质元素
prerequisites: [] # 强依赖:必须答对必做才能解锁本 LO
weakPrerequisites: [] # 弱依赖:可越过(目前 v0.2 还没用,占位)
estimatedDurationMin: 15 # 学习者评估,影响进度条 / 提醒
difficultyBand: beginner # beginner | intermediate | advanced
coreExplanation: { $ref: ./core-explanation.md } # ★ 学习者进 LO 第一屏看到的讲解
commonMisconceptions: # ★ 常见误解,AI 出题时会拿来设陷阱选项
  - list 只能存同类型元素(把 list 当 C 数组)
  - list 像数组一样定长(把 list 当 tuple)
masteryCriteria: 连续 2 题正确判断 list 长度 / 元素类型;能写出创建空 list 与含初值 list
requiredInteractions: # ★ 必做题数组,按顺序出
  - id: ri.list.basics.1
    patternId: concept_check
    prompt:
      explanationMd: { $ref: ./ri-1.explanation.md }
      question:
        stem: 下列哪个表达式创建一个空列表?
        options: ['[]', '{}', 'list{}', 'list[]']
        answerIndex: 0
        rationale: { $ref: ./ri-1.rationale.md }
    hints: # 可选,1-5 元素;不写则学习者求提示时 AI 自动生成 3 级
      - 留意四个选项里**括号的形状**和**调用语法**...
      - 'Python 创建空容器有两种写法:**字面量**和**构造函数**...'
  - id: ri.list.basics.2
    patternId: concept_check
    prompt: { ... }
  - id: ri.list.basics.3
    patternId: concept_check
    prompt: { ... }
adaptivePatterns: [concept_check, free_recall] # 答错后 AI 出"换说法"题时可用的 pattern 集
```

**逐字段含义**:

| 字段                   | 类型        | 必填 | 说明                                                            |
| ---------------------- | ----------- | ---- | --------------------------------------------------------------- |
| `id`                   | string      | ✓    | LO 全局唯一标识。命名建议 `lo.<topic>.<subtopic>`               |
| `name`                 | string      | ✓    | 学习者看到                                                      |
| `description`          | string      | ✓    | 1-2 句话说"学完能做到什么"                                      |
| `prerequisites`        | string[]    | ✓    | 强前置 LO id;它们必做完成后才解锁本 LO                          |
| `weakPrerequisites`    | string[]    | ✗    | 弱前置(v0.2 占位)                                               |
| `estimatedDurationMin` | number      | ✓    | 整数分钟                                                        |
| `difficultyBand`       | enum        | ✓    | beginner / intermediate / advanced                              |
| `coreExplanation`      | string      | ✓    | LO 第一屏的教学讲解(markdown,常 $ref 外置)                      |
| `commonMisconceptions` | string[]    | ✓    | 常见误解列表;AI 出"换说法"题时拿来设陷阱(必填,即使空数组也得写) |
| `masteryCriteria`      | string      | ✓    | 给学习者看的 "本节通过标准" 描述                                |
| `requiredInteractions` | RI[]        | ✓    | 必做题数组                                                      |
| `adaptivePatterns`     | PatternId[] | ✓    | 答错时 AI 生成的题型(用学习者已熟悉的题型避免认知负担)          |

### 3.4 `assessment.yaml`(章末测试)

```yaml
id: ca.ch.list_and_iter
name: 列表与迭代:综合检验
requiredInteractions:
  - id: ca.list_and_iter.1
    patternId: code_sandbox
    prompt: { ... }
  # 通常 5-10 道,覆盖该章所有 LO
```

**章末跟 LO 不同的地方**:

- 不分 LO 推进,直接按数组顺序出
- **答错不出"换说法"题**(综合考核,系统不兜底)
- **求提示按钮也隐藏**(同样的考核理由)
- 没 `commonMisconceptions` / `coreExplanation` / `prerequisites`(它的 prereq 是 chapter 内全部 LO 完成)

---

## 4. `$ref` — 把长 markdown 抽出去

为什么不直接把 markdown 写在 yaml 里?— 你试一下就知道:yaml 多行字符串 + 缩进 + escape 一堆细节,markdown 高亮也丢了。

所以约定:**结构和短字段写 yaml,长 markdown 抽到 .md 文件用 `$ref` 引**。

### 语法

```yaml
explanationMd: { $ref: ./ri-1.explanation.md }
```

**两条规则**:

1. 路径**相对当前 yaml 文件所在目录**(不是 courses/ 根)
2. 按文件后缀决定:
   - `.md` → 读为字符串
   - `.yaml` / `.yml` → 读为 YAML 对象,递归 resolve 其中的 `$ref`

### 哪些字段适合 $ref?

凡是"长文本":

- LO 的 `coreExplanation`(讲解动辄上百行)
- 题目的 `explanationMd`(题前引子)
- 题目的 `rationale`(答案解析)
- code_sandbox 的 `starterCode`(若超长)
- spot_the_bug 的 `buggyCode`(若超长)

凡是"短的、结构性的"直接 inline 写:

- LO 的 `name` / `description`
- question 的 `options` / `answerIndex`
- `prerequisites` / `adaptivePatterns` 等数组

### 混合用没问题

同一字段,不同位置可以一处 inline 一处 $ref:

```yaml
- id: ri.list.basics.1
  prompt:
    explanationMd: { $ref: ./ri-1.explanation.md } # 长,外置
    question:
      stem: 下列哪个表达式创建一个空列表? # 短,inline
      options: ['[]', '{}', 'list{}', 'list[]']
      answerIndex: 0
      rationale: 字面量 [] 是 list 的标准空形式... # 也可以 inline 短答案解析
```

---

## 5. 4 种交互模式(题型)

每道必做题用 4 种 `patternId` 之一。每种有自己的 prompt 字段约束。

### 5.1 `concept_check` — 概念选择题

**用法**:测一个明确概念的 4 选 1 题。

```yaml
patternId: concept_check
prompt:
  explanationMd: { $ref: ./ri-N.explanation.md } # 题前引子,可空字符串
  question:
    stem: 下列哪个表达式创建一个空列表? # 题干
    options: # 必须 ≥2 个,通常 4 个
      - '[]'
      - '{}'
      - 'list{}'
      - 'list[]'
    answerIndex: 0 # 正确选项 0-based
    rationale: { $ref: ./ri-N.rationale.md } # 答案解析(无论对错都展示)
```

**评估方式**:确定性匹配 — `selectedIndex === answerIndex`,不调 AI,瞬间返结果。

**适合**:概念辨析、API 名词、语法选择。**不适合**:开放思路题(用 free_recall)。

### 5.2 `code_sandbox` — 代码沙盒

**用法**:让学习者写一段代码,浏览器里跑 Python(Pyodide),按测试用例期望输出对比。

```yaml
patternId: code_sandbox
prompt:
  promptMd: { $ref: ./ri-N.prompt.md } # 题面
  starterCode: | # 起手代码(学习者基于此修改)
    def first_two(items):
        # TODO: 返回前两个元素
        pass
  testCases: # 至少 1 个
    - description: 列表至少 2 元素
      setupCode: print(first_two([1, 2, 3])) # ★ 必须含 print(),输出做比较
      expectedOutput: '[1, 2]' # ★ trim 后精确字符串匹配
    - description: 边界 — 空列表
      setupCode: print(first_two([]))
      expectedOutput: '[]'
  hiddenTestCases: [] # 可选,迁移性测试,v0.2 暂不下发
```

**评估方式**:确定性 — 浏览器里 Pyodide 跑一遍 `学习者代码 + setupCode`,捕获 stdout,trim 后跟 `expectedOutput` 严格对比。**全部测试通过才算 correct**。

**`setupCode` 写法要诀**:

- 假定学习者代码已经定义好函数/变量,直接 `print(调用)`
- 必须用 `print(...)` — 否则没 stdout 输出可比,测试永远过不了
- 一行能写完最好;复杂场景多行也行,但每个 `expectedOutput` 都对应**完整 stdout**

**适合**:小函数实现、表达式求值、循环逻辑。**不适合**:大型程序(Pyodide 慢)、需要文件 IO 的场景。

### 5.3 `spot_the_bug` — 找 bug

**用法**:展示一段含 bug 的代码,让学习者点选哪几行有问题 + 用文字解释 bug 性质。

```yaml
patternId: spot_the_bug
prompt:
  buggyCode: |
    def add_zero(items):
        items.append(0)        # 这行修改了原 list,有副作用
        return items

    a = [1, 2, 3]
    b = add_zero(a)            # 调用方不一定预期 a 也被修改
    print(a)                   # → [1, 2, 3, 0]
  bugLocations: # ★ server-only,精确行号(从 1 开始)
    - line: 2
      kind: side_effect_on_argument
  correctExplanation: { $ref: ./ri-N.explanation.md }
  hintMd: 想想函数参数传引用对调用方的影响... # 可选,引导提示
```

**评估方式**:**hybrid** — server 先确定性比对学习者选的行号是否完全等于 `bugLocations`,再调 AI 评估学习者的文字解释是否抓住 bug 性质。两个都过才 correct。

**`bugLocations.kind` 是给系统的内部标签**(如 `off_by_one` / `aliasing` / `side_effect_on_argument`),不展示给学习者,主要给 AI 评估时参考。

**适合**:常见错误模式、副作用、变量作用域、边界条件。**不适合**:语法错误(太基础)、设计题(太开放)。

### 5.4 `free_recall` — 自由回忆

**用法**:开放问答,学习者用自己的话表达;AI 按 rubric 关键点判覆盖度。

```yaml
patternId: free_recall
prompt:
  promptMd: { $ref: ./ri-N.prompt.md } # 题面(开放问题)
  rubricKeyPoints: # ★ server-only,AI 判分按这个
    - list 是有序的
    - list 长度可变(append/pop)
    - list 元素可以是异质类型
    - 空 list 长度为 0
```

**评估方式**:AI 评估 — 看学习者答案是否覆盖了 ≥70% 的 rubric 点。每点 AI 标 covered/not。confidence 0-1 浮动。

**`rubricKeyPoints` 写得好的关键**:

- 每点 1 句具体可判定的事实(不是 "理解 list" 这种主观)
- 3-5 个点最合适(<3 太宽松,>5 太严)
- 不在题干里直接提示这些点(否则学习者抄)

**适合**:复述概念、对比说明、原理解释。**不适合**:有标准答案的题(用 concept_check)、需要写代码(用 code_sandbox)。

### 5.5 4 种 pattern 的对比速查

| Pattern         | 评估方式                   | 学习者输入    | 适合场景            | AI 用量                                |
| --------------- | -------------------------- | ------------- | ------------------- | -------------------------------------- |
| `concept_check` | 确定性(选项匹配)           | 选 1 个选项   | 4 选 1 概念辨析     | 无                                     |
| `code_sandbox`  | 确定性(Pyodide + 输出比对) | 写代码        | 小函数实现 / 表达式 | 无(本题评估;仅 hint / regenerate 时用) |
| `spot_the_bug`  | hybrid(行号 + AI 评解释)   | 选行 + 写解释 | 常见错误模式        | 评估时 1 次                            |
| `free_recall`   | AI(按 rubric)              | 写自由回答    | 复述 / 对比 / 解释  | 评估时 1 次                            |

---

## 6. hint 机制(求提示)

学习者答题时卡住,可以点题目上方的"💡 求提示"按钮。提示分梯度,一次出 1 级,可继续点"再来一级"逐步加详细。

### 你能写的:静态 hint(可选)

在 RI 上加 `hints` 数组(1-5 元素,作者决定该题需要几级):

```yaml
- id: ri.list.basics.1
  patternId: concept_check
  prompt: { ... }
  hints: # ★ 可选,作者决定级数
    - 留意四个选项里**括号的形状**(方括号 / 花括号)和**调用语法**(带 `()` 与否)
    - 'Python 创建空容器有两种写法:**字面量**(`[]`、`{}`)和**构造函数**(`list()`、`dict()`)'
```

学习者点"求提示" → 出 hint[0]("提示 1");"再来一级" → hint[1]("提示 2"),用完后按钮 disabled。

**梯度建议**(不强制,作者按题难度自己判断):

- Level 1:引导问题 — 不给答案,问一个引导思考的问题
- Level 2:概念提示 — 指出 1-2 个相关概念/原理
- Level 3:部分解答 — 给一半的解题方法
- Level 4-5:更详细 / 部分接近答案

### 你不写的:AI 兜底(自动)

**作者没在 RI 上写 `hints` → 学习者第一次点"求提示"时,系统自动调 AI 生成 3 级 hint**,缓存住,后续命中直接返(不重复调 AI)。

意味着:

- 你不用为每道题都写 hint
- AI 兜底质量 OK 但不一定贴你的口吻;如果想定制,在 yaml 加 `hints` 即可覆盖

### hint 不影响必做完成,但影响 mastery

**学习者用 hint 答对**:

- ✓ 必做计入(LO 进度仍前进)
- ✗ 不算"裸答对",不增加 consecutiveCorrect

**结果**:LO 内学习者用 hint 通关 → 必做都做完了能进下个 LO,但 mastery 状态留在 `exposed` 或 `practicing`,达不到 `mastered`。**鼓励学习者后续不用 hint 答对几次拿到 mastered**。

### 章末测试无 hint

章末是综合考核,UI 隐藏求助按钮。学习者必须自己来(可以用"问问题"求助,但那是另一回事)。

---

## 7. 评价机制(系统怎么判对错)

每道题答完,系统返一个 `evaluation` 给学习者:

| 字段            | 含义                                                    |
| --------------- | ------------------------------------------------------- |
| `correct`       | 对/错(布尔)                                             |
| `confidence`    | 系统对自己判断的信心 0-1                                |
| `feedbackMd`    | 反馈文案(给学习者看)                                    |
| `evaluatorKind` | `deterministic` / `ai` / `hybrid`(让前端展示置信度提示) |

### 4 个 pattern 的评估摘要

(详见 §5,这里是横向比较)

| Pattern         | correct 怎么定                                | confidence                   | feedback 来源                  |
| --------------- | --------------------------------------------- | ---------------------------- | ------------------------------ |
| `concept_check` | `selectedIndex === answerIndex`               | 固定 1                       | `rationale` 字段               |
| `code_sandbox`  | 全部 testCases 通过                           | 固定 1                       | 系统拼通过/失败用例报告        |
| `spot_the_bug`  | 选行 = bugLocations ∧ AI 评 quality ≠ 'wrong' | 选行错时 0.95;选行对时 AI 给 | AI feedbackMd + 系统拼参考解析 |
| `free_recall`   | AI 判覆盖 ≥70% rubric 点                      | AI 给 0-1                    | AI feedbackMd                  |

### Mastery 状态机

每个 LO 维护一个 mastery 状态:

```
untouched → exposed → practicing → mastered
                                      ↓ (连错 2 次)
                                   practicing
```

**晋级规则**:

- `untouched + 任何答题` → `exposed`(只要做了一题就升)
- `exposed + 裸答对(无 hint)` → `practicing`
- `practicing + 连续 2 次裸答对 + AI confidence > 0.7` → `mastered`
- `mastered + 连续 2 次答错` → 回退 `practicing`

**hint 折扣**:用 hint 答对仍计入必做,但**不增加 consecutiveCorrect**,所以 mastered 拿不到。

**学习者不用直接看 mastery 状态机**;他们看到的是必做 X/N + 章节完成度。但这个状态会驱动:

- 章末测试解锁(所有 LO 必做完成)
- 答错→自动出 AI 换说法题(`adaptivePatterns` 中的)
- 连错 3 次→强制回 LO 讲解(review_lo)

### 答错时系统会做什么(v0.2 智能编排)

**答错任意必做题** → server 自动调 AI(`pattern.regenerate.<patternId>`)出**同 LO 但题干换说法**的题(adaptive 题)。学习者看到一道新题(不是原题再发一遍)。

**adaptive 题答对** → 视为原题通关,必做计入,继续。
**adaptive 题答错** → 再出一道 adaptive。
**连续答错 3 次** → 系统强制弹 LO 讲解("先回去看一遍讲解再来"),学习者点"我看完了"后回到原题。

**对作者意味着什么**:

- `commonMisconceptions` 字段不是装饰 — AI 生成"换说法"题时会读它当陷阱选项灵感。**多写几条具体的常见误解 → AI 出题质量更高**
- `adaptivePatterns` 列表决定 AI 能用哪些 pattern 出 retry 题。如果原题是 concept_check,放 `[concept_check]` 让 AI 出选择题;放 `[free_recall, concept_check]` 让 AI 可能出回忆题。**列你确信学生熟悉的 pattern**

---

## 8. 日常工作流

### 8.1 改了内容怎么办

```bash
# 改完 yaml/md 文件,本地保存
whale-tutor lint                       # 5 秒,告诉你写错没
whale-tutor start                      # 重启 server,浏览器看效果
```

server 进程是常驻的,内容改完必须重启才能重新加载(v0.2 没做 hot reload)。

### 8.2 加一个新 LO

1. 在 `chapters/<your-chapter>/los/` 下新建一个目录(如 `dict_basics/`)
2. 写 `lo.yaml`(参考已有 LO,改 id / name / description / requiredInteractions)
3. 写 `core-explanation.md` 和每道题的 `ri-N.explanation.md` / `ri-N.rationale.md`
4. 在 `chapter.yaml` 的 `learningObjectives` 数组里 $ref 这个新 lo.yaml,放在合适顺序位置
5. **如果这个 LO 依赖另一个**,在新 lo.yaml 的 `prerequisites: [lo.list.basics]` 里写
6. `whale-tutor lint` → 没问题就 `start`

### 8.3 加一道新必做题

1. 在某 LO 目录里加 `ri-4.explanation.md` 和 `ri-4.rationale.md`(题号接续)
2. 编辑该 LO 的 `lo.yaml`,在 `requiredInteractions` 数组末尾加一个 RI:
   ```yaml
   - id: ri.<lo>.4 # ★ 必须全局唯一,推荐 ri.<lo-id>.<n>
     patternId: concept_check # 选 4 种之一
     prompt: { ... } # 按 §5 该 pattern 的 schema 写
     hints: [...] # 可选
   ```
3. `lint` → `start`

### 8.4 加一门新课程

**三条路径**,按你手头资料 / 想要的控制粒度选:

#### A 路径 — `whale-tutor generate` 一键 AI 生成(推荐起步,详见 [§10](#10-whale-tutor-generate--build-ai-辅助生成课程))

什么资料都没有,只有个想法?

```bash
whale-tutor generate                     # 交互式问答 → AI 写讲稿 + 拆 LO + 出题
whale-tutor lint && whale-tutor start    # 试学
```

最快从 0 到课程的方式。AI 写完后留一份 markdown 在 `<course-id>-source/`,可手改后重跑 `whale-tutor build` 优化。

#### B 路径 — 自己写讲稿 + `whale-tutor build` 拆题

已经有教案 markdown(每章一份)?跳过 AI 写讲稿,只让 AI 拆 LO + 出题:

```bash
mkdir my-source && cd my-source && mkdir chapters
# 写 course.md(课程介绍)+ chapters/01-xxx.md / 02-xxx.md(每章一份完整讲稿)
cd ..
whale-tutor build my-source/             # AI 拆 LO + 出题 → courses/my-source/
whale-tutor lint && whale-tutor start
```

或:`whale-tutor generate` 选 `manual` 模式 → CLI 帮你 scaffold 一个最小源目录骨架,你按提示写完讲稿后跑 `whale-tutor build`。

build 出来都是 `concept_check` 题型 + 默认 `adaptivePatterns: [concept_check]`,作者后续可手改部分 RI 为其他 pattern(参考 §5)。

#### C 路径 — 手写 yaml(改示例,适合定向控制)

如果你想精细控制每道题的 pattern / hints / rubric / 测试用例(尤其 code_sandbox / spot_the_bug),从示例改:

1. 在 `courses/` 下新建目录(如 `sql-basics/`)
2. 写 `course.yaml`,**改 `subject: SQL`**(让所有 AI prompt 自动适配)
3. 写章节 + LO,完全同 python-basics 套路
4. `start` 时所有课程会一起被发现 + 加载

### 8.5 改完想清空学习记录?

学习记录在 MySQL 里跟课程内容**完全分开**。改 yaml/md 不影响学习记录;改学习记录不影响课程。要清空学习记录有两条路径:

#### 方式 A:**整个数据库重置**(开发期推荐)

`whale-tutor` 用的是 MySQL docker 容器。开发本机最简单:

```bash
# 在开发 monorepo 目录
pnpm db:reset
```

它做的事:`docker compose down -v`(删卷)+ `docker compose up -d mysql`(重启 + 重跑 db/init/01-schema.sql)。所有 learner / session / interaction / response / event 都没了,schema 重建,demo learner_id=1 重新插入。

如果你不在 monorepo 里(用 `whale-tutor` pip/npm CLI 跑):**直接进你装的 MySQL**:

```sql
DROP DATABASE whale_tutor;
CREATE DATABASE whale_tutor;
-- 然后重新跑 whale-tutor start,它会自动检测 schema 缺失并应用
```

#### 方式 B:只清单个 learner 的进度(不动 schema)

```sql
DELETE FROM learner_state WHERE learner_id = 1;
DELETE FROM learner_chapter_progress WHERE learner_id = 1;
DELETE FROM events WHERE learner_id = 1;
-- 可选:清掉 sessions / interactions / responses(事实表,通常保留)
DELETE FROM responses;
DELETE FROM interactions;
DELETE FROM sessions WHERE learner_id = 1;
```

v0 demo learner 硬编码 `id=1`,所以 `WHERE learner_id = 1` 永远对。等 v0.3 加认证后会变。

#### 改课程结构后的"残留"问题

改 LO 的 `requiredInteractions` 数组(如删了一题、改了 id)后,如果学习者已经做过的旧 RI id 还留在 `mandatory_completed_ids` 里,会变成"无效完成":数字对不上 / 章节进度算错。`whale-tutor lint` 不查这个(它只验 yaml 结构,不知道学习者做过什么)。出现这种情况,**清 learner_state**(方式 B)就好。

### 8.6 章节切换(学习者侧)

进入学习页(LearnView)后,左侧 ProgressSidebar 顶部是"课程全部章节"栏,列出该课所有章节 + 当前章蓝底高亮。

**点其他章节** → 服务端会把 session 的 `current_lo_id` 切到该章首 LO + 重新决定下一题。学习者立刻看到新章的 LO Intro 页,可以从头看讲解 + 答题。

切换不影响学习状态:

- mastery / 必做完成度 / 章末进度都按学习者历史保留(每个 (learner, lo) 一行 `learner_state`,跟当前 session focus 无关)
- 切回原章,接着原 LO 继续

**注意**:章节切换不强制 prereq 校验 — 学习者可以提前看后面章节的内容(浏览),系统不阻拦。LO 内的 prereq(`prerequisites: [lo.x]`)仍生效:解锁 LO 内的题目要求其前置 LO 已通过必做。所以"切到第 3 章" + "第 3 章 LO 1 prereq 是第 2 章某 LO 但没做" → sidebar 显示"🔒 需先完成前置 LO"。

学习者关闭浏览器再进 → start session 时仍走 `pickStartingLo` 自动找第一个未完成章节,不受切换历史影响。

---

## 9. 常见错误 + 排查

### 9.1 `whale-tutor lint` 报错

#### `Failed to resolve $ref './xx.md' from .../yy.yaml`

→ 路径写错了。**$ref 路径相对当前 yaml 文件**,不是相对 courses/ 根。检查文件确实存在 + 大小写匹配(Linux 区分大小写)。

#### `Invalid YAML at .../lo.yaml: bad indentation of a mapping entry (53:3)`

→ YAML 语法错(缩进 / 引号 / 冒号)。看冒号:行号 53、列号 3。常见坑:

- tab 和空格混用 → 全用 2 空格
- 字符串含特殊字符没加引号(冒号、`@`、`#` 开头等)
- 列表 `-` 后的缩进不一致

#### `must be equal to one of the allowed values [ ... allowedValues ]`

→ 枚举字段写了不存在的值。看 `instancePath` 找具体哪行的哪个字段。例:`adaptivePatterns: [bogus_pattern]` 会报这个,因为 `bogus_pattern` 不在 4 种 pattern 之列。

#### `must have required property 'subject'`

→ `course.yaml` 没写 `subject` 字段(v0.2 必填)。补上:`subject: Python` 之类。

#### `must NOT have additional properties` / `additionalProperty: ...`

→ 写了 schema 不认的字段(可能拼写错了,如 `prerequisite` 少了 s)。看 `params.additionalProperty` 找出超额的字段名。

### 9.2 `whale-tutor start` 起不来 / 报错

#### `连不上 mysql`

→ 检查 `whale-tutor.config.yaml` 里 host/port/user/password。MySQL 容器装好了吗?端口对吗?

#### 浏览器 404

→ 端口对吗?config.yaml 里 `server.port` = 实际访问的端口。

#### 启动很久没动静

→ 第一次启动会跑 schema 初始化,正常 1-3 秒。如果 30 秒以上,看 server 日志(默认 stdout)。

### 9.3 学习者看到的问题

#### "AI 评估暂不可用"

→ DeepSeek API key 没设或失效。`whale-tutor doctor` 看 API key 一行。free_recall / spot_the_bug 评解释 / 答错出 adaptive 题都需要 API key。

#### 答对了但章节没解锁

→ 检查每个 LO 的 `requiredInteractionCount` 是不是跟 `requiredInteractions` 数组长度一致(应该自动派生)。如果学习者中途跳过题,可能 mandatoryCompletedIds 不全。清 learner_state 重新做。

#### "换种说法再试一道" 后出题质量很差

→ AI 兜底受 LO `commonMisconceptions` 质量影响。如果你写的太宽泛("理解 list"),AI 出的陷阱也宽泛。**在 commonMisconceptions 里写具体的、可识别的错误模式**(如"以为 a[5:10] 抛 IndexError(实际返 [])")。

---

## 10. `whale-tutor generate` & `build`:AI 辅助生成课程

两个命令,**两层抽象**:

| 命令                         | 输入                                                 | AI 干的事                  | 输出                    |
| ---------------------------- | ---------------------------------------------------- | -------------------------- | ----------------------- |
| `whale-tutor generate`(高层) | 交互式问答(课程名 / 主题 / 章节数 / 受众)            | **写讲稿 + 拆 LO + 出题**  | 完整可学课程(yaml + md) |
| `whale-tutor build`(底层)    | 你已经写好的 markdown(`course.md` + `chapters/*.md`) | 拆 LO + 出题(讲稿是你写的) | 完整可学课程(yaml + md) |

**简单选择**:不想动笔写就 `generate`(默认 ai 模式);你已经有讲稿草稿就直接 `build`。

### `whale-tutor generate` — 一键生成(推荐起步)

```bash
whale-tutor generate
```

交互式问答(都有合理默认值,直接回车就行):

```
? 课程名字(中文 OK,如 "Pandas 数据分析入门")
? 生成方式  ([ai]=AI 自动写讲稿(推荐) / manual=我自己写 markdown)
? 课程主题/范围(可选,留空 AI 从课程名推断)
? 目标受众(可选,如 "数据分析新手")
? 章节数(留空 AI 自己定;一般 3-7)
```

回答完 AI 跑两步,然后自动接 build pipeline:

| 阶段 | prompt                     | 调用次数 | 干什么                                                                |
| ---- | -------------------------- | -------- | --------------------------------------------------------------------- |
| 1    | `generate.course_outline`  | 1        | 决定 course id / subject / description / N 个章节 outline(含 summary) |
| 2    | `generate.chapter_content` | N        | **逐章扩写 markdown 讲稿**(2000-3500 字 / 章,含代码块 + 易错点段落)   |
| 3    | (build pipeline,见下面)    | 1+2N+M   | 拆 LO + 出题 + 章末测试                                               |

**总调用次数 = 2 + 3N + M**。例:5 章共 20 个 LO → 2 + 15 + 20 = 37 次,deepseek-v4-flash ≈ $0.10,2-5 分钟。

**生成完后**:

- `<workspace>/<course-id>-source/` — AI 写的 markdown 讲稿,**留下来供你 review/手改**
- `<workspace>/courses/<course-id>/` — 完整可学课程

不满意 AI 写的某章?改 `<course-id>-source/chapters/03-xxx.md`,然后:

```bash
whale-tutor build <course-id>-source/ --force
```

只重跑底层 build pipeline(3 阶段拆 LO + 出题),不重写讲稿。

#### `manual` 模式 — 不让 AI 写讲稿,只让 AI 拆 LO

`whale-tutor generate` 选 `manual`:CLI scaffold 出一个最小源目录骨架(`course.md` + `chapters/01-introduction.md` + `chapters/02-second-topic.md` 占位),你按提示写完讲稿后跑 `whale-tutor build <source>/` 即可。这条路径适合**你已经有教案稿子,只是不想写 yaml**。

### `whale-tutor build` — 给已写好的讲稿拆 LO + 出题

```bash
whale-tutor build my-course-source/                # 输出到 <coursesDir>/<source 目录名>/
whale-tutor build my-course-source/ --force        # 已存在时覆盖
whale-tutor build my-course-source/ --output ./courses/awesome   # 指定输出目录
```

**输入约定**(MD 一份 = 一个 chapter):

```
my-course-source/                # 自由命名,等下传给 build
├── course.md                    # 课程介绍(1-3 段),决定 course id/name/subject/description
└── chapters/
    ├── 01-list-and-iter.md      # 一章一份 md,文件名前缀(数字+分隔符)决定章节顺序
    ├── 02-string-and-format.md  # AI 拆 LO 时只看 md 内容,不依赖编号
    └── 03-dict-and-set.md
```

每份 chapter md 就是该章的完整讲稿,作者按"我想让学生学会什么"自然分段写,不用预先想 LO 怎么分。

**为什么 chapter 粒度而不是 LO 粒度作为输入** — LO 边界本身就是认知粒度判断,作者很难一开始就拆好;chapter 粒度更接近作者写课时自然的思维单元(一节课讲什么)。AI 看完整章上下文拆 LO 比作者孤立写每个 LO 更准。

**前置**:必须配置 `DEEPSEEK_API_KEY`(在 `whale-tutor.config.yaml` 或环境变量)。无 key 时 generate / build 直接报错退出 — AI 调用全 fallback 没意义。

### AI 4 阶段 pipeline

| 阶段 | prompt template id      | AI 调用次数 | 干什么                                                                                       |
| ---- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| 1    | `build.course_meta`     | 1           | 解析 course.md → 提取 id / name / **subject** / description                                  |
| 2    | `build.chapter_outline` | N(章数)     | 每章 AI 拆 2-5 个 LO,每个 LO 携带 coreExplanation 切片(主要来自原 md,AI 不凭空发挥讲解)      |
| 3    | `build.lo_full`         | M(总 LO 数) | 每个 LO 生成 commonMisconceptions(3-5 条具体错误)+ masteryCriteria + 3-5 道 concept_check RI |
| 4    | `build.assessment`      | N(章数)     | 每章生成 5-7 道章末综合测试(必须覆盖该章每个 LO ≥1 题)                                       |

**总调用次数 = 1 + 2N + M**。例:3 章共 12 个 LO → 1 + 6 + 12 = 19 次 AI 调用,deepseek-v4-flash 大约 $0.05。每阶段失败 ajv 重试 1 次,仍失败 build 直接退出(不静默兜底,因为兜底内容质量差)。

### 输出与命名规范

输出严格镜像 `whale-tutor init` 模板格式,直接 `lint` + `start` 可用:

```
<output>/
├── course.yaml                  # id, name, subject(给后续所有 AI prompt 用), description($ref)
├── course-description.md
└── chapters/
    └── <chapter-slug>/          # 文件名去数字前缀 + 转下划线(`01-list-and-iter.md` → `list_and_iter`)
        ├── chapter.yaml         # id=ch.<slug>, learningObjectives + assessment
        ├── description.md
        ├── los/
        │   └── <lo-slug>/       # AI 给的 lo slug
        │       ├── lo.yaml      # id=lo.<chapter-slug>.<lo-slug>, 完整字段
        │       ├── core-explanation.md       # 来自 chapter md 切片
        │       ├── ri-1.rationale.md         # 每道题的解析($ref)
        │       └── ri-N.rationale.md
        └── assessment/
            ├── assessment.yaml  # id=ca.ch.<slug>
            └── ca-1.rationale.md
```

**id 命名约定**(`build` 自动生成,作者可以手动重命名但要全局唯一):

- chapter id: `ch.<chapter-slug>`(如 `ch.list_and_iter`)
- LO id: `lo.<chapter-slug>.<lo-slug>`(如 `lo.list_and_iter.basics`)
- LO RI id: `ri.<chapter-slug>.<lo-slug>.<n>`
- assessment id: `ca.ch.<chapter-slug>`,assessment RI id: `ca.ch.<chapter-slug>.<n>`

**注意 `build` 默认产出全部是 `concept_check` 题型**,且 `adaptivePatterns: [concept_check]`。原因:

- AI 出 4 选 1 比出代码题 / 找 bug 题成功率高得多(失败率几乎为 0)
- 出错也只是 4 选 1,作者可以快速看出来改
- code_sandbox 需要的 setupCode + expectedOutput 一致性 AI 经常做不对
- spot_the_bug 需要精确行号,AI 容易偏移

**生成完后,作者可以手动改部分 RI 为 code_sandbox / free_recall / spot_the_bug**(参考 §5)— `lint` 仍然能查出 yaml 结构错误。

### 生成后的工作流

```bash
whale-tutor build my-course-source/        # AI 生成
whale-tutor lint                           # 校验生成的 yaml 没问题
# (可选)手动改部分 RI 题型 / 调整 LO 划分 / 加 hints
whale-tutor start                          # 试学
```

**如果 AI 拆 LO 不理想**(如把不该合的合了 / 该合的拆了):

- 可以把 chapter md 写得更"分块"(用 `## LO 1:xxx` 之类的小标题暗示边界)再 build
- 或 build 完手动调整 yaml(合并两个 LO / 拆开一个 LO 的 RI 数组)

**如果 AI 出题质量不好**:

- commonMisconceptions 太宽泛 → 学习者答错时 PathOrchestrator 出的 retry 题也宽泛。手动改 lo.yaml 里的 `commonMisconceptions` 字段写更具体的错误模式
- 题干重复 / 选项有错 → 直接改 yaml(改完 lint 一下)

### 限制

- 不增量:每次 build 重写整个输出目录(`--force`)。手动改了的内容会被覆盖,需要谨慎
- 不支持 hint 自动生成:RI 上没有 `hints` 字段,运行时学习者求提示走 AI 兜底(看 §6)
- 长 chapter md 注意 token 预算:单份 chapter md > 8000 字符可能触发 AI maxTokens 截断,建议拆成多份 md

---

## 附:CLI 命令速查

| 命令                                                    | 作用                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `whale-tutor init`                                      | 在当前目录 scaffold 完整示例 + 配置文件                               |
| `whale-tutor start [--no-open]`                         | 启动 server(自动应用 schema + serve API + 静态前端)                   |
| `whale-tutor doctor`                                    | 健康检查(node / bundle / mysql / API key 4 项)                        |
| `whale-tutor lint`                                      | 校验当前目录课程结构(yaml / $ref / pattern / 等),不动 mysql           |
| `whale-tutor generate`                                  | **(高层)**交互式问答,AI 一键生成完整课程(讲稿 + LO + 题)。详见 §10    |
| `whale-tutor build <source> [--force] [--output <dir>]` | **(底层)**从已写好的 markdown 讲稿 AI 生成课程骨架(LO + 题)。详见 §10 |
| `whale-tutor --version`                                 | 打印版本                                                              |

---

## 附:进一步阅读

- 想给项目贡献代码 / 报 bug / 提 feature → [CONTRIBUTING.md](CONTRIBUTING.md)
- 工程边界、模块职责、命名约定(给二次开发本工具的人) → [CLAUDE.md](CLAUDE.md)
- 整体项目状态、安装、demo → [README.md](README.md)
