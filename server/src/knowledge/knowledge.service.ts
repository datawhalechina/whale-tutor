import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type {
  Chapter,
  ChapterAssessmentDefinition,
  ChapterAssessmentSummary,
  ChapterDefinition,
  Course,
  CourseDefinition,
  LearningObjective,
  LearningObjectiveDefinition,
  RequiredInteraction,
} from '@whale-tutor/tutor-types';
import { loadCourse } from './knowledge.loader';
import { validateCourseDefinition } from './knowledge.schema';

// 课程数据根目录的解析顺序:
//   1. WHALE_TUTOR_COURSES_DIR 环境变量(CLI 模式 — `whale-tutor` 把课程作者本地目录传进来)
//   2. fallback 到 __dirname/data(monorepo dev 模式 — 内置 python-basics)
// __dirname 在开发期(ts-node)指向 src/knowledge/, 生产期(node dist)指向 dist/knowledge/。
// nest-cli.json 的 assets 配置确保 build 时 data/ 也被复制到 dist/knowledge/data/。
const COURSES_DIR = process.env.WHALE_TUTOR_COURSES_DIR || path.join(__dirname, 'data');

interface LoIndexEntry {
  lo: LearningObjectiveDefinition;
  chapter: ChapterDefinition;
  course: CourseDefinition;
}

interface AssessmentIndexEntry {
  assessment: ChapterAssessmentDefinition;
  chapter: ChapterDefinition;
}

@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly courses = new Map<string, CourseDefinition>();
  private readonly loIndex = new Map<string, LoIndexEntry>();
  private readonly riIndex = new Map<string, RequiredInteraction>();
  private readonly assessmentIndex = new Map<string, AssessmentIndexEntry>();
  // ri id → 拥有它的 LO(章末测试的 RI 不进此索引,因为不属于 LO)
  private readonly riOwnerLoIndex = new Map<string, LearningObjectiveDefinition>();

  async onModuleInit(): Promise<void> {
    this.logger.log(`Scanning courses from ${COURSES_DIR}`);
    const courseIds = await discoverCourseIds(COURSES_DIR);
    if (courseIds.length === 0) {
      this.logger.warn(
        `No courses found under ${COURSES_DIR}. A valid course must be a subdirectory containing course.yaml.`,
      );
    }
    for (const courseId of courseIds) {
      await this.loadCourseFromDisk(courseId);
    }
    this.logger.log(
      `Loaded ${this.courses.size} course(s), ${this.loIndex.size} LO(s), ${this.riIndex.size} RequiredInteraction(s), ${this.assessmentIndex.size} ChapterAssessment(s)`,
    );
  }

  private async loadCourseFromDisk(courseId: string): Promise<void> {
    const courseDir = path.join(COURSES_DIR, courseId);
    let raw: unknown;
    try {
      raw = await loadCourse(courseDir);
    } catch (err) {
      throw new Error(
        `Failed loading course '${courseId}' from ${courseDir}: ${(err as Error).message}`,
      );
    }
    const course = validateCourseDefinition(raw, courseId);
    this.courses.set(course.id, course);
    this.indexCourse(course);
  }

  private indexCourse(course: CourseDefinition): void {
    for (const chapter of course.chapters) {
      for (const lo of chapter.learningObjectives) {
        this.loIndex.set(lo.id, { lo, chapter, course });
        for (const ri of lo.requiredInteractions) {
          this.riIndex.set(ri.id, ri);
          this.riOwnerLoIndex.set(ri.id, lo);
        }
      }
      if (chapter.assessment) {
        this.assessmentIndex.set(chapter.assessment.id, {
          assessment: chapter.assessment,
          chapter,
        });
        for (const ri of chapter.assessment.requiredInteractions) {
          this.riIndex.set(ri.id, ri);
          // 章末测试 RI 不归属任何 LO,不进 riOwnerLoIndex
        }
      }
    }
  }

  // ===== Server-internal API（含 server-only 字段） =====

  getCourseDefinition(courseId: string): CourseDefinition {
    const c = this.courses.get(courseId);
    if (!c) throw new NotFoundException(`Course not found: ${courseId}`);
    return c;
  }

  getLoDefinition(loId: string): LearningObjectiveDefinition {
    const e = this.loIndex.get(loId);
    if (!e) throw new NotFoundException(`LO not found: ${loId}`);
    return e.lo;
  }

  getChapterByLoId(loId: string): ChapterDefinition {
    const e = this.loIndex.get(loId);
    if (!e) throw new NotFoundException(`LO not found: ${loId}`);
    return e.chapter;
  }

  getRequiredInteraction(riId: string): RequiredInteraction {
    const ri = this.riIndex.get(riId);
    if (!ri) throw new NotFoundException(`RequiredInteraction not found: ${riId}`);
    return ri;
  }

  /**
   * RI 所在的 LO。章末测试的 RI 不属于任何 LO,返 null。
   * Hint 生成时需要 LO 上下文(loName / commonMisconceptions)。
   */
  getOwningLoOfRi(riId: string): LearningObjectiveDefinition | null {
    return this.riOwnerLoIndex.get(riId) ?? null;
  }

  /**
   * 取 LO 所在课程的 subject(如 "Python" / "SQL")。
   * 给 AI prompt 的 {{subject}} 变量,让 prompt 不依赖 hardcoded 学科。
   */
  getSubjectByLoId(loId: string): string {
    const e = this.loIndex.get(loId);
    if (!e) throw new NotFoundException(`LO not found: ${loId}`);
    return e.course.subject;
  }

  /**
   * 取 RI 所在课程的 subject。RI 可能在 LO 内或章末测试内。
   * 章末测试的 RI 通过 chapter.assessment → chapter → 找到 course。
   */
  getSubjectByRiId(riId: string): string {
    // 先查 LO-内的 RI
    const lo = this.riOwnerLoIndex.get(riId);
    if (lo) return this.getSubjectByLoId(lo.id);
    // 章末测试的 RI:扫一遍 assessmentIndex 找 owning chapter,再取 course.subject
    for (const entry of this.assessmentIndex.values()) {
      if (entry.assessment.requiredInteractions.some((ri) => ri.id === riId)) {
        // 找 chapter 所在 course(loIndex 任一 LO 同 chapter 都行)
        const sampleLo = entry.chapter.learningObjectives[0];
        if (sampleLo) return this.getSubjectByLoId(sampleLo.id);
      }
    }
    throw new NotFoundException(`RequiredInteraction not found: ${riId}`);
  }

  getChapterAssessmentDefinition(assessmentId: string): ChapterAssessmentDefinition {
    const e = this.assessmentIndex.get(assessmentId);
    if (!e) throw new NotFoundException(`ChapterAssessment not found: ${assessmentId}`);
    return e.assessment;
  }

  // ===== HTTP-public API（去除 server-only 字段） =====

  getCourse(courseId: string): Course {
    return toPublicCourse(this.getCourseDefinition(courseId));
  }

  getLearningObjective(loId: string): LearningObjective {
    return toPublicLo(this.getLoDefinition(loId));
  }

  // HomeView 课程选择器用 — 列所有已加载课程的轻量摘要
  listCourseSummaries(): Array<{
    id: string;
    name: string;
    description: string;
    chapterCount: number;
    loCount: number;
  }> {
    return Array.from(this.courses.values()).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      chapterCount: c.chapters.length,
      loCount: c.chapters.reduce((sum, ch) => sum + ch.learningObjectives.length, 0),
    }));
  }
}

