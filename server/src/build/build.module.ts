import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { KYSELY } from '../database/database.module';
import { BuildService } from './build.service';
import { GenerateService } from './generate.service';

/**
 * BuildModule:`whale-tutor build` 和 `whale-tutor generate` 用的最小依赖图。
 * 不依赖 mysql / web / 其他业务模块,只要 AI Gateway + 文件系统。
 *
 * KYSELY 提供为 null:AiGatewayService.recordCall 内部已 guard,
 * 所以 build/generate 模式下 ai_calls 不入库(也不需要)。
 *
 * GenerateService 内部依赖 BuildService(generate 跑完 AI 写讲稿后调 build pipeline)。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: KYSELY, useValue: null },
    AiGatewayService,
    BuildService,
    GenerateService,
  ],
  exports: [BuildService, GenerateService],
})
export class BuildModule {}
