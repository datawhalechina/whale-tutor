import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type {
  AcknowledgeReviewLoResponse,
  EndSessionResponse,
  GetNextInteractionResponse,
  GetSessionProgressResponse,
  RequestHintRequest,
  RequestHintResponse,
  ResetChapterRequest,
  ResetChapterResponse,
  ResetCourseResponse,
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

  // 配合 submit 拆分:前端 submit 后立即拿评估,然后单独 GET 这个拿下一题。
  // 此接口可能 block 几秒(adaptive retry 走 AI),前端在背景调,用户读完反馈基本已就绪。
  @Get(':id/next-interaction')
  getNextInteraction(
    @Param('id', ParseIntPipe) sessionId: number,
  ): Promise<GetNextInteractionResponse> {
    return this.sessions.getNextInteraction(sessionId);
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

  // 重置某章节学习进度(清 learner_state + chapter_progress + 跳到该章首 LO)
  @Post(':id/reset-chapter')
  resetChapter(
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: ResetChapterRequest,
  ): Promise<ResetChapterResponse> {
    return this.sessions.resetChapter(sessionId, body);
  }

  // 重置整个课程学习进度(清全部 LO + 全部章节进度 + 跳到第一章首 LO)
  @Post(':id/reset-course')
  resetCourse(@Param('id', ParseIntPipe) sessionId: number): Promise<ResetCourseResponse> {
    return this.sessions.resetCourse(sessionId);
  }

  @Get(':id/progress')
  getProgress(@Param('id', ParseIntPipe) sessionId: number): Promise<GetSessionProgressResponse> {
    return this.sessions.getProgress(sessionId);
  }
}
