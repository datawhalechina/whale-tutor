import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { BuildService } from './build.service';

// ============================================================
// `whale-tutor generate` 主流程(比 `build` 高一阶):
//   输入:用户在交互式 CLI 里给的 courseName / topic / audience / chapterCount
//   过程:
//     1. AI 写课程大纲(generate.course_outline) → 决定 course id/subject/chapters[N]
//     2. AI 逐章扩写讲稿(generate.chapter_content × N) → 写到 source dir
//     3. 直接调 BuildService.buildCourse(source, output, force) →
//        把 markdown 转成完整 yaml/md 课程
//
// 跟 `build` 的关系:
//   - `build` 的输入是用户**已经写好**的 markdown 讲稿
//   - `generate` 多了"写讲稿"这一步 — AI 替用户把讲稿写出来,然后丢给 build 跑
//   - 用户能看到 source dir 的 markdown,不满意可以手改后重跑 build
//
// AI 调用次数:
//   = 1 (outline) + N (chapter contents) + 1 + 2N + M (build 内部)
//   = 2 + 3N + M
// 例:5 章共 20 个 LO → 2 + 15 + 20 = 37 次,deepseek-v4-flash ≈ $0.10
// ============================================================

export interface GenerateInput {
  courseName: string; // 用户给的课程名(中文 OK)
  topic: string; // 主题描述,可空
  audience: string; // 目标受众,可空
  chapterCountHint: string; // "auto" 或具体数字字符串
  sourceDir: string; // AI 写出的 markdown 落到这里(<workspace>/<course-id>-source/)
  outputDir: string; // 最终课程 yaml/md 落到这里(<workspace>/courses/<course-id>/)
  force: boolean;
}

export interface GenerateSummary {
  courseId: string;
  courseName: string;
  subject: string;
  chapterCount: number;
  loCount: number;
  riCount: number;
  assessmentRiCount: number;
  sourceDir: string;
  outputDir: string;
}

interface OutlineResult {
  courseId: string;
  subject: string;
  description: string;
  chapters: Array<{
    slug: string;
    name: string;
    summary: string;
  }>;
}

interface ChapterContentResult {
  markdown: string;
}

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly ai: AiGatewayService,
    private readonly buildService: BuildService,
  ) {}

  async generateCourse(input: GenerateInput): Promise<GenerateSummary> {
    // === 0. 输出目标校验 ===
    const sourceDir = path.resolve(input.sourceDir);
    const outputDir = path.resolve(input.outputDir);

    if (existsSync(sourceDir) && !input.force) {
      throw new Error(
        `Source dir already exists: ${sourceDir}. Use --force to overwrite.`,
      );
    }
    // outputDir 的存在性由 buildService 自己校验,不重复

    // === 1. AI 写课程大纲 ===
    this.logger.log('[1/3] AI generating course outline…');
    const outline = await this.ai.complete<OutlineResult>({
      templateId: 'generate.course_outline',
      variables: {
        courseName: input.courseName,
        topic: input.topic || input.courseName, // topic 空时用 courseName 兜底
        audience: input.audience || '初学者(假设有该学科基本概念但未系统学过)',
        chapterCountHint: input.chapterCountHint || 'auto',
      },
      callerTag: 'generate:outline',
    });

    if (
      outline.courseId === '_FALLBACK_' ||
      !outline.chapters ||
      outline.chapters.length === 0
    ) {
      throw new Error(
        'AI failed generating course outline (fallback returned). 检查 DEEPSEEK_API_KEY 是否有效。',
      );
    }
    this.logger.log(
      `[1/3] outline: course "${outline.courseId}" (${outline.subject}), ` +
        `${outline.chapters.length} chapter(s): ${outline.chapters.map((c) => c.slug).join(', ')}`,
    );

    // === 2. AI 逐章扩写 markdown 讲稿 ===
    if (existsSync(sourceDir)) {
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
    await fs.mkdir(path.join(sourceDir, 'chapters'), { recursive: true });

    // 写 course.md(直接用 outline 的 description,不再调 AI)
    const courseMd = `# ${input.courseName}\n\n${outline.description}\n`;
    await fs.writeFile(path.join(sourceDir, 'course.md'), courseMd, 'utf8');

    // 逐章扩写 — 每章一次独立 AI 调用,失败可单独重试
    const chapters = outline.chapters;
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      this.logger.log(
        `[2/3] AI writing chapter ${i + 1}/${chapters.length} (${ch.slug}: ${ch.name})…`,
      );
      const content = await this.ai.complete<ChapterContentResult>({
        templateId: 'generate.chapter_content',
        variables: {
          subject: outline.subject,
          courseName: input.courseName,
          courseDescription: outline.description,
          chapterIndex: String(i + 1),
          totalChapters: String(chapters.length),
          chapterName: ch.name,
          chapterSummary: ch.summary,
          previousChaptersSummary: chapters
            .slice(0, i)
            .map((c, idx) => `第 ${idx + 1} 章「${c.name}」:${c.summary}`)
            .join('\n') || '(无,这是第一章)',
          nextChaptersSummary: chapters
            .slice(i + 1)
            .map((c, idx) => `第 ${i + 1 + idx + 1} 章「${c.name}」:${c.summary}`)
            .join('\n') || '(无,这是最后一章)',
        },
        callerTag: `generate:content:${ch.slug}`,
      });

      if (!content.markdown || content.markdown === '_FALLBACK_') {
        throw new Error(
          `AI failed writing chapter ${i + 1} (${ch.slug}). 重跑或单独修该章。`,
        );
      }

      // 文件名:01-introduction.md / 02-xxx.md(零填充 2 位,build 阶段会按文件名排序)
      const filename = `${String(i + 1).padStart(2, '0')}-${ch.slug.replace(/_/g, '-')}.md`;
      await fs.writeFile(
        path.join(sourceDir, 'chapters', filename),
        content.markdown.trim() + '\n',
        'utf8',
      );
      this.logger.log(`  → wrote ${filename} (${content.markdown.length} chars)`);
    }

    this.logger.log(
      `[2/3] all ${chapters.length} chapters written to ${sourceDir}`,
    );

    // === 3. 调 BuildService 把 markdown 转成完整 yaml/md 课程 ===
    this.logger.log(`[3/3] running build pipeline on ${sourceDir} → ${outputDir}…`);
    const buildSummary = await this.buildService.buildCourse({
      inputDir: sourceDir,
      outputDir,
      force: input.force,
    });

    return {
      courseId: buildSummary.courseId,
      courseName: buildSummary.courseName,
      subject: buildSummary.subject,
      chapterCount: buildSummary.chapterCount,
      loCount: buildSummary.loCount,
      riCount: buildSummary.riCount,
      assessmentRiCount: buildSummary.assessmentRiCount,
      sourceDir,
      outputDir: buildSummary.outputDir,
    };
  }
}
