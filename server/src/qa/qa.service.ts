import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import type {
  QaMessage,
  QaThread,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { KYSELY, type Database } from '../database/database.module';
import type {
  QaMessagesTable,
  QaThreadsTable,
} from '../database/database.types';
import { EventService } from '../event/event.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

interface AiAnswer {
  text: string;
}

interface StartThreadInput {
  sessionId: number;
  // learnerId 内部从 sessionId 推导,客户端不传(防伪造 + 一致性)
  loId: string | null;
  parentInteractionId: number | null;
  parentQaThreadId: number | null;
  question: string;
}

@Injectable()
export class QaService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly events: EventService,
    private readonly ai: AiGatewayService,
    private readonly knowledge: KnowledgeService,
  ) {}

  // ============================================================
  // 开启新 thread + 第一问
  // ============================================================

  async startThread(input: StartThreadInput): Promise<{
    thread: QaThread;
    learnerMessage: QaMessage;
    assistantMessage: QaMessage;
  }> {
    if (input.parentInteractionId !== null && input.parentQaThreadId !== null) {
      throw new BadRequestException(
        'parent_interaction_id 与 parent_qa_thread_id 互斥,只能有一个非 null',
      );
    }
    if (!input.question.trim()) {
      throw new BadRequestException('question 不能为空');
    }

    const learnerId = await this.lookupLearnerId(input.sessionId);

    // 1. 创建 thread
    const threadInsert = await this.db
      .insertInto('qa_threads')
      .values({
        learner_id: learnerId,
        session_id: input.sessionId,
        lo_id: input.loId,
        parent_interaction_id: input.parentInteractionId,
        parent_qa_thread_id: input.parentQaThreadId,
        status: 'active',
      })
      .executeTakeFirstOrThrow();
    const threadId = Number(threadInsert.insertId);

    await this.events.emit({
      sessionId: input.sessionId,
      learnerId,
      loId: input.loId,
      type: 'qa.thread_started',
      payload: {
        threadId,
        parentInteractionId: input.parentInteractionId,
        parentQaThreadId: input.parentQaThreadId,
      },
    });

    // 2. 写 learner message
    const learnerMessage = await this.insertMessage({
      threadId,
      role: 'learner',
      contentMd: input.question,
      sessionId: input.sessionId,
      learnerId,
      loId: input.loId,
    });

    // 3. 调 AI 生成 assistant message(传 [] 因为是第一问,无前序对话)
    const aiOutput = await this.generateAnswer({
      sessionId: input.sessionId,
      loId: input.loId,
      parentInteractionId: input.parentInteractionId,
      parentQaThreadId: input.parentQaThreadId,
      question: input.question,
      previousMessages: [],
    });

    // 4. 写 assistant message
    const assistantMessage = await this.insertMessage({
      threadId,
      role: 'assistant',
      contentMd: aiOutput.text,
      sessionId: input.sessionId,
      learnerId,
      loId: input.loId,
    });

    const thread = await this.getThread(threadId);
    return { thread, learnerMessage, assistantMessage };
  }

  private async lookupLearnerId(sessionId: number): Promise<number> {
    const row = await this.db
      .selectFrom('sessions')
      .select('learner_id')
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return row.learner_id;
  }

  // ============================================================
  // 同 thread 追问
  // ============================================================

  async appendMessage(
    threadId: number,
    question: string,
  ): Promise<{ learnerMessage: QaMessage; assistantMessage: QaMessage }> {
    if (!question.trim()) {
      throw new BadRequestException('question 不能为空');
    }
    const thread = await this.getThread(threadId);
    if (thread.status !== 'active') {
      throw new BadRequestException(
        `Thread ${threadId} 已结束,无法追问;请新开 thread。`,
      );
    }

    const previousMessages = await this.getMessagesByThread(threadId);

    const learnerMessage = await this.insertMessage({
      threadId,
      role: 'learner',
      contentMd: question,
      sessionId: thread.sessionId,
      learnerId: thread.learnerId,
      loId: thread.loId,
    });

    const aiOutput = await this.generateAnswer({
      sessionId: thread.sessionId,
      loId: thread.loId,
      parentInteractionId: thread.parentInteractionId,
      parentQaThreadId: thread.parentQaThreadId,
      question,
      previousMessages,
    });

    const assistantMessage = await this.insertMessage({
      threadId,
      role: 'assistant',
      contentMd: aiOutput.text,
      sessionId: thread.sessionId,
      learnerId: thread.learnerId,
      loId: thread.loId,
    });

    return { learnerMessage, assistantMessage };
  }

  // ============================================================
  // 结束 thread
  // ============================================================

  async endThread(threadId: number): Promise<QaThread> {
    const thread = await this.getThread(threadId);
    if (thread.status === 'ended') return thread;

    await this.db
      .updateTable('qa_threads')
      .set({ status: 'ended', ended_at: sql`CURRENT_TIMESTAMP(3)` })
      .where('id', '=', threadId)
      .execute();

    await this.events.emit({
      sessionId: thread.sessionId,
      learnerId: thread.learnerId,
      loId: thread.loId,
      type: 'qa.thread_ended',
      payload: { threadId },
    });

    return await this.getThread(threadId);
  }

  // ============================================================
  // 列出 session 内 active 栈(按 startedAt 升序 = 栈底→栈顶)
  // ============================================================

  async listActiveThreads(sessionId: number): Promise<QaThread[]> {
    const rows = await this.db
      .selectFrom('qa_threads')
      .selectAll()
      .where('session_id', '=', sessionId)
      .where('status', '=', 'active')
      .orderBy('started_at', 'asc')
      .execute();
    return rows.map(rowToThread);
  }

  // 含 ended 的全部 thread,用于"历史 QA"侧栏
  async listAllThreads(sessionId: number): Promise<QaThread[]> {
    const rows = await this.db
      .selectFrom('qa_threads')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('started_at', 'asc')
      .execute();
    return rows.map(rowToThread);
  }

  // ============================================================
  // 单 thread 完整对话
  // ============================================================

  async getThreadWithMessages(
    threadId: number,
  ): Promise<{ thread: QaThread; messages: QaMessage[] }> {
    const thread = await this.getThread(threadId);
    const messages = await this.getMessagesByThread(threadId);
    return { thread, messages };
  }

  // ============================================================
  // 内部 helpers
  // ============================================================

  private async getThread(threadId: number): Promise<QaThread> {
    const row = await this.db
      .selectFrom('qa_threads')
      .selectAll()
      .where('id', '=', threadId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException(`QaThread ${threadId} not found`);
    return rowToThread(row);
  }

  private async insertMessage(input: {
    threadId: number;
    role: 'learner' | 'assistant';
    contentMd: string;
    sessionId: number;
    learnerId: number;
    loId: string | null;
  }): Promise<QaMessage> {
    const result = await this.db
      .insertInto('qa_messages')
      .values({
        thread_id: input.threadId,
        role: input.role,
        content_md: input.contentMd,
        // v0:ai_call_id 关联待 AI Gateway 改造为返 callId 后再补;暂 null
        ai_call_id: null,
      })
      .executeTakeFirstOrThrow();
    const messageId = Number(result.insertId);

    await this.events.emit({
      sessionId: input.sessionId,
      learnerId: input.learnerId,
      loId: input.loId,
      type: 'qa.message_added',
      payload: {
        threadId: input.threadId,
        messageId,
        role: input.role,
      },
    });

    const row = await this.db
      .selectFrom('qa_messages')
      .selectAll()
      .where('id', '=', messageId)
      .executeTakeFirstOrThrow();
    return rowToMessage(row);
  }

  private async getMessagesByThread(threadId: number): Promise<QaMessage[]> {
    const rows = await this.db
      .selectFrom('qa_messages')
      .selectAll()
      .where('thread_id', '=', threadId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(rowToMessage);
  }

  /**
   * 装配 prompt 上下文 + 调 AI Gateway。失败/无 key 时拿到 fallback 文案。
   */
  private async generateAnswer(input: {
    sessionId: number;
    loId: string | null;
    parentInteractionId: number | null;
    parentQaThreadId: number | null;
    question: string;
    previousMessages: QaMessage[];
  }): Promise<AiAnswer> {
    const loContext = input.loId
      ? this.formatLoContext(input.loId)
      : '(学习者未在具体 LO 内)';

    let interactionContext = '';
    if (input.parentInteractionId !== null) {
      interactionContext = await this.formatInteractionContext(
        input.parentInteractionId,
      );
    }

    const previousDialog =
      input.previousMessages.length === 0
        ? '(无,这是 thread 内第一个问题)'
        : input.previousMessages
            .map(
              (m) =>
                `**${m.role === 'learner' ? '学习者' : '助手'}**:${m.contentMd}`,
            )
            .join('\n\n---\n\n');

    // qa.answer 是 session 级别的对话,subject 来自该 session 的 course。
    // QA 可以发生在 LO 闲置时(input.loId=null),那时退一步从 session.course_id 取。
    const subject = await this.resolveSubjectForSession(
      input.sessionId,
      input.loId,
    );

    return await this.ai.complete<AiAnswer>({
      templateId: 'qa.answer',
      variables: {
        subject,
        loContext,
        interactionContext,
        previousDialog,
        question: input.question,
      },
      sessionId: input.sessionId,
      callerTag: 'qa.answer',
    });
  }

  /**
   * subject 解析:优先 LO → 课程;LO 缺失时回退到 session.course_id → 课程。
   */
  private async resolveSubjectForSession(
    sessionId: number,
    loId: string | null,
  ): Promise<string> {
    if (loId) {
      try {
        return this.knowledge.getSubjectByLoId(loId);
      } catch {
        // 落到 session 兜底
      }
    }
    const session = await this.db
      .selectFrom('sessions')
      .select(['course_id'])
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (session) {
      try {
        return this.knowledge.getCourseDefinition(session.course_id).subject;
      } catch {
        // 课程不存在(理论上不该发生),最终兜底
      }
    }
    return '通用';
  }

  private formatLoContext(loId: string): string {
    try {
      const lo = this.knowledge.getLoDefinition(loId);
      return [
        `**${lo.name}** — ${lo.description}`,
        '',
        lo.coreExplanation,
      ].join('\n');
    } catch {
      return `(LO ${loId} 未找到)`;
    }
  }

  private async formatInteractionContext(
    interactionId: number,
  ): Promise<string> {
    const row = await this.db
      .selectFrom('interactions')
      .selectAll()
      .where('id', '=', interactionId)
      .executeTakeFirst();
    if (!row) return '';
    // prompt_payload 是 server-only 完整版（含答案）。QA 上下文中暴露给 AI 是可以的
    // (AI 在 server,不会泄漏到客户端)。
    const promptStr = JSON.stringify(row.prompt_payload, null, 2);
    return [
      '## 当前题目上下文',
      '',
      `类型:${row.pattern_id}`,
      '',
      '```json',
      promptStr,
      '```',
    ].join('\n');
  }
}

// ============================================================
// row → domain 映射
// ============================================================

function rowToThread(row: Selectable<QaThreadsTable>): QaThread {
  return {
    id: row.id,
    learnerId: row.learner_id,
    sessionId: row.session_id,
    loId: row.lo_id,
    parentInteractionId: row.parent_interaction_id,
    parentQaThreadId: row.parent_qa_thread_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
  };
}

function rowToMessage(row: Selectable<QaMessagesTable>): QaMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    contentMd: row.content_md,
    aiCallId: row.ai_call_id,
    createdAt: row.created_at.toISOString(),
  };
}
