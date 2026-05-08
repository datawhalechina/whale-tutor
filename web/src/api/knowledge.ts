import type {
  GetCourseResponse,
  GetLearningObjectiveResponse,
} from '@whale-tutor/tutor-types';
import { http } from './http';

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
