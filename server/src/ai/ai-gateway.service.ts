import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { AiCallStatus } from '@whale-tutor/tutor-types';
import { KYSELY, type Database } from '../database/database.module';

// __dirname 在 dev(ts-node) = src/ai;在 prod(node dist) = dist/ai。
// 都映射到 ai/prompts/。nest-cli.json assets 配置确保 build 时复制 .yaml。
const PROMPTS_DIR = path.join(__dirname, 'prompts');

interface PromptTemplate {
  templateId: string;
  model: string;
  maxRetries?: number;
  maxTokens?: number;
  temperature?: number;
  system: string;
  user: string;
  outputSchema?: AnySchema;
  fallback?: unknown;
}

export interface AiCompleteInput {
  templateId: string;
  variables: Record<string, unknown>;
  sessionId?: number | null;
  callerTag?: string;
}

interface CallOutcome {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * AI Gateway:所有 LLM 交互的唯一入口。
 *
 * - prompts/*.yaml 启动期加载 + ajv schema 编译 + 字符串插值模板
 * - DeepSeek OpenAI 兼容协议(可切换 base URL 接其他兼容服务)
 * - 失败重试 1 次(带上次的 schema 错误信息) → 仍失败用 YAML 的 fallback
 * - 每次调用写 ai_calls 表(成本 + 状态 + 错误)
 * - 无 API key 时直接走 fallback,让 dev 环境无 key 也能跑
 */
@Injectable()
export class AiGatewayService implements OnModuleInit {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly templates = new Map<string, PromptTemplate>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly apiKey: string | undefined;
  private readonly apiBaseUrl: string;

  // db 在 build 模式下是 null(BuildModule 不依赖 mysql),所有 ai_calls 写入要 guard
  constructor(
    @Inject(KYSELY) private readonly db: Database | null,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    this.apiBaseUrl = this.config.get<string>('DEEPSEEK_API_BASE_URL', 'https://api.deepseek.com');
  }

