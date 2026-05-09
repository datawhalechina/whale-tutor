import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import type { GetArchiveResponse } from '@whale-tutor/tutor-types';
import { ArchiveService } from './archive.service';

// 统一的"节点 → markdown"接口。kind 决定语义,id 是节点 id。
//   GET /archives/lo/:loId?learnerId=<n>
//   GET /archives/qa-thread/:threadId
//   GET /archives/chapter/:chapterId?learnerId=<n>      (v0.2)
//   GET /archives/course/:courseId?learnerId=<n>        (v0.2)
//   GET /archives/adaptive-interaction/:interactionId   (v0.2)
@Controller()
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Get('archives/:kind/:id')
  async getArchive(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('learnerId') learnerIdQuery?: string,
  ): Promise<GetArchiveResponse> {
    if (kind === 'lo') {
      const learnerId = parseLearnerId(learnerIdQuery, kind);
      const { title, contentMd } = await this.archive.loToMarkdown(learnerId, id);
      return { kind: 'lo', title, contentMd };
    }

    if (kind === 'qa-thread') {
      const threadId = Number(id);
      if (Number.isNaN(threadId)) {
        throw new BadRequestException(`id must be numeric for kind=qa-thread`);
      }
      const { title, contentMd } = await this.archive.qaThreadToMarkdown(threadId);
      return { kind: 'qa-thread', title, contentMd };
    }

    if (kind === 'chapter' || kind === 'course' || kind === 'adaptive-interaction') {
      throw new BadRequestException(
        `Archive kind '${kind}' not implemented yet (planned for v0.2)`,
      );
    }

    throw new BadRequestException(`Unknown archive kind: ${kind}`);
  }
}

function parseLearnerId(value: string | undefined, kind: string): number {
  if (!value) {
    throw new BadRequestException(`learnerId query parameter required for kind=${kind}`);
  }
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) {
    throw new BadRequestException(`learnerId must be a positive integer`);
  }
  return n;
}
