// 4 种 Pattern 的 prompt / response 形状。
//
// 关键约定：
//   *Prompt          — server 端完整 prompt（含 answer / expected / rubric 等不应下发字段）
//   *PromptForLearner — 下发给前端的安全子集（去除答案）
//   *Response        — 学习者提交回服务端的回答
//
// API 边界：interactions.prompt_payload 列存 *Prompt（含答案,内部使用,前端拿到的是经过
// 净化后的 *PromptForLearner）；前端永远不应见到 answerIndex / bugLocations / rubric 等字段。

// ============================================================
// concept_check — 概念解释 + 即时检验
// 评估方式：确定性（选项匹配）
// ============================================================

export interface ConceptCheckQuestion {
  stem: string;
  options: string[];
  answerIndex: number;              // server-only
  rationale: string;                // server-only,用于 feedback 生成
}

export interface ConceptCheckPrompt {
  explanationMd: string;
  question: ConceptCheckQuestion;
}

export interface ConceptCheckPromptForLearner {
  explanationMd: string;
  question: {
    stem: string;
    options: string[];
  };
}

export interface ConceptCheckResponse {
  selectedIndex: number;
}

// ============================================================
// code_sandbox — 代码沙盒练习
// 评估方式：确定性（Pyodide 跑 + 测试用例匹配）
// ============================================================

export interface CodeTestCase {
  description?: string;
  // setupCode 在学习者代码之后执行,用于调用其函数并捕获输出
  setupCode: string;
  // 学习者代码 + setupCode 执行完毕后,与此字符串比对（trim 后）
  expectedOutput: string;
}

export interface CodeSandboxPrompt {
  promptMd: string;
  starterCode: string;
  testCases: CodeTestCase[];
  // 隐藏的额外测试,用于评估迁移能力（v0.2 用,v0 可空）
  hiddenTestCases?: CodeTestCase[];
}

export type CodeSandboxPromptForLearner = Omit<CodeSandboxPrompt, 'hiddenTestCases'>;

export interface CodeRunOutcome {
  testIndex: number;
  passed: boolean;
  actualOutput: string;
  error?: string;
}

export interface CodeSandboxResponse {
  code: string;
  // Pyodide 在前端执行后回填,server 重跑可选（v0 信任前端结果但服务端再做一次校验）
  runResults: CodeRunOutcome[];
}

// ============================================================
// spot_the_bug — 找错题
// 评估方式：半确定性（行号匹配 + AI 解释评估兜底）
// ============================================================

export interface BugLocation {
  line: number;
  kind: string;                     // e.g. "reference_aliasing", "off_by_one"
}

export interface SpotTheBugPrompt {
  buggyCode: string;
  bugLocations: BugLocation[];      // server-only
  correctExplanation: string;       // server-only
  hintMd?: string;                  // 可选的引导提示
}

export interface SpotTheBugPromptForLearner {
  buggyCode: string;
  hintMd?: string;
}

export interface SpotTheBugResponse {
  selectedLines: number[];
  // 学习者用文字解释为什么是 bug；用于 AI 评估理解深度
  explanation: string;
}

// ============================================================
// free_recall — 自由回忆
// 评估方式：AI 评估（带 confidence）
// ============================================================

export interface FreeRecallPrompt {
  promptMd: string;
  // server-only：评估时作为 rubric 让 AI 判定覆盖度
  rubricKeyPoints: string[];
}

export interface FreeRecallPromptForLearner {
  promptMd: string;
}

export interface FreeRecallResponse {
  text: string;
}

// ============================================================
// 联合 / Map 类型（路由分发用）
// ============================================================

export type PatternPromptMap = {
  concept_check: ConceptCheckPrompt;
  code_sandbox: CodeSandboxPrompt;
  spot_the_bug: SpotTheBugPrompt;
  free_recall: FreeRecallPrompt;
};

export type PatternPromptForLearnerMap = {
  concept_check: ConceptCheckPromptForLearner;
  code_sandbox: CodeSandboxPromptForLearner;
  spot_the_bug: SpotTheBugPromptForLearner;
  free_recall: FreeRecallPromptForLearner;
};

export type PatternResponseMap = {
  concept_check: ConceptCheckResponse;
  code_sandbox: CodeSandboxResponse;
  spot_the_bug: SpotTheBugResponse;
  free_recall: FreeRecallResponse;
};
