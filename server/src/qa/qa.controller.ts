import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import type {
  AppendQaMessageRequest,
  AppendQaMessageResponse,
  EndQaThreadResponse,
  GetQaThreadResponse,
  ListActiveQaThreadsResponse,
  ListAllQaThreadsResponse,
  StartQaThreadRequest,
  StartQaThreadResponse,
} from '@whale-tutor/tutor-types';
import { QaService } from './qa.service';

// vite proxy 把 /api/* 重写为 /*,这里不加 'api' 前缀。
@Controller()
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Post('sessions/:sessionId/qa-threads')
  startThread(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() body: StartQaThreadRequest,
  ): Promise<StartQaThreadResponse> {
    return this.qa.startThread({
      sessionId,
      loId: body.loId,
      parentInteractionId: body.parentInteractionId,
      parentQaThreadId: body.parentQaThreadId,
      question: body.question,
    });
  }

  @Post('qa-threads/:threadId/messages')
  appendMessage(
    @Param('threadId', ParseIntPipe) threadId: number,
    @Body() body: AppendQaMessageRequest,
  ): Promise<AppendQaMessageResponse> {
    return this.qa.appendMessage(threadId, body.question);
  }

  @Post('qa-threads/:threadId/end')
  async endThread(
    @Param('threadId', ParseIntPipe) threadId: number,
  ): Promise<EndQaThreadResponse> {
    const thread = await this.qa.endThread(threadId);
    return { thread };
  }

  @Get('sessions/:sessionId/qa-threads/active')
  async listActiveThreads(
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<ListActiveQaThreadsResponse> {
    const threads = await this.qa.listActiveThreads(sessionId);
    return { threads };
  }

  @Get('sessions/:sessionId/qa-threads')
  async listAllThreads(
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<ListAllQaThreadsResponse> {
    const threads = await this.qa.listAllThreads(sessionId);
    return { threads };
  }

  @Get('qa-threads/:threadId')
  getThread(
    @Param('threadId', ParseIntPipe) threadId: number,
  ): Promise<GetQaThreadResponse> {
    return this.qa.getThreadWithMessages(threadId);
  }
}
