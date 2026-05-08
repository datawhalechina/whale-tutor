#!/usr/bin/env node
// commander 入口。子命令:init / start / doctor。

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import kleur from 'kleur';
import { findConfig, loadConfig } from '../lib/config.mjs';
import { ensureSchema } from '../lib/db.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { startServer } from '../lib/runner.mjs';
import { scaffoldInit } from '../lib/scaffold.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

function bundleRoot() {
  return resolve(PKG_ROOT, '_bundle');
}

function schemaFile() {
  return resolve(bundleRoot(), 'db', 'init', '01-schema.sql');
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf8'));
  return pkg.version ?? '0.0.0';
}

const program = new Command();
program
  .name('whale-tutor')
  .description(
    'Whale Tutor — AI-driven interactive Python tutor.\n课程作者用的命令行:在自己的目录写 yaml/md 内容,一键启动学习环境。',
  )
  .version(readVersion(), '-v, --version', '打印版本');

program
  .command('init')
  .description('在当前目录 scaffold 完整示例课程 + 配置文件模板。')
  .option('-t, --template <name>', 'scaffold 模板名(对应 _bundle/templates/<name>/)', 'python-basics')
  .option('--target <dir>', '目标目录,默认当前目录')
  .action((opts) => {
    const targetDir = resolve(opts.target ?? process.cwd());
    scaffoldInit(opts.template, targetDir, bundleRoot());
  });

program
  .command('start')
  .description('启动 server(自动应用 schema + serve API + serve web)。')
  .option('--no-open', 'server 就绪后不自动打开浏览器(远程开发 / 手工调试时用)')
  .action(async (opts) => {
    let configPath;
    try {
      configPath = findConfig();
    } catch (e) {
      console.error(kleur.red(`✗ ${e.message}`));
      process.exit(1);
    }

    console.log(kleur.dim(`使用配置 ${configPath}`));
    const cfg = loadConfig(configPath);

    try {
      await ensureSchema(cfg, schemaFile());
    } catch (e) {
      console.error(kleur.red(`✗ 连不上 mysql 或 schema 应用失败:${e.message}`));
      console.error(
        kleur.yellow('提示:确认配置文件里的 database 字段正确,且 mysql 在监听该端口。'),
      );
      process.exit(1);
    }

    const code = await startServer(cfg, bundleRoot(), { openBrowser: opts.open });
    process.exit(code);
  });

program
  .command('doctor')
  .description('健康检查:node 版本 / bundle 资源 / mysql 连通 / API key。')
  .action(async () => {
    let configPath;
    try {
      configPath = findConfig();
    } catch (e) {
      console.error(kleur.red(`✗ ${e.message}`));
      process.exit(1);
    }
    const cfg = loadConfig(configPath);
    await runDoctor(cfg, bundleRoot());
  });

program.parseAsync(process.argv);
