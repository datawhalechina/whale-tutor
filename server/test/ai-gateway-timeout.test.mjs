// Run after pnpm build:types && pnpm build:server:
// node --test server/test/ai-gateway-timeout.test.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as schedule } from 'node:timers';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../dist/ai/ai-gateway.service.js';

async function setup(t, replies) {
  let requests = 0;
  const server = createServer((req, res) => {
    req.resume();
    const reply = replies[Math.min(requests++, replies.length - 1)];
    res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
    res.flushHeaders();
    if (reply.stall) {
      res.write('{"choices":');
      return; // Keep the body open after sending the headers.
    }
    res.end(JSON.stringify({ choices: [{ message: { content: '{"text":"recovered"}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const gateway = new AiGatewayService(
    null,
    new ConfigService({
      DEEPSEEK_API_KEY: 'offline-test',
      DEEPSEEK_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    }),
  );
  await gateway.onModuleInit();
  // Shorten only the gateway deadline; fetch and its AbortSignal stay real.
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) =>
    schedule(callback, delay === 30_000 ? 250 : delay, ...args),
  );
  return { gateway, requestCount: () => requests };
}

async function complete(gateway, throwOnFallback = false) {
  let watchdog;
  try {
    return await Promise.race([
      gateway.complete({ templateId: 'qa.answer', variables: {}, throwOnFallback }),
      new Promise((_, reject) => {
        watchdog = schedule(() => reject(new Error('body read outlived gateway deadline')), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

test('stalled success bodies retry and return the configured fallback', async (t) => {
  const { gateway, requestCount } = await setup(t, [{ stall: true }]);
  const result = await complete(gateway);
  assert.match(result.text, /AI 暂不可用/);
  assert.equal(requestCount(), 2);
});

test('stalled error bodies also reach the timeout and fallback', async (t) => {
  const { gateway, requestCount } = await setup(t, [{ status: 503, stall: true }]);
  const result = await complete(gateway);
  assert.match(result.text, /AI 暂不可用/);
  assert.equal(requestCount(), 2);
});

test('a retry can succeed after the preceding body stalls', async (t) => {
  const { gateway, requestCount } = await setup(t, [{ stall: true }, {}]);
  assert.deepEqual(await complete(gateway), { text: 'recovered' });
  assert.equal(requestCount(), 2);
});

test('throwOnFallback propagates the body timeout after both attempts', async (t) => {
  const { gateway, requestCount } = await setup(t, [{ stall: true }]);
  await assert.rejects(complete(gateway, true), /DeepSeek API timeout \(>30s\)/);
  assert.equal(requestCount(), 2);
});

test('an ordinary response still succeeds without retry', async (t) => {
  const { gateway, requestCount } = await setup(t, [{}]);
  assert.deepEqual(await complete(gateway), { text: 'recovered' });
  assert.equal(requestCount(), 1);
});
