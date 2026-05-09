import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import * as yaml from 'js-yaml';
import { AiGatewayService } from '../ai/ai-gateway.service';

// ============================================================
// `whale-tutor build` 主流程:
//   输入:user-source/{ course.md, chapters/01-foo.md, 02-bar.md, ... }
//   输出:courses/<course-id>/{ course.yaml + 完整 chapter/lo/assessment 树 }
//
// AI 调用 4 个阶段(每阶段独立 prompt yaml,失败重试 1 次,失败 fallback 检测后报错退出):
//   1. build.course_meta       — 1 次,提取 course id/name/subject/description
//   2. build.chapter_outline   — N 次(每章 1 次),拆 LO + 给 LO 切讲解
//   3. build.lo_full           — M 次(每 LO 1 次),生成 misconceptions + RIs
//   4. build.assessment        — N 次(每章 1 次),生成章末综合测试
//
// 总 AI 调用次数 = 1 + N + M + N = 1 + 2N + M(N=章数,M=总 LO 数)
// 例:3 章共 12 个 LO → 1 + 6 + 12 = 19 次 AI 调用(deepseek-v4-flash 约 $0.05)
// ============================================================

export interface BuildInput {
  inputDir: string;     // 用户的源目录(含 course.md + chapters/*.md)
  outputDir: string;    // 输出根目录(通常是 cwd/courses/<course-id>)
  force: boolean;       // 已存在时是否覆盖
}

export interface BuildSummary {
  courseId: string;
  courseName: string;
  subject: string;
  chapterCount: number;
  loCount: number;
  riCount: number;
  assessmentRiCount: number;
  outputDir: string;
}

interface CourseMetaResult {
  id: string;
  name: string;
  subject: string;
  description: string;
}

interface ChapterOutlineResult {
  name: string;
  description: string;
  los: Array<{
    slug: string;
    name: string;
    description: string;
    estimatedDurationMin: number;
    difficultyBand: 'beginner' | 'intermediate' | 'advanced';
    coreExplanationMd: string;
    prerequisites: string[];        // 同章 LO slug 引用
  }>;
}

interface LoFullResult {
  commonMisconceptions: string[];
  masteryCriteria: string;
  requiredInteractions: Array<{
    explanationMd: string;
    question: {
      stem: string;
      options: string[];
      answerIndex: number;
      rationale: string;
    };
  }>;
}

interface AssessmentResult {
  name: string;
  requiredInteractions: Array<{
    explanationMd: string;
    coverLoSlug: string;
    question: {
      stem: string;
      options: string[];
      answerIndex: number;
      rationale: string;
    };
  }>;
}

interface BuiltLo {
  slug: string;
  loId: string;             // lo.<chapter-slug>.<lo-slug>
  outline: ChapterOutlineResult['los'][number];
  full: LoFullResult;
}

interface BuiltChapter {
  slug: string;             // 来自文件名,如 list_and_iter
  chapterId: string;        // ch.<slug>
  outline: ChapterOutlineResult;
  los: BuiltLo[];
  assessment: AssessmentResult;
}

@Injectable()
export class BuildService {
  private readonly logger = new Logger(BuildService.name);

  constructor(private readonly ai: AiGatewayService) {}

