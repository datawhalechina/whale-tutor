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
import { http } from './http';

export async function startSession(body: StartSessionRequest): Promise<StartSessionResponse> {
  const res = await http.post<StartSessionResponse>('/sessions', body);
  return res.data;
}

export async function submitResponse(
  sessionId: number,
  body: SubmitResponseBody,
): Promise<SubmitResponseResult> {
  const res = await http.post<SubmitResponseResult>(`/sessions/${sessionId}/responses`, body);
  return res.data;
}

// 配合 submit 拆分:submit 后立即拿评估,然后调本接口拿下一题(可能 block 几秒走 AI)
export async function getNextInteraction(sessionId: number): Promise<GetNextInteractionResponse> {
  const res = await http.get<GetNextInteractionResponse>(`/sessions/${sessionId}/next-interaction`);
  return res.data;
}

export async function endSession(sessionId: number): Promise<EndSessionResponse> {
  const res = await http.post<EndSessionResponse>(`/sessions/${sessionId}/end`);
  return res.data;
}

export async function getSessionProgress(sessionId: number): Promise<GetSessionProgressResponse> {
  const res = await http.get<GetSessionProgressResponse>(`/sessions/${sessionId}/progress`);
  return res.data;
}

export async function requestHint(
  sessionId: number,
  body: RequestHintRequest,
): Promise<RequestHintResponse> {
  const res = await http.post<RequestHintResponse>(`/sessions/${sessionId}/hints`, body);
  return res.data;
}

export async function acknowledgeReviewLo(sessionId: number): Promise<AcknowledgeReviewLoResponse> {
  const res = await http.post<AcknowledgeReviewLoResponse>(
    `/sessions/${sessionId}/acknowledge-review-lo`,
  );
  return res.data;
}

export async function switchChapter(
  sessionId: number,
  body: SwitchChapterRequest,
): Promise<SwitchChapterResponse> {
  const res = await http.post<SwitchChapterResponse>(`/sessions/${sessionId}/switch-chapter`, body);
  return res.data;
}

export async function resetChapter(
  sessionId: number,
  body: ResetChapterRequest,
): Promise<ResetChapterResponse> {
  const res = await http.post<ResetChapterResponse>(`/sessions/${sessionId}/reset-chapter`, body);
  return res.data;
}

export async function resetCourse(sessionId: number): Promise<ResetCourseResponse> {
  const res = await http.post<ResetCourseResponse>(`/sessions/${sessionId}/reset-course`);
  return res.data;
}
