import { Module } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';

@Module({
  providers: [AiGatewayService],
  exports: [AiGatewayService],
})
export class AiModule {}
