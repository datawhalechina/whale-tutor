import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import type {
  LearnerLoState,
  LearnerProfile,
  MasteryLevel,
} from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';
import type { LearnerStateTable } from '../database/database.types';

@Injectable()
export class LearnerService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async getProfile(learnerId: number): Promise<LearnerProfile> {
    const row = await this.db
      .selectFrom('learners')
      .selectAll()
      .where('id', '=', learnerId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException(`Learner not found: ${learnerId}`);
    return {
      id: row.id,
      name: row.name,
      goalScenario: row.goal_scenario,
      userId: row.user_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async getLoState(
    learnerId: number,
    loId: string,
    requiredInteractionTotal: number = 0,
  ): Promise<LearnerLoState | null> {
    const row = await this.db
      .selectFrom('learner_state')
      .selectAll()
      .where('learner_id', '=', learnerId)
      .where('lo_id', '=', loId)
      .executeTakeFirst();
    return row ? rowToLoState(row, requiredInteractionTotal) : null;
  }

  /**
   * 拿当前状态;如不存在则插入一行 untouched 返回。requiredInteractionTotal 用于派生
   * mandatoryAllCompleted 标志,由 KnowledgeService 决定。
   */
  async getOrInitLoState(
    learnerId: number,
    loId: string,
    requiredInteractionTotal: number,
  ): Promise<LearnerLoState> {
    const existing = await this.db
      .selectFrom('learner_state')
      .selectAll()
      .where('learner_id', '=', learnerId)
      .where('lo_id', '=', loId)
      .executeTakeFirst();
    if (existing) {
      return rowToLoState(existing, requiredInteractionTotal);
    }
    await this.db
      .insertInto('learner_state')
      .values({
        learner_id: learnerId,
        lo_id: loId,
        mastery_level: 'untouched',
        attempts: 0,
        correct_count: 0,
        consecutive_correct: 0,
        consecutive_wrong: 0,
        mandatory_completed_ids: JSON.stringify([]),
      })
      .execute();
    return {
      loId,
      masteryLevel: 'untouched',
      attempts: 0,
      correctCount: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      mandatoryCompletedIds: [],
      mandatoryAllCompleted: false,
      lastSeenAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 应用一次评估对 LO state 的影响。
   * 由 SessionService 计算好新值后传入,这里只做持久化。
   */
  async applyEvaluation(input: {
    learnerId: number;
    loId: string;
    correct: boolean;
    nextMasteryLevel: MasteryLevel;
    consecutiveCorrect: number;
    consecutiveWrong: number;
    mandatoryCompletedIds: string[];
    requiredInteractionTotal: number;
  }): Promise<LearnerLoState> {
    await this.db
      .updateTable('learner_state')
      .set({
        mastery_level: input.nextMasteryLevel,
        attempts: sql`attempts + 1`,
        correct_count: input.correct
          ? sql`correct_count + 1`
          : sql`correct_count`,
        consecutive_correct: input.consecutiveCorrect,
        consecutive_wrong: input.consecutiveWrong,
        mandatory_completed_ids: JSON.stringify(input.mandatoryCompletedIds),
        last_seen_at: sql`CURRENT_TIMESTAMP(3)`,
      })
      .where('learner_id', '=', input.learnerId)
      .where('lo_id', '=', input.loId)
      .execute();
    const fresh = await this.getLoState(input.learnerId, input.loId);
    if (!fresh) throw new Error('learner_state vanished after update — should not happen');
    // 用调用方传来的 total 计算 mandatoryAllCompleted（DB 里没存这个派生字段）
    return {
      ...fresh,
      mandatoryAllCompleted:
        input.requiredInteractionTotal > 0 &&
        fresh.mandatoryCompletedIds.length >= input.requiredInteractionTotal,
    };
  }
}

// mysql2 默认 parse JSON 列,但跨版本可能返回字符串。defensive parse。
function rowToLoState(
  row: Selectable<LearnerStateTable>,
  requiredInteractionTotal: number,
): LearnerLoState {
  const mandatoryIds = parseJsonArray(row.mandatory_completed_ids);
  return {
    loId: row.lo_id,
    masteryLevel: row.mastery_level,
    attempts: row.attempts,
    correctCount: row.correct_count,
    consecutiveCorrect: row.consecutive_correct,
    consecutiveWrong: row.consecutive_wrong,
    mandatoryCompletedIds: mandatoryIds,
    mandatoryAllCompleted:
      requiredInteractionTotal > 0 &&
      mandatoryIds.length >= requiredInteractionTotal,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function parseJsonArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
