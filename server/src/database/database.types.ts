import type { ColumnType, Generated } from 'kysely';

// 写入端接受 string(ISO 8601) 或 Date(mysql2 driver 帮我们 serialize)。
type Datetime = ColumnType<Date, Date | string | undefined, Date | string>;
type DatetimeNullable = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
// JSON 列：mysql2 默认会把 JSON 列 parse 为 object/array 返回（select 端为 unknown,
// 由 service 层做 type narrowing）;写入端必须传 stringified JSON。
type Json<TSelect = unknown> = ColumnType<TSelect, string, string>;
type JsonNullable<TSelect = unknown> = ColumnType<TSelect | null, string | null, string | null>;

// ============================================================
// v0.2 认证骨架
// ============================================================

export interface UsersTable {
  id: Generated<number>;
  email: string;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

// ============================================================
// 学习者与会话
// ============================================================

export interface LearnersTable {
  id: Generated<number>;
  name: string;
  goal_scenario: 'data_analysis' | 'ai' | 'automation' | 'interest' | 'other';
  user_id: number | null;
  created_at: Datetime;
  updated_at: Datetime;
}

export interface SessionsTable {
  id: Generated<number>;
  learner_id: number;
  course_id: string;
  started_at: Datetime;
  ended_at: DatetimeNullable;
  current_lo_id: string | null;
  status: 'active' | 'completed' | 'abandoned';
  created_at: Datetime;
}

// ============================================================
// 事件流（事实表,只追加）
// ============================================================

export interface EventsTable {
  id: Generated<number>;
  session_id: number | null;
  learner_id: number;
  // type 列在 DB 是 VARCHAR(64),用 string 不约束（domain.ts 的 EventType 联合在 emit() 处约束）
  type: string;
  lo_id: string | null;
  pattern_id: string | null;
  payload: Json;
  created_at: Datetime;
}

export interface InteractionsTable {
  id: Generated<number>;
  session_id: number;
  learner_id: number;
  lo_id: string;
  pattern_id: string;
  source: 'static' | 'adaptive';
  required_interaction_id: string | null;
  // v0.2:adaptive 题对原 RI 的引用,答对此题视为原 RI 通关
  parent_required_interaction_id: string | null;
  prompt_payload: Json;
  expected: JsonNullable;
  created_at: Datetime;
}

export interface ResponsesTable {
  id: Generated<number>;
  interaction_id: number;
  response: Json;
  evaluation: Json;
  hint_level: number;
  created_at: Datetime;
}

export interface AiCallsTable {
  id: Generated<number>;
  template_id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  status: 'ok' | 'schema_failed' | 'retry_ok' | 'fallback' | 'error';
  cost_usd: number | string | null; // DECIMAL(10,6) — mysql2 可能返字符串
  session_id: number | null;
  caller_tag: string | null;
  error_message: string | null;
  created_at: Datetime;
}

// ============================================================
// 派生快照
// ============================================================

export interface LearnerStateTable {
  learner_id: number;
  lo_id: string;
  mastery_level: 'untouched' | 'exposed' | 'practicing' | 'mastered' | 'applied';
  attempts: number;
  correct_count: number;
  consecutive_correct: number;
  consecutive_wrong: number;
  mandatory_completed_ids: JsonNullable<string[]>;
  // v0.2:在 retry 模式时记录原 RI;非空 → decideNext 优先出 adaptive
  pending_retry_ri_id: string | null;
  last_seen_at: DatetimeNullable;
  updated_at: Datetime;
}

export interface LearnerChapterProgressTable {
  learner_id: number;
  chapter_id: string;
  phase: 'learning' | 'assessment' | 'completed';
  assessment_completed_ids: JsonNullable<string[]>;
  updated_at: Datetime;
}

export interface ArchivesTable {
  id: Generated<number>;
  learner_id: number;
  course_id: string;
  scope: 'chapter' | 'course';
  scope_ref: string | null;
  content_md: string;
  generated_at: Datetime;
}

// ============================================================
// QA 侧支
// ============================================================

export interface QaThreadsTable {
  id: Generated<number>;
  learner_id: number;
  session_id: number;
  lo_id: string | null;
  parent_interaction_id: number | null;
  parent_qa_thread_id: number | null;
  status: 'active' | 'ended';
  started_at: Datetime;
  ended_at: DatetimeNullable;
}

export interface QaMessagesTable {
  id: Generated<number>;
  thread_id: number;
  role: 'learner' | 'assistant';
  content_md: string;
  ai_call_id: number | null;
  created_at: Datetime;
}

// ============================================================
// 总 DB interface
// ============================================================

export interface DB {
  users: UsersTable;
  learners: LearnersTable;
  sessions: SessionsTable;
  events: EventsTable;
  interactions: InteractionsTable;
  responses: ResponsesTable;
  ai_calls: AiCallsTable;
  learner_state: LearnerStateTable;
  learner_chapter_progress: LearnerChapterProgressTable;
  archives: ArchivesTable;
  qa_threads: QaThreadsTable;
  qa_messages: QaMessagesTable;
}