  async buildCourse(input: BuildInput): Promise<BuildSummary> {
    // === 0. 输入校验 ===
    const inputDir = path.resolve(input.inputDir);
    if (!existsSync(inputDir)) {
      throw new Error(`Input dir does not exist: ${inputDir}`);
    }
    const courseMdPath = path.join(inputDir, 'course.md');
    if (!existsSync(courseMdPath)) {
      throw new Error(
        `Missing ${courseMdPath}. Build expects: <inputDir>/course.md + <inputDir>/chapters/*.md`,
      );
    }
    const chaptersDir = path.join(inputDir, 'chapters');
    if (!existsSync(chaptersDir)) {
      throw new Error(`Missing ${chaptersDir}. Put one .md per chapter under chapters/`);
    }
    const chapterFiles = (await fs.readdir(chaptersDir))
      .filter((f) => f.endsWith('.md') || f.endsWith('.markdown'))
      .sort();   // 文件名前缀决定章节顺序(如 01-, 02-, 03-)
    if (chapterFiles.length === 0) {
      throw new Error(`No .md files under ${chaptersDir}`);
    }

    const courseMd = await fs.readFile(courseMdPath, 'utf8');
    this.logger.log(
      `Source OK: 1 course.md + ${chapterFiles.length} chapter file(s) — ${chapterFiles.join(', ')}`,
    );

    // === 1. AI: course meta ===
    const suggestedId = path.basename(inputDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    this.logger.log('[1/4] AI extracting course meta…');
    const meta = await this.ai.complete<CourseMetaResult>({
      templateId: 'build.course_meta',
      variables: { suggestedId, courseMd },
      callerTag: 'build:course_meta',
    });
    if (meta.id === '_FALLBACK_') {
      throw new Error(
        'AI failed extracting course meta (fallback returned). Check DEEPSEEK_API_KEY and try again.',
      );
    }
    this.logger.log(
      `[1/4] course meta: id=${meta.id} name="${meta.name}" subject=${meta.subject}`,
    );

    // === 2-4. per chapter ===
    const builtChapters: BuiltChapter[] = [];
    for (let i = 0; i < chapterFiles.length; i++) {
      const file = chapterFiles[i];
      const chapterSlug = chapterSlugFromFilename(file);
      const chapterId = `ch.${chapterSlug}`;
      const chapterMd = await fs.readFile(path.join(chaptersDir, file), 'utf8');

      this.logger.log(
        `\n[chapter ${i + 1}/${chapterFiles.length}] file=${file} slug=${chapterSlug}`,
      );

      // 2. outline
      this.logger.log(`  [2/4] AI outlining LOs…`);
      const outline = await this.ai.complete<ChapterOutlineResult>({
        templateId: 'build.chapter_outline',
        variables: { subject: meta.subject, chapterSlug, chapterMd },
        callerTag: `build:outline:${chapterSlug}`,
      });
      if (!outline.los || outline.los.length === 0) {
        throw new Error(
          `AI failed outlining chapter ${file} (returned 0 LOs). Try splitting the markdown or rerun.`,
        );
      }
      assertUniqueLoSlugs(outline.los, file);
      this.logger.log(
        `  [2/4] outlined ${outline.los.length} LO(s): ${outline.los.map((l) => l.slug).join(', ')}`,
      );

      // 3. per-LO full
      const builtLos: BuiltLo[] = [];
      const siblingNames = outline.los.map((l) => `${l.slug}: ${l.name}`).join('; ');
      for (let j = 0; j < outline.los.length; j++) {
        const lo = outline.los[j];
        this.logger.log(`  [3/4] AI generating LO ${j + 1}/${outline.los.length} (${lo.slug})…`);
        const full = await this.ai.complete<LoFullResult>({
          templateId: 'build.lo_full',
          variables: {
            subject: meta.subject,
            chapterName: outline.name,
            loName: lo.name,
            loDescription: lo.description,
            coreExplanationMd: lo.coreExplanationMd,
            siblingLoNames: siblingNames,
          },
          callerTag: `build:lo_full:${chapterSlug}.${lo.slug}`,
        });
        if (!full.requiredInteractions || full.requiredInteractions.length === 0) {
          throw new Error(
            `AI failed generating RIs for LO ${chapterSlug}.${lo.slug}. Rerun build (single chapter retry not yet supported).`,
          );
        }
        builtLos.push({
          slug: lo.slug,
          loId: `lo.${chapterSlug}.${lo.slug}`,
          outline: lo,
          full,
        });
      }

      // 4. assessment
      this.logger.log(`  [4/4] AI generating chapter assessment…`);
      const losJson = JSON.stringify(
        builtLos.map((l) => ({
          slug: l.slug,
          name: l.outline.name,
          description: l.outline.description,
          commonMisconceptions: l.full.commonMisconceptions,
        })),
        null,
        2,
      );
      const assessment = await this.ai.complete<AssessmentResult>({
        templateId: 'build.assessment',
        variables: {
          subject: meta.subject,
          chapterName: outline.name,
          chapterDescription: outline.description,
          losJson,
        },
        callerTag: `build:assessment:${chapterSlug}`,
      });
      if (!assessment.requiredInteractions || assessment.requiredInteractions.length === 0) {
        throw new Error(
          `AI failed generating assessment for chapter ${chapterSlug}. Rerun build.`,
        );
      }
      this.logger.log(
        `  [4/4] assessment: ${assessment.requiredInteractions.length} RI(s)`,
      );

      builtChapters.push({
        slug: chapterSlug,
        chapterId,
        outline,
        los: builtLos,
        assessment,
      });
    }

    // === 5. write to disk ===
    const outputDir = path.resolve(input.outputDir);
    await this.writeCourseToDisk(outputDir, meta, builtChapters, input.force);

    const loCount = builtChapters.reduce((s, c) => s + c.los.length, 0);
    const riCount = builtChapters.reduce(
      (s, c) => s + c.los.reduce((s2, l) => s2 + l.full.requiredInteractions.length, 0),
      0,
    );
    const assessmentRiCount = builtChapters.reduce(
      (s, c) => s + c.assessment.requiredInteractions.length,
      0,
    );

    return {
      courseId: meta.id,
      courseName: meta.name,
      subject: meta.subject,
      chapterCount: builtChapters.length,
      loCount,
      riCount,
      assessmentRiCount,
      outputDir,
    };
  }

  // ---------- file emission ----------

  private async writeCourseToDisk(
    outputDir: string,
    meta: CourseMetaResult,
    chapters: BuiltChapter[],
    force: boolean,
  ): Promise<void> {
    if (existsSync(outputDir)) {
      if (!force) {
        throw new Error(
          `Output dir already exists: ${outputDir}. Use --force to overwrite.`,
        );
      }
      // 整目录覆盖前先删,避免残留过时文件
      await fs.rm(outputDir, { recursive: true, force: true });
    }
    await fs.mkdir(outputDir, { recursive: true });

    // course.yaml + course-description.md
    await fs.writeFile(
      path.join(outputDir, 'course-description.md'),
      meta.description.trim() + '\n',
      'utf8',
    );
    const courseYaml = {
      id: meta.id,
      name: meta.name,
      subject: meta.subject,
      description: refTo('./course-description.md'),
      chapters: chapters.map((c) => refTo(`./chapters/${c.slug}/chapter.yaml`)),
    };
    await fs.writeFile(
      path.join(outputDir, 'course.yaml'),
      dumpYaml(courseYaml),
      'utf8',
    );

    // per-chapter
    for (const ch of chapters) {
      const chDir = path.join(outputDir, 'chapters', ch.slug);
      await fs.mkdir(path.join(chDir, 'los'), { recursive: true });
      await fs.mkdir(path.join(chDir, 'assessment'), { recursive: true });

      // description.md
      await fs.writeFile(
        path.join(chDir, 'description.md'),
        ch.outline.description.trim() + '\n',
        'utf8',
      );

      // chapter.yaml
      const chapterYaml = {
        id: ch.chapterId,
        name: ch.outline.name,
        description: refTo('./description.md'),
        learningObjectives: ch.los.map((l) =>
          refTo(`./los/${l.slug}/lo.yaml`),
        ),
        assessment: refTo('./assessment/assessment.yaml'),
      };
      await fs.writeFile(
        path.join(chDir, 'chapter.yaml'),
        dumpYaml(chapterYaml),
        'utf8',
      );

      // per-LO
      for (const lo of ch.los) {
        const loDir = path.join(chDir, 'los', lo.slug);
        await fs.mkdir(loDir, { recursive: true });

        // core-explanation.md
        await fs.writeFile(
          path.join(loDir, 'core-explanation.md'),
          lo.outline.coreExplanationMd.trim() + '\n',
          'utf8',
        );

        // 把 LO outline 中的 prereq slug 转换为完整 LO id(同章前缀)
        const fullPrereqs = lo.outline.prerequisites
          .filter((slug) => slug && slug.length > 0)
          .map((slug) => `lo.${ch.slug}.${slug}`);

        // 每个 RI 的 rationale 都外置成 .md;explanationMd 仅在非空时外置
        const requiredInteractions: Array<Record<string, unknown>> = [];
        for (let k = 0; k < lo.full.requiredInteractions.length; k++) {
          const ri = lo.full.requiredInteractions[k];
          const n = k + 1;
          const baseId = `ri.${ch.slug}.${lo.slug}.${n}`;
          await fs.writeFile(
            path.join(loDir, `ri-${n}.rationale.md`),
            ri.question.rationale.trim() + '\n',
            'utf8',
          );
          let explanationField: unknown;
          if (ri.explanationMd && ri.explanationMd.trim().length > 0) {
            await fs.writeFile(
              path.join(loDir, `ri-${n}.explanation.md`),
              ri.explanationMd.trim() + '\n',
              'utf8',
            );
            explanationField = refTo(`./ri-${n}.explanation.md`);
          } else {
            explanationField = '';
          }
          requiredInteractions.push({
            id: baseId,
            patternId: 'concept_check',
            prompt: {
              explanationMd: explanationField,
              question: {
                stem: ri.question.stem,
                options: ri.question.options,
                answerIndex: ri.question.answerIndex,
                rationale: refTo(`./ri-${n}.rationale.md`),
              },
            },
          });
        }

        const loYaml = {
          id: lo.loId,
          name: lo.outline.name,
          description: lo.outline.description,
          prerequisites: fullPrereqs,
          estimatedDurationMin: lo.outline.estimatedDurationMin,
          difficultyBand: lo.outline.difficultyBand,
          coreExplanation: refTo('./core-explanation.md'),
          commonMisconceptions: lo.full.commonMisconceptions,
          masteryCriteria: lo.full.masteryCriteria,
          requiredInteractions,
          adaptivePatterns: ['concept_check'],
        };
        await fs.writeFile(path.join(loDir, 'lo.yaml'), dumpYaml(loYaml), 'utf8');
      }

      // assessment
      const assessmentDir = path.join(chDir, 'assessment');
      const assessmentRis: Array<Record<string, unknown>> = [];
      for (let k = 0; k < ch.assessment.requiredInteractions.length; k++) {
        const ri = ch.assessment.requiredInteractions[k];
        const n = k + 1;
        const baseId = `ca.${ch.chapterId}.${n}`;   // ca.ch.<slug>.<n>,匹配现有 python-basics 命名
        await fs.writeFile(
          path.join(assessmentDir, `ca-${n}.rationale.md`),
          ri.question.rationale.trim() + '\n',
          'utf8',
        );
        let explanationField: unknown;
        if (ri.explanationMd && ri.explanationMd.trim().length > 0) {
          await fs.writeFile(
            path.join(assessmentDir, `ca-${n}.explanation.md`),
            ri.explanationMd.trim() + '\n',
            'utf8',
          );
          explanationField = refTo(`./ca-${n}.explanation.md`);
        } else {
          explanationField = '';
        }
        assessmentRis.push({
          id: baseId,
          patternId: 'concept_check',
          prompt: {
            explanationMd: explanationField,
            question: {
              stem: ri.question.stem,
              options: ri.question.options,
              answerIndex: ri.question.answerIndex,
              rationale: refTo(`./ca-${n}.rationale.md`),
            },
          },
        });
      }
      const assessmentYaml = {
        id: `ca.${ch.chapterId}`,
        name: ch.assessment.name,
        requiredInteractions: assessmentRis,
      };
      await fs.writeFile(
        path.join(assessmentDir, 'assessment.yaml'),
        dumpYaml(assessmentYaml),
        'utf8',
      );
    }
  }
}

// =================== helpers ===================

// `01-list-and-iter.md` → `list_and_iter`
// 规则:去 .md/.markdown 后缀,去前导数字+分隔符,hyphen → underscore
function chapterSlugFromFilename(file: string): string {
  let name = file.replace(/\.(md|markdown)$/i, '');
  name = name.replace(/^[\d]+[-_.\s]+/, ''); // 去前导编号
  name = name.toLowerCase();
  name = name.replace(/-/g, '_');
  name = name.replace(/[^a-z0-9_]/g, '_');
  name = name.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (name.length === 0) {
    throw new Error(`Cannot derive valid slug from filename: ${file}`);
  }
  return name;
}

function assertUniqueLoSlugs(
  los: ChapterOutlineResult['los'],
  filename: string,
): void {
  const seen = new Set<string>();
  for (const lo of los) {
    if (seen.has(lo.slug)) {
      throw new Error(
        `AI returned duplicate LO slug "${lo.slug}" in chapter ${filename}`,
      );
    }
    seen.add(lo.slug);
  }
}

// 自定义 $ref 标记 — 在 yaml dump 时用 flow style 单行展示。
// 不用 yaml tag,直接靠 dumpYaml 的 replacer 后处理。
const REF_SENTINEL = '__WT_REF__';
function refTo(target: string): { [REF_SENTINEL]: string } {
  return { [REF_SENTINEL]: target };
}

// js-yaml dump,然后把 `__WT_REF__: './x.md'` 行替换成 `{ $ref: ./x.md }` 单行 flow 形式。
// 保持跟 `whale-tutor init` 模板风格一致(已有课程都是这种 inline flow)。
function dumpYaml(obj: unknown): string {
  // 1. 把所有 refTo() 占位替换成临时字符串标记,让 yaml.dump 输出已知格式
  const transformed = transformRefsForDump(obj);
  let dumped = yaml.dump(transformed, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  // 2. 后处理:把临时标记行 `key: __WT_REF_BEGIN__./x.md__WT_REF_END__` 改成 `key: { $ref: ./x.md }`
  // 也包括纯字符串场景:某些数组项整体就是 ref(chapters: [{ $ref: ... }])
  dumped = dumped.replace(
    /__WT_REF_BEGIN__(.+?)__WT_REF_END__/g,
    (_m, target) => `{ $ref: ${target} }`,
  );
  return dumped;
}

function transformRefsForDump(node: unknown): unknown {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(transformRefsForDump);
  if (typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  if (REF_SENTINEL in obj && Object.keys(obj).length === 1) {
    // refTo() 占位 → 转成可识别的字符串,避免 yaml dump 把 $ref 解析成 anchor
    return `__WT_REF_BEGIN__${obj[REF_SENTINEL] as string}__WT_REF_END__`;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = transformRefsForDump(v);
  return out;
}