// ===== Definition → Public 转换 =====

function toPublicCourse(def: CourseDefinition): Course {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    chapters: def.chapters.map(toPublicChapter),
  };
}

function toPublicChapter(def: ChapterDefinition): Chapter {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    learningObjectives: def.learningObjectives.map(toPublicLo),
    assessment: def.assessment ? toPublicAssessment(def.assessment) : null,
  };
}

function toPublicLo(def: LearningObjectiveDefinition): LearningObjective {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    prerequisites: def.prerequisites,
    weakPrerequisites: def.weakPrerequisites,
    estimatedDurationMin: def.estimatedDurationMin,
    difficultyBand: def.difficultyBand,
    masteryCriteria: def.masteryCriteria,
    requiredInteractionCount: def.requiredInteractions.length,
    adaptivePatterns: def.adaptivePatterns,
    // commonMisconceptions 仍 server-only(出题灵感,不下发);coreExplanation 改公开
    coreExplanationMd: def.coreExplanation,
  };
}

function toPublicAssessment(def: ChapterAssessmentDefinition): ChapterAssessmentSummary {
  return {
    id: def.id,
    name: def.name,
    requiredInteractionCount: def.requiredInteractions.length,
  };
}

// 扫描 coursesDir 下所有"含 course.yaml 的子目录",返回 courseId(目录名)列表。
// pip 包模式下,课程作者把多个课程放在 courses/ 目录里,我们自动发现而不需要他们改代码。
async function discoverCourseIds(coursesDir: string): Promise<string[]> {
  if (!existsSync(coursesDir)) {
    return [];
  }
  const entries = await fs.readdir(coursesDir, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const courseYaml = path.join(coursesDir, entry.name, 'course.yaml');
    if (existsSync(courseYaml)) {
      ids.push(entry.name);
    }
  }
  // 稳定的排序,让多课程加载顺序可预期
  ids.sort();
  return ids;
}
