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
  InternalWritePreviewRequest,
  InternalWriteConfirmationRequest,
  InternalWritePreview,
  InternalControlledWriteResult,
} from './types';
import * as mock from './api-mock';
import { responseSchemas } from './schema-validation';
import type { z } from 'zod';

/**
 * 规范化 API Base URL：去除末尾 /，缺失时返回 null（fail closed）。
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01: Production 不允许静默回退到 mock。
 */
function normalizeApiBaseUrl(raw: string | undefined): string | null {
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim().replace(/\/+$/, '');
}

/** collator HTTP 服务 baseURL，从环境变量读取并规范化 */
const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ?? 'http://127.0.0.1:8787';

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
 *
 * 注意：使用 ZodTypeAny + as T 断言，因为 zod 的 .loose() 产生的索引签名
 * 与 TypeScript interface 不直接兼容。
 */
function validateOrThrow<T>(
  schema: z.ZodTypeAny,
  data: unknown,
  label: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    // 提取第一个 issue 的路径和消息，便于诊断
    const firstIssue = result.error.issues[0];
    const pathStr = firstIssue?.path?.length ? firstIssue.path.join('.') : '(root)';
    const detailMsg = firstIssue
      ? `${firstIssue.message} (path: ${pathStr})`
      : 'unknown issue';
    throw new ScreenshotApiError(
      'SCHEMA_VALIDATION_FAILED',
      `响应结构校验失败: ${label} — ${detailMsg}`,
      result.error.issues,
    );
  }
  return result.data as T;
}

// ============================================================================
// Operator JWT（FAMP-INTERNAL-CONTROLLED-WRITE-01）
// ============================================================================

/**
 * 获取 Portal operator JWT（HS256）。
 *
 * 安全设计：
 * - 浏览器端不存放飞书 Secret 或 PRODUCTION_PILOT_JWT_SECRET
 * - 前端持有 NEXT_PUBLIC_PORTAL_OPERATOR_JWT（一个预生成的长期 JWT，由运维 out-of-band 生成）
 * - Collator 端用 PRODUCTION_PILOT_JWT_SECRET 验证签名
 *
 * 返回 null 表示未配置（internal-controlled 流程将 fail closed）
 */
function getOperatorJwt(): string | null {
  const raw = process.env.NEXT_PUBLIC_PORTAL_OPERATOR_JWT;
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}

/** 为 fetch 请求构造 internal-controlled 所需的 Authorization header */
function withOperatorAuth(headers: Record<string, string> = {}): Record<string, string> {
  const jwt = getOperatorJwt();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  return headers;
}

/** internal-controlled 流程是否就绪（JWT 已配置） */
export function isInternalControlledReady(): boolean {
  return getOperatorJwt() !== null;
}

// ============================================================================
// API 模式配置（AC-A03：NEXT_PUBLIC_DEMO_MODE）
// ============================================================================

/**
 * 读取 NEXT_PUBLIC_DEMO_MODE 环境变量，决定 API 模式。
 *
 * - 'true'  → mock（演示模式，本地模拟数据）
 * - 'false' → real（调用真实 collator HTTP 服务）
 * - 缺失或值非法时：任何环境都直接抛错，不得静默进入 Demo。
 *
 * 此函数在模块加载时被 store 初始化调用，因此未显式配置运行模式时
 * 会立即失败。这样可以避免本地开发遗漏 .env.local 后误把 mock 数据当成
 * 真实 OCR 结果。
 */
export function getApiMode(): ApiMode {
  const raw = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (raw === 'true') return 'mock';
  if (raw === 'false') return 'real';
  throw new Error(
    'NEXT_PUBLIC_DEMO_MODE must be set explicitly to "true" or "false". ' +
      '配置缺失或非法时不得静默进入 Mock/Demo 模式。',
  );
}

// ============================================================================
// 终态判定与轮询（AC-A04）
// ============================================================================

