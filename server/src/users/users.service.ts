import { Inject, Injectable } from '@nestjs/common';
import type { User, UserCreateInput } from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';

@Injectable()
export class UsersService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async findAll(): Promise<User[]> {
    const rows = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'created_at', 'updated_at'])
      .execute();

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async create(input: UserCreateInput): Promise<{ id: number }> {
    const result = await this.db
      .insertInto('users')
      .values({ email: input.email, name: input.name })
      .executeTakeFirstOrThrow();

    return { id: Number(result.insertId) };
  }
}
