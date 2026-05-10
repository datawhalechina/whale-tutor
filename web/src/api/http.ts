import axios from 'axios';

// 60s 兜底 — DeepSeek cold-start 经常 15-30s,server 端 fetch 超时设的是 30s,
// client 留比 server 大的窗口,避免出现"server 还在拉 / 已 fallback,client 已 abort"的窗口期
// (那样会让用户看到 timeout 报错,但 server 实际成功了,下次点反而瞬秒,体验割裂)。
export const http = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});
