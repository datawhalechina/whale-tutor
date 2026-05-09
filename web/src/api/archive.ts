import type { ArchiveNodeKind, GetArchiveResponse } from '@whale-tutor/tutor-types';
import { http } from './http';

/**
 * 拿任意学习节点的 markdown 档案。kind 决定语义,id 是节点 id。
 * 其中 lo / chapter / course 需要 learnerId 参数;qa-thread / adaptive-interaction 不需要。
 */
export async function getArchive(
  kind: ArchiveNodeKind,
  id: string | number,
  learnerId?: number,
): Promise<GetArchiveResponse> {
  const params = learnerId !== undefined ? { learnerId } : undefined;
  const res = await http.get<GetArchiveResponse>(`/archives/${kind}/${id}`, {
    params,
  });
  return res.data;
}
