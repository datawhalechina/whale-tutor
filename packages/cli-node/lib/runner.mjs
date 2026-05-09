// spawn node server + 信号转发(Ctrl+C 优雅退出) + ready 后自动开浏览器。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import kleur from 'kleur';
import { toEnv } from './config.mjs';

// 轮询 :port 直到能 connect 上,然后(若 openBrowser)用平台默认浏览器打开。
// 探测成功才打印 "✓ Server 就绪" — 之前用户不该访问 URL(会 connection refused)。
async function waitForReady(port, { openBrowser, timeoutMs = 30000 }) {
  const deadline = Date.now() + timeoutMs;
  const probe = () =>
    new Promise((resolveProbe) => {
      const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
        sock.end();
        resolveProbe(true);
      });
      sock.on('error', () => resolveProbe(false));
      sock.setTimeout(500, () => {
        sock.destroy();
        resolveProbe(false);
      });
    });

  while (Date.now() < deadline) {
    if (await probe()) {
      // 给 nest 路由再一点点时间(server listen != routes ready)
      await new Promise((r) => setTimeout(r, 300));
      const url = `http://localhost:${port}`;
      console.log('\n' + kleur.green().bold(`✓ Server 就绪`) + kleur.dim(`  → ${url}`));
      if (openBrowser) {
        console.log(kleur.dim(`  浏览器自动打开中…(没弹出请手工访问上面 URL)`));
        const opener =
          process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '""', url]]
            : process.platform === 'darwin'
              ? ['open', [url]]
              : ['xdg-open', [url]];
        try {
          spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref();
        } catch {
          // 没装 xdg-open 等场景:静默放弃,日志里有 url
        }
      } else {
        console.log(kleur.dim(`  --no-open 已设,请手工访问上面 URL`));
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  // 探测超时 — server 可能没起来或卡在初始化(连不上 mysql / 找不到 web bundle 等)
  console.log(
    '\n' +
      kleur.yellow(
        `⚠ 等了 ${timeoutMs / 1000} 秒 server 仍未在 :${port} listen,看上方日志找原因(常见:mysql 连不上 / 端口被占)。`,
      ),
  );
}

// 启动 node server,前台运行直到 server 退出或用户 Ctrl+C。
// 返回 child 进程 exit code。openBrowser=true 时 ready 后自动打开默认浏览器。
export async function startServer(cfg, bundleRoot, { openBrowser = true } = {}) {
  const serverMain = join(bundleRoot, 'server', 'dist', 'main.js');
  const webDir = join(bundleRoot, 'web');
  const schemaFile = join(bundleRoot, 'db', 'init', '01-schema.sql');

  if (!existsSync(serverMain)) {
    console.error(
      kleur.red(`✗ 找不到 server bundle (${serverMain})。可能是 npm 包损坏,试试重装 whale-tutor。`),
    );
    process.exit(1);
  }

  console.log(kleur.green().bold(`→ 启动 server  `) + kleur.dim('node main.js'));
  console.log(kleur.dim(`  courses: ${cfg.coursesDir}`));
  console.log(kleur.dim(`  port: ${cfg.server.port}`));
  console.log(
    kleur.dim(
      `  db: ${cfg.database.user}@${cfg.database.host}:${cfg.database.port}/${cfg.database.database}`,
    ),
  );
  console.log(
    kleur.yellow(
      `  ⏳ 等 server 启动中,看到下方 "✓ Server 就绪" 再访问 http://localhost:${cfg.server.port}\n`,
    ),
  );

  const child = spawn(process.execPath, [serverMain], {
    env: { ...process.env, ...toEnv(cfg, { webDir, schemaFile }) },
    cwd: dirname(serverMain),
    stdio: 'inherit',
  });

  // 不论是否 auto-open browser,都轮询端口 — 让用户知道 server 真正 ready 的时刻
  waitForReady(cfg.server.port, { openBrowser }).catch(() => {
    // 不阻塞,不污染输出
  });

  // 信号转发 — Ctrl+C 让 child 优雅退出
  const forward = (sig) => () => {
    if (!child.killed) child.kill(sig);
  };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));

  return new Promise((resolveExit) => {
    child.on('exit', (code) => resolveExit(code ?? 0));
  });
}
