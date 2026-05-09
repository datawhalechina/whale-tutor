import { Controller, Get, Param } from '@nestjs/common';
import type {
  GetCourseResponse,
  GetLearningObjectiveResponse,
  ListCoursesResponse,
} from '@whale-tutor/tutor-types';
import { KnowledgeService } from './knowledge.service';

// server 已设 globalPrefix('api'),controller 里不重复加。
@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  // HomeView 课程选择器:列所有已加载的课程(摘要)
  @Get('courses')
  listCourses(): ListCoursesResponse {
    return { courses: this.knowledge.listCourseSummaries() };
  }

  @Get('courses/:id')
  getCourse(@Param('id') id: string): GetCourseResponse {
    return { course: this.knowledge.getCourse(id) };
  }

  @Get('los/:id')
  getLearningObjective(@Param('id') id: string): GetLearningObjectiveResponse {
    return { lo: this.knowledge.getLearningObjective(id) };
  }
}
