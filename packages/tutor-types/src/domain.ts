// Whale Tutor 核心领域类型。
// 与 db/init/01-schema.sql 中的 ENUM/字段语义保持对齐。
// 命名规范：camelCase（与现有 User 类型一致），DB 列名 snake_case 在 service 层做映射。

import type { PatternPromptMap } from './patterns.js';

// ============================================================
// Mastery & Hint
// ============================================================

export const MASTERY_LEVELS = [
  'untouched',
  'exposed',
  'practicing',
  'mastered',
  'applied',
] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

// v0 仅使用 0（未求助）/ 1（求助过一次,获得单级提示）
// v0.2 扩到 0-4（梯度提示协议：引导问题 → 概念提示 → 部分解答 → 完整解答）
export type HintLevel = 0 | 1 | 2 | 3 | 4;

// ============================================================
// Pattern 标识
// ============================================================

// v0 实现的 4 种交互模式。新增模式只需在此联合中追加,并实现 PatternRegistry 接口即可。
export const PATTERN_IDS = [
  'concept_check',
  'code_sandbox',
  'spot_the_bug',
  'free_recall',
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export type DifficultyBand = 'beginner' | 'intermediate' | 'advanced';

// ============================================================
// 必做交互（Required Interactions）
// ------------------------------------------------------------
// 必做题目是 YAML 静态预置的内容,完整含答案/expected/rubric。
// 通过 discriminated union by patternId 严格关联 prompt 类型,
// 让 server 端 evaluator 可以做精确类型分发。
// ============================================================

export type RequiredInteraction = {
  [P in PatternId]: {
    id: string;                     // 在 chapter 范围内唯一,如 "ri.list.basics.1"
    patternId: P;
    prompt: PatternPromptMap[P];    // server-only,含 answer/expected/rubric
    // 静态梯度提示(server-only)。作者可定制 1-5 级,缺省走 AI 兜底生成 3 级。
    // hints 数组下标 0 = level 1(最轻),依次递进。
    // 取的时候永远 hints[level - 1]。详见 server/src/session/hint-cache.service.ts
    hints?: string[];
    note?: string;                  // 可选,内容作者的备注
  };
}[PatternId];

// 公开版只暴露 id + patternId,不含 prompt 内容
export interface RequiredInteractionMeta {
  id: string;
  patternId: PatternId;
}

// ============================================================
// 知识图谱：Server-side 完整版（仅 server 内部使用,YAML 解析的源结构）
// ------------------------------------------------------------
// KnowledgeService 启动时从 YAML 解析得到的内存结构,含答案/expected/rubric。
// 永远不应通过 HTTP 直接下发到前端 — 公开版(下方)是它的派生子集。
//
// ★ 加字段时的两难规则:
//   1. 想公开 → 直接加在 Definition 上,Public 默认会包含(Omit 没排除它)
//   2. 想 server-only → 加在 Definition 上后,在下方 Omit 列表里加上字段名
//   3. 想字段名换种语义(如 markdown 后缀)→ Omit 原名,在 Public 的 & 子句里加新字段
// ============================================================

export interface LearningObjectiveDefinition {
  id: string;                       // e.g. "lo.list.basics"
  name: string;
  description: string;
  prerequisites: string[];          // 强依赖,必须 ≥ practicing 才能解锁
  weakPrerequisites?: string[];     // 弱依赖,可越过
  estimatedDurationMin: number;     // 15-30
  difficultyBand: DifficultyBand;
  coreExplanation: string;          // 教学讲解原文(YAML 里通过 $ref 引入 .md)
  commonMisconceptions: string[];   // server-only,出题灵感 + 评估识别(v0.2 PathOrchestrator 智能化时用)
  masteryCriteria: string;          // 人类可读的判定标准描述
  requiredInteractions: RequiredInteraction[];   // server-only,按序必做(含答案)
  adaptivePatterns: PatternId[];    // 必做完成后,AI 动态生成时可用的 pattern 集
}

export interface ChapterAssessmentDefinition {
  id: string;                       // e.g. "ca.ch.list_and_iter"
  name: string;
  requiredInteractions: RequiredInteraction[];   // server-only
}

export interface ChapterDefinition {
  id: string;                       // e.g. "ch.list_and_iter"
  name: string;
  description: string;
  learningObjectives: LearningObjectiveDefinition[];
  assessment: ChapterAssessmentDefinition | null;
}

export interface CourseDefinition {
  id: string;                       // e.g. "python-basics"
  name: string;
  description: string;
  chapters: ChapterDefinition[];
}

// ============================================================
// 知识图谱：API 公开版（前端可见）
// ------------------------------------------------------------
// 派生自 Definition,通过 Omit + 显式追加字段表达"删什么 + 改什么"。
// service 层做转换(server/src/knowledge/knowledge.service.ts toPublic*)。
//
// 派生关系:
//   LearningObjective       = LearningObjectiveDefinition
//                             - commonMisconceptions       (server-only)
//                             - requiredInteractions       (含答案,改成 count)
//                             - coreExplanation            (改名加 Md 后缀强调渲染语义)
//                             + requiredInteractionCount: number
//                             + coreExplanationMd: string
//
//   ChapterAssessmentSummary = ChapterAssessmentDefinition
//                             - requiredInteractions
//                             + requiredInteractionCount: number
//
//   Chapter / Course        = 各自 Definition,把嵌套的 *Definition[] 替换成公开版数组
// ============================================================

export type LearningObjective = Omit<
  LearningObjectiveDefinition,
  'commonMisconceptions' | 'requiredInteractions' | 'coreExplanation'
> & {
  requiredInteractionCount: number; // 让前端展示"已做 M / N 道必做"
  // 教学开场用的核心讲解(markdown)。前端进入 LO 第一道题之前显示一个 intro 页,
  // 学习者点"开始练习"才进入题目。Definition.coreExplanation 的公开镜像
  // (v0.2 可加 AI 个性化讲解,此字段作为"标准讲解"或 AI 失败兜底)
  coreExplanationMd: string;
};

export type ChapterAssessmentSummary = Omit<
  ChapterAssessmentDefinition,
  'requiredInteractions'
> & {
  requiredInteractionCount: number;
};

export type Chapter = Omit<
  ChapterDefinition,
  'learningObjectives' | 'assessment'
> & {
  learningObjectives: LearningObjective[];
  assessment: ChapterAssessmentSummary | null;
};

export type Course = Omit<CourseDefinition, 'chapters'> & {
  chapters: Chapter[];
};

// ============================================================
// 学习者（Learner Model）
// ============================================================

export const GOAL_SCENARIOS = [
  'data_analysis',
  'ai',
  'automation',
  'interest',
  'other',
] as const;
export type GoalScenario = (typeof GOAL_SCENARIOS)[number];

export interface LearnerProfile {
  id: number;
  name: string;
  goalScenario: GoalScenario;
  userId: number | null;            // v0.2 加认证后关联
  createdAt: string;                // ISO 8601
  updatedAt: string;
}

export interface LearnerLoState {
  loId: string;
  masteryLevel: MasteryLevel;
  attempts: number;
  correctCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  // 必做进度：已完成的 required_interaction id 列表
  mandatoryCompletedIds: string[];
  // 派生字段（mandatoryCompletedIds.length === LO 的 requiredInteractionCount）
  mandatoryAllCompleted: boolean;
  lastSeenAt: string | null;
  updatedAt: string;
}

// 同一 learner 的所有 LO 状态聚合
export interface LearnerState {
  learnerId: number;
  loStates: Record<string, LearnerLoState>;
}

// ============================================================
// 章节级状态（章末测试进度）
// ============================================================

// learning      — 还在学 chapter 内的 LO
// assessment    — 所有 LO 已 mastered,正在做章末测试
// completed     — 章末测试通过
export const CHAPTER_PHASES = ['learning', 'assessment', 'completed'] as const;
export type ChapterPhase = (typeof CHAPTER_PHASES)[number];

export interface LearnerChapterProgress {
  learnerId: number;
  chapterId: string;
  phase: ChapterPhase;
  // 章末测试已完成的 required_interaction id 列表
  assessmentCompletedIds: string[];
  updatedAt: string;
}

// ============================================================
// 会话（Session Manager）
// ============================================================

export const SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface Session {
  id: number;
  learnerId: number;
  courseId: string;
  startedAt: string;
  endedAt: string | null;
  currentLoId: string | null;
  status: SessionStatus;
}

// ============================================================
// 交互实例与评估（Pattern Library 输出）
// ============================================================

// TPrompt: 各 Pattern 的 prompt 类型（见 patterns.ts）
// interactions 表中持久化的 prompt 是完整版（含答案）；下发到前端的是 *PromptForLearner。
export interface InteractionInstance<TPrompt = unknown> {
  id: number;
  sessionId: number;
  learnerId: number;
  loId: string;
  patternId: PatternId;
  prompt: TPrompt;
  // 来源标识：static = 来自 LO/Assessment 的 requiredInteraction;adaptive = AI 动态生成
  source: 'static' | 'adaptive';
  // static 时指向 RequiredInteraction.id;adaptive 时为 null
  requiredInteractionId: string | null;
  createdAt: string;
}

export interface EvaluationResult {
  correct: boolean;
  confidence: number;               // 0-1; AI 评估时必返,确定性评估固定 1
  feedbackMd: string;
  // 状态机增量,由 PathOrchestrator 应用到 learner_state
  masteryDelta: {
    nextMasteryLevel?: MasteryLevel;
    consecutiveCorrect?: number;
    consecutiveWrong?: number;
  };
  hintLevelUsed: HintLevel;
  // 评估途径,前端可据此显示置信度提示（见 plan §AI Gateway 反幻觉）
  evaluatorKind: 'deterministic' | 'ai' | 'hybrid';
}

// ============================================================
// 路径编排器输出（Path Orchestrator）
// ============================================================

export type PathActionType =
  | 'serve_interaction'             // 出一道交互题（必做或自适应）
  | 'review_lo'                     // 同 LO 换种说法/模式（不算"回答"）
  | 'chapter_assessment'            // 进入章末测试
  | 'chapter_complete'              // 章末通过
  | 'request_break';                // 建议学习者休息

export interface ServeInteractionAction {
  type: 'serve_interaction';
  loId: string;
  patternId: PatternId;
  // static 时由 SessionService 从 KnowledgeService 取 RequiredInteraction
  // adaptive 时由 SessionService 调对应 Pattern.generate()
  source: 'static' | 'adaptive';
  requiredInteractionId: string | null;
  rationale: string;                // 为什么选这个,会回显给学习者增加掌控感
}

export interface ReviewLoAction {
  type: 'review_lo';
  loId: string;
  reason: string;
}

export interface ChapterAssessmentAction {
  type: 'chapter_assessment';
  chapterId: string;
  requiredInteractionId: string;    // 章末测试中下一道必做题
}

export interface ChapterCompleteAction {
  type: 'chapter_complete';
  chapterId: string;
}

export interface RequestBreakAction {
  type: 'request_break';
  reason: string;
}

export type PathAction =
  | ServeInteractionAction
  | ReviewLoAction
  | ChapterAssessmentAction
  | ChapterCompleteAction
  | RequestBreakAction;

export interface PathDecision {
  primary: PathAction;
  alternatives: PathAction[];       // 0-2 个备选,交还前端让学习者选择
}

// ============================================================
// 事件流（Event Bus）
// ============================================================

// type 字段在 DB 是 VARCHAR(64),允许后续扩展。这里维持联合类型让 TS 帮我们查全。
// 新增事件类型 → 这里加联合 + 在写入处添加；DB 不需要变更。
export type EventType =
  | 'session.started'
  | 'session.ended'
  | 'lo.entered'
  | 'lo.mandatory_completed'
  | 'lo.completed'
  | 'lo.regressed'
  | 'chapter.entered'
  | 'chapter.assessment_started'
  | 'chapter.completed'
  | 'interaction.served'
  | 'interaction.responded'
  | 'interaction.evaluated'
  | 'hint.requested'
  | 'hint.served'
  | 'stuck.detected'
  | 'mastery.changed'
  | 'archive.generated'
  | 'assessment.diagnostic.served'
  | 'assessment.diagnostic.responded'
  | 'qa.thread_started'
  | 'qa.message_added'
  | 'qa.thread_ended';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: number;
  sessionId: number | null;         // 部分事件发生在 session 之外（如 onboarding 早期）
  learnerId: number;
  type: EventType;
  loId: string | null;
  patternId: PatternId | null;
  payload: TPayload;
  createdAt: string;
}

