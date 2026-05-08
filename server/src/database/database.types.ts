import type { ColumnType, Generated } from 'kysely';

export interface UsersTable {
  id: Generated<number>;
  email: string;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface DB {
  users: UsersTable;
}
