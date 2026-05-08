import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const REF_KEY = '$ref';

/**
 * 从单个文件加载内容并递归 resolve 其中的 $ref。
 *   .md / .markdown → 读为字符串
 *   .yaml / .yml    → 解析为对象,递归处理 $ref
 */
export async function loadFromFile(filePath: string): Promise<unknown> {
  const ext = path.extname(filePath).toLowerCase();
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file ${filePath}: ${(err as Error).message}`);
  }
  if (ext === '.md' || ext === '.markdown') {
    return content;
  }
  if (ext === '.yaml' || ext === '.yml') {
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new Error(`Invalid YAML at ${filePath}: ${(err as Error).message}`);
    }
    return resolveRefs(parsed, path.dirname(filePath), filePath);
  }
  throw new Error(`Unsupported file extension '${ext}' at ${filePath}`);
}

/**
 * 递归处理 $ref。baseDir 是当前文件所在目录,$ref 路径相对此解析。
 * sourcePath 仅用于错误提示。
 */
async function resolveRefs(
  node: unknown,
  baseDir: string,
  sourcePath: string,
): Promise<unknown> {
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return Promise.all(node.map((item) => resolveRefs(item, baseDir, sourcePath)));
  }
  const obj = node as Record<string, unknown>;
  const refValue = obj[REF_KEY];
  if (typeof refValue === 'string') {
    const extraKeys = Object.keys(obj).filter((k) => k !== REF_KEY);
    if (extraKeys.length > 0) {
      throw new Error(
        `$ref must be the only key in an object (found extra keys: ${extraKeys.join(', ')}) at ${sourcePath}`,
      );
    }
    const absRefPath = path.resolve(baseDir, refValue);
    try {
      return await loadFromFile(absRefPath);
    } catch (err) {
      throw new Error(
        `Failed to resolve $ref './${refValue}' from ${sourcePath}: ${(err as Error).message}`,
      );
    }
  }
  // 普通对象,递归处理每个 value
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = await resolveRefs(v, baseDir, sourcePath);
  }
  return out;
}

/**
 * 从课程根目录加载 course.yaml(递归 resolve 所有 $ref)。
 * 返回 unknown,后续由 schema 校验为 CourseDefinition。
 */
export async function loadCourse(courseDir: string): Promise<unknown> {
  const courseYaml = path.join(courseDir, 'course.yaml');
  return loadFromFile(courseYaml);
}
