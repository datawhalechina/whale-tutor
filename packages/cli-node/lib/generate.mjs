// `whale-tutor generate` — 交互式问答 → AI 生成完整课程(含 markdown 讲稿)。
//
// 比 `whale-tutor build` 更上层:用户不用先手写 course.md / chapters/*.md。
// 流程:
//   1. CLI 交互式问几个问题(课程名 / 模式(ai/manual)/ 章节数 / 受众)
//   2. ai 模式:把输入序列化到 temp JSON,spawn server with WHALE_TUTOR_GENERATE_MODE=1
//      server 跑 GenerateService:AI 写 outline → AI 逐章扩写讲稿 → 自动跑 build
//   3. manual 模式:scaffold 一个最小源目录(course.md + chapters/01-introduction.md
//      占位),提示用户编辑后跑 `whale-tutor build`

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { stdin as input, stdout as output } from 'node:process';
import kleur from 'kleur';

// 简单的交互式问答 — 用 node:readline/promises (内置,零 dep)
async function ask(prompt, { defaultValue = '' } = {}) {
  const rl = createInterface({ input, output });
  const hint = defaultValue ? kleur.dim(` [默认: ${defaultValue}]`) : '';
  const answer = (await rl.question(`${kleur.cyan('?')} ${prompt}${hint}: `)).trim();
  rl.close();
  return answer || defaultValue;
}

// 选择题 — 上下方向键切换 + Enter 确认。零依赖,基于 node:readline 的 keypress 事件。
// 非 TTY 环境(管道输入 / 没有终端)自动 fallback 到默认选项。
async function askChoice(prompt, options, defaultIndex = 0) {
  // 非 TTY → 直接用默认值,避免在 CI / 重定向场景死循环
  if (!input.isTTY) {
    console.log(
      `${kleur.cyan('?')} ${prompt} ${kleur.dim(`(non-TTY,使用默认 ${options[defaultIndex].key})`)}`,
    );
    return options[defaultIndex].key;
  }

  return new Promise((resolveSelect) => {
    let idx = defaultIndex;
    let firstRender = true;

    const render = () => {
      // 二次渲染前先把上次的输出抹掉(question 1 行 + 每个选项 1 行 + 提示 1 行)
      if (!firstRender) {
        const linesToErase = options.length + 2;
        for (let i = 0; i < linesToErase; i++) {
          process.stdout.write('\x1B[1A\x1B[2K'); // 上移 1 行 + 清除该行
        }
      }
      firstRender = false;

      // 题目
      process.stdout.write(`${kleur.cyan('?')} ${prompt}\n`);
      // 选项列表
      options.forEach((o, i) => {
        const cursor = i === idx ? kleur.cyan('❯') : ' ';
        const label = i === idx ? kleur.cyan().bold(o.label) : kleur.dim(o.label);
        process.stdout.write(`  ${cursor} ${label}\n`);
      });
      // 操作提示
      process.stdout.write(kleur.dim('  使用 ↑/↓ 切换,Enter 确认,Ctrl+C 取消\n'));
    };

    readline.emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    process.stdout.write('\x1B[?25l'); // 隐藏光标

    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === 'up' || (key.name === 'k' && !key.ctrl)) {
        idx = (idx - 1 + options.length) % options.length;
        render();
      } else if (key.name === 'down' || (key.name === 'j' && !key.ctrl)) {
        idx = (idx + 1) % options.length;
        render();
      } else if (key.name === 'return') {
        cleanup();
        // Enter 后输出当前选中,固定下来
        process.stdout.write(kleur.dim(`  ✓ 已选: ${kleur.cyan(options[idx].label)}\n`));
        resolveSelect(options[idx].key);
      } else if (key.ctrl && key.name === 'c') {
        cleanup();
        process.stdout.write('\n' + kleur.yellow('已取消\n'));
        process.exit(130);
      }
    };

    const cleanup = () => {
      input.off('keypress', onKey);
      if (input.isTTY) input.setRawMode(false);
      process.stdout.write('\x1B[?25h'); // 恢复光标
      input.pause();
    };

    input.on('keypress', onKey);
    input.resume();
    render();
  });
}

