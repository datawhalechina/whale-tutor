// Classic web worker — 不能用 ES module import/export 语法。
// 通过 self.importScripts 从 jsdelivr CDN 加载 Pyodide。
//
// 协议(主线程 ↔ worker):
//   incoming { id, type: 'init' }                                  → outgoing { id, type: 'init.done', error? }
//   incoming { id, type: 'run', payload: { code, setupCode } }     → outgoing { id, type: 'run.done', payload: { stdout, stderr, error } }
//
// `code` 是学习者写的函数定义;`setupCode` 是测试用例(调用学习者函数 + print 结果)。
// 两段顺序执行,先 code 后 setupCode,共享 Pyodide global scope。

const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

let pyodide = null;
let initPromise = null;

async function ensureInit() {
  if (pyodide) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    self.importScripts(`${PYODIDE_BASE}pyodide.js`);
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE });
  })();
  return initPromise;
}

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      await ensureInit();
      self.postMessage({ id: msg.id, type: 'init.done' });
    } catch (err) {
      self.postMessage({
        id: msg.id,
        type: 'init.done',
        error: (err && err.message) || String(err),
      });
    }
    return;
  }

  if (msg.type === 'run') {
    try {
      await ensureInit();
      const result = await runCode(msg.payload.code, msg.payload.setupCode);
      self.postMessage({ id: msg.id, type: 'run.done', payload: result });
    } catch (err) {
      self.postMessage({
        id: msg.id,
        type: 'run.done',
        payload: {
          stdout: '',
          stderr: '',
          error: (err && err.message) || String(err),
        },
      });
    }
    return;
  }
};

async function runCode(code, setupCode) {
  const stdoutBuf = [];
  const stderrBuf = [];
  pyodide.setStdout({ batched: (s) => stdoutBuf.push(s) });
  pyodide.setStderr({ batched: (s) => stderrBuf.push(s) });

  // 每次跑测试前重置 Python 命名空间,避免上次定义残留干扰。
  // 用 dict() 重置 globals,但保留 __builtins__。
  pyodide.runPython(`
import sys
_keep = {'__builtins__'}
for _k in list(globals().keys()):
    if _k not in _keep and not _k.startswith('_'):
        del globals()[_k]
`);

  let error = null;
  try {
    // 学习者代码先跑(定义函数等)
    await pyodide.runPythonAsync(code);
    // setupCode 调用学习者函数 + print 结果
    await pyodide.runPythonAsync(setupCode);
  } catch (err) {
    error = (err && err.message) || String(err);
  }

  return {
    stdout: stdoutBuf.join('\n'),
    stderr: stderrBuf.join('\n'),
    error,
  };
}
