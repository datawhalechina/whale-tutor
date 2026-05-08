import { Controller, Get, Param } from '@nestjs/common';
import type {
  GetCourseResponse,
  GetLearningObjectiveResponse,
} from '@whale-tutor/tutor-types';
import { KnowledgeService } from './knowledge.service';

// 注意:vite proxy 把前端 /api/* 重写为 /*,所以这里不加 'api' 前缀。
@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('courses/:id')
  getCourse(@Param('id') id: string): GetCourseResponse {
    return { course: this.knowledge.getCourse(id) };
  }

  @Get('los/:id')
  getLearningObjective(@Param('id') id: string): GetLearningObjectiveResponse {
    return { lo: this.knowledge.getLearningObjective(id) };
  }
}
