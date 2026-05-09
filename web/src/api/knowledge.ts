import type {
  CourseSummary,
  GetCourseResponse,
  GetLearningObjectiveResponse,
  ListCoursesResponse,
} from '@whale-tutor/tutor-types';
import { http } from './http';

export async function listCourses(): Promise<CourseSummary[]> {
  const res = await http.get<ListCoursesResponse>('/courses');
  return res.data.courses;
}

export async function getCourse(
  courseId: string,
): Promise<GetCourseResponse['course']> {
  const res = await http.get<GetCourseResponse>(`/courses/${courseId}`);
  return res.data.course;
}

export async function getLearningObjective(
  loId: string,
): Promise<GetLearningObjectiveResponse['lo']> {
  const res = await http.get<GetLearningObjectiveResponse>(`/los/${loId}`);
  return res.data.lo;
}