// 把课程名转成 kebab-case slug 当默认 course id
function slugFromName(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/[一-龥]+/g, 'course') // 中文字符 fallback,AI 会重新决定
      .replace(/^-+|-+$/g, '') || 'my-course'
  );
}

// scaffold 用 — 最小化的可编辑源目录占位
function manualScaffold(targetDir, courseName) {
  if (existsSync(targetDir)) {
    console.error(kleur.red(`✗ 目标目录已存在 ${targetDir},请先删掉或换个 course 名`));
    return 1;
  }
  mkdirSync(join(targetDir, 'chapters'), { recursive: true });

  writeFileSync(
    join(targetDir, 'course.md'),
    `# ${courseName}\n\n` +
      `[在这里写课程介绍 — 1-3 段说清这门课讲什么、目标受众是谁、学完能做到什么]\n`,
    'utf8',
  );
  writeFileSync(
    join(targetDir, 'chapters', '01-introduction.md'),
    `# 第一章:简介\n\n` +
      `[在这里写第一章的完整 markdown 讲稿 — 推荐 2000-3500 字,含代码示例 + 易错点段落]\n\n` +
      `## 章节结构建议\n\n` +
      `- 用 \`##\` 分主话题(3-5 个)\n` +
      `- 每个话题展开:动机 → 概念 → 代码示例 → 对比/易错点\n` +
      `- 至少 1-2 段"### ⚠️ 常见误解" — 后续 build 拆 LO 时会从这里抽 commonMisconceptions\n`,
    'utf8',
  );
  writeFileSync(
    join(targetDir, 'chapters', '02-second-topic.md'),
    `# 第二章:[主题名]\n\n[同 01-introduction.md 结构]\n`,
    'utf8',
  );

  console.log();
  console.log(kleur.green(`✓ 已创建源目录骨架 → ${targetDir}`));
  console.log(`  ${join(targetDir, 'course.md')}`);
  console.log(`  ${join(targetDir, 'chapters/01-introduction.md')}`);
  console.log(`  ${join(targetDir, 'chapters/02-second-topic.md')}`);
  console.log();
  console.log(kleur.bold('下一步:'));
  console.log(`  1. 用编辑器打开 ${kleur.cyan(targetDir)},编辑 course.md + 各章 md`);
  console.log(`     - 一份 md = 一章;文件名前缀(01- / 02- ...)决定章节顺序`);
  console.log(`     - 推荐每章 2000-3500 字,含 3-8 个代码块 + 易错点段落`);
  console.log(`  2. 跑 ${kleur.bold(`whale-tutor build ${targetDir}`)} 让 AI 拆 LO + 出题`);
  console.log(`  3. 跑 ${kleur.bold('whale-tutor lint && whale-tutor start')} 试学`);
  return 0;
}

