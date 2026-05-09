// `whale-tutor lint` — 校验当前目录的课程结构是否合法。
//
// 实现:spawn server 的 main.js,带 WHALE_TUTOR_VALIDATE_ONLY=1 + WHALE_TUTOR_COURSES_DIR。
// server 只 boot KnowledgeModule(不连 mysql / 不起 web),走完 ajv 校验后 exit:
//   - exit 0  → 通过
//   - exit 非0 → 失败,stderr 含 CourseValidationError 详情
// CLI 把 server 的 stdout/stderr 透传给学习者,自己只加最后一行总结。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import kleur from 'kleur';

/**
 * 跑 lint。返回 exit code。
 *
 * @param {string} bundleRoot — _bundle 目录
 * @param {string} coursesDir — 用户的课程目录(绝对路径)
 */
export async function runLint(bundleRoot, coursesDir) {
  const serverMain = join(bundleRoot, 'server', 'dist', 'main.js');
  if (!existsSync(serverMain)) {
    console.error(
      kleur.red(`✗ 找不到 server bundle (${serverMain})。可能是 npm 包损坏,试试重装。`),
    );
    return 1;
  }

  console.log(kleur.dim(`→ 校验课程目录 ${coursesDir}…`));
  console.log();

  const child = spawn(process.execPath, [serverMain], {
    env: {
      ...process.env,
      WHALE_TUTOR_VALIDATE_ONLY: '1',
      WHALE_TUTOR_COURSES_DIR: coursesDir,
    },
    cwd: dirname(serverMain),
    stdio: 'inherit',
  });

  const code = await new Promise((resolveExit) => {
    child.on('exit', (c) => resolveExit(c ?? 0));
  });

  console.log();
  if (code === 0) {
    console.log(kleur.green().bold('✓ 课程结构合法'));
  } else {
    console.log(
      kleur.red().bold(`✗ 课程结构有问题(server exit ${code})`) +
        kleur.dim(' — 上方日志含具体 yaml 路径与字段错误'),
    );
  }
  return code;
}
