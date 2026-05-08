import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import * as path from 'node:path';
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

// __dirname 在开发期(ts-node)指向 src/knowledge/, 生产期(node dist)指向 dist/knowledge/。
// nest-cli.json 的 assets 配置确保 build 时 data/ 也被复制到 dist/knowledge/data/。
const COURSES_DIR = path.join(__dirname, 'data');

// v0 仅一门课。后续扩 SQL/Pandas 等只需追加 id。
const COURSE_IDS = ['python-basics'] as const;

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

  async onModuleInit(): Promise<void> {
    for (const courseId of COURSE_IDS) {
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
        }
      }
      if (chapter.assessment) {
        this.assessmentIndex.set(chapter.assessment.id, {
          assessment: chapter.assessment,
          chapter,
        });
        for (const ri of chapter.assessment.requiredInteractions) {
          this.riIndex.set(ri.id, ri);
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
