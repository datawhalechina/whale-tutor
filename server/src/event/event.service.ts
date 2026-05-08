import { Inject, Injectable } from '@nestjs/common';
import type { EventType, PatternId } from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';

export interface EmitEventInput {
  sessionId: number | null;
  learnerId: number;
  type: EventType;
  loId?: string | null;
  patternId?: PatternId | null;
  payload?: Record<string, unknown>;
}

/**
 * Event Bus 的唯一写入入口。其他 service 禁止直接 db.insertInto('events')。
 * 见 CLAUDE.md "事件流是数据真相" 原则。
 */
@Injectable()
export class EventService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async emit(input: EmitEventInput): Promise<{ id: number }> {
    const result = await this.db
      .insertInto('events')
      .values({
        session_id: input.sessionId,
        learner_id: input.learnerId,
        type: input.type,
        lo_id: input.loId ?? null,
        pattern_id: input.patternId ?? null,
        payload: JSON.stringify(input.payload ?? {}),
      })
      .executeTakeFirstOrThrow();
    return { id: Number(result.insertId) };
  }
}