  async onModuleInit(): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(PROMPTS_DIR);
    } catch {
      this.logger.warn(`Prompts dir not found: ${PROMPTS_DIR} — no templates loaded`);
      return;
    }
    for (const f of files) {
      if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue;
      const fullPath = path.join(PROMPTS_DIR, f);
      const content = await fs.readFile(fullPath, 'utf8');
      let parsed: PromptTemplate;
      try {
        parsed = yaml.load(content) as PromptTemplate;
      } catch (err) {
        throw new Error(`Invalid YAML in ${fullPath}: ${(err as Error).message}`);
      }
      if (!parsed.templateId || !parsed.system || !parsed.user) {
        throw new Error(
          `Prompt template ${fullPath} missing required fields (templateId/system/user)`,
        );
      }
      this.templates.set(parsed.templateId, parsed);
      if (parsed.outputSchema) {
        this.validators.set(parsed.templateId, ajv.compile(parsed.outputSchema));
      }
    }
    if (!this.apiKey) {
      this.logger.warn(
        `Loaded ${this.templates.size} prompt template(s);DEEPSEEK_API_KEY not set → all calls will use fallback`,
      );
    } else {
      this.logger.log(`Loaded ${this.templates.size} prompt template(s)`);
    }
  }

  /**
   * 唯一对外方法。返回 schema 校验通过的 JSON object 或 fallback。
   */
  async complete<TOut = unknown>(input: AiCompleteInput): Promise<TOut> {
    const tpl = this.templates.get(input.templateId);
    if (!tpl) {
      throw new Error(`Prompt template not found: ${input.templateId}`);
    }

    const startedAt = Date.now();
    let lastError: string | null = null;

    // 无 API key 直接走 fallback,不调用 API、不消耗时间。
    if (!this.apiKey) {
      await this.recordCall({
        templateId: input.templateId,
        model: tpl.model,
        tokensIn: null,
        tokensOut: null,
        latencyMs: 0,
        status: 'fallback',
        costUsd: null,
        sessionId: input.sessionId ?? null,
        callerTag: input.callerTag ?? null,
        errorMessage: 'DEEPSEEK_API_KEY not set',
      });
      if (tpl.fallback !== undefined) return tpl.fallback as TOut;
      throw new Error('DEEPSEEK_API_KEY not set and no fallback configured');
    }

    const validator = this.validators.get(input.templateId);
    const maxRetries = tpl.maxRetries ?? 1;
    const baseSystem = interpolate(tpl.system, input.variables);
    const baseUser = interpolate(tpl.user, input.variables);

    let userPrompt = baseUser;
    let outcome: CallOutcome | null = null;
    let parsedJson: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        outcome = await this.callDeepSeek({
          model: tpl.model,
          system: baseSystem,
          user: userPrompt,
          maxTokens: tpl.maxTokens,
          temperature: tpl.temperature,
        });
        try {
          parsedJson = JSON.parse(outcome.content);
        } catch (err) {
          lastError = `JSON parse: ${(err as Error).message}`;
          userPrompt = `${baseUser}\n\n你上次返回了非法 JSON,错误:${lastError}。请只返回符合 schema 的 JSON object,无任何额外文本。`;
          continue;
        }
        if (validator && !validator(parsedJson)) {
          lastError = `Schema mismatch: ${JSON.stringify(validator.errors)}`;
          userPrompt = `${baseUser}\n\n你上次返回的 JSON 不符合 schema,错误:${lastError}。请按 schema 严格返回。`;
          continue;
        }
        // success
        await this.recordCall({
          templateId: input.templateId,
          model: tpl.model,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          latencyMs: Date.now() - startedAt,
          status: attempt === 0 ? 'ok' : 'retry_ok',
          costUsd: outcome.costUsd,
          sessionId: input.sessionId ?? null,
          callerTag: input.callerTag ?? null,
          errorMessage: null,
        });
        return parsedJson as TOut;
      } catch (err) {
        lastError = (err as Error).message;
        // network / API error 不再重试,直接走 fallback
        break;
      }
    }

    // all attempts failed → fallback or rethrow
    await this.recordCall({
      templateId: input.templateId,
      model: tpl.model,
      tokensIn: outcome?.tokensIn ?? null,
      tokensOut: outcome?.tokensOut ?? null,
      latencyMs: Date.now() - startedAt,
      status: tpl.fallback !== undefined ? 'fallback' : validator ? 'schema_failed' : 'error',
      costUsd: outcome?.costUsd ?? null,
      sessionId: input.sessionId ?? null,
      callerTag: input.callerTag ?? null,
      errorMessage: lastError ?? 'unknown',
    });

    if (tpl.fallback !== undefined) {
      this.logger.warn(`AI call ${input.templateId} → fallback. Reason: ${lastError}`);
      return tpl.fallback as TOut;
    }
    throw new Error(`AI Gateway call failed: ${input.templateId}: ${lastError}`);
  }

  private async callDeepSeek(input: {
    model: string;
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<CallOutcome> {
    const res = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as DeepSeekChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty content in DeepSeek response');
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    return {
      content,
      tokensIn,
      tokensOut,
      costUsd: computeDeepSeekCost(input.model, tokensIn, tokensOut),
    };
  }

  private async recordCall(input: {
    templateId: string;
    model: string;
    tokensIn: number | null;
    tokensOut: number | null;
    latencyMs: number;
    status: AiCallStatus;
    costUsd: number | null;
    sessionId: number | null;
    callerTag: string | null;
    errorMessage: string | null;
  }): Promise<void> {
    // build 模式无 DB,跳过 ai_calls 写入
    if (!this.db) return;
    await this.db
      .insertInto('ai_calls')
      .values({
        template_id: input.templateId,
        model: input.model,
        tokens_in: input.tokensIn,
        tokens_out: input.tokensOut,
        latency_ms: input.latencyMs,
        status: input.status,
        cost_usd: input.costUsd === null ? null : input.costUsd.toFixed(6),
        session_id: input.sessionId,
        caller_tag: input.callerTag,
        error_message: input.errorMessage?.slice(0, 500) ?? null,
      })
      .execute();
  }
}

interface DeepSeekChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// 简单字符串插值 — 支持 {{var}} 与 {{path.to.nested}}。
// 不支持 {{#each}} 等高级语法;数组类变量请在调用前 join 成字符串再传。
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = (key as string)
      .split('.')
      .reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), vars);
    return value === undefined || value === null ? '' : String(value);
  });
}

// DeepSeek 价位(USD per 1M tokens,2026 年初报价,需根据实际官网核对)。
//
// 模型迁移注:
//   deepseek-chat / deepseek-reasoner 将于 2026/07/24 弃用,
//   分别对应 deepseek-v4-flash 的非思考模式 / 思考模式;
//   deepseek-v4-pro 是更强的版本,价位独立(此处用占位,需以官网为准)。
//
// 价位是相对的、用于 ai_calls.cost_usd 记账;不影响调用本身。
// 找不到 model 时 fallback 到 v4-flash 价位。
const DEEPSEEK_PRICES: Record<string, { input: number; output: number }> = {
  // 新模型(2026/07/24 起为唯一选项)
  'deepseek-v4-flash': { input: 0.27, output: 1.1 }, // 非思考模式;思考模式价位通常 ≈ reasoner,此处先取下限
  'deepseek-v4-pro': { input: 0.55, output: 2.19 }, // TODO:官网价位确认后更新
  // 旧模型(到 2026/07/24 弃用前仍可用)
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

function computeDeepSeekCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = DEEPSEEK_PRICES[model] ?? DEEPSEEK_PRICES['deepseek-v4-flash'];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}
