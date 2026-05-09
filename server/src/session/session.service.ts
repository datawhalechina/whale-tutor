import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'kysely';
import type {
  AcknowledgeReviewLoResponse,
  ChapterAssessmentAction,
  ChapterPhase,
  EndSessionResponse,
  EvaluationResult,
  GetSessionProgressResponse,
  LearnerLoState,
  LearningObjectiveDefinition,
  MasteryLevel,
  PathDecision,
  PatternId,
  RequestHintRequest,
  RequestHintResponse,
  RequiredInteraction,
  ServeInteractionAction,
  ServedInteraction,
  SessionProgressLoEntry,
  StartSessionRequest,
  StartSessionResponse,
  SubmitResponseBody,
  SubmitResponseResult,
} from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';
import { EventService } from '../event/event.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LearnerService, parseJsonArray } from '../learner/learner.service';
import { PatternRegistry } from '../pattern/pattern.registry';
import { HintCacheService } from './hint-cache.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly knowledge: KnowledgeService,
    private readonly events: EventService,
    private readonly learners: LearnerService,
    private readonly patterns: PatternRegistry,
    private readonly hints: HintCacheService,
  ) {}

  // ========================================================
  // 公开方法（被 Controller 调用）
  // ========================================================

  async start(input: StartSessionRequest): Promise<StartSessionResponse> {
    // 自动 abandon 该 learner 之前未结束的 active session,避免数据脏累积。
    // 一个 learner 同一时间只应有一个 active session(v0 单端;v0.2 多端再考虑)
    await this.db
      .updateTable('sessions')
      .set({ status: 'abandoned', ended_at: sql`CURRENT_TIMESTAMP(3)` })
      .where('learner_id', '=', input.learnerId)
      .where('status', '=', 'active')
      .execute();

    const result = await this.db
      .insertInto('sessions')
      .values({
        learner_id: input.learnerId,
        course_id: input.courseId,
        status: 'active',
      })
      .executeTakeFirstOrThrow();
    const sessionId = Number(result.insertId);

    await this.events.emit({
      sessionId,
      learnerId: input.learnerId,
      type: 'session.started',
      payload: { courseId: input.courseId },
    });

    // v0:从课程第一章第一个 LO 开始（无诊断时）
    const course = this.knowledge.getCourseDefinition(input.courseId);
    const firstChapter = course.chapters[0];
    const firstLo = firstChapter.learningObjectives[0];

    await this.db
      .updateTable('sessions')
      .set({ current_lo_id: firstLo.id })
      .where('id', '=', sessionId)
      .execute();

    await this.events.emit({
      sessionId,
      learnerId: input.learnerId,
      loId: firstLo.id,
      type: 'lo.entered',
      payload: {},
    });

    let decision = await this.decideNext(sessionId, input.learnerId, firstLo.id);
    let interaction = await this.maybeServeFromDecision(
      sessionId,
      input.learnerId,
      firstLo.id,
      decision,
    );
    // 同 submit:adaptive 服务失败 → 把 decision 降级为 review_lo
    if (
      decision.primary.type === 'serve_interaction' &&
      decision.primary.source === 'adaptive' &&
      interaction === null
    ) {
      decision = {
        primary: {
          type: 'review_lo',
          loId: firstLo.id,
          reason: '换说法生成失败,先回到讲解再来',
        },
        alternatives: [],
      };
    }

    return { sessionId, decision, interaction };
  }

  async submit(
    sessionId: number,
    body: SubmitResponseBody,
  ): Promise<SubmitResponseResult> {
    const interactionRow = await this.db
      .selectFrom('interactions')
      .selectAll()
      .where('id', '=', body.interactionId)
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (!interactionRow) {
      throw new NotFoundException(
        `Interaction ${body.interactionId} not found in session ${sessionId}`,
      );
    }
    const learnerId = interactionRow.learner_id;
    const loId = interactionRow.lo_id;
    const patternId = interactionRow.pattern_id as PatternId;
    const promptPayload = interactionRow.prompt_payload as unknown;

    // 评估。concept_check 同步,free_recall 走 AI Gateway 异步;统一 await。
    const evaluation = await this.patterns.evaluate(patternId, promptPayload, body.response, {
      sessionId,
      subject: this.knowledge.getSubjectByLoId(loId),
    });

    await this.db
      .insertInto('responses')
      .values({
        interaction_id: body.interactionId,
        response: JSON.stringify(body.response),
        evaluation: JSON.stringify(evaluation),
        hint_level: body.hintLevelUsed ?? 0,
      })
      .execute();

    await this.events.emit({
      sessionId,
      learnerId,
      loId,
      patternId,
      type: 'interaction.responded',
      payload: {
        interactionId: body.interactionId,
        hintLevelUsed: body.hintLevelUsed ?? 0,
      },
    });
    await this.events.emit({
      sessionId,
      learnerId,
      loId,
      patternId,
      type: 'interaction.evaluated',
      payload: {
        interactionId: body.interactionId,
        correct: evaluation.correct,
        confidence: evaluation.confidence,
      },
    });

    // 应用 mastery 状态机
    const lo = this.knowledge.getLoDefinition(loId);
    const oldState = await this.learners.getOrInitLoState(
      learnerId,
      loId,
      lo.requiredInteractions.length,
    );
    // 章末测试 RI 不参与 retry/review_lo 流程(综合考核,答错就累计错次,不出 adaptive)。
    // 通过 RI 是否属于该 LO 来判定:章末测试 RI 不在 LO.requiredInteractions 中。
    const isAssessmentRi =
      interactionRow.source === 'static' &&
      !!interactionRow.required_interaction_id &&
      !lo.requiredInteractions.some(
        (ri) => ri.id === interactionRow.required_interaction_id,
      );
    const delta = applyMasteryStateMachine({
      state: oldState,
      evaluation,
      source: interactionRow.source,
      riId: interactionRow.required_interaction_id,
      parentRiId: interactionRow.parent_required_interaction_id,
      hintLevelUsed: body.hintLevelUsed ?? 0,
      enableRetry: !isAssessmentRi,
    });
    const updatedLoState = await this.learners.applyEvaluation({
      learnerId,
      loId,
      correct: evaluation.correct,
      nextMasteryLevel: delta.nextMasteryLevel,
      consecutiveCorrect: delta.consecutiveCorrect,
      consecutiveWrong: delta.consecutiveWrong,
      mandatoryCompletedIds: delta.mandatoryCompletedIds,
      pendingRetryRiId: delta.pendingRetryRiId,
      requiredInteractionTotal: lo.requiredInteractions.length,
    });

    if (oldState.masteryLevel !== updatedLoState.masteryLevel) {
      await this.events.emit({
        sessionId,
        learnerId,
        loId,
        type: 'mastery.changed',
        payload: { from: oldState.masteryLevel, to: updatedLoState.masteryLevel },
      });
    }
    if (!oldState.mandatoryAllCompleted && updatedLoState.mandatoryAllCompleted) {
      await this.events.emit({
        sessionId,
        learnerId,
        loId,
        type: 'lo.mandatory_completed',
        payload: { count: updatedLoState.mandatoryCompletedIds.length },
      });
    }

    // 章末测试的进度跟踪：如果这道题是 chapter assessment 的一部分,更新
    // learner_chapter_progress.assessment_completed_ids
    const chapter = this.knowledge.getChapterByLoId(loId);
    if (
      chapter.assessment &&
      interactionRow.required_interaction_id &&
      chapter.assessment.requiredInteractions.some(
        (ari) => ari.id === interactionRow.required_interaction_id,
      ) &&
      evaluation.correct
    ) {
      await this.recordAssessmentProgress(
        learnerId,
        chapter.id,
        interactionRow.required_interaction_id,
      );
    }

    // 决定下一动作
    let nextDecision = await this.decideNext(sessionId, learnerId, loId);
    let nextInteraction = await this.maybeServeFromDecision(
      sessionId,
      learnerId,
      loId,
      nextDecision,
    );
    // serveAdaptiveInteraction 在 generate 全失败时会清 pending_retry_ri_id 并返 null。
    // 此时 decision 和 interaction 不一致 — 把 decision 也降级为 review_lo,前端弹 LO recap。
    if (
      nextDecision.primary.type === 'serve_interaction' &&
      nextDecision.primary.source === 'adaptive' &&
      nextInteraction === null
    ) {
      nextDecision = {
        primary: {
          type: 'review_lo',
          loId,
          reason: '换说法生成失败,先回到讲解再来',
        },
        alternatives: [],
      };
    }

    return {
      evaluation,
      nextDecision,
      nextInteraction,
      updatedLoState,
    };
  }

  async end(sessionId: number): Promise<EndSessionResponse> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);

    await this.db
      .updateTable('sessions')
      .set({ status: 'completed', ended_at: sql`CURRENT_TIMESTAMP(3)` })
      .where('id', '=', sessionId)
      .execute();

    await this.events.emit({
      sessionId,
      learnerId: session.learner_id,
      type: 'session.ended',
      payload: {},
    });

    // M1 暂不生成 archive,留给 M3
    return {};
  }

  // ========================================================
  // v0.2:Review-LO 兜底确认
  // ------------------------------------------------------------
  // 学习者从 LO recap 回来后调用:清当前 LO 的 pending_retry_ri_id + consecutive_wrong=0,
  // 重新 decideNext。理想情况是回到原 RI 重新出 static 题。
  // emit lo.regressed(reason: review_lo_acknowledged)用于事件溯源。
  // ========================================================

  async acknowledgeReviewLo(sessionId: number): Promise<AcknowledgeReviewLoResponse> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!session) throw new NotFoundException(`Session not found: ${sessionId}`);
    if (!session.current_lo_id) {
      throw new NotFoundException(`Session ${sessionId} has no current LO`);
    }
    const learnerId = session.learner_id;
    const loId = session.current_lo_id;

    const lo = this.knowledge.getLoDefinition(loId);
    const state = await this.learners.getOrInitLoState(
      learnerId,
      loId,
      lo.requiredInteractions.length,
    );

    // 重置 retry 上下文(mastery / 必做 / correct count 不动)
    await this.learners.applyEvaluation({
      learnerId,
      loId,
      correct: false, // attempts++ 但 correct_count 不增。这里更像是状态校正,无所谓 correct
      nextMasteryLevel: state.masteryLevel,
      consecutiveCorrect: state.consecutiveCorrect,
      consecutiveWrong: 0, // 重置连续错
      mandatoryCompletedIds: state.mandatoryCompletedIds,
      pendingRetryRiId: null, // 脱离 retry
      requiredInteractionTotal: lo.requiredInteractions.length,
    });

    await this.events.emit({
      sessionId,
      learnerId,
      loId,
      type: 'lo.regressed',
      payload: { reason: 'review_lo_acknowledged' },
    });

    let decision = await this.decideNext(sessionId, learnerId, loId);
    let interaction = await this.maybeServeFromDecision(
      sessionId,
      learnerId,
      loId,
      decision,
    );
    if (
      decision.primary.type === 'serve_interaction' &&
      decision.primary.source === 'adaptive' &&
      interaction === null
    ) {
      decision = {
        primary: {
          type: 'review_lo',
          loId,
          reason: '换说法生成失败,先回到讲解再来',
        },
        alternatives: [],
      };
    }
    return { decision, interaction };
  }

  // ========================================================
  // 静态梯度提示(StuckProtocol)
  // 作者写了 RI.hints → 直接返;没写 → AI 兜底生成 3 级 + cache
  // ========================================================

  async requestHint(
    sessionId: number,
    body: RequestHintRequest,
  ): Promise<RequestHintResponse> {
    const interactionRow = await this.db
      .selectFrom('interactions')
      .selectAll()
      .where('id', '=', body.interactionId)
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (!interactionRow) {
      throw new NotFoundException(
        `Interaction ${body.interactionId} not found in session ${sessionId}`,
      );
    }

    // adaptive 题(无 required_interaction_id)目前不支持 hint(留给 v0.2 PathO 智能化时,
    // 用同 HintCacheService.generate 路径,key 改为 interactionId)
    const riId = interactionRow.required_interaction_id;
    if (!riId) {
      return { hintLevel: body.targetLevel, hintMd: '', totalLevels: 0 };
    }

    const ri = this.knowledge.getRequiredInteraction(riId);
    // RI 可能属于 LO 也可能属于章末测试 — 后者没有 owning LO,commonMisconceptions 传 []
    const owningLo = this.knowledge.getOwningLoOfRi(riId);

    await this.events.emit({
      sessionId,
      learnerId: interactionRow.learner_id,
      loId: interactionRow.lo_id,
      type: 'hint.requested',
      payload: { interactionId: body.interactionId, level: body.targetLevel },
    });

    const result = await this.hints.getHint(
      ri,
      {
        subject: this.knowledge.getSubjectByRiId(riId),
        loName: owningLo?.name ?? '章末综合测试',
        commonMisconceptions: owningLo?.commonMisconceptions ?? [],
        sessionId,
      },
      body.targetLevel,
    );

    if (!result) {
      throw new BadRequestException(
        `targetLevel ${body.targetLevel} out of range for interaction ${body.interactionId}`,
      );
    }

    await this.events.emit({
      sessionId,
      learnerId: interactionRow.learner_id,
      loId: interactionRow.lo_id,
      type: 'hint.served',
      payload: {
        interactionId: body.interactionId,
        level: body.targetLevel,
        totalLevels: result.totalLevels,
      },
    });

    return {
      hintLevel: body.targetLevel,
      hintMd: result.hintMd,
      totalLevels: result.totalLevels,
    };
  }

  // ========================================================
  // Progress 概览(给 ProgressSidebar 用,无副作用)
  // ========================================================

  async getProgress(sessionId: number): Promise<GetSessionProgressResponse> {
    const session = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    const course = this.knowledge.getCourseDefinition(session.course_id);
    // v0 课程仅 1 个 chapter;后续多 chapter 时这里需要由 sessions.current_chapter_id 决定
    const chapter = course.chapters[0];
    const chapterProgress = await this.getChapterProgressOrDefault(
      session.learner_id,
      chapter.id,
    );
    const assessmentRequiredCount =
      chapter.assessment?.requiredInteractions.length ?? 0;

    const los: SessionProgressLoEntry[] = [];
    for (const lo of chapter.learningObjectives) {
      const state = await this.learners.getLoState(
        session.learner_id,
        lo.id,
        lo.requiredInteractions.length,
      );
      const prereqsSatisfied = await this.allPrereqsSatisfiedReadonly(
        session.learner_id,
        lo,
      );
      los.push({
        id: lo.id,
        name: lo.name,
        masteryLevel: state?.masteryLevel ?? 'untouched',
        mandatoryCompletedCount: state?.mandatoryCompletedIds.length ?? 0,
        requiredInteractionCount: lo.requiredInteractions.length,
        mandatoryAllCompleted: state?.mandatoryAllCompleted ?? false,
        prerequisitesSatisfied: prereqsSatisfied,
        isCurrent: lo.id === session.current_lo_id,
      });
    }

    return {
      course: { id: course.id, name: course.name },
      chapter: {
        id: chapter.id,
        name: chapter.name,
        phase: chapterProgress.phase,
        assessmentRequiredCount,
        assessmentCompletedCount: chapterProgress.assessmentCompletedIds.length,
      },
      los,
    };
  }

  private async getChapterProgressOrDefault(
    learnerId: number,
    chapterId: string,
  ): Promise<{ phase: ChapterPhase; assessmentCompletedIds: string[] }> {
    const row = await this.db
      .selectFrom('learner_chapter_progress')
      .selectAll()
      .where('learner_id', '=', learnerId)
      .where('chapter_id', '=', chapterId)
      .executeTakeFirst();
    if (!row) {
      return { phase: 'learning', assessmentCompletedIds: [] };
    }
    return {
      phase: row.phase,
      assessmentCompletedIds: parseJsonArray(row.assessment_completed_ids),
    };
  }

  private async allPrereqsSatisfiedReadonly(
    learnerId: number,
    lo: LearningObjectiveDefinition,
  ): Promise<boolean> {
    for (const prereqId of lo.prerequisites) {
      const prereqLo = this.knowledge.getLoDefinition(prereqId);
      const state = await this.learners.getLoState(
        learnerId,
        prereqId,
        prereqLo.requiredInteractions.length,
      );
      if (!state || !state.mandatoryAllCompleted) return false;
    }
    return true;
  }

  // ========================================================
  // Path Orchestrator（v0 极简规则）
  // ========================================================

  private async decideNext(
    sessionId: number,
    learnerId: number,
    loId: string,
  ): Promise<PathDecision> {
    const lo = this.knowledge.getLoDefinition(loId);
    const state = await this.learners.getOrInitLoState(
      learnerId,
      loId,
      lo.requiredInteractions.length,
    );

    // Rule 0(v0.2 加):若 pendingRetryRiId 非空,优先出 adaptive "换说法" 题。
    // 连续错 ≥ 3 次或 generate 返 null → 落 review_lo,前端弹 LO recap。
    if (state.pendingRetryRiId) {
      if (state.consecutiveWrong >= 3) {
        return {
          primary: {
            type: 'review_lo',
            loId,
            reason: `连续答错 ${state.consecutiveWrong} 次,先回到讲解再来`,
          },
          alternatives: [],
        };
      }
      return {
        primary: {
          type: 'serve_interaction',
          loId,
          patternId: this.knowledge.getRequiredInteraction(state.pendingRetryRiId).patternId,
          source: 'adaptive',
          requiredInteractionId: null,
          rationale: `换种说法再试 (第 ${state.consecutiveWrong} 次)`,
        },
        alternatives: [],
      };
    }

    // Rule 1: 当前 LO 必做按序推进
    const completedSet = new Set(state.mandatoryCompletedIds);
    const nextRi = lo.requiredInteractions.find((ri) => !completedSet.has(ri.id));
    if (nextRi) {
      return {
        primary: {
          type: 'serve_interaction',
          loId,
          patternId: nextRi.patternId,
          source: 'static',
          requiredInteractionId: nextRi.id,
          rationale: `必做 ${state.mandatoryCompletedIds.length + 1}/${lo.requiredInteractions.length}`,
        },
        alternatives: [],
      };
    }

    // Rule 2: 当前 LO 必做完成 → 找 chapter 内下一个可推进的 LO
    // 按 yaml 中 learningObjectives 数组顺序找第一个"prereq 满足且未完成必做"的 LO,
    // 切换 sessions.current_lo_id + emit lo.entered。
    const chapter = this.knowledge.getChapterByLoId(loId);
    for (const candidate of chapter.learningObjectives) {
      if (candidate.id === loId) continue;
      const candidateState = await this.learners.getOrInitLoState(
        learnerId,
        candidate.id,
        candidate.requiredInteractions.length,
      );
      if (candidateState.mandatoryAllCompleted) continue;
      if (!(await this.allPrereqsCompleted(learnerId, candidate))) continue;
      const candidateCompleted = new Set(candidateState.mandatoryCompletedIds);
      const candidateNextRi = candidate.requiredInteractions.find(
        (ri) => !candidateCompleted.has(ri.id),
      );
      if (!candidateNextRi) continue;
      // 切换到该 LO
      await this.db
        .updateTable('sessions')
        .set({ current_lo_id: candidate.id })
        .where('id', '=', sessionId)
        .execute();
      await this.events.emit({
        sessionId,
        learnerId,
        loId: candidate.id,
        type: 'lo.entered',
        payload: { from: loId },
      });
      return {
        primary: {
          type: 'serve_interaction',
          loId: candidate.id,
          patternId: candidateNextRi.patternId,
          source: 'static',
          requiredInteractionId: candidateNextRi.id,
          rationale: `${candidate.name}:必做 ${candidateState.mandatoryCompletedIds.length + 1}/${candidate.requiredInteractions.length}`,
        },
        alternatives: [],
      };
    }

    // Rule 3: 章末测试
    if (chapter.assessment) {
      const progress = await this.getOrInitChapterProgress(learnerId, chapter.id);
      const assessmentDoneSet = new Set(progress.assessmentCompletedIds);
      const nextAri = chapter.assessment.requiredInteractions.find(
        (ari) => !assessmentDoneSet.has(ari.id),
      );
      if (nextAri) {
        if (progress.phase === 'learning') {
          await this.setChapterPhase(learnerId, chapter.id, 'assessment');
          await this.events.emit({
            sessionId,
            learnerId,
            type: 'chapter.assessment_started',
            payload: { chapterId: chapter.id },
          });
        }
        return {
          primary: {
            type: 'chapter_assessment',
            chapterId: chapter.id,
            requiredInteractionId: nextAri.id,
          },
          alternatives: [],
        };
      }
      if (progress.phase !== 'completed') {
        await this.setChapterPhase(learnerId, chapter.id, 'completed');
        await this.events.emit({
          sessionId,
          learnerId,
          type: 'chapter.completed',
          payload: { chapterId: chapter.id },
        });
      }
    }

    // Rule 4: 章节完成
    return {
      primary: { type: 'chapter_complete', chapterId: chapter.id },
      alternatives: [],
    };
  }

  // ========================================================
  // 辅助:从 PathDecision 派生 ServedInteraction（如果适用）
  // ========================================================

  private async maybeServeFromDecision(
    sessionId: number,
    learnerId: number,
    loId: string,
    decision: PathDecision,
  ): Promise<ServedInteraction | null> {
    const action = decision.primary;
    if (action.type === 'serve_interaction') {
      if (action.source === 'adaptive') {
        // adaptive:从 learner_state.pending_retry_ri_id 取原 RI,调 Pattern.generate
        return this.serveAdaptiveInteraction(sessionId, learnerId, action.loId);
      }
      return this.serveStaticInteraction(sessionId, learnerId, action.loId, action);
    }
    if (action.type === 'chapter_assessment') {
      return this.serveStaticInteraction(sessionId, learnerId, loId, action);
    }
    // review_lo / chapter_complete / request_break — 不出题
    return null;
  }

  private async serveStaticInteraction(
    sessionId: number,
    learnerId: number,
    loId: string,
    action: ServeInteractionAction | ChapterAssessmentAction,
  ): Promise<ServedInteraction> {
    let riId: string;
    if (action.type === 'serve_interaction') {
      if (action.source !== 'static' || !action.requiredInteractionId) {
        throw new Error('serveStaticInteraction called with non-static action');
      }
      riId = action.requiredInteractionId;
    } else {
      riId = action.requiredInteractionId;
    }
    const ri: RequiredInteraction = this.knowledge.getRequiredInteraction(riId);

    const result = await this.db
      .insertInto('interactions')
      .values({
        session_id: sessionId,
        learner_id: learnerId,
        lo_id: loId,
        pattern_id: ri.patternId,
        source: 'static',
        required_interaction_id: ri.id,
        parent_required_interaction_id: null,
        prompt_payload: JSON.stringify(ri.prompt),
        expected: null,
      })
      .executeTakeFirstOrThrow();
    const interactionId = Number(result.insertId);

    await this.events.emit({
      sessionId,
      learnerId,
      loId,
      patternId: ri.patternId,
      type: 'interaction.served',
      payload: { interactionId, requiredInteractionId: ri.id, source: 'static' },
    });

    const learnerPrompt = this.patterns.toLearnerPrompt(ri.patternId, ri.prompt);

    return {
      id: interactionId,
      sessionId,
      learnerId,
      loId,
      patternId: ri.patternId,
      prompt: learnerPrompt,
      source: 'static',
      requiredInteractionId: ri.id,
      parentRequiredInteractionId: null,
      createdAt: new Date().toISOString(),
    } as ServedInteraction;
  }

  /**
   * v0.2:adaptive 题。从 learner_state.pending_retry_ri_id 取原 RI,
   * 调 Pattern.generate 生成换说法 prompt;失败 / pattern 不支持 generate
   * → 清 pending + 自动转 review_lo(由调用方再 decideNext)。
   */
  private async serveAdaptiveInteraction(
    sessionId: number,
    learnerId: number,
    loId: string,
  ): Promise<ServedInteraction | null> {
    const lo = this.knowledge.getLoDefinition(loId);
    const state = await this.learners.getOrInitLoState(
      learnerId,
      loId,
      lo.requiredInteractions.length,
    );
    if (!state.pendingRetryRiId) {
      // 不该到这里;decideNext 已经检查过
      return null;
    }
    const originalRi = this.knowledge.getRequiredInteraction(state.pendingRetryRiId);

    let generatedPrompt: unknown;
    try {
      generatedPrompt = await this.patterns.generate(originalRi, lo, {
        sessionId,
        subject: this.knowledge.getSubjectByLoId(loId),
        attemptIndex: state.consecutiveWrong, // 第 N 次 retry
      });
    } catch (e) {
      this.logger.warn(
        `Pattern.generate failed for RI ${originalRi.id}: ${(e as Error).message} — falling back to review_lo`,
      );
      generatedPrompt = null;
    }

    if (!generatedPrompt) {
      // 生成不出来 → 清 pending,让上层走 review_lo 路径
      // (我们 emit 一条 lo.regressed 事件让外部分析能看到这次降级)
      await this.learners.applyEvaluation({
        learnerId,
        loId,
        correct: false,
        nextMasteryLevel: state.masteryLevel,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveWrong: state.consecutiveWrong,
        mandatoryCompletedIds: state.mandatoryCompletedIds,
        pendingRetryRiId: null, // 清 retry,让 review_lo 接手
        requiredInteractionTotal: lo.requiredInteractions.length,
      });
      await this.events.emit({
        sessionId,
        learnerId,
        loId,
        type: 'lo.regressed',
        payload: { reason: 'no_generator', riId: originalRi.id },
      });
      return null;
    }

    const result = await this.db
      .insertInto('interactions')
      .values({
        session_id: sessionId,
        learner_id: learnerId,
        lo_id: loId,
        pattern_id: originalRi.patternId,
        source: 'adaptive',
        required_interaction_id: null,
        parent_required_interaction_id: originalRi.id,
        prompt_payload: JSON.stringify(generatedPrompt),
        expected: null,
      })
      .executeTakeFirstOrThrow();
    const interactionId = Number(result.insertId);

    await this.events.emit({
      sessionId,
      learnerId,
      loId,
      patternId: originalRi.patternId,
      type: 'interaction.served',
      payload: {
        interactionId,
        parentRequiredInteractionId: originalRi.id,
        source: 'adaptive',
      },
    });

    const learnerPrompt = this.patterns.toLearnerPrompt(
      originalRi.patternId,
      generatedPrompt,
    );

    return {
      id: interactionId,
      sessionId,
      learnerId,
      loId,
      patternId: originalRi.patternId,
      prompt: learnerPrompt,
      source: 'adaptive',
      requiredInteractionId: null,
      parentRequiredInteractionId: originalRi.id,
      createdAt: new Date().toISOString(),
    } as ServedInteraction;
  }

  // ========================================================
  // Chapter progress helpers
  // ========================================================

  private async getOrInitChapterProgress(
    learnerId: number,
    chapterId: string,
  ): Promise<{ phase: ChapterPhase; assessmentCompletedIds: string[] }> {
    const row = await this.db
      .selectFrom('learner_chapter_progress')
      .selectAll()
      .where('learner_id', '=', learnerId)
      .where('chapter_id', '=', chapterId)
      .executeTakeFirst();
    if (!row) {
      await this.db
        .insertInto('learner_chapter_progress')
        .values({
          learner_id: learnerId,
          chapter_id: chapterId,
          phase: 'learning',
          assessment_completed_ids: JSON.stringify([]),
        })
        .execute();
      return { phase: 'learning', assessmentCompletedIds: [] };
    }
    return {
      phase: row.phase,
      assessmentCompletedIds: parseJsonArray(row.assessment_completed_ids),
    };
  }

  private async setChapterPhase(
    learnerId: number,
    chapterId: string,
    phase: ChapterPhase,
  ): Promise<void> {
    await this.db
      .updateTable('learner_chapter_progress')
      .set({ phase })
      .where('learner_id', '=', learnerId)
      .where('chapter_id', '=', chapterId)
      .execute();
  }

  private async recordAssessmentProgress(
    learnerId: number,
    chapterId: string,
    riId: string,
  ): Promise<void> {
    const progress = await this.getOrInitChapterProgress(learnerId, chapterId);
    if (progress.assessmentCompletedIds.includes(riId)) return;
    const next = [...progress.assessmentCompletedIds, riId];
    await this.db
      .updateTable('learner_chapter_progress')
      .set({ assessment_completed_ids: JSON.stringify(next) })
      .where('learner_id', '=', learnerId)
      .where('chapter_id', '=', chapterId)
      .execute();
  }

  /**
   * 检查 LO 的所有强 prereq 是否必做完成。弱 prereq(weakPrerequisites)允许越过,不检查。
   */
  private async allPrereqsCompleted(
    learnerId: number,
    lo: LearningObjectiveDefinition,
  ): Promise<boolean> {
    for (const prereqId of lo.prerequisites) {
      const prereqLo = this.knowledge.getLoDefinition(prereqId);
      const state = await this.learners.getOrInitLoState(
        learnerId,
        prereqId,
        prereqLo.requiredInteractions.length,
      );
      if (!state.mandatoryAllCompleted) return false;
    }
    return true;
  }
}

