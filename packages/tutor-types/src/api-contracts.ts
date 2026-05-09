// HTTP API 端点契约（前后端共享）。
// 端点路径与 server/src/*/*.controller.ts 一一对应。

import type {
  Archive,
  ChapterPhase,
  GoalScenario,
  HintLevel,
  InteractionInstance,
  LearnerLoState,
  LearnerProfile,
  MasteryLevel,
  PathDecision,
  EvaluationResult,
  Course,
  LearningObjective,
  QaThread,
  QaMessage,
} from './domain.js';
import type {
  PatternPromptForLearnerMap,
  PatternResponseMap,
} from './patterns.js';

// ============================================================
// /api/courses
// ============================================================

export interface GetCourseResponse {
  course: Course;
}

// ============================================================
// /api/los/:id
// ============================================================

export interface GetLearningObjectiveResponse {
  lo: LearningObjective;
}

// ============================================================
// /api/sessions
// ============================================================

export interface StartSessionRequest {
  learnerId: number;
  courseId: string;
}

// 安全的 InteractionInstance（prompt 已剔除答案/expected）
export type ServedInteraction = {
  [P in keyof PatternPromptForLearnerMap]: Omit<
    InteractionInstance<PatternPromptForLearnerMap[P]>,
    never
  > & { patternId: P };
}[keyof PatternPromptForLearnerMap];

export interface StartSessionResponse {
  sessionId: number;
  decision: PathDecision;
  // 如果 decision.primary 是 serve_interaction,会一并下发对应的 interaction
  interaction: ServedInteraction | null;
}

// ============================================================
// /api/sessions/:id/responses
// ============================================================

export type SubmitResponseBody = {
  [P in keyof PatternResponseMap]: {
    interactionId: number;
    patternId: P;
    response: PatternResponseMap[P];
    hintLevelUsed?: HintLevel;
  };
}[keyof PatternResponseMap];

export interface SubmitResponseResult {
  evaluation: EvaluationResult;
  nextDecision: PathDecision;
  nextInteraction: ServedInteraction | null;
  updatedLoState: LearnerLoState;
}

// ============================================================
// /api/sessions/:id/end
// ============================================================

export interface EndSessionResponse {
  archive?: Archive;                // chapter 结束时返回章节档案
}

// ============================================================
// /api/sessions/:id/acknowledge-review-lo
// v0.2:学习者从 LO recap 回来后调用,清 pending_retry_ri_id + consecutive_wrong=0,
// 服务端再次决定下一题(理想情况是回到原 RI 静态题)。
// ============================================================

export interface AcknowledgeReviewLoResponse {
  decision: PathDecision;
  interaction: ServedInteraction | null;
}

// ============================================================
// /api/sessions/:id/hints
// v0.2 实施:静态梯度提示协议(server/src/session/hint-cache.service.ts)
//   - 作者在 RI.hints 写好 1-5 级文案 → 直接返
//   - 作者没写 → AI Gateway 生成 3 级,首次生成后 in-memory cache
//   - adaptive 题或 totalLevels=0 → 前端引导用 QA
// ============================================================

export interface RequestHintRequest {
  interactionId: number;
  // 1-5。前端按"求提示"时为 1,"再来一级"时累加。server 不强制单调递增,
  // 但 level 超过 totalLevels 时返 400(前端通常不会发到这里 — 看到 totalLevels 后会 disable 按钮)
  targetLevel: HintLevel;
}

export interface RequestHintResponse {
  hintLevel: HintLevel;     // 实际返回的 level(等于 targetLevel,除非 server clamp)
  hintMd: string;
  // 该 RI 一共有多少级 hint。前端用它决定"再来一级"按钮何时 disable。
  // 0 表示无 hint(adaptive 题或 AI 生成失败且无 fallback),前端应隐藏 hint UI 并引导 QA
  totalLevels: number;
}

// ============================================================
// /api/learners/:id
// ============================================================

export interface GetLearnerResponse {
  profile: LearnerProfile;
  loStates: LearnerLoState[];
}

// ============================================================
// /api/learners/:id/archive
// ============================================================

export interface GetLearnerArchivesResponse {
  archives: Archive[];
}

// ============================================================
// /api/diagnostic
// 诊断 mini-session（onboarding）
// ============================================================

export interface DiagnosticItem {
  id: string;
  kind: 'behavior_anchor' | 'mini_problem';
  prompt: string;
  options?: string[];               // 行为锚点为多选,迷你题为单选
  multiSelect?: boolean;
}

