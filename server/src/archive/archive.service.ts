import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CodeRunOutcome,
  CodeSandboxPrompt,
  CodeSandboxResponse,
  CodeTestCase,
  ConceptCheckPrompt,
  ConceptCheckResponse,
  FreeRecallPrompt,
  FreeRecallResponse,
  PatternId,
  SpotTheBugPrompt,
  SpotTheBugResponse,
} from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LearnerService } from '../learner/learner.service';

interface ArchiveOutput {
  title: string;
  contentMd: string;
}

interface EvaluationLike {
  correct?: boolean;
  confidence?: number;
  feedbackMd?: string;
  evaluatorKind?: string;
}

/**
 * 把任意"学习节点"统一转 markdown。
 *
 * v0 实现:
 *   - lo (LO 学习档案 — 讲解 + 学习者已做题 + 反馈)
 *   - qa-thread (QA 对话档案)
 *
 * v0.2 待补:
 *   - chapter (章节聚合 — 所有 LO 档案合并)
 *   - course (课程聚合)
 *   - adaptive-interaction (单道 adaptive 题)
 */
@Injectable()
export class ArchiveService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly knowledge: KnowledgeService,
    private readonly learners: LearnerService,
  ) {}

  async loToMarkdown(learnerId: number, loId: string): Promise<ArchiveOutput> {
    const lo = this.knowledge.getLoDefinition(loId);
    const state = await this.learners.getLoState(
      learnerId,
      loId,
      lo.requiredInteractions.length,
    );

    // 拉这个 learner+lo 的所有 interactions
    const interactions = await this.db
      .selectFrom('interactions')
      .selectAll()
      .where('learner_id', '=', learnerId)
      .where('lo_id', '=', loId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();

    // 拉对应 responses,合并;一个 interaction 可能有多个 response(答错重做),取最新的
    const interactionIds = interactions.map((i) => i.id);
    const responsesByInteraction = new Map<
      number,
      {
        evaluation: EvaluationLike;
        response: unknown;
        created_at: Date;
      }
    >();
    if (interactionIds.length > 0) {
      const rows = await this.db
        .selectFrom('responses')
        .selectAll()
        .where('interaction_id', 'in', interactionIds)
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .execute();
      for (const r of rows) {
        const evaluation = parseEvaluation(r.evaluation);
        responsesByInteraction.set(r.interaction_id, {
          evaluation,
          response: parseJson(r.response),
          created_at: r.created_at,
        });
      }
    }

    const lines: string[] = [];
    lines.push(`# ${lo.name}`);
    lines.push('');
    lines.push(`> ${lo.description}`);
    lines.push('');
    lines.push(
      `**当前掌握等级**:\`${state?.masteryLevel ?? 'untouched'}\``,
    );
    lines.push(
      `**必做完成**:${state?.mandatoryCompletedIds.length ?? 0} / ${lo.requiredInteractions.length}`,
    );
    lines.push(
      `**尝试次数**:${state?.attempts ?? 0}(其中正确 ${state?.correctCount ?? 0})`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 核心讲解');
    lines.push('');
    lines.push(lo.coreExplanation);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 我的练习记录');
    lines.push('');

    // 过滤掉"幽灵 interaction"(start 时立即创建但学习者没提交答案就退出的)
    const submitted = interactions.filter((i) =>
      responsesByInteraction.has(i.id),
    );

    // 同一 ri 多次提交(答错重做或跨 session 重做),只保留**最后一次**;
    // 同时统计每条 ri 的总尝试数,显示"共尝试 N 次"。
    // adaptive interaction(无 ri)各自保留。
    const lastByRi = new Map<string, (typeof submitted)[number]>();
    const attemptCountByRi = new Map<string, number>();
    const adaptiveInteractions: typeof submitted = [];
    for (const i of submitted) {
      if (i.required_interaction_id) {
        lastByRi.set(i.required_interaction_id, i);
        attemptCountByRi.set(
          i.required_interaction_id,
          (attemptCountByRi.get(i.required_interaction_id) ?? 0) + 1,
        );
      } else {
        adaptiveInteractions.push(i);
      }
    }
    const dedupedInteractions = [
      ...lastByRi.values(),
      ...adaptiveInteractions,
    ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    if (dedupedInteractions.length === 0) {
      lines.push('*尚未提交任何答案*');
    } else {
      dedupedInteractions.forEach((interaction, i) => {
        const r = responsesByInteraction.get(interaction.id)!;
        lines.push(`### 第 ${i + 1} 题 — ${interaction.pattern_id}`);
        lines.push('');
        const sourceLabel =
          interaction.source === 'static' ? '必做' : 'AI 生成';
        const riHint = interaction.required_interaction_id
          ? ` · 题目 ID \`${interaction.required_interaction_id}\``
          : '';
        const attempts = interaction.required_interaction_id
          ? (attemptCountByRi.get(interaction.required_interaction_id) ?? 1)
          : 1;
        const attemptsHint =
          attempts > 1 ? ` · 共尝试 ${attempts} 次,显示最后一次` : '';
        lines.push(`> 来源:${sourceLabel}${riHint}${attemptsHint}`);
        lines.push('');

        // 按 patternId 渲染题干 + 学习者答案
        const promptPayload = parseJson(interaction.prompt_payload);
        const detailLines = renderPatternDetail(
          interaction.pattern_id as PatternId,
          promptPayload,
          r.response,
          !!r.evaluation.correct,
        );
        if (detailLines.length > 0) {
          lines.push(...detailLines);
          lines.push('');
        }

        const correct = r.evaluation.correct ? '✓ 答对' : '✗ 答错';
        const conf =
          typeof r.evaluation.confidence === 'number'
            ? r.evaluation.confidence.toFixed(2)
            : '-';
        const kind = r.evaluation.evaluatorKind ?? '-';
        lines.push(`**结果**:${correct} · 置信度 ${conf} · ${kind}`);
        lines.push('');
        if (r.evaluation.feedbackMd) {
          lines.push('**反馈**:');
          lines.push('');
          lines.push(r.evaluation.feedbackMd);
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      });
    }

    return { title: lo.name, contentMd: lines.join('\n') };
  }

  async qaThreadToMarkdown(threadId: number): Promise<ArchiveOutput> {
    const threadRow = await this.db
      .selectFrom('qa_threads')
      .selectAll()
      .where('id', '=', threadId)
      .executeTakeFirst();
    if (!threadRow) {
      throw new NotFoundException(`QA thread ${threadId} not found`);
    }

    const messages = await this.db
      .selectFrom('qa_messages')
      .selectAll()
      .where('thread_id', '=', threadId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();

    // 用第一条 learner 消息作 title 摘要
    const firstLearnerMsg = messages.find((m) => m.role === 'learner');
    const title = firstLearnerMsg
      ? truncate(firstLearnerMsg.content_md.replace(/\n/g, ' '), 40)
      : `QA Thread #${threadId}`;

    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push('');
    if (threadRow.lo_id) {
      lines.push(`**所在 LO**:\`${threadRow.lo_id}\``);
    }
    if (threadRow.parent_interaction_id !== null) {
      lines.push(`**所在题目**:第 ${threadRow.parent_interaction_id} 题`);
    }
    if (threadRow.parent_qa_thread_id !== null) {
      lines.push(`**嵌套于**:thread #${threadRow.parent_qa_thread_id}`);
    }
    lines.push(`**状态**:${threadRow.status}`);
    lines.push(`**开始时间**:${formatDate(threadRow.started_at)}`);
    if (threadRow.ended_at) {
      lines.push(`**结束时间**:${formatDate(threadRow.ended_at)}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    if (messages.length === 0) {
      lines.push('*暂无对话*');
    } else {
      messages.forEach((msg) => {
        const role = msg.role === 'learner' ? '🧑 我' : '🐳 鲸鱼老师';
        lines.push(`### ${role}`);
        lines.push('');
        lines.push(msg.content_md);
        lines.push('');
      });
    }

    return { title, contentMd: lines.join('\n') };
  }
}

function parseEvaluation(value: unknown): EvaluationLike {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as EvaluationLike;
    } catch {
      return {};
    }
  }
  if (value && typeof value === 'object') {
    return value as EvaluationLike;
  }
  return {};
}

function parseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

function formatDate(d: Date): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

// ============================================================
// 按 patternId 渲染题目细节(题干 + 学习者答案 + 正确答案标记)
// ============================================================

function renderPatternDetail(
  patternId: PatternId,
  prompt: unknown,
  response: unknown,
  _correct: boolean,
): string[] {
  switch (patternId) {
    case 'concept_check':
      return renderConceptCheckDetail(
        prompt as ConceptCheckPrompt | null,
        response as ConceptCheckResponse | null,
      );
    case 'spot_the_bug':
      return renderSpotTheBugDetail(
        prompt as SpotTheBugPrompt | null,
        response as SpotTheBugResponse | null,
      );
    case 'code_sandbox':
      return renderCodeSandboxDetail(
        prompt as CodeSandboxPrompt | null,
        response as CodeSandboxResponse | null,
      );
    case 'free_recall':
      return renderFreeRecallDetail(
        prompt as FreeRecallPrompt | null,
        response as FreeRecallResponse | null,
      );
    default:
      return [];
  }
}

function renderConceptCheckDetail(
  prompt: ConceptCheckPrompt | null,
  response: ConceptCheckResponse | null,
): string[] {
  if (!prompt?.question) return [];
  const q = prompt.question;
  const selected = response?.selectedIndex;
  const lines: string[] = [];
  lines.push(`**题干**:${q.stem}`);
  lines.push('');
  lines.push('**选项**:');
  q.options.forEach((opt, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const isAnswer = idx === q.answerIndex;
    const isMine = idx === selected;
    let marker = '';
    if (isMine && isAnswer) marker = '   ← ✓ 你的选择(正确答案)';
    else if (isMine) marker = '   ← ✗ 你的选择';
    else if (isAnswer) marker = '   ← ✓ 正确答案';
    lines.push(`- ${letter}. ${opt}${marker}`);
  });
  return lines;
}

function renderSpotTheBugDetail(
  prompt: SpotTheBugPrompt | null,
  response: SpotTheBugResponse | null,
): string[] {
  if (!prompt?.buggyCode) return [];
  const lines: string[] = [];
  lines.push('**buggy 代码**:');
  lines.push('');
  lines.push('```python');
  lines.push(prompt.buggyCode.replace(/\n+$/, ''));
  lines.push('```');
  lines.push('');
  if (Array.isArray(prompt.bugLocations) && prompt.bugLocations.length > 0) {
    const locs = prompt.bugLocations
      .map((l) => `第 ${l.line} 行(${l.kind})`)
      .join('、');
    lines.push(`**bug 实际位置**:${locs}`);
  }
  if (Array.isArray(response?.selectedLines) && response.selectedLines.length > 0) {
    lines.push(`**你选的行**:${response.selectedLines.join(', ')}`);
  }
  if (response?.explanation) {
    lines.push('');
    lines.push('**你的解释**:');
    lines.push('');
    const indented = response.explanation
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    lines.push(indented);
  }
  return lines;
}

function renderCodeSandboxDetail(
  prompt: CodeSandboxPrompt | null,
  response: CodeSandboxResponse | null,
): string[] {
  if (!prompt) return [];
  const lines: string[] = [];
  if (prompt.promptMd) {
    lines.push('**题目**:');
    lines.push('');
    lines.push(prompt.promptMd);
    lines.push('');
  }
  if (response?.code) {
    lines.push('**你的代码**:');
    lines.push('');
    lines.push('```python');
    lines.push(response.code.replace(/\n+$/, ''));
    lines.push('```');
    lines.push('');
  }
  if (Array.isArray(response?.runResults) && response.runResults.length > 0) {
    const total = response.runResults.length;
    const passed = response.runResults.filter((r) => r.passed).length;
    lines.push(`**测试结果**:${passed} / ${total} 通过`);
    // 列出失败的测试细节
    const failures = response.runResults.filter((r) => !r.passed);
    if (failures.length > 0 && Array.isArray(prompt.testCases)) {
      lines.push('');
      lines.push('未通过的用例:');
      failures.forEach((f: CodeRunOutcome) => {
        const tc: CodeTestCase | undefined = prompt.testCases[f.testIndex];
        const desc = tc?.description ? ` — ${tc.description}` : '';
        lines.push(
          `- 测试 ${f.testIndex + 1}${desc}:期望 \`${tc?.expectedOutput ?? '?'}\`,实际 \`${f.actualOutput || '(空)'}\`${f.error ? ` · 错误 ${f.error}` : ''}`,
        );
      });
    }
  }
  return lines;
}

function renderFreeRecallDetail(
  prompt: FreeRecallPrompt | null,
  response: FreeRecallResponse | null,
): string[] {
  if (!prompt) return [];
  const lines: string[] = [];
  if (prompt.promptMd) {
    lines.push('**题目**:');
    lines.push('');
    lines.push(prompt.promptMd);
    lines.push('');
  }
  if (response?.text) {
    lines.push('**你的回答**:');
    lines.push('');
    const indented = response.text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    lines.push(indented);
  }
  return lines;
}
