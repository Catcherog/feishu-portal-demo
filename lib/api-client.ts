/**
 * API Client
 *
 * 封装 7 个截图 API 调用，支持 mock/real 两种模式。
 *
 * 安全约束（AC-B09）：
 * - 浏览器端不存放飞书 Secret 或正式写入 Token
 * - real 模式直接调用 collator HTTP 服务，不携带任何凭据
 * - collator 自身负责服务端鉴权与 Secret 管理
 *
 * 幂等约束（AC-B08）：
 * - 客户端禁用重复点击（由 store.submitting 控制）
 * - 服务端以幂等键为准，客户端仅负责不重复提交
 */

import type {
  ApiMode,
  CreateScreenshotRequest,
  CreateScreenshotResponse,
  GetScreenshotStatusResponse,
  GetScreenshotEvidenceResponse,
  SubmitCorrectionsRequest,
  SubmitCorrectionsResponse,
  ConfirmWriteRequest,
  ConfirmWriteResponse,
  EscalateReviewRequest,
  EscalateReviewResponse,
  GetFinalResultResponse,
  ApiErrorResponse,
  ScreenshotStatus,
} from './types';
import * as mock from './api-mock';
import { responseSchemas } from './schema-validation';
import type { z } from 'zod';

/** collator HTTP 服务 baseURL，从环境变量读取 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

/** 默认超时 30s */
const DEFAULT_TIMEOUT_MS = 30000;

