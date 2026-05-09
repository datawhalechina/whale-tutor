// `whale-tutor init` — 在当前目录 scaffold 完整示例课程 + 配置文件模板。

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import kleur from 'kleur';
import { CONFIG_FILENAME } from './config.mjs';

const CONFIG_TEMPLATE = `\
# Whale Tutor 配置文件
# 参考:https://github.com/datawhale/whale-tutor

# 课程内容根目录(相对此配置文件所在位置)
# 该目录下每个含 course.yaml 的子目录都被视为一门课程,自动加载。
courses_dir: ./courses

# MySQL 连接 — 课程作者本机已开 MySQL
# (server 启动时若发现 schema 缺失会自动应用 db/init/01-schema.sql)
database:
  host: localhost
  port: 13306
  user: tutor
  password: tutor
  database: whale_tutor

# AI Gateway — DeepSeek (OpenAI 兼容协议)
# 留空则所有 AI 调用走 fallback 文案,不影响 e2e 但章末测试无法通过
ai:
  deepseek_api_key: ""
  deepseek_api_base_url: https://api.deepseek.com

# server 端口
server:
  port: 3000
`;

// 复制 _bundle/templates/<name>/ → targetDir/courses/<name>/,并写 config 模板。
export function scaffoldInit(templateName, targetDir, bundleRoot) {
  const templateSrc = join(bundleRoot, 'templates', templateName);
  if (!existsSync(templateSrc)) {
    console.error(
      kleur.red(
        `✗ 找不到模板 ${templateName}(查找路径 ${templateSrc})。可能 npm 包损坏,试试重装。`,
      ),
    );
    process.exit(1);
  }

  const coursesDir = join(targetDir, 'courses');
  const courseTarget = join(coursesDir, templateName);

  if (existsSync(courseTarget)) {
    console.log(kleur.yellow(`⚠ 目标目录已存在 ${courseTarget},跳过课程内容复制`));
  } else {
    mkdirSync(coursesDir, { recursive: true });
    cpSync(templateSrc, courseTarget, { recursive: true });
    console.log(kleur.green(`✓ 已生成示例课程 → ${courseTarget}`));
  }

  const configTarget = join(targetDir, CONFIG_FILENAME);
  if (existsSync(configTarget)) {
    console.log(kleur.yellow(`⚠ ${CONFIG_FILENAME} 已存在,跳过(若想重置请手动删除)`));
  } else {
    writeFileSync(configTarget, CONFIG_TEMPLATE, 'utf8');
    console.log(kleur.green(`✓ 已生成配置文件 → ${configTarget}`));
  }

  console.log();
  console.log(kleur.bold('下一步:'));
  console.log(`  1. 编辑 ${kleur.cyan(CONFIG_FILENAME)} 填入你的 mysql 连接 + DEEPSEEK_API_KEY`);
  console.log(`  2. 编辑 ${kleur.cyan(`courses/${templateName}/`)} 下的 yaml/md 修改课程内容`);
  console.log(`  3. 运行 ${kleur.bold('whale-tutor start')} 启动学习环境`);
}
