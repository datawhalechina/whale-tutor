import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { KYSELY } from '../database/database.module';
import { BuildService } from './build.service';

/**
 * BuildModule:`whale-tutor build` 用的最小依赖图。
 * 不依赖 mysql / web / 其他业务模块,只要 AI Gateway + 文件系统。
 *
 * KYSELY 提供为 null:AiGatewayService.recordCall 内部已 guard,
 * 所以 build 模式下 ai_calls 不入库(也不需要)。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: KYSELY, useValue: null },
    AiGatewayService,
    BuildService,
  ],
  exports: [BuildService],
})
export class BuildModule {}