// ========================================================
// Mastery 状态机（纯函数）
// 见 CLAUDE.md "学习模型" 与 plan §Path Orchestrator 决策表
// ========================================================

interface StateMachineDelta {
  nextMasteryLevel: MasteryLevel;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  mandatoryCompletedIds: string[];
  // v0.2:retry 上下文。null = 清空(脱离 retry 或不在 retry)
  pendingRetryRiId: string | null;
}

interface StateMachineInput {
  state: LearnerLoState;
  evaluation: EvaluationResult;
  source: 'static' | 'adaptive';
  /** static 时:本道题对应的 RI id。adaptive 时:null */
  riId: string | null;
  /** adaptive 时:这道 retry 题对应的原 RI id;static 时:null */
  parentRiId: string | null;
  /** 学习者用过的最高 hint 级别(0 = 未求助) */
  hintLevelUsed: number;
  /** false → 不更新 pendingRetryRiId(章末测试 RI 不参与 retry/review_lo 流程) */
  enableRetry: boolean;
}

/**
 * v0.2 PathOrchestrator 状态机。
 *
 * 关键改动 vs v0:
 *   - 答对 adaptive 题 → 把 parentRiId 加入 mandatoryCompletedIds(原 RI 视为通关)
 *   - 答对 static 题 → 同 v0,把 riId 加入 mandatoryCompletedIds
 *   - 答对任何题 → 清空 pendingRetryRiId(脱离 retry)
 *   - 答错 static 题 → pendingRetryRiId = riId(进入 retry,decideNext 会出 adaptive)
 *   - 答错 adaptive 题 → pendingRetryRiId 不变(continue retry,connsecutive_wrong 累加)
 *   - hint 折扣:hintLevelUsed > 0 答对仍计 mandatoryCompletedIds,但 consecutiveCorrect 不增加
 *     (mastered 门槛拿不到,鼓励学习者后续不靠 hint 答对)
 */
