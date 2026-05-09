// 内容验证 helper：快速校验 server/src/knowledge/data/ 下的 YAML + .md 能加载并通过 schema 校验。
// 改完课程内容后跑一次确认,不需要起整个 server。
//
// 用法（在 server/ 目录下）：
//   node scripts/verify-knowledge.js
//
// 注意：依赖 dist/。改完源 .ts 需要先 `pnpm build`;改 .yaml/.md 内容由于
// nest-cli.json 的 watchAssets 在 dev 期会自动同步,但用此脚本前最好 build 一次。

require('reflect-metadata');
const path = require('node:path');
const { loadCourse } = require('../dist/knowledge/knowledge.loader');
const { validateCourseDefinition } = require('../dist/knowledge/knowledge.schema');

const COURSE_IDS = ['python-basics'];

(async () => {
  let totalLos = 0;
  let totalRis = 0;
  let totalAssessments = 0;

  for (const courseId of COURSE_IDS) {
    const dir = path.join(__dirname, '..', 'dist', 'knowledge', 'data', courseId);
    let raw;
    try {
      raw = await loadCourse(dir);
    } catch (err) {
      console.error(`[load failed] ${courseId}: ${err.message}`);
      process.exit(1);
    }

    let course;
    try {
      course = validateCourseDefinition(raw, courseId);
    } catch (err) {
      console.error(`[schema failed] ${err.message}`);
      process.exit(1);
    }

    console.log(`✓ ${course.id} — ${course.name}`);
    for (const ch of course.chapters) {
      console.log(
        `  ▸ ${ch.id} — ${ch.name} (${ch.learningObjectives.length} LO${ch.learningObjectives.length !== 1 ? 's' : ''})`,
      );
      for (const lo of ch.learningObjectives) {
        totalLos += 1;
        totalRis += lo.requiredInteractions.length;
        const sample = lo.requiredInteractions[0];
        const sampleStat = sample
          ? `${sample.patternId}; first ri prompt sample: ${sampleStatString(sample)}`
          : '(no required interactions)';
        console.log(
          `    • ${lo.id} — ${lo.requiredInteractions.length} required ri; ${sampleStat}`,
        );
      }
      if (ch.assessment) {
        totalAssessments += 1;
        totalRis += ch.assessment.requiredInteractions.length;
        const sample = ch.assessment.requiredInteractions[0];
        console.log(
          `    ★ assessment ${ch.assessment.id} — ${ch.assessment.requiredInteractions.length} required ri${sample ? ` (${sample.patternId})` : ''}`,
        );
      }
    }
  }

  console.log(
    `\nSummary: ${COURSE_IDS.length} course(s), ${totalLos} LO(s), ${totalAssessments} assessment(s), ${totalRis} required interaction(s)`,
  );
})().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

function sampleStatString(ri) {
  switch (ri.patternId) {
    case 'concept_check': {
      const q = ri.prompt && ri.prompt.question;
      return `explanation=${ri.prompt.explanationMd.length}c, options=${q ? q.options.length : '?'}`;
    }
    case 'code_sandbox':
      return `prompt=${ri.prompt.promptMd.length}c, testCases=${ri.prompt.testCases.length}`;
    case 'spot_the_bug':
      return `buggyCode=${ri.prompt.buggyCode.length}c, bugLocations=${ri.prompt.bugLocations.length}`;
    case 'free_recall':
      return `prompt=${ri.prompt.promptMd.length}c, rubric=${ri.prompt.rubricKeyPoints.length}`;
    default:
      return '?';
  }
}
