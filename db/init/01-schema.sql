-- Initial schema for whale_tutor
-- Loaded by MySQL container on first start (docker-entrypoint-initdb.d).
--
-- Schema 划分（参见 notes/plan.md 模块 3/4/7/8/14）：
--   事实表（不可变事件流）：events / interactions / responses / ai_calls
--     - 写入后只允许追加,任何衍生数据都从这些表派生
--     - learner_state 等派生表理论上可由事件流重建
--   派生表（可重建快照,为查询性能预聚合）：learners / sessions / learner_state / archives
--   v0.2 认证骨架预留：users（保留示例表）

-- ============================================================
-- v0.2 认证骨架预留
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(128) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 学习者与会话（派生表）
-- ============================================================

CREATE TABLE IF NOT EXISTS learners (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(128) NOT NULL,
  goal_scenario   ENUM('data_analysis','ai','automation','interest','other') NOT NULL DEFAULT 'other',
  user_id         BIGINT UNSIGNED NULL COMMENT 'v0.2 加认证后关联 users.id',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_learners_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- v0 demo learner（避免每次重启重新插入,使用固定 id=1）
INSERT INTO learners (id, name, goal_scenario)
  VALUES (1, 'Demo Learner', 'data_analysis')
  ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS sessions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  learner_id      BIGINT UNSIGNED NOT NULL,
  course_id       VARCHAR(64) NOT NULL,
  started_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at        DATETIME(3) NULL,
  current_lo_id   VARCHAR(64) NULL,
  status          ENUM('active','completed','abandoned') NOT NULL DEFAULT 'active',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_sessions_learner_status (learner_id, status, started_at),
  KEY ix_sessions_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 事件流（事实表,不可变,只追加）
-- ============================================================

-- 所有学习者行为的统一事件流。任何衍生数据都从这里派生。
-- type 字段不用 ENUM 而用 VARCHAR(64),允许后续扩展事件类型不需要 schema 变更。
-- v0 已知的 type 见 packages/tutor-types 中的 EventType 联合类型。
CREATE TABLE IF NOT EXISTS events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id      BIGINT UNSIGNED NULL COMMENT '部分事件可能发生在 session 之外（如 onboarding 早期）',
  learner_id      BIGINT UNSIGNED NOT NULL,
  type            VARCHAR(64) NOT NULL COMMENT '如 session.started / interaction.served / hint.requested',
  lo_id           VARCHAR(64) NULL,
  pattern_id      VARCHAR(64) NULL,
  payload         JSON NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_events_learner_created (learner_id, created_at),
  KEY ix_events_session_created (session_id, created_at),
  KEY ix_events_type_created (type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 每次"出题"产生的交互实例。来源有两类：
--   source='static'   — 取自 LO/ChapterAssessment 的 requiredInteraction（YAML 静态预置）
--   source='adaptive' — 必做完成后由 AI Gateway 动态生成
-- prompt_payload 存完整 prompt（含答案/expected/rubric）,下发前端时由 service 层 sanitize。
CREATE TABLE IF NOT EXISTS interactions (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id              BIGINT UNSIGNED NOT NULL,
  learner_id              BIGINT UNSIGNED NOT NULL,
  lo_id                   VARCHAR(64) NOT NULL,
  pattern_id              VARCHAR(64) NOT NULL,
  source                  ENUM('static','adaptive') NOT NULL,
  required_interaction_id VARCHAR(64) NULL COMMENT 'source=static 时指向 YAML 中的 requiredInteraction.id',
  prompt_payload          JSON NOT NULL,
  expected                JSON NULL COMMENT '确定性评估的预期数据;AI 评估时为 NULL',
  created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_interactions_session_created (session_id, created_at),
  KEY ix_interactions_lo_pattern (lo_id, pattern_id),
  KEY ix_interactions_source (learner_id, source, required_interaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 学习者对 interaction 的回答以及评估结果。
-- hint_level: v0 仅用 0/1（未求助/求助过一次）;v0.2 扩到 0-4（梯度提示协议）。
CREATE TABLE IF NOT EXISTS responses (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  interaction_id  BIGINT UNSIGNED NOT NULL,
  response        JSON NOT NULL,
  evaluation      JSON NOT NULL COMMENT '{ correct, confidence, feedback_md, mastery_delta, ... }',
  hint_level      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_responses_interaction (interaction_id),
  CONSTRAINT fk_responses_interaction FOREIGN KEY (interaction_id) REFERENCES interactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- AI Gateway 每次调用的成本与状态记录,用于经济性分析与故障排查。
-- status: ok=一次成功 / schema_failed=schema 校验失败 / retry_ok=重试后成功 / fallback=用了兜底文案 / error=最终失败
CREATE TABLE IF NOT EXISTS ai_calls (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id     VARCHAR(128) NOT NULL,
  model           VARCHAR(64) NOT NULL,
  tokens_in       INT UNSIGNED NULL,
  tokens_out      INT UNSIGNED NULL,
  latency_ms      INT UNSIGNED NULL,
  status          ENUM('ok','schema_failed','retry_ok','fallback','error') NOT NULL,
  cost_usd        DECIMAL(10,6) NULL,
  session_id      BIGINT UNSIGNED NULL,
  caller_tag      VARCHAR(128) NULL COMMENT '业务侧标签,如 pattern.concept_check.generate',
  error_message   VARCHAR(512) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_ai_calls_template_created (template_id, created_at),
  KEY ix_ai_calls_session (session_id),
  KEY ix_ai_calls_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 派生快照（理论上可由事件流重建,出于查询性能预聚合）
-- ============================================================

-- 每个学习者在每个 LO 上的当前掌握状态。
-- consecutive_correct/consecutive_wrong 用于 Path Orchestrator 的状态机决策
-- （连续 2 次正确 + confidence>0.7 → mastered;mastered 下连续 2 次错 → 退回 practicing）。
CREATE TABLE IF NOT EXISTS learner_state (
  learner_id              BIGINT UNSIGNED NOT NULL,
  lo_id                   VARCHAR(64) NOT NULL,
  mastery_level           ENUM('untouched','exposed','practicing','mastered','applied') NOT NULL DEFAULT 'untouched',
  attempts                INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count           INT UNSIGNED NOT NULL DEFAULT 0,
  consecutive_correct     INT UNSIGNED NOT NULL DEFAULT 0,
  consecutive_wrong       INT UNSIGNED NOT NULL DEFAULT 0,
  -- 已完成的 required_interaction id 数组（YAML 静态预置题目）
  -- 长度 == LO YAML 中的 requiredInteractions 数 → mandatory_all_completed = true
  mandatory_completed_ids JSON NULL,
  last_seen_at            DATETIME(3) NULL,
  updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (learner_id, lo_id),
  KEY ix_learner_state_mastery (learner_id, mastery_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 章节级进度。每个 learner × chapter 一行,跟踪学习阶段与章末测试完成情况。
-- 理论上可由 events 派生（chapter.entered / chapter.assessment_started / chapter.completed）,
-- 出于查询性能预聚合。
CREATE TABLE IF NOT EXISTS learner_chapter_progress (
  learner_id                  BIGINT UNSIGNED NOT NULL,
  chapter_id                  VARCHAR(64) NOT NULL,
  phase                       ENUM('learning','assessment','completed') NOT NULL DEFAULT 'learning',
  -- 章末测试已完成的 required_interaction id 数组
  assessment_completed_ids    JSON NULL,
  updated_at                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (learner_id, chapter_id),
  KEY ix_lcp_phase (learner_id, phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 学习者主动发起的 QA 侧支（栈式插入）
-- ------------------------------------------------------------
-- 学习者在主学习流的任意位置（interaction / 嵌套 QA / LO 闲置）可压栈
-- 一个 QA 线程提问。同 thread 内可追问多轮（messages）;
-- 在 thread 中可以再开嵌套 thread（parent_qa_thread_id 自引用）。
-- 结束 thread = 出栈,回到 parent 上下文继续主学习流。
-- 不影响 learner_state / learner_chapter_progress（QA 是侧支,不计入掌握进度）。
-- ============================================================

-- qa_threads 是有生命周期的派生快照（status / ended_at 会更新）,可由 events 重建。
CREATE TABLE IF NOT EXISTS qa_threads (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  learner_id              BIGINT UNSIGNED NOT NULL,
  session_id              BIGINT UNSIGNED NOT NULL,
  lo_id                   VARCHAR(64) NULL COMMENT '发起时所在 LO 范围;章末测试期间或其他场景可能为 null',
  -- 栈式父引用：恰有一个非 NULL,或都 NULL（lo/chapter 闲置场景）
  parent_interaction_id   BIGINT UNSIGNED NULL,
  parent_qa_thread_id     BIGINT UNSIGNED NULL,
  status                  ENUM('active','ended') NOT NULL DEFAULT 'active',
  started_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at                DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_qa_threads_session_started (session_id, started_at),
  KEY ix_qa_threads_active (learner_id, status, started_at),
  KEY ix_qa_threads_parent_interaction (parent_interaction_id),
  KEY ix_qa_threads_parent_qa (parent_qa_thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- qa_messages 是事实表（不可变,只追加）。
CREATE TABLE IF NOT EXISTS qa_messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id       BIGINT UNSIGNED NOT NULL,
  role            ENUM('learner','assistant') NOT NULL,
  content_md      MEDIUMTEXT NOT NULL,
  ai_call_id      BIGINT UNSIGNED NULL COMMENT 'assistant 消息关联到 ai_calls.id',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_qa_messages_thread_created (thread_id, created_at),
  CONSTRAINT fk_qa_messages_thread FOREIGN KEY (thread_id) REFERENCES qa_threads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 学习档案
-- ============================================================

-- 章节末/课程末由 ArchiveGenerator 生成的 Markdown 学习档案。
CREATE TABLE IF NOT EXISTS archives (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  learner_id      BIGINT UNSIGNED NOT NULL,
  course_id       VARCHAR(64) NOT NULL,
  scope           ENUM('chapter','course') NOT NULL,
  scope_ref       VARCHAR(64) NULL COMMENT 'chapter id（scope=chapter 时）',
  content_md      MEDIUMTEXT NOT NULL,
  generated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_archives_learner_course (learner_id, course_id, generated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
