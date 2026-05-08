import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * 安全地把 markdown 字符串渲染为 HTML。
 * AI 生成的 feedbackMd 是不可信内容,必须经过 DOMPurify 清洗以防 XSS。
 */
export function renderMarkdown(input: string | null | undefined): string {
  if (!input) return '';
  const raw = marked.parse(input, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
