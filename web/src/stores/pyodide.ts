import { defineStore } from 'pinia';
import { ref } from 'vue';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface RunResult {
  stdout: string;
  stderr: string;
  error: string | null;
}

type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Pyodide worker 句柄管理。
 *
 * - 单例 worker(整个 SPA 生命周期共享一个 Pyodide 实例)
 * - status 状态机:idle → loading → ready / error
 * - preload() 后台预热,HomeView 进入时调用一次,让用户走到 LearnView 时已 ready
 * - runCode(code, setupCode) 跑学习者代码 + 测试 setup,返回 { stdout, stderr, error }
 */
export const usePyodideStore = defineStore('pyodide', () => {
  const status = ref<PyodideStatus>('idle');
  const errorMessage = ref<string | null>(null);

  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(
      new URL('@/workers/pyodide.worker.js', import.meta.url),
      { type: 'classic' },
    );
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        id: number;
        type: string;
        payload?: unknown;
        error?: string;
      };
      const handler = pending.get(msg.id);
      if (!handler) return;
      pending.delete(msg.id);
      if (msg.error) {
        handler.reject(new Error(msg.error));
      } else {
        handler.resolve(msg.payload ?? null);
      }
    };
    worker.onerror = (err) => {
      // 全局 worker 错误 — 比如 importScripts 加载 pyodide.js 失败
      // eslint-disable-next-line no-console
      console.error('[pyodide.worker] error:', err);
      status.value = 'error';
      errorMessage.value = err.message || 'pyodide worker error';
    };
    return worker;
  }

  function send<T = unknown>(type: string, payload?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const w = ensureWorker();
      const id = nextId++;
      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      w.postMessage({ id, type, payload });
    });
  }

  /**
   * 加载 Pyodide(幂等 — 多次调用复用同一 init promise)。
   * v0:HomeView mounted 时调一次,后台跑;实际 LearnView 用之前等待 status='ready'。
   */
  async function preload(): Promise<void> {
    if (status.value === 'ready') return;
    if (status.value === 'loading') {
      // 已经在加载中,等到 ready 或 error
      await waitUntilSettled();
      return;
    }
    status.value = 'loading';
    errorMessage.value = null;
    try {
      await send<void>('init');
      status.value = 'ready';
    } catch (err) {
      status.value = 'error';
      errorMessage.value = (err as Error).message;
    }
  }

  function waitUntilSettled(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (status.value === 'ready' || status.value === 'error') resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  async function runCode(
    code: string,
    setupCode: string,
  ): Promise<RunResult> {
    if (status.value !== 'ready') await preload();
    if (status.value !== 'ready') {
      throw new Error(errorMessage.value ?? 'Pyodide not ready');
    }
    return await send<RunResult>('run', { code, setupCode });
  }

  return { status, errorMessage, preload, runCode };
});