export async function runGenerate(bundleRoot, cfg) {
  const serverMain = join(bundleRoot, 'server', 'dist', 'main.js');
  if (!existsSync(serverMain)) {
    console.error(kleur.red(`✗ 找不到 server bundle (${serverMain}),npm 包损坏请重装`));
    return 1;
  }

  console.log(kleur.bold('Whale Tutor — 课程生成向导'));
  console.log(kleur.dim('  以下问题决定要生成什么样的课程。括号内是默认值,直接回车采用。'));
  console.log();

  // === 交互问答 ===
  const courseName = await ask('课程名字(中文 OK,如 "Pandas 数据分析入门")');
  if (!courseName) {
    console.error(kleur.red('✗ 课程名字必填'));
    return 1;
  }

  const mode = await askChoice('生成方式', [
    { key: 'ai', label: 'AI 自动写讲稿(推荐 — 一条命令出完整课程)' },
    { key: 'manual', label: '我自己写 markdown(scaffold 占位 + 走 build)' },
  ]);

  // 默认 sourceDir 名(用户可改)。AI 模式会在 server 端被 outline 的 courseId 覆写,
  // 但这里先有个本地路径供存放 / 提示。
  const defaultSlug = slugFromName(courseName);
  const sourceDir = resolve(cfg.coursesDir, '..', `${defaultSlug}-source`);
  // outputDir 默认 <coursesDir>/<courseId> — 但 courseId AI 算完才知道,
  // 所以先用 defaultSlug 占位,GenerateService 跑完 outline 后实际会用 outline.courseId 重定向
  const outputDir = resolve(cfg.coursesDir, defaultSlug);

  if (mode === 'manual') {
    console.log();
    return manualScaffold(sourceDir, courseName);
  }

  // === AI 模式 ===
  if (!cfg.ai.deepseekApiKey) {
    console.error(
      kleur.red(
        '\n✗ AI 模式必须配置 DEEPSEEK_API_KEY(在 whale-tutor.config.yaml 的 ai.deepseek_api_key)',
      ),
    );
    console.error(kleur.dim('  申请: https://platform.deepseek.com/api_keys'));
    return 1;
  }

  const topic = await ask('课程主题/范围(可选,留空 AI 从课程名推断)', {
    defaultValue: '',
  });
  const audience = await ask('目标受众(可选,如 "数据分析新手")', {
    defaultValue: '',
  });
  const chapterCountRaw = await ask('章节数(留空 AI 自己定;一般 3-7)', {
    defaultValue: 'auto',
  });
  const chapterCountHint = /^\d+$/.test(chapterCountRaw) ? chapterCountRaw : 'auto';

  let force = false;
  if (existsSync(sourceDir) || existsSync(outputDir)) {
    const overwrite = await askChoice(
      `检测到已存在 ${existsSync(sourceDir) ? sourceDir : outputDir},覆盖吗?`,
      [
        { key: 'n', label: '否(中止)' },
        { key: 'y', label: '是(整目录覆盖)' },
      ],
      0,
    );
    if (overwrite === 'n') {
      console.log(kleur.yellow('已取消'));
      return 0;
    }
    force = true;
  }

  // 把 input 序列化到 temp JSON
  const tmpDir = mkdtempSync(join(tmpdir(), 'whale-tutor-generate-'));
  const inputJsonPath = join(tmpDir, 'input.json');
  const generateInput = {
    courseName,
    topic,
    audience,
    chapterCountHint,
    sourceDir,
    outputDir,
    force,
  };
  writeFileSync(inputJsonPath, JSON.stringify(generateInput, null, 2), 'utf8');

  console.log();
  console.log(kleur.dim(`→ 开始 AI 生成(预计 2-5 分钟,逐章打印进度)`));
  console.log(kleur.dim(`  source markdown → ${sourceDir}`));
  console.log(kleur.dim(`  built course    → ${outputDir}`));
  console.log();

  const child = spawn(process.execPath, [serverMain], {
    env: {
      ...process.env,
      WHALE_TUTOR_GENERATE_MODE: '1',
      WHALE_TUTOR_GENERATE_INPUT: inputJsonPath,
      DEEPSEEK_API_KEY: cfg.ai.deepseekApiKey,
      DEEPSEEK_API_BASE_URL: cfg.ai.deepseekApiBaseUrl,
    },
    stdio: 'inherit',
  });

  const code = await new Promise((resolveExit) => {
    child.on('exit', (c) => resolveExit(c ?? 0));
  });

  // 清理 temp(无论成败)
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 忽略 — 系统会在重启时清理
  }

  console.log();
  if (code === 0) {
    console.log(kleur.green().bold('✓ 课程生成成功'));
    console.log(kleur.dim('  下一步:'));
    console.log(kleur.dim('    1. 看一下 source markdown,不满意可以手改后重跑 whale-tutor build'));
    console.log(kleur.dim('    2. whale-tutor lint && whale-tutor start 试学'));
  } else {
    console.log(
      kleur.red().bold(`✗ generate 失败(server exit ${code})`) + kleur.dim(' — 上方日志含具体原因'),
    );
  }
  return code;
}