/** 终态状态集合：到达这些状态后无需继续轮询 */
const TERMINAL_STATUSES: ReadonlySet<ScreenshotStatus> = new Set([
  'write_succeeded',
  'write_failed',
  'write_result_unknown',
  'write_needs_reconciliation',
  'write_partial',
  'duplicate_skipped',
  'review_resolved',
  'expired',
  'governance_blocked',
  'ocr_failed',
  'governance_needs_review',
  'review_pending',
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
    const validated = validateOrThrow<GetScreenshotStatusResponse>(
      responseSchemas.getScreenshotStatus,
      lastResp,
      'getScreenshotStatus (poll)',
    );
    lastResp = validated;
    onStatus?.(validated, attempt);

    if (isTerminalStatus(validated.status)) {
      return validated;
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
  // FAMP-INTERNAL-CONTROLLED-WRITE-01: 3 步 internal-controlled 流程
  createInternalPreview(req: InternalWritePreviewRequest): Promise<InternalWritePreview>;
  confirmInternalPreview(previewId: string, req: InternalWriteConfirmationRequest): Promise<InternalWritePreview>;
  executeInternalWrite(previewId: string, req: InternalWriteConfirmationRequest): Promise<InternalControlledWriteResult>;
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
  // Mock: internal-controlled 3 步流程返回模拟 preview
  createInternalPreview: async (req) => ({
    preview_id: `mock_preview_${Date.now()}`,
    nonce: `mock_nonce_${Math.random().toString(36).slice(2)}`,
    ingestion_id: req.screenshot_id,
    candidate_id: req.candidate_v1_id,
    candidate_digest: 'mock_candidate_digest',
    governance_digest: 'mock_governance_digest',
    authoritative_plan_digest: 'mock_plan_digest',
    operator: 'mock-operator',
    target_tables: ['customer', 'project'],
    target_table_digests: {},
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900000).toISOString(),
    status: 'preview_generated',
  }),
  confirmInternalPreview: async (previewId, req) => ({
    preview_id: previewId,
    nonce: req.nonce,
    ingestion_id: 'mock_ingestion',
    candidate_id: req.candidate_v1_id,
    candidate_digest: 'mock_candidate_digest',
    governance_digest: 'mock_governance_digest',
    authoritative_plan_digest: 'mock_plan_digest',
    operator: 'mock-operator',
    target_tables: ['customer', 'project'],
    target_table_digests: {},
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900000).toISOString(),
    status: 'confirmed',
    confirmed_by: 'mock-operator',
    confirmed_at: new Date().toISOString(),
  }),
  executeInternalWrite: async (previewId, req) => ({
    status: 'succeeded',
    write_results: [
      {
        entity_type: 'customer',
        target_table_id: 'tblMockCustomer',
        business_record_id: 'mock_rec_001',
        created: true,
        status: 'succeeded',
      },
      {
        entity_type: 'project',
        target_table_id: 'tblMockProject',
        business_record_id: 'mock_rec_002',
        created: true,
        status: 'succeeded',
      },
    ],
    transaction_snapshot_id: 'mock_snapshot_001',
    additional_create_calls: 0,
    completed_at: new Date().toISOString(),
  }),
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
  // FAMP-INTERNAL-CONTROLLED-WRITE-01: 3 步 internal-controlled 流程
  // 每步都需要 Authorization: Bearer <JWT> header
  createInternalPreview: async (req) => {
    if (!isInternalControlledReady()) {
      throw new ScreenshotApiError(
        'INTERNAL_CONTROLLED_NOT_CONFIGURED',
        'internal-controlled 流程未配置：NEXT_PUBLIC_PORTAL_OPERATOR_JWT 环境变量缺失',
      );
    }
    const data = await fetchJson<unknown>(
      '/v1/internal-controlled-writes/previews',
      {
        method: 'POST',
        body: JSON.stringify(req),
        headers: withOperatorAuth(),
        // preview 生成涉及治理调用，可能较慢
        timeoutMs: 60000,
      },
    );
    return validateOrThrow<InternalWritePreview>(responseSchemas.internalWritePreview, data, 'createInternalPreview');
  },
  confirmInternalPreview: async (previewId, req) => {
    if (!isInternalControlledReady()) {
      throw new ScreenshotApiError(
        'INTERNAL_CONTROLLED_NOT_CONFIGURED',
        'internal-controlled 流程未配置：NEXT_PUBLIC_PORTAL_OPERATOR_JWT 环境变量缺失',
      );
    }
    const data = await fetchJson<unknown>(
      `/v1/internal-controlled-writes/previews/${encodeURIComponent(previewId)}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(req),
        headers: withOperatorAuth(),
      },
    );
    return validateOrThrow<InternalWritePreview>(responseSchemas.internalWritePreview, data, 'confirmInternalPreview');
  },
  executeInternalWrite: async (previewId, req) => {
    if (!isInternalControlledReady()) {
      throw new ScreenshotApiError(
        'INTERNAL_CONTROLLED_NOT_CONFIGURED',
        'internal-controlled 流程未配置：NEXT_PUBLIC_PORTAL_OPERATOR_JWT 环境变量缺失',
      );
    }
    const data = await fetchJson<unknown>(
      `/v1/internal-controlled-writes/previews/${encodeURIComponent(previewId)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify(req),
        headers: withOperatorAuth(),
        // 执行真实写入可能较慢（飞书 API 调用 + 事务）
        timeoutMs: 120000,
      },
    );
    return validateOrThrow<InternalControlledWriteResult>(responseSchemas.internalControlledWriteResult, data, 'executeInternalWrite');
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

// ============================================================================
// 本地运行时健康检查（FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §5）
// ============================================================================

/** 连接状态 */
export type RuntimeStatus =
  | 'checking'
  | 'connected'
  | 'collator_offline'
  | 'sop_unavailable'
  | 'browser_blocked';

/** 健康检查结果 */
export interface HealthCheckResult {
  status: RuntimeStatus;
  collatorReady: boolean;
  sopReady: boolean;
  message: string;
}

/**
 * 检查本地运行时连接状态。
 *
 * 只执行只读 GET /readyz，短超时 3 秒。
 * 不无限轮询：页面首次加载一次、用户点击"重新检测"一次、写入流程开始前一次。
 */
export async function checkRuntimeHealth(): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${API_BASE_URL}/readyz`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => null) as {
      status?: string;
      dependencies?: { sop?: string };
    } | null;
    if (!res.ok) {
      if (res.status === 503 && data?.dependencies?.sop === 'unavailable') {
        return {
          status: 'sop_unavailable',
          collatorReady: true,
          sopReady: false,
          message: 'Collator 已启动，但 SOP 治理服务未就绪',
        };
      }
      return {
        status: 'collator_offline',
        collatorReady: false,
        sopReady: false,
        message: `Collator 返回 HTTP ${res.status}`,
      };
    }
    const collatorReady = data?.status === 'ready';
    const sopReady = data?.dependencies?.sop !== 'unavailable';
    return {
      status: collatorReady && sopReady ? 'connected' : 'sop_unavailable',
      collatorReady,
      sopReady,
      message: collatorReady && sopReady
        ? '本地运行时已连接'
        : 'SOP 治理服务未就绪',
    };
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.name === 'TimeoutError');
    if (isAbort) {
      return {
        status: 'browser_blocked',
        collatorReady: false,
        sopReady: false,
        message: '浏览器拒绝本地网络访问（请检查权限设置）',
      };
    }
    return {
      status: 'collator_offline',
      collatorReady: false,
      sopReady: false,
      message: 'Collator 未启动',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 运行时模式配置（FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §2）
// ============================================================================

/** 运行时模式 */
export type RuntimeMode = 'local-companion' | 'demo';

/** 写入模式 */
export type WriteMode = 'controlled' | 'dry-only';

/** 获取运行时模式 */
export function getRuntimeMode(): RuntimeMode {
  const raw = process.env.NEXT_PUBLIC_RUNTIME_MODE;
  if (raw === 'local-companion') return 'local-companion';
  if (raw === 'demo') return 'demo';
  // 默认 demo（安全侧）
  return 'demo';
}

/** 获取写入模式 */
export function getWriteMode(): WriteMode {
  const raw = process.env.NEXT_PUBLIC_WRITE_MODE;
  if (raw === 'controlled') return 'controlled';
  if (raw === 'dry-only') return 'dry-only';
  return 'dry-only';
}

/** 是否为受控写入环境（真实 API + 本地伴随运行时 + controlled 写入） */
export function isControlledWriteEnvironment(): boolean {
  return (
    getApiMode() === 'real' &&
    getRuntimeMode() === 'local-companion' &&
    getWriteMode() === 'controlled'
  );
}
