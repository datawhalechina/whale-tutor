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
import { http } from './http';

export async function startQaThread(
  sessionId: number,
  body: StartQaThreadRequest,
): Promise<StartQaThreadResponse> {
  const res = await http.post<StartQaThreadResponse>(`/sessions/${sessionId}/qa-threads`, body);
  return res.data;
}

export async function appendQaMessage(
  threadId: number,
  body: AppendQaMessageRequest,
): Promise<AppendQaMessageResponse> {
  const res = await http.post<AppendQaMessageResponse>(`/qa-threads/${threadId}/messages`, body);
  return res.data;
}

export async function endQaThread(threadId: number): Promise<EndQaThreadResponse> {
  const res = await http.post<EndQaThreadResponse>(`/qa-threads/${threadId}/end`);
  return res.data;
}

export async function listActiveQaThreads(sessionId: number): Promise<ListActiveQaThreadsResponse> {
  const res = await http.get<ListActiveQaThreadsResponse>(
    `/sessions/${sessionId}/qa-threads/active`,
  );
  return res.data;
}

export async function listAllQaThreads(sessionId: number): Promise<ListAllQaThreadsResponse> {
  const res = await http.get<ListAllQaThreadsResponse>(`/sessions/${sessionId}/qa-threads`);
  return res.data;
}

export async function getQaThread(threadId: number): Promise<GetQaThreadResponse> {
  const res = await http.get<GetQaThreadResponse>(`/qa-threads/${threadId}`);
  return res.data;
}