/** API 错误类 */
export class ScreenshotApiError extends Error {
  code: string;
  details?: unknown;
  statusCode?: number;
  constructor(code: string, message: string, details?: unknown, statusCode?: number) {
    super(message);
    this.name = 'ScreenshotApiError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

/** 解析错误响应 */
async function parseError(res: Response): Promise<never> {
  let body: ApiErrorResponse | { error?: string } | unknown;
  try {
    body = await res.json();
  } catch {
    body = { error: { code: 'PARSE_ERROR', message: `HTTP ${res.status} 响应非 JSON` } };
  }
  const errBody = body as ApiErrorResponse;
  if (errBody?.error?.code) {
    throw new ScreenshotApiError(
      errBody.error.code,
      errBody.error.message,
      errBody.error.details,
      res.status,
    );
  }
  throw new ScreenshotApiError('HTTP_ERROR', `HTTP ${res.status}`, body, res.status);
}

/** 通用 fetch 封装（real 模式） */
async function fetchJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(rest.headers ?? {}),
        },
      });
    } catch (err) {
      // 网络错误或超时中断（AbortController 触发）
      if (err instanceof ScreenshotApiError) throw err;
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      throw new ScreenshotApiError(
        isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        isAbort
          ? `请求超时 (${timeoutMs}ms)`
          : `网络请求失败: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    if (!res.ok) {
      await parseError(res);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ScreenshotApiError(
        'PARSE_ERROR',
        `HTTP ${res.status} 响应非有效 JSON`,
        undefined,
        res.status,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 响应 Schema 校验（AC-A06）
// ============================================================================

/**
 * 用 zod schema 校验 real API 响应。
 * 校验失败时抛出 ScreenshotApiError('SCHEMA_VALIDATION_FAILED')，
 * 防止畸形数据进入 UI。
 */
function validateOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  label: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ScreenshotApiError(
      'SCHEMA_VALIDATION_FAILED',
      `响应结构校验失败: ${label}`,
      result.error.issues,
    );
  }
  return result.data;
}

// ============================================================================
// API 模式配置（AC-A03：NEXT_PUBLIC_DEMO_MODE）
// ============================================================================

/**
 * 读取 NEXT_PUBLIC_DEMO_MODE 环境变量，决定 API 模式。
 *
 * - 'true'  → mock（演示模式，本地模拟数据）
 * - 'false' → real（调用真实 collator HTTP 服务）
 * - 缺失时：
 *   - 生产构建（NODE_ENV=production）直接抛错，不得静默进入 Demo（amendment 3）
 *   - 开发环境默认 mock 并 console.warn 提示
 *
 * 此函数在模块加载时被 store 初始化调用，
 * 因此生产构建若未设置环境变量会在构建阶段直接失败。
 */
export function getApiMode(): ApiMode {
  const raw = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (raw === 'true') return 'mock';
  if (raw === 'false') return 'real';

  // 环境变量缺失或值不合法
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_DEMO_MODE must be set explicitly to "true" or "false" in production. ' +
        '配置缺失时不得静默进入 Demo 模式。',
    );
  }

  // 开发环境：默认 mock 并警告
  if (typeof console !== 'undefined') {
    console.warn(
      '[Portal] NEXT_PUBLIC_DEMO_MODE 未设置，默认使用 mock（演示）模式。' +
        '设置 NEXT_PUBLIC_DEMO_MODE=false 以调用真实 collator API。',
    );
  }
  return 'mock';
}

// ============================================================================
// 终态判定与轮询（AC-A04）
// ============================================================================

/** 终态状态集合：到达这些状态后无需继续轮询 */
const TERMINAL_STATUSES: ReadonlySet<ScreenshotStatus> = new Set([
  'write_succeeded',
  'write_failed',
  'duplicate_skipped',
  'review_resolved',
  'expired',
  'governance_blocked',
]);

/** 判断状态是否为终态（无需继续轮询） */
export function isTerminalStatus(status: ScreenshotStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** 等待指定毫秒数，支持 AbortSignal 提前取消 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ScreenshotApiError('POLL_ABORTED', '轮询已取消'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ScreenshotApiError('POLL_ABORTED', '轮询已取消'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 轮询选项 */
export interface PollOptions {
  /** 最大轮询次数，默认 60 */
  maxAttempts?: number;
  /** 轮询间隔（毫秒），默认 2000 */
  intervalMs?: number;
  /** 单次请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 每次状态回调 */
  onStatus?: (resp: GetScreenshotStatusResponse, attempt: number) => void;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * 轮询截图处理状态，直到到达终态或超过最大次数。
 *
 * AC-A04 轮询健壮性：
 * - 最大次数限制（默认 60 次 × 2s = 2 分钟）
 * - 单次请求超时（30s，由 fetchJson 内部 AbortController 保证）
 * - 终态自动终止（isTerminalStatus）
 */
export async function pollScreenshotStatus(
  id: string,
  opts: PollOptions = {},
): Promise<GetScreenshotStatusResponse> {
  const {
    maxAttempts = 60,
    intervalMs = 2000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onStatus,
    signal,
  } = opts;

  let lastResp: GetScreenshotStatusResponse | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new ScreenshotApiError('POLL_ABORTED', '轮询已取消');
    }
    lastResp = await fetchJson<GetScreenshotStatusResponse>(
      `/v1/screenshots/${encodeURIComponent(id)}`,
      { method: 'GET', timeoutMs, signal },
    );
    // 校验响应结构
    lastResp = validateOrThrow(
      responseSchemas.getScreenshotStatus,
      lastResp,
      'getScreenshotStatus (poll)',
    );
    onStatus?.(lastResp, attempt);

    if (isTerminalStatus(lastResp.status)) {
      return lastResp;
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs, signal);
    }
  }

  throw new ScreenshotApiError(
    'POLL_TIMEOUT',
    `轮询超过最大次数 (${maxAttempts})，截图 ${id} 未到达终态`,
    { lastStatus: lastResp?.status, attempts: maxAttempts },
  );
}

// ============================================================================
// 统一 API 调用入口（根据 mode 分发）
// ============================================================================

export interface ApiClient {
  createScreenshot(req: CreateScreenshotRequest): Promise<CreateScreenshotResponse>;
  getScreenshotStatus(id: string): Promise<GetScreenshotStatusResponse>;
  getScreenshotEvidence(id: string): Promise<GetScreenshotEvidenceResponse>;
  submitCorrections(id: string, req: SubmitCorrectionsRequest): Promise<SubmitCorrectionsResponse>;
  confirmWrite(id: string, req: ConfirmWriteRequest): Promise<ConfirmWriteResponse>;
  escalateReview(id: string, req: EscalateReviewRequest): Promise<EscalateReviewResponse>;
  getFinalResult(id: string): Promise<GetFinalResultResponse>;
}

/** Mock API Client */
export const mockApiClient: ApiClient = {
  createScreenshot: (req) => mock.mockCreateScreenshot(req),
  getScreenshotStatus: (id) => mock.mockGetScreenshotStatus(id),
  getScreenshotEvidence: (id) => mock.mockGetScreenshotEvidence(id),
  submitCorrections: (id, req) => mock.mockSubmitCorrections(id, req),
  confirmWrite: (id, req) => mock.mockConfirmWrite(id, req),
  escalateReview: (id, req) => mock.mockEscalateReview(id, req),
  getFinalResult: (id) => mock.mockGetFinalResult(id),
};

/**
 * Real API Client（调用 collator HTTP 服务）
 *
 * AC-A06：每个方法在返回前用 zod schema 校验响应结构。
 * 校验失败时抛出 ScreenshotApiError('SCHEMA_VALIDATION_FAILED')。
 * real 模式无 mock 回退——若 collator 不可达或返回畸形数据，
 * UI 将展示明确错误而非静默使用模拟数据。
 */
export const realApiClient: ApiClient = {
  createScreenshot: async (req) => {
    const data = await fetchJson<unknown>('/v1/screenshots', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return validateOrThrow(responseSchemas.createScreenshot, data, 'createScreenshot');
  },
  getScreenshotStatus: async (id) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    return validateOrThrow(responseSchemas.getScreenshotStatus, data, 'getScreenshotStatus');
  },
  getScreenshotEvidence: async (id) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}/evidence`,
      { method: 'GET' },
    );
    return validateOrThrow(responseSchemas.getScreenshotEvidence, data, 'getScreenshotEvidence');
  },
  submitCorrections: async (id, req) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}/corrections`,
      { method: 'POST', body: JSON.stringify(req) },
    );
    return validateOrThrow(responseSchemas.submitCorrections, data, 'submitCorrections');
  },
  confirmWrite: async (id, req) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: JSON.stringify(req) },
    );
    return validateOrThrow(responseSchemas.confirmWrite, data, 'confirmWrite');
  },
  escalateReview: async (id, req) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}/escalate-review`,
      { method: 'POST', body: JSON.stringify(req) },
    );
    return validateOrThrow(responseSchemas.escalateReview, data, 'escalateReview');
  },
  getFinalResult: async (id) => {
    const data = await fetchJson<unknown>(
      `/v1/screenshots/${encodeURIComponent(id)}/final-result`,
      { method: 'GET' },
    );
    return validateOrThrow(responseSchemas.getFinalResult, data, 'getFinalResult');
  },
};

/** 根据 mode 获取 API Client */
export function getApiClient(mode: ApiMode): ApiClient {
  return mode === 'mock' ? mockApiClient : realApiClient;
}

/**
 * 获取当前环境配置的 API Client。
 *
 * 基于 NEXT_PUBLIC_DEMO_MODE 环境变量决定使用 mock 还是 real。
 * 非 Demo 模式（NEXT_PUBLIC_DEMO_MODE=false）时调用真实 collator，无 mock 回退。
 */
export function getConfiguredApiClient(): ApiClient {
  return getApiClient(getApiMode());
}

/** 获取当前配置的 collator baseURL（用于 UI 展示） */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
