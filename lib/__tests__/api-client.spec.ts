/**
 * API Client 测试套件（AC-A05 ~ AC-A10）
 *
 * 覆盖：
 * - Normal: realApiClient 调用 fetch 的 URL/method 正确
 * - Error: HTTP 500、超时(abort)、无效 JSON → 抛出 ScreenshotApiError
 * - Security: 客户端模块不含 SECRET/APP_SECRET/TOKEN 等凭据字符串
 * - Demo mode: getApiMode 仅接受显式 true/false，缺失或非法配置 fail closed
 * - Schema validation: 畸形响应抛出 SCHEMA_VALIDATION_FAILED
 * - Regression: mockApiClient 仍正常工作（AC-A08）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import type {
  CreateScreenshotRequest,
  CreateScreenshotResponse,
  GetScreenshotStatusResponse,
  GetScreenshotEvidenceResponse,
  SubmitCorrectionsResponse,
  ConfirmWriteResponse,
  EscalateReviewResponse,
  GetFinalResultResponse,
} from '../types';

// ============================================================================
// 辅助：构造 mock fetch Response
// ============================================================================

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

function makeInvalidJsonResponse(status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token in JSON');
    },
  } as unknown as Response;
}

// ============================================================================
// 辅助：构造合法响应数据（通过 schema 校验）
// ============================================================================

const validCreateResponse: CreateScreenshotResponse = {
  screenshot_id: 'ss_test_001',
  ingestion_id: 'ing_test_001',
  status: 'received',
  idempotent_replay: false,
  ocr_task_id: 'ocr_test_001',
  created_at: '2026-07-22T00:00:00.000Z',
};

const validStatusResponse: GetScreenshotStatusResponse = {
  screenshot_id: 'ss_test_001',
  ingestion_id: 'ing_test_001',
  status: 'candidate_drafted',
  ocr: {
    status: 'succeeded',
    engine: 'tengine',
    confidence: 0.92,
    text_blocks_count: 6,
    processed_at: '2026-07-22T00:01:00.000Z',
  },
  candidate: {
    status: 'drafted',
    candidate_id: 'cand_001',
    quality_score: 0.88,
    quality_status: 'OK',
  },
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:01:00.000Z',
};

const validEvidenceResponse: GetScreenshotEvidenceResponse = {
  screenshot_id: 'ss_test_001',
  ocr_evidence: {
    engine: 'tengine',
    ocr_version: 'v1.0',
    text_blocks: [
      { type: 'name', text: '张三', line: 1, confidence: 0.95 },
      { type: 'phone', text: '13800001111', line: 2, confidence: 0.91 },
    ],
    raw_text: '张三\n13800001111',
    confidence: 0.92,
    processed_at: '2026-07-22T00:01:00.000Z',
  },
  candidate_v1: {
    schema_version: 'candidate-v1',
    candidate_id: 'cand_001',
    ingestion_id: 'ing_test_001',
    source: {
      system: 'portal',
      table: 'screenshots',
      record_id: 'rec_001',
      source_type: 'chat_screenshot',
    },
    entity_type: 'customer',
    raw_evidence: {
      raw_text: '张三\n13800001111',
      segments: [],
      content_hash: 'hash_001',
    },
    normalized_fields: {
      customer_name: '张三',
      contact_phone: '13800001111',
    },
    quality: {
      status: 'OK',
      issues: [],
      score: 0.88,
    },
    processing: {
      extractor_version: 'ext-v1',
      attempt: 1,
      created_at: '2026-07-22T00:00:30.000Z',
    },
    idempotency_key: 'idem_001',
  },
};

const validSubmitCorrectionsResponse: SubmitCorrectionsResponse = {
  screenshot_id: 'ss_test_001',
  candidate_v1: {
    schema_version: 'candidate-v1',
    candidate_id: 'cand_001',
    normalized_fields: { customer_name: '李四' },
    quality: { status: 'OK', issues: [], score: 0.95 },
  },
  field_authority: 'CONFIRMED',
  correction_applied_at: '2026-07-22T00:02:00.000Z',
  reviewer_id: 'reviewer_001',
};

const validConfirmWriteResponse: ConfirmWriteResponse = {
  screenshot_id: 'ss_test_001',
  ingestion_id: 'ing_test_001',
  status: 'write_succeeded',
  write_results: [
    {
      entity_type: 'customer',
      target_table_id: 'tbl_customer',
      business_record_id: 'rec_feishu_001',
      created: true,
      status: 'succeeded',
      write_log_id: 'wlog_001',
    },
  ],
  transaction_snapshot_id: 'snap_001',
  completed_at: '2026-07-22T00:03:00.000Z',
};

const validEscalateResponse: EscalateReviewResponse = {
  screenshot_id: 'ss_test_001',
  governance_result_v1: {
    schema_version: 'governance-result-v1',
    candidate_id: 'cand_001',
    decision: 'NEEDS_REVIEW',
    classification: { entity_type: 'customer', confidence: 0.72 },
    rule_version: 'rule-v1',
    violations: [{ code: 'LOW_CONFIDENCE', message: '置信度过低', severity: 'warning' }],
    write: { status: 'NOT_ATTEMPTED', target_table: 'tbl_customer', target_record_id: null },
    review: {
      status: 'CREATED',
      review_task_id: 'rev_001',
      ai_explanation: { available: true, reason: '需人工复核', summary: '置信度低于阈值' },
    },
    audit: {
      audit_id: 'audit_001',
      timestamp: '2026-07-22T00:02:00.000Z',
      source_record_id: 'rec_001',
      idempotency_key: 'idem_001',
      rule_version: 'rule-v1',
    },
  },
  review_task: {
    review_task_id: 'rev_001',
    status: 'pending_review',
    created_at: '2026-07-22T00:02:00.000Z',
  },
};

const validFinalResultResponse: GetFinalResultResponse = {
  screenshot_id: 'ss_test_001',
  ingestion_id: 'ing_test_001',
  final_status: 'write_succeeded',
  governance_result_v1: {
    schema_version: 'governance-result-v1',
    candidate_id: 'cand_001',
    decision: 'PASS',
    classification: { entity_type: 'customer', confidence: 0.95 },
    rule_version: 'rule-v1',
    violations: [],
    write: {
      status: 'succeeded',
      target_table: 'tbl_customer',
      target_record_id: 'rec_feishu_001',
      attempted_at: '2026-07-22T00:03:00.000Z',
    },
    review: { status: 'not_required', review_task_id: null },
    audit: {
      audit_id: 'audit_001',
      timestamp: '2026-07-22T00:03:00.000Z',
      source_record_id: 'rec_001',
      idempotency_key: 'idem_001',
      rule_version: 'rule-v1',
    },
  },
  write_logs: [
    {
      write_log_id: 'wlog_001',
      ingestion_id: 'ing_test_001',
      target_table_id: 'tbl_customer',
      business_record_id: 'rec_feishu_001',
      status: 'succeeded',
      created_at: '2026-07-22T00:03:00.000Z',
    },
  ],
  transaction_snapshot: {
    snapshot_id: 'snap_001',
    status: 'committed',
    records_created: 1,
    records_rolled_back: 0,
  },
  completed_at: '2026-07-22T00:03:00.000Z',
};

// ============================================================================
// 测试组 1: Normal — realApiClient 调用 fetch 的 URL/method 正确
// ============================================================================

describe('realApiClient — 正常调用', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('createScreenshot 用 POST 调用正确 URL', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validCreateResponse));

    const { realApiClient } = await import('../api-client');
    const req: CreateScreenshotRequest = {
      source_system: 'portal',
      source_record_id: 'rec_001',
      submitted_at: '2026-07-22T00:00:00.000Z',
      image_base64: 'dGVzdA==',
      image_filename: 'test.png',
    };
    const result = await realApiClient.createScreenshot(req);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.source_system).toBe('portal');
    expect(result.screenshot_id).toBe('ss_test_001');
    expect(result.status).toBe('received');
  });

  it('getScreenshotStatus 用 GET 调用正确 URL（含 ID）', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validStatusResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.getScreenshotStatus('ss_test_001');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001');
    expect(init.method).toBe('GET');
  });

  it('getScreenshotEvidence 用 GET 调用 evidence 端点', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validEvidenceResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.getScreenshotEvidence('ss_test_001');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001/evidence');
    expect(init.method).toBe('GET');
  });

  it('submitCorrections 用 POST 调用 corrections 端点', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validSubmitCorrectionsResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.submitCorrections('ss_test_001', {
      reviewer_id: 'rev_001',
      corrections: { customer_name: '李四' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001/corrections');
    expect(init.method).toBe('POST');
  });

  it('confirmWrite 用 POST 调用 confirm 端点', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validConfirmWriteResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.confirmWrite('ss_test_001', {
      reviewer_id: 'rev_001',
      candidate_v1_id: 'cand_001',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001/confirm');
    expect(init.method).toBe('POST');
  });

  it('escalateReview 用 POST 调用 escalate-review 端点', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validEscalateResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.escalateReview('ss_test_001', {
      reviewer_id: 'rev_001',
      reason_code: 'LOW_CONFIDENCE',
      reason: '置信度过低',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001/escalate-review');
    expect(init.method).toBe('POST');
  });

  it('getFinalResult 用 GET 调用 final-result 端点', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse(validFinalResultResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.getFinalResult('ss_test_001');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/screenshots/ss_test_001/final-result');
    expect(init.method).toBe('GET');
  });

  it('getFinalResult 接受后端 write_partial 终态，不得因旧枚举误报结构校验失败', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse({
      ...validFinalResultResponse,
      final_status: 'write_partial',
      error_code: 'INTERNAL_WRITE_PARTIAL',
      governance_result_v1: {
        ...validFinalResultResponse.governance_result_v1,
        write: {
          ...validFinalResultResponse.governance_result_v1.write,
          status: 'partial',
          error_code: 'INTERNAL_WRITE_PARTIAL',
        },
      },
    }));

    const { realApiClient } = await import('../api-client');
    const result = await realApiClient.getFinalResult('ss_test_001');
    expect(result.final_status).toBe('write_partial');
    expect(result.error_code).toBe('INTERNAL_WRITE_PARTIAL');
  });
});

// ============================================================================
// 测试组 2: Error — HTTP 500、超时、无效 JSON
// ============================================================================

describe('realApiClient — 错误处理', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('HTTP 500 抛出 ScreenshotApiError（含错误码），不返回 mock 成功', async () => {
    fetchSpy.mockResolvedValue(
      makeErrorResponse(500, {
        error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      }),
    );

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.getScreenshotStatus('ss_001');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('INTERNAL_ERROR');
      expect((err as InstanceType<typeof ScreenshotApiError>).statusCode).toBe(500);
    }
  });

  it('超时(abort) 抛出 ScreenshotApiError（code=TIMEOUT）', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchSpy.mockRejectedValue(abortError);

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.getScreenshotStatus('ss_001');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('TIMEOUT');
    }
  });

  it('网络错误 抛出 ScreenshotApiError（code=NETWORK_ERROR）', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.getScreenshotStatus('ss_001');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('NETWORK_ERROR');
    }
  });

  it('无效 JSON 抛出 ScreenshotApiError（code=PARSE_ERROR），不返回 mock 成功', async () => {
    fetchSpy.mockResolvedValue(makeInvalidJsonResponse(200));

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.getScreenshotStatus('ss_001');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('PARSE_ERROR');
    }
  });

  it('HTTP 500 无 error body 抛出 ScreenshotApiError（code=HTTP_ERROR）', async () => {
    fetchSpy.mockResolvedValue(makeErrorResponse(500, { random: 'data' }));

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.getScreenshotStatus('ss_001');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('HTTP_ERROR');
      expect((err as InstanceType<typeof ScreenshotApiError>).statusCode).toBe(500);
    }
  });
});

// ============================================================================
// 测试组 3: Security — 客户端模块不含凭据字符串
// ============================================================================

describe('Security — 无凭据泄露（AC-A10）', () => {
  const FORBIDDEN_KEYWORDS = [
    'APP_SECRET',
    'FEISHU_APP_SECRET',
    'APP_ID',
    'API_KEY',
    'PASSWORD',
    'ACCESS_TOKEN',
    'SECRET_KEY',
  ];

  it('api-client.ts 源码不含敏感字符串', () => {
    const source = readFileSync(
      new URL('../api-client.ts', import.meta.url),
      'utf-8',
    );
    for (const keyword of FORBIDDEN_KEYWORDS) {
      expect(source).not.toContain(keyword);
    }
  });

  it('schema-validation.ts 源码不含敏感字符串', () => {
    const source = readFileSync(
      new URL('../schema-validation.ts', import.meta.url),
      'utf-8',
    );
    for (const keyword of FORBIDDEN_KEYWORDS) {
      expect(source).not.toContain(keyword);
    }
  });

  it('store.ts 源码不含敏感字符串', () => {
    const source = readFileSync(
      new URL('../store.ts', import.meta.url),
      'utf-8',
    );
    for (const keyword of FORBIDDEN_KEYWORDS) {
      expect(source).not.toContain(keyword);
    }
  });

  it('realApiClient 请求不携带 Authorization 头', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockResolvedValue(makeOkResponse(validCreateResponse));

    const { realApiClient } = await import('../api-client');
    await realApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'r1',
      submitted_at: '2026-07-22T00:00:00.000Z',
      image_base64: 'dGVzdA==',
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers['X-Feishu-Secret']).toBeUndefined();

    vi.unstubAllGlobals();
  });
});

// ============================================================================
// 测试组 4: Demo mode — getApiMode 行为
// ============================================================================

describe('getApiMode — NEXT_PUBLIC_DEMO_MODE 配置（AC-A03）', () => {
  const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalDemoMode === undefined) {
      delete process.env.NEXT_PUBLIC_DEMO_MODE;
    } else {
      process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
    }
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it('NEXT_PUBLIC_DEMO_MODE=true 返回 mock', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    const { getApiMode } = await import('../api-client');
    expect(getApiMode()).toBe('mock');
  });

  it('NEXT_PUBLIC_DEMO_MODE=false 返回 real', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    const { getApiMode } = await import('../api-client');
    expect(getApiMode()).toBe('real');
  });

  it('生产构建缺失环境变量时抛错', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const { getApiMode } = await import('../api-client');
    expect(() => getApiMode()).toThrow('NEXT_PUBLIC_DEMO_MODE must be set explicitly');
  });

  it('开发环境缺失环境变量时同样抛错，不得静默进入 mock', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const { getApiMode } = await import('../api-client');
    expect(() => getApiMode()).toThrow('NEXT_PUBLIC_DEMO_MODE must be set explicitly');
  });

  it('getConfiguredApiClient 根据 env 返回对应 client', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    const { getConfiguredApiClient, realApiClient } = await import('../api-client');
    const client = getConfiguredApiClient();
    // realApiClient 每个方法都含 validateOrThrow，mockApiClient 直接转发 mock
    // 验证指向同一对象引用即可
    expect(client).toBe(realApiClient);
  });

  it('只有 real + local-companion + controlled 才视为受控写入环境', async () => {
    const originalRuntimeMode = process.env.NEXT_PUBLIC_RUNTIME_MODE;
    const originalWriteMode = process.env.NEXT_PUBLIC_WRITE_MODE;
    try {
      process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
      process.env.NEXT_PUBLIC_RUNTIME_MODE = 'local-companion';
      process.env.NEXT_PUBLIC_WRITE_MODE = 'controlled';
      const { isControlledWriteEnvironment } = await import('../api-client');
      expect(isControlledWriteEnvironment()).toBe(true);

      process.env.NEXT_PUBLIC_WRITE_MODE = 'dry-only';
      expect(isControlledWriteEnvironment()).toBe(false);

      process.env.NEXT_PUBLIC_WRITE_MODE = 'controlled';
      process.env.NEXT_PUBLIC_RUNTIME_MODE = 'demo';
      expect(isControlledWriteEnvironment()).toBe(false);

      process.env.NEXT_PUBLIC_RUNTIME_MODE = 'local-companion';
      process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
      expect(isControlledWriteEnvironment()).toBe(false);
    } finally {
      if (originalRuntimeMode === undefined) delete process.env.NEXT_PUBLIC_RUNTIME_MODE;
      else process.env.NEXT_PUBLIC_RUNTIME_MODE = originalRuntimeMode;
      if (originalWriteMode === undefined) delete process.env.NEXT_PUBLIC_WRITE_MODE;
      else process.env.NEXT_PUBLIC_WRITE_MODE = originalWriteMode;
    }
  });
});

// ============================================================================
// 测试组 4.5: 本地运行时健康检查
// ============================================================================

describe('checkRuntimeHealth — Collator + SOP 就绪状态', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Collator 和 SOP 均就绪时返回 connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({
      status: 'ready',
      dependencies: { sop: 'ready' },
    })));
    const { checkRuntimeHealth } = await import('../api-client');

    await expect(checkRuntimeHealth()).resolves.toMatchObject({
      status: 'connected',
      collatorReady: true,
      sopReady: true,
    });
  });

  it('Collator 在线但 SOP 不可用时返回 sop_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(503, {
      status: 'not_ready',
      dependencies: { sop: 'unavailable' },
    })));
    const { checkRuntimeHealth } = await import('../api-client');

    await expect(checkRuntimeHealth()).resolves.toMatchObject({
      status: 'sop_unavailable',
      collatorReady: true,
      sopReady: false,
    });
  });
});

// ============================================================================
// 测试组 5: Schema validation — 畸形响应抛出 SCHEMA_VALIDATION_FAILED
// ============================================================================

describe('Schema validation — 畸形响应（AC-A06）', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('缺少必需字段抛出 SCHEMA_VALIDATION_FAILED', async () => {
    // 缺少 ingestion_id
    fetchSpy.mockResolvedValue(
      makeOkResponse({
        screenshot_id: 'ss_001',
        status: 'received',
        idempotent_replay: false,
        created_at: '2026-07-22T00:00:00.000Z',
      }),
    );

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.createScreenshot({
        source_system: 'portal',
        source_record_id: 'r1',
        submitted_at: '2026-07-22T00:00:00.000Z',
      });
      expect.fail('应抛出校验错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe(
        'SCHEMA_VALIDATION_FAILED',
      );
    }
  });

  it('非法枚举值抛出 SCHEMA_VALIDATION_FAILED', async () => {
    fetchSpy.mockResolvedValue(
      makeOkResponse({
        screenshot_id: 'ss_001',
        ingestion_id: 'ing_001',
        status: 'INVALID_STATUS',
        idempotent_replay: false,
        created_at: '2026-07-22T00:00:00.000Z',
      }),
    );

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.createScreenshot({
        source_system: 'portal',
        source_record_id: 'r1',
        submitted_at: '2026-07-22T00:00:00.000Z',
      });
      expect.fail('应抛出校验错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe(
        'SCHEMA_VALIDATION_FAILED',
      );
    }
  });

  it('类型错误（boolean 字段传 string）抛出 SCHEMA_VALIDATION_FAILED', async () => {
    fetchSpy.mockResolvedValue(
      makeOkResponse({
        screenshot_id: 'ss_001',
        ingestion_id: 'ing_001',
        status: 'received',
        idempotent_replay: 'yes', // 应为 boolean
        created_at: '2026-07-22T00:00:00.000Z',
      }),
    );

    const { realApiClient, ScreenshotApiError } = await import('../api-client');
    try {
      await realApiClient.createScreenshot({
        source_system: 'portal',
        source_record_id: 'r1',
        submitted_at: '2026-07-22T00:00:00.000Z',
      });
      expect.fail('应抛出校验错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe(
        'SCHEMA_VALIDATION_FAILED',
      );
    }
  });

  it('合法响应允许额外字段（.loose() 前向兼容）', async () => {
    fetchSpy.mockResolvedValue(
      makeOkResponse({
        ...validCreateResponse,
        extra_field: 'future_extension',
      }),
    );

    const { realApiClient } = await import('../api-client');
    const result = await realApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'r1',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    expect(result.screenshot_id).toBe('ss_test_001');
  });
});

// ============================================================================
// 测试组 6: Regression — mockApiClient 仍正常工作（AC-A08）
// ============================================================================

describe('mockApiClient — 回归测试（AC-A08）', () => {
  it('createScreenshot 返回合法响应', async () => {
    const { mockApiClient } = await import('../api-client');
    const result = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_001',
      submitted_at: '2026-07-22T00:00:00.000Z',
      submitted_by: 'tester',
      image_base64: 'bW9jaw==',
      image_filename: 'mock.png',
    });
    expect(result.screenshot_id).toBeTruthy();
    expect(result.ingestion_id).toBeTruthy();
    expect(result.status).toBe('received');
    expect(result.idempotent_replay).toBe(false);
  });

  it('getScreenshotStatus 推进状态并返回合法响应', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_002',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    const status = await mockApiClient.getScreenshotStatus(created.screenshot_id);
    expect(status.screenshot_id).toBe(created.screenshot_id);
    expect(status.status).toBeTruthy();
  });

  it('getScreenshotEvidence 返回合法证据和候选', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_003',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    const evidence = await mockApiClient.getScreenshotEvidence(created.screenshot_id);
    expect(evidence.screenshot_id).toBe(created.screenshot_id);
    expect(evidence.ocr_evidence.raw_text).toBeTruthy();
    expect(evidence.candidate_v1.normalized_fields).toBeDefined();
    expect(Object.keys(evidence.candidate_v1.normalized_fields).length).toBeGreaterThan(0);
  });

  it('submitCorrections 返回 CONFIRMED 权威等级', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_004',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    const result = await mockApiClient.submitCorrections(created.screenshot_id, {
      reviewer_id: 'tester',
      corrections: { customer_name: '修正后的名字' },
    });
    expect(result.field_authority).toBe('CONFIRMED');
    expect(result.reviewer_id).toBe('tester');
  });

  it('confirmWrite 返回写入成功', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_005',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    const result = await mockApiClient.confirmWrite(created.screenshot_id, {
      reviewer_id: 'tester',
      candidate_v1_id: 'cand_mock',
    });
    expect(result.status).toBe('write_succeeded');
    expect(result.write_results.length).toBeGreaterThan(0);
    expect(result.write_results[0].status).toBe('succeeded');
  });

  it('escalateReview 返回 NEEDS_REVIEW 决策', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_006',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    const result = await mockApiClient.escalateReview(created.screenshot_id, {
      reviewer_id: 'tester',
      reason_code: 'LOW_CONFIDENCE',
      reason: '测试转复核',
    });
    expect(result.governance_result_v1.decision).toBe('NEEDS_REVIEW');
    expect(result.review_task.status).toBe('pending_review');
  });

  it('getFinalResult 返回完整治理和写入结果', async () => {
    const { mockApiClient } = await import('../api-client');
    const created = await mockApiClient.createScreenshot({
      source_system: 'portal',
      source_record_id: 'rec_mock_007',
      submitted_at: '2026-07-22T00:00:00.000Z',
    });
    // 先确认写入
    await mockApiClient.confirmWrite(created.screenshot_id, {
      reviewer_id: 'tester',
      candidate_v1_id: 'cand_mock',
    });
    const result = await mockApiClient.getFinalResult(created.screenshot_id);
    expect(result.final_status).toBe('write_succeeded');
    expect(result.governance_result_v1).toBeDefined();
    expect(result.write_logs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 测试组 7: 轮询辅助函数（AC-A04）
// ============================================================================

describe('pollScreenshotStatus — 轮询健壮性（AC-A04）', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('到达终态后停止轮询', async () => {
    const { pollScreenshotStatus } = await import('../api-client');
    fetchSpy
      .mockResolvedValueOnce(makeOkResponse({ ...validStatusResponse, status: 'ocr_processing' }))
      .mockResolvedValueOnce(makeOkResponse({ ...validStatusResponse, status: 'write_succeeded' }));

    const result = await pollScreenshotStatus('ss_001', {
      intervalMs: 10,
      maxAttempts: 10,
    });

    expect(result.status).toBe('write_succeeded');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('超过最大次数抛出 POLL_TIMEOUT', async () => {
    const { pollScreenshotStatus, ScreenshotApiError } = await import('../api-client');
    fetchSpy.mockResolvedValue(
      makeOkResponse({ ...validStatusResponse, status: 'ocr_processing' }),
    );

    try {
      await pollScreenshotStatus('ss_001', {
        intervalMs: 5,
        maxAttempts: 3,
      });
      expect.fail('应抛出超时错误');
    } catch (err) {
      expect(err).toBeInstanceOf(ScreenshotApiError);
      expect((err as InstanceType<typeof ScreenshotApiError>).code).toBe('POLL_TIMEOUT');
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('isTerminalStatus 正确识别终态', async () => {
    const { isTerminalStatus } = await import('../api-client');
    const terminal = [
      'ocr_failed',
      'governance_needs_review',
      'governance_blocked',
      'write_succeeded',
      'write_failed',
      'write_result_unknown',
      'write_needs_reconciliation',
      'write_partial',
      'duplicate_skipped',
      'review_pending',
      'review_resolved',
      'expired',
    ];
    const nonTerminal = ['received', 'ocr_processing', 'ocr_completed', 'candidate_drafted', 'governance_passed'];

    for (const s of terminal) {
      expect(isTerminalStatus(s as never)).toBe(true);
    }
    for (const s of nonTerminal) {
      expect(isTerminalStatus(s as never)).toBe(false);
    }
  });
});
