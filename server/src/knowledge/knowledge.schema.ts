import Ajv, { type ErrorObject } from 'ajv';
import type { CourseDefinition } from '@whale-tutor/tutor-types';

// ajv 实例。strict: false 是因为我们用了 if/then 条件 schema,strict 模式会对一些
// 边界情况报警告（如 if 内字段是 properties 的子集时）。allErrors: true 收集全部错误便于一次性修。
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * CourseDefinition 的 JSON Schema。
 * 与 packages/tutor-types/src/domain.ts 中的 *Definition 系列对齐。
 * additionalProperties: false 让 YAML 中多余字段直接报错（避免拼写错误悄悄通过）。
 */
const courseSchema = {
  type: 'object',
  required: ['id', 'name', 'subject', 'description', 'chapters'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    // 学科名,作 AI prompt 的 {{subject}} 变量。例 "Python" / "SQL"
    subject: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    chapters: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/chapter' },
    },
  },
  definitions: {
    chapter: {
      type: 'object',
      required: ['id', 'name', 'description', 'learningObjectives', 'assessment'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        learningObjectives: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/lo' },
        },
        // assessment 允许 null（部分章节可能没有章末测试,但 v0 都有）
        assessment: {
          oneOf: [{ type: 'null' }, { $ref: '#/definitions/assessment' }],
        },
      },
    },
    lo: {
      type: 'object',
      required: [
        'id',
        'name',
        'description',
        'prerequisites',
        'estimatedDurationMin',
        'difficultyBand',
        'coreExplanation',
        'commonMisconceptions',
        'masteryCriteria',
        'requiredInteractions',
        'adaptivePatterns',
      ],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        prerequisites: { type: 'array', items: { type: 'string' } },
        weakPrerequisites: { type: 'array', items: { type: 'string' } },
        estimatedDurationMin: { type: 'number', minimum: 1 },
        difficultyBand: { enum: ['beginner', 'intermediate', 'advanced'] },
        coreExplanation: { type: 'string' },
        commonMisconceptions: { type: 'array', items: { type: 'string' } },
        masteryCriteria: { type: 'string' },
        requiredInteractions: {
          type: 'array',
          items: { $ref: '#/definitions/requiredInteraction' },
        },
        adaptivePatterns: {
          type: 'array',
          items: { $ref: '#/definitions/patternId' },
        },
      },
    },
    assessment: {
      type: 'object',
      required: ['id', 'name', 'requiredInteractions'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        requiredInteractions: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/requiredInteraction' },
        },
      },
    },
    // RequiredInteraction 是 discriminated union by patternId。
    // 这里用 if/then 分发 prompt 子 schema,错误信息更精准。
    requiredInteraction: {
      type: 'object',
      required: ['id', 'patternId', 'prompt'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        patternId: { $ref: '#/definitions/patternId' },
        prompt: { type: 'object' },
        // 静态梯度提示。作者可填 1-5 级,缺省走 AI 兜底生成 3 级。
        // 上限 5 防滥用。半填(只写 0 元素)等价缺省。
        hints: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { type: 'string', minLength: 1 },
        },
        note: { type: 'string' },
      },
      allOf: [
        {
          if: { properties: { patternId: { const: 'concept_check' } } },
          then: { properties: { prompt: { $ref: '#/definitions/conceptCheckPrompt' } } },
        },
        {
          if: { properties: { patternId: { const: 'code_sandbox' } } },
          then: { properties: { prompt: { $ref: '#/definitions/codeSandboxPrompt' } } },
        },
        {
          if: { properties: { patternId: { const: 'spot_the_bug' } } },
          then: { properties: { prompt: { $ref: '#/definitions/spotTheBugPrompt' } } },
        },
        {
          if: { properties: { patternId: { const: 'free_recall' } } },
          then: { properties: { prompt: { $ref: '#/definitions/freeRecallPrompt' } } },
        },
      ],
    },
    patternId: {
      enum: ['concept_check', 'code_sandbox', 'spot_the_bug', 'free_recall'],
    },
    conceptCheckPrompt: {
      type: 'object',
      required: ['explanationMd', 'question'],
      additionalProperties: false,
      properties: {
        explanationMd: { type: 'string' },
        question: {
          type: 'object',
          required: ['stem', 'options', 'answerIndex', 'rationale'],
          additionalProperties: false,
          properties: {
            stem: { type: 'string', minLength: 1 },
            options: { type: 'array', items: { type: 'string' }, minItems: 2 },
            answerIndex: { type: 'integer', minimum: 0 },
            rationale: { type: 'string' },
          },
        },
      },
    },
    codeSandboxPrompt: {
      type: 'object',
      required: ['promptMd', 'starterCode', 'testCases'],
      additionalProperties: false,
      properties: {
        promptMd: { type: 'string' },
        starterCode: { type: 'string' },
        testCases: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/codeTestCase' },
        },
        hiddenTestCases: {
          type: 'array',
          items: { $ref: '#/definitions/codeTestCase' },
        },
      },
    },
    codeTestCase: {
      type: 'object',
      required: ['setupCode', 'expectedOutput'],
      additionalProperties: false,
      properties: {
        description: { type: 'string' },
        setupCode: { type: 'string' },
        expectedOutput: { type: 'string' },
      },
    },
    spotTheBugPrompt: {
      type: 'object',
      required: ['buggyCode', 'bugLocations', 'correctExplanation'],
      additionalProperties: false,
      properties: {
        buggyCode: { type: 'string' },
        bugLocations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['line', 'kind'],
            additionalProperties: false,
            properties: {
              line: { type: 'integer', minimum: 1 },
              kind: { type: 'string' },
            },
          },
        },
        correctExplanation: { type: 'string' },
        hintMd: { type: 'string' },
      },
    },
    freeRecallPrompt: {
      type: 'object',
      required: ['promptMd', 'rubricKeyPoints'],
      additionalProperties: false,
      properties: {
        promptMd: { type: 'string' },
        rubricKeyPoints: { type: 'array', minItems: 1, items: { type: 'string' } },
      },
    },
  },
} as const;

const validateFn = ajv.compile(courseSchema);

export class CourseValidationError extends Error {
  constructor(
    public readonly errors: ReadonlyArray<ErrorObject>,
    public readonly courseId: string,
  ) {
    super(`Course '${courseId}' failed schema validation:${formatErrors(errors)}`);
  }
}

function formatErrors(errors: ReadonlyArray<ErrorObject>): string {
  if (!errors || errors.length === 0) return '';
  return errors
    .map((e) => {
      const path = e.instancePath || '(root)';
      const params = e.params ? ` ${JSON.stringify(e.params)}` : '';
      return `\n  - ${path} ${e.message}${params}`;
    })
    .join('');
}

export function validateCourseDefinition(data: unknown, courseId: string): CourseDefinition {
  if (!validateFn(data)) {
    throw new CourseValidationError(validateFn.errors ?? [], courseId);
  }
  return data as CourseDefinition;
}
