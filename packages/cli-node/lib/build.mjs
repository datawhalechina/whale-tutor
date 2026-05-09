// `whale-tutor build` — 把作者写的原始 markdown 通过 AI 转成完整 yaml/md 课程结构。
//
// 实现:spawn server 的 main.js,带:
//   WHALE_TUTOR_BUILD_MODE=1
//   WHALE_TUTOR_BUILD_INPUT=<source dir>     # 含 course.md + chapters/*.md
//   WHALE_TUTOR_BUILD_OUTPUT=<dest dir>      # 通常 cwd/courses/<source-dir-name>
//   WHALE_TUTOR_BUILD_FORCE=1                # --force 时设
//   DEEPSEEK_API_KEY=...                     # AI Gateway 必需
//
// server 端 BuildModule 跑 4 阶段 AI(course meta / chapter outline / per-LO full / per-chapter assessment)
// + 写 yaml/md 文件树。CLI 透传 stdout/stderr。

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import kleur from 'kleur';

/**
 * 跑 build。返回 exit code。
 *
 * @param {string} bundleRoot — _bundle 目录
 * @param {object} cfg — loadConfig 返回的对象
 * @param {string} sourceArg — 用户传的 source dir(可相对)
 * @param {object} opts — { output, force }
 */
export async function runBuild(bundleRoot, cfg, sourceArg, opts = {}) {
  const source = resolve(sourceArg);
  if (!existsSync(source)) {
    console.error(kleur.red(`✗ source dir does not exist: ${source}`));
    return 1;
  }
  const courseMd = join(source, 'course.md');
  const chaptersDir = join(source, 'chapters');
  if (!existsSync(courseMd)) {
    console.error(
      kleur.red(`✗ Missing ${courseMd}. Source must contain course.md + chapters/*.md`),
    );
    return 1;
  }
  if (!existsSync(chaptersDir)) {
    console.error(kleur.red(`✗ Missing chapters dir: ${chaptersDir}`));
    return 1;
  }
  const chapterFiles = readdirSync(chaptersDir).filter((f) => /\.(md|markdown)$/i.test(f));
  if (chapterFiles.length === 0) {
    console.error(kleur.red(`✗ No .md files under ${chaptersDir}`));
    return 1;
  }

  const output = opts.output
    ? (isAbsolute(opts.output) ? opts.output : resolve(opts.output))
    : join(cfg.coursesDir, basename(source));

  const serverMain = join(bundleRoot, 'server', 'dist', 'main.js');
  if (!existsSync(serverMain)) {
    console.error(
      kleur.red(`✗ 找不到 server bundle (${serverMain})。可能是 npm 包损坏,试试重装。`),
    );
    return 1;
  }

  if (!cfg.ai.deepseekApiKey) {
    console.error(
      kleur.red(
        '✗ build 必须配置 DEEPSEEK_API_KEY(在 whale-tutor.config.yaml 的 ai.deepseek_api_key,' +
          '或环境变量)。否则 AI 调用全走 fallback,无法生成内容。',
      ),
    );
    return 1;
  }

  console.log(
    kleur.dim(
      `→ AI 生成课程: ${source} → ${output}\n` +
        `  共 ${chapterFiles.length} 个章节文件。AI 调用约需 2-5 分钟,过程中会打印每章每 LO 的进度…`,
    ),
  );
  console.log();

  const child = spawn(process.execPath, [serverMain], {
    env: {
      ...process.env,
      WHALE_TUTOR_BUILD_MODE: '1',
      WHALE_TUTOR_BUILD_INPUT: source,
      WHALE_TUTOR_BUILD_OUTPUT: output,
      WHALE_TUTOR_BUILD_FORCE: opts.force ? '1' : '0',
      DEEPSEEK_API_KEY: cfg.ai.deepseekApiKey,
      DEEPSEEK_API_BASE_URL: cfg.ai.deepseekApiBaseUrl,
    },
    cwd: dirname(serverMain),
    stdio: 'inherit',
  });

  const code = await new Promise((resolveExit) => {
    child.on('exit', (c) => resolveExit(c ?? 0));
  });

  console.log();
  if (code === 0) {
    console.log(kleur.green().bold('✓ 课程生成成功') + kleur.dim(` → ${output}`));
    console.log(
      kleur.dim('  下一步:`whale-tutor lint` 校验,然后 `whale-tutor start` 试学。'),
    );
  } else {
    console.log(
      kleur.red().bold(`✗ build 失败(server exit ${code})`) +
        kleur.dim(' — 上方日志含具体原因'),
    );
  }
  return code;
}