// ============================================================
// QA 侧支（学习者主动发起的提问）
// ------------------------------------------------------------
// QA 是栈式插入的侧支,不计入 mastery / 必做进度。
// thread 是有生命周期的派生快照（status 会更新）;messages 是事实表（不可变）。
// 嵌套：parentQaThreadId 指向当前所在 thread 即可表达"在 QA 中再开 QA"。
// 同 thread 多轮追问通过追加 messages 表达。
// ============================================================

export const QA_THREAD_STATUSES = ['active', 'ended'] as const;
export type QaThreadStatus = (typeof QA_THREAD_STATUSES)[number];

export const QA_MESSAGE_ROLES = ['learner', 'assistant'] as const;
export type QaMessageRole = (typeof QA_MESSAGE_ROLES)[number];

export interface QaThread {
  id: number;
  learnerId: number;
  sessionId: number;
  loId: string | null;              // 发起时所在 LO,部分场景可能为 null
  // 栈式父引用：恰有一个非 null,或都 null（LO/Chapter 闲置场景）
  parentInteractionId: number | null;
  parentQaThreadId: number | null;
  status: QaThreadStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface QaMessage {
  id: number;
  threadId: number;
  role: QaMessageRole;
  contentMd: string;
  // assistant 消息关联到具体一次 AI Gateway 调用,便于成本追踪与 prompt 复盘
  aiCallId: number | null;
  createdAt: string;
}

// ============================================================
// 学习档案（Archive Generator 产出）
// ============================================================

export const ARCHIVE_SCOPES = ['chapter', 'course'] as const;
export type ArchiveScope = (typeof ARCHIVE_SCOPES)[number];

export interface Archive {
  id: number;
  learnerId: number;
  courseId: string;
  scope: ArchiveScope;
  scopeRef: string | null;          // chapter id（scope=chapter 时）
  contentMd: string;
  generatedAt: string;
}

// ============================================================
// AI Gateway 调用记录（用于成本追踪与故障排查）
// ============================================================

export const AI_CALL_STATUSES = [
  'ok',
  'schema_failed',
  'retry_ok',
  'fallback',
  'error',
] as const;
export type AiCallStatus = (typeof AI_CALL_STATUSES)[number];

export interface AiCallRecord {
  id: number;
  templateId: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  status: AiCallStatus;
  costUsd: number | null;
  sessionId: number | null;
  callerTag: string | null;
  errorMessage: string | null;
  createdAt: string;
}
