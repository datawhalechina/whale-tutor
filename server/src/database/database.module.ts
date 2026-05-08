import { Global, Module, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Kysely, MysqlDialect, type MysqlPool } from 'kysely';
import { createPool } from 'mysql2';
import type { DB } from './database.types';

export const KYSELY = Symbol('KYSELY');
export type Database = Kysely<DB>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const pool = createPool({
          host: config.get<string>('DATABASE_HOST', 'localhost'),
          port: config.get<number>('DATABASE_PORT', 3306),
          user: config.get<string>('DATABASE_USER', 'tutor'),
          password: config.get<string>('DATABASE_PASSWORD', 'tutor'),
          database: config.get<string>('DATABASE_NAME', 'whale_tutor'),
          connectionLimit: 10,
        }) as unknown as MysqlPool;
        return new Kysely<DB>({ dialect: new MysqlDialect({ pool }) });
      },
    },
  ],
  exports: [KYSELY],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
