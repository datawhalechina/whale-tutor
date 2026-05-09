import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type {
  AcknowledgeReviewLoResponse,
  EndSessionResponse,
  GetSessionProgressResponse,
  RequestHintRequest,
  RequestHintResponse,
  StartSessionRequest,
  StartSessionResponse,
  SubmitResponseBody,
  SubmitResponseResult,
  SwitchChapterRequest,
  SwitchChapterResponse,
} from '@whale-tutor/tutor-types';
import { SessionService } from './session.service';

// vite proxy 把 /api/* 重写为 /*,这里不加 'api' 前缀。
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post()
  start(@Body() body: StartSessionRequest): Promise<StartSessionResponse> {
    return this.sessions.start({
      learnerId: body.learnerId,
      courseId: body.courseId,
    });
  }

  @Post(':id/responses')
  submit(
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: SubmitResponseBody,
  ): Promise<SubmitResponseResult> {
    return this.sessions.submit(sessionId, body);
  }

  @Post(':id/end')
  end(@Param('id', ParseIntPipe) sessionId: number): Promise<EndSessionResponse> {
    return this.sessions.end(sessionId);
  }

  @Post(':id/hints')
  requestHint(
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: RequestHintRequest,
  ): Promise<RequestHintResponse> {
    return this.sessions.requestHint(sessionId, body);
  }

  @Post(':id/acknowledge-review-lo')
  acknowledgeReviewLo(
    @Param('id', ParseIntPipe) sessionId: number,
  ): Promise<AcknowledgeReviewLoResponse> {
    return this.sessions.acknowledgeReviewLo(sessionId);
  }

  @Post(':id/switch-chapter')
  switchChapter(
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: SwitchChapterRequest,
  ): Promise<SwitchChapterResponse> {
    return this.sessions.switchChapter(sessionId, body);
  }

  @Get(':id/progress')
  getProgress(@Param('id', ParseIntPipe) sessionId: number): Promise<GetSessionProgressResponse> {
    return this.sessions.getProgress(sessionId);
  }
}
