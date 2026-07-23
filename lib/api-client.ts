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
} from './types';
import * as mock from './api-mock';

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
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(rest.headers ?? {}),
      },
    });
    if (!res.ok) {
      await parseError(res);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
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

/** Real API Client（调用 collator HTTP 服务） */
export const realApiClient: ApiClient = {
  createScreenshot: (req) =>
    fetchJson<CreateScreenshotResponse>('/v1/screenshots', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  getScreenshotStatus: (id) =>
    fetchJson<GetScreenshotStatusResponse>(`/v1/screenshots/${encodeURIComponent(id)}`, {
      method: 'GET',
    }),
  getScreenshotEvidence: (id) =>
    fetchJson<GetScreenshotEvidenceResponse>(
      `/v1/screenshots/${encodeURIComponent(id)}/evidence`,
      { method: 'GET' },
    ),
  submitCorrections: (id, req) =>
    fetchJson<SubmitCorrectionsResponse>(
      `/v1/screenshots/${encodeURIComponent(id)}/corrections`,
      { method: 'POST', body: JSON.stringify(req) },
    ),
  confirmWrite: (id, req) =>
    fetchJson<ConfirmWriteResponse>(`/v1/screenshots/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  escalateReview: (id, req) =>
    fetchJson<EscalateReviewResponse>(
      `/v1/screenshots/${encodeURIComponent(id)}/escalate-review`,
      { method: 'POST', body: JSON.stringify(req) },
    ),
  getFinalResult: (id) =>
    fetchJson<GetFinalResultResponse>(`/v1/screenshots/${encodeURIComponent(id)}/final-result`, {
      method: 'GET',
    }),
};

/** 根据 mode 获取 API Client */
export function getApiClient(mode: ApiMode): ApiClient {
  return mode === 'mock' ? mockApiClient : realApiClient;
}

/** 获取当前配置的 collator baseURL（用于 UI 展示） */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