export interface GetDiagnosticResponse {
  items: DiagnosticItem[];
}

export interface SubmitDiagnosticRequest {
  learnerId: number;
  goalScenario: GoalScenario;
  responses: Array<{
    itemId: string;
    selectedIndices: number[];      // 选中的选项索引
  }>;
}

export interface SubmitDiagnosticResponse {
  // 诊断后写入的初始 LO 状态（仅返回 != untouched 的）
  initialLoStates: LearnerLoState[];
  // 推荐起始 LO
  recommendedStartLoId: string;
}

// ============================================================
// QA 侧支
// ============================================================

// POST /api/sessions/:sessionId/qa-threads
// 开启新 QA 线程并提第一个问题
export interface StartQaThreadRequest {
  loId: string | null;
  // 栈式父引用：parentInteractionId 与 parentQaThreadId 互斥;都为 null 表示
  // LO/Chapter 闲置场景（如学习者刚进入一个 LO 介绍页就提问）
  parentInteractionId: number | null;
  parentQaThreadId: number | null;
  question: string;
}

export interface StartQaThreadResponse {
  thread: QaThread;
  learnerMessage: QaMessage;
  assistantMessage: QaMessage;
}

// POST /api/qa-threads/:threadId/messages
// 在已有 thread 中追问
export interface AppendQaMessageRequest {
  question: string;
}

export interface AppendQaMessageResponse {
  learnerMessage: QaMessage;
  assistantMessage: QaMessage;
}

// POST /api/qa-threads/:threadId/end
// 结束 thread,前端栈出栈,继续主学习流
export interface EndQaThreadResponse {
  thread: QaThread;                 // status=ended
}

// GET /api/sessions/:sessionId/qa-threads/active
// 重连/刷新时拿当前 active 的 QA 栈（按 startedAt 升序 = 栈底到栈顶）
export interface ListActiveQaThreadsResponse {
  threads: QaThread[];
}

// GET /api/qa-threads/:threadId
// 拿单个 thread 的完整对话（用于回看历史）
export interface GetQaThreadResponse {
  thread: QaThread;
  messages: QaMessage[];
}

// GET /api/sessions/:sessionId/qa-threads
// 列出 session 内**全部** thread(含 ended),用于"历史 QA"侧栏
export interface ListAllQaThreadsResponse {
  threads: QaThread[];
}

// ============================================================
// /api/sessions/:sessionId/progress
// 学习者在当前 session 中的章节进度概览,用于 ProgressSidebar
// ============================================================

export interface SessionProgressLoEntry {
  id: string;
  name: string;
  masteryLevel: MasteryLevel;
  mandatoryCompletedCount: number;
  requiredInteractionCount: number;
  mandatoryAllCompleted: boolean;
  prerequisitesSatisfied: boolean;     // 强 prereq 是否全部必做完成(决定 LO 是否可点击进入)
  isCurrent: boolean;                  // 当前 session 正在做的 LO
}

export interface SessionProgressChapter {
  id: string;
  name: string;
  phase: ChapterPhase;
  assessmentRequiredCount: number;
  assessmentCompletedCount: number;
}

export interface GetSessionProgressResponse {
  course: { id: string; name: string };
  chapter: SessionProgressChapter;
  los: SessionProgressLoEntry[];
}

// ============================================================
// /api/archives/:kind/:id
// 把任意"学习节点"统一转 markdown。kind:
//   - lo (?learnerId=)         → LO 学习档案(讲解 + 学习者已做题 + 反馈)
//   - qa-thread                 → QA 对话档案
//   - chapter (?learnerId=)     → 章节聚合(v0.2 待实现)
//   - course (?learnerId=)      → 课程聚合(v0.2 待实现)
//   - adaptive-interaction      → 单道 adaptive 题档案(v0.2 待实现)
// 这是统一的"节点转 markdown"接口,所有节点类型走同一个 endpoint。
// ============================================================

export const ARCHIVE_NODE_KINDS = [
  'lo',
  'qa-thread',
  'chapter',
  'course',
  'adaptive-interaction',
] as const;
export type ArchiveNodeKind = (typeof ARCHIVE_NODE_KINDS)[number];

export interface GetArchiveResponse {
  kind: ArchiveNodeKind;
  title: string;        // 给前端 modal 标题用
  contentMd: string;    // markdown 正文,前端 marked + DOMPurify 渲染
}
