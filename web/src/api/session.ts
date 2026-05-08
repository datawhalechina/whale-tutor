import type {
  EndSessionResponse,
  GetSessionProgressResponse,
  StartSessionRequest,
  StartSessionResponse,
  SubmitResponseBody,
  SubmitResponseResult,
} from '@whale-tutor/tutor-types';
import { http } from './http';

export async function startSession(
  body: StartSessionRequest,
): Promise<StartSessionResponse> {
  const res = await http.post<StartSessionResponse>('/sessions', body);
  return res.data;
}

export async function submitResponse(
  sessionId: number,
  body: SubmitResponseBody,
): Promise<SubmitResponseResult> {
  const res = await http.post<SubmitResponseResult>(
    `/sessions/${sessionId}/responses`,
    body,
  );
  return res.data;
}

export async function endSession(
  sessionId: number,
): Promise<EndSessionResponse> {
  const res = await http.post<EndSessionResponse>(`/sessions/${sessionId}/end`);
  return res.data;
}

export async function getSessionProgress(
  sessionId: number,
): Promise<GetSessionProgressResponse> {
  const res = await http.get<GetSessionProgressResponse>(
    `/sessions/${sessionId}/progress`,
  );
  return res.data;
}