function applyMasteryStateMachine(input: StateMachineInput): StateMachineDelta {
  const { state, evaluation, source, riId, parentRiId, hintLevelUsed, enableRetry } = input;
  const correct = evaluation.correct;

  // hint 折扣:用过 hint 答对 → consecutiveCorrect 不增,但 wrong 计数照常重置
  const usedHint = hintLevelUsed > 0;
  const consecutiveCorrect = correct
    ? usedHint
      ? state.consecutiveCorrect
      : state.consecutiveCorrect + 1
    : 0;
  const consecutiveWrong = correct ? 0 : state.consecutiveWrong + 1;

  // 必做完成跟踪 — static 用 riId,adaptive 用 parentRiId(retry 答对算原 RI 通关)
  let mandatoryCompletedIds = state.mandatoryCompletedIds;
  if (correct) {
    const targetRi = source === 'static' ? riId : parentRiId;
    if (targetRi && !state.mandatoryCompletedIds.includes(targetRi)) {
      mandatoryCompletedIds = [...state.mandatoryCompletedIds, targetRi];
    }
  }

  // pending retry 状态推进。enableRetry=false(章末测试 RI)→ 不动 pendingRetryRiId。
  let pendingRetryRiId = state.pendingRetryRiId;
  if (enableRetry) {
    if (correct) {
      // 任何答对 → 脱离 retry
      pendingRetryRiId = null;
    } else if (source === 'static' && riId) {
      // 静态题答错 → 进入 retry
      pendingRetryRiId = riId;
    }
    // adaptive 答错 → pendingRetryRiId 保持(继续 retry 同 RI)
  }

  // mastery 状态机
  let next: MasteryLevel = state.masteryLevel;
  if (state.masteryLevel === 'untouched') {
    next = 'exposed';
  } else if (state.masteryLevel === 'exposed') {
    if (correct && !usedHint) next = 'practicing';
    // 用 hint 答对 → 暂不前进(保持 exposed,等无 hint 答对)
  } else if (state.masteryLevel === 'practicing') {
    if (correct && consecutiveCorrect >= 2 && evaluation.confidence > 0.7) {
      next = 'mastered';
    }
  } else if (state.masteryLevel === 'mastered') {
    if (!correct && consecutiveWrong >= 2) {
      next = 'practicing';
    }
  }

  return {
    nextMasteryLevel: next,
    consecutiveCorrect,
    consecutiveWrong,
    mandatoryCompletedIds,
    pendingRetryRiId,
  };
}
