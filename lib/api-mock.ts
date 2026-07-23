/**
 * API Mock 实现
 *
 * 为 7 个截图 API 提供本地模拟数据，严格适配 screenshot-api-v1.ts 契约。
 * 所有数据为匿名合成数据，不包含真实客户信息，不包含客片/样片业务规则（AC-B10）。
 */

import type {
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
  ScreenshotStatus,
} from './types';

/** 模拟网络延迟 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 生成随机 ID */
function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** 生成 ISO-8601 时间戳 */
function nowIso(): string {
  return new Date().toISOString();
}

/** 存储每个 screenshot 的状态机，便于 Mock 多次查询时推进状态 */
interface MockScreenshotState {
  screenshotId: string;
  ingestionId: string;
  createdAt: string;
  updatedAt: string;
  request: CreateScreenshotRequest;
  status: ScreenshotStatus;
  corrections?: SubmitCorrectionsRequest;
  confirmRequest?: ConfirmWriteRequest;
  escalateRequest?: EscalateReviewRequest;
  /** 状态推进次数（每次 getStatus 调用推进一次） */
  pollCount: number;
}

/** 内存存储 */
const mockStore = new Map<string, MockScreenshotState>();

/** 状态推进序列：received → ocr_processing → ocr_completed → candidate_drafted → governance_passed → write_succeeded */
const STAGE_SEQUENCE: ScreenshotStatus[] = [
  'received',
  'ocr_processing',
  'ocr_completed',
  'candidate_drafted',
  'governance_passed',
  'write_succeeded',
];

/** 根据轮询次数推断当前阶段 */
function inferStage(pollCount: number): ScreenshotStatus {
  const idx = Math.min(pollCount, STAGE_SEQUENCE.length - 1);
  return STAGE_SEQUENCE[idx];
}

// ============================================================================
// 匿名合成数据生成器
// ============================================================================

/** 匿名候选字段（模拟从聊天截图 OCR 提取的normalized_fields） */
function buildAnonymousCandidateFields(): Record<string, unknown> {
  return {
    customer_name: '匿名客户' + Math.floor(Math.random() * 900 + 100),
    contact_phone: '138****' + String(Math.floor(Math.random() * 9000 + 1000)),
    project_type: '写真套系',
    project_amount: Math.floor(Math.random() * 5000 + 1000),
    appointment_date: '2026-08-' + String(Math.floor(Math.random() * 28 + 1)).padStart(2, '0'),
    shoot_location: '示例门店·1号棚',
    channel: '小红书',
    note: '匿名合成演示数据，非真实客户',
  };
}

/** 匿名 OCR 文本块 */
function buildAnonymousTextBlocks() {
  return [
    { type: 'name' as const, text: '匿名客户123', line: 1, confidence: 0.95 },
    { type: 'phone' as const, text: '138****5678', line: 2, confidence: 0.91 },
    { type: 'text' as const, text: '你好，想咨询写真套餐', line: 3, confidence: 0.88 },
    { type: 'price' as const, text: '预算3000左右', line: 4, confidence: 0.86 },
    { type: 'date' as const, text: '8月15日有空吗', line: 5, confidence: 0.92 },
    { type: 'text' as const, text: '在哪家店拍呢', line: 6, confidence: 0.9 },
  ];
}

// ============================================================================
// 1. POST /v1/screenshots — 创建截图提交
// ============================================================================

export async function mockCreateScreenshot(
  req: CreateScreenshotRequest,
): Promise<CreateScreenshotResponse> {
  await delay(400 + Math.random() * 300);
  const screenshotId = genId('ss');
  const ingestionId = genId('ing');
  const now = nowIso();
  mockStore.set(screenshotId, {
    screenshotId,
    ingestionId,
    createdAt: now,
    updatedAt: now,
    request: req,
    status: 'received',
    pollCount: 0,
  });
  return {
    screenshot_id: screenshotId,
    ingestion_id: ingestionId,
    status: 'received',
    idempotent_replay: false,
    ocr_task_id: genId('ocr'),
    created_at: now,
  };
}

// ============================================================================
// 2. GET /v1/screenshots/:id — 查询处理状态
// ============================================================================

export async function mockGetScreenshotStatus(
  screenshotId: string,
): Promise<GetScreenshotStatusResponse> {
  await delay(200 + Math.random() * 200);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  // 每次查询推进一次状态
  state.pollCount += 1;
  const stage = inferStage(state.pollCount);
  state.status = stage;
  state.updatedAt = nowIso();

  const resp: GetScreenshotStatusResponse = {
    screenshot_id: state.screenshotId,
    ingestion_id: state.ingestionId,
    status: stage,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  };

  if (stage === 'ocr_processing' || stage === 'ocr_completed') {
    resp.ocr = {
      status: stage === 'ocr_completed' ? 'succeeded' : 'processing',
      engine: 'mock-ocr-engine',
      confidence: stage === 'ocr_completed' ? 0.91 : undefined,
      text_blocks_count: 6,
      processed_at: stage === 'ocr_completed' ? state.updatedAt : undefined,
    };
  }
  if (stage === 'candidate_drafted' || stage === 'governance_passed' || stage === 'write_succeeded') {
    resp.ocr = {
      status: 'succeeded',
      engine: 'mock-ocr-engine',
      confidence: 0.91,
      text_blocks_count: 6,
      processed_at: state.updatedAt,
    };
    resp.candidate = {
      status: 'drafted',
      candidate_id: genId('cand'),
      quality_score: 0.88,
      quality_status: 'OK',
    };
  }
  if (stage === 'governance_passed' || stage === 'write_succeeded') {
    resp.governance = {
      decision: 'PASS',
      rule_version: 'mock-rule-v1',
      review_task_id: null,
    };
  }
  if (stage === 'write_succeeded') {
    resp.write = {
      status: 'succeeded',
      entity_count: 1,
      completed_at: state.updatedAt,
    };
  }
  return resp;
}

// ============================================================================
// 3. GET /v1/screenshots/:id/evidence — 获取 OCR 证据和 Candidate
// ============================================================================

export async function mockGetScreenshotEvidence(
  screenshotId: string,
): Promise<GetScreenshotEvidenceResponse> {
  await delay(300 + Math.random() * 200);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  const now = nowIso();
  const fields = buildAnonymousCandidateFields();
  return {
    screenshot_id: screenshotId,
    ocr_evidence: {
      engine: 'mock-ocr-engine',
      ocr_version: 'mock-v1.0',
      text_blocks: buildAnonymousTextBlocks(),
      raw_text:
        '匿名客户123\n138****5678\n你好，想咨询写真套餐\n预算3000左右\n8月15日有空吗\n在哪家店拍呢',
      confidence: 0.91,
      processed_at: now,
    },
    candidate_v1: {
      schema_version: 'candidate-v1',
      candidate_id: genId('cand'),
      ingestion_id: state.ingestionId,
      source: {
        system: state.request.source_system,
        table: 'screenshots',
        record_id: state.request.source_record_id,
        source_type: 'chat_screenshot',
      },
      entity_type: 'customer',
      raw_evidence: {
        raw_text:
          '匿名客户123\n138****5678\n你好，想咨询写真套餐\n预算3000左右\n8月15日有空吗\n在哪家店拍呢',
        segments: [],
        content_hash: genId('hash'),
      },
      normalized_fields: fields,
      quality: {
        status: 'OK',
        issues: [],
        score: 0.88,
      },
      processing: {
        extractor_version: 'mock-extractor-v1',
        attempt: 1,
        created_at: state.createdAt,
      },
      idempotency_key: genId('idem'),
    },
  };
}

// ============================================================================
// 4. POST /v1/screenshots/:id/corrections — 提交人工修正
// ============================================================================

export async function mockSubmitCorrections(
  screenshotId: string,
  req: SubmitCorrectionsRequest,
): Promise<SubmitCorrectionsResponse> {
  await delay(300 + Math.random() * 200);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  state.corrections = req;
  state.updatedAt = nowIso();
  // 合并修正字段到候选
  const baseFields = buildAnonymousCandidateFields();
  const merged = { ...baseFields, ...req.corrections };
  return {
    screenshot_id: screenshotId,
    candidate_v1: {
      schema_version: 'candidate-v1',
      candidate_id: genId('cand'),
      normalized_fields: merged,
      quality: {
        status: 'OK',
        issues: [],
        score: 0.95,
      },
    },
    field_authority: 'CONFIRMED',
    correction_applied_at: state.updatedAt,
    reviewer_id: req.reviewer_id,
  };
}

// ============================================================================
// 5. POST /v1/screenshots/:id/confirm — 确认写入
// ============================================================================

export async function mockConfirmWrite(
  screenshotId: string,
  req: ConfirmWriteRequest,
): Promise<ConfirmWriteResponse> {
  await delay(500 + Math.random() * 300);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  state.confirmRequest = req;
  state.status = 'write_succeeded';
  state.updatedAt = nowIso();
  const dryRun = req.dry_run === true;
  return {
    screenshot_id: screenshotId,
    ingestion_id: state.ingestionId,
    status: 'write_succeeded',
    write_results: [
      {
        entity_type: 'customer',
        target_table_id: 'mock_customer_table',
        business_record_id: dryRun ? null : genId('rec'),
        created: true,
        status: dryRun ? 'not_attempted' : 'succeeded',
        write_log_id: genId('wlog'),
      },
    ],
    transaction_snapshot_id: genId('snap'),
    completed_at: state.updatedAt,
  };
}

// ============================================================================
// 6. POST /v1/screenshots/:id/escalate-review — 转人工复核
// ============================================================================

export async function mockEscalateReview(
  screenshotId: string,
  req: EscalateReviewRequest,
): Promise<EscalateReviewResponse> {
  await delay(400 + Math.random() * 200);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  state.escalateRequest = req;
  state.status = 'review_pending';
  state.updatedAt = nowIso();
  const reviewTaskId = genId('rev');
  const now = state.updatedAt;
  return {
    screenshot_id: screenshotId,
    governance_result_v1: {
      schema_version: 'governance-result-v1',
      candidate_id: genId('cand'),
      decision: 'NEEDS_REVIEW',
      classification: {
        entity_type: 'customer',
        confidence: 0.72,
      },
      rule_version: 'mock-rule-v1',
      violations: [
        {
          code: req.reason_code,
          message: req.reason,
          severity: 'warning',
        },
      ],
      write: {
        status: 'NOT_ATTEMPTED',
        target_table: 'mock_customer_table',
        target_record_id: null,
      },
      review: {
        status: 'CREATED',
        review_task_id: reviewTaskId,
        ai_explanation: {
          available: true,
          reason: 'mock: 触发人工复核规则',
          summary: '已根据提交原因生成复核任务',
        },
      },
      audit: {
        audit_id: genId('audit'),
        timestamp: now,
        source_record_id: state.request.source_record_id,
        idempotency_key: genId('idem'),
        rule_version: 'mock-rule-v1',
      },
    },
    review_task: {
      review_task_id: reviewTaskId,
      status: 'pending_review',
      created_at: now,
    },
  };
}

// ============================================================================
// 7. GET /v1/screenshots/:id/final-result — 获取最终治理和写入结果
// ============================================================================

export async function mockGetFinalResult(
  screenshotId: string,
): Promise<GetFinalResultResponse> {
  await delay(300 + Math.random() * 200);
  const state = mockStore.get(screenshotId);
  if (!state) {
    throw new Error(`[mock] screenshot not found: ${screenshotId}`);
  }
  const now = nowIso();
  const escalated = state.status === 'review_pending' || !!state.escalateRequest;
  const confirmed = state.status === 'write_succeeded' || !!state.confirmRequest;

  if (escalated) {
    // 转复核的最终结果
    const reviewTaskId = state.escalateRequest ? genId('rev') : genId('rev');
    return {
      screenshot_id: screenshotId,
      ingestion_id: state.ingestionId,
      final_status: 'review_pending',
      governance_result_v1: {
        schema_version: 'governance-result-v1',
        candidate_id: genId('cand'),
        decision: 'NEEDS_REVIEW',
        classification: {
          entity_type: 'customer',
          confidence: 0.72,
        },
        rule_version: 'mock-rule-v1',
        violations: [
          {
            code: state.escalateRequest?.reason_code ?? 'UNKNOWN',
            message: state.escalateRequest?.reason ?? 'mock: 转人工复核',
            severity: 'warning',
          },
        ],
        write: {
          status: 'not_attempted',
          target_table: 'mock_customer_table',
          target_record_id: null,
        },
        review: {
          status: 'pending_review',
          review_task_id: reviewTaskId,
          ai_explanation: {
            available: true,
            reason: 'mock: 触发人工复核规则',
            summary: '已生成复核任务等待处理',
          },
        },
        audit: {
          audit_id: genId('audit'),
          timestamp: now,
          source_record_id: state.request.source_record_id,
          idempotency_key: genId('idem'),
          rule_version: 'mock-rule-v1',
        },
      },
      write_logs: [],
      review_task: {
        review_task_id: reviewTaskId,
        status: 'pending_review',
        created_at: state.updatedAt,
      },
      completed_at: now,
    };
  }

  if (confirmed) {
    // 确认写入的最终结果
    return {
      screenshot_id: screenshotId,
      ingestion_id: state.ingestionId,
      final_status: 'write_succeeded',
      governance_result_v1: {
        schema_version: 'governance-result-v1',
        candidate_id: genId('cand'),
        decision: 'PASS',
        classification: {
          entity_type: 'customer',
          confidence: 0.95,
        },
        rule_version: 'mock-rule-v1',
        violations: [],
        write: {
          status: 'succeeded',
          target_table: 'mock_customer_table',
          target_record_id: genId('rec'),
          attempted_at: state.updatedAt,
        },
        review: {
          status: 'not_required',
          review_task_id: null,
        },
        audit: {
          audit_id: genId('audit'),
          timestamp: now,
          source_record_id: state.request.source_record_id,
          idempotency_key: genId('idem'),
          rule_version: 'mock-rule-v1',
        },
      },
      write_logs: [
        {
          write_log_id: genId('wlog'),
          ingestion_id: state.ingestionId,
          target_table_id: 'mock_customer_table',
          business_record_id: genId('rec'),
          status: 'succeeded',
          created_at: state.updatedAt,
        },
      ],
      transaction_snapshot: {
        snapshot_id: genId('snap'),
        status: 'committed',
        records_created: 1,
        records_rolled_back: 0,
      },
      completed_at: now,
    };
  }

  // 默认：治理通过但未确认写入
  return {
    screenshot_id: screenshotId,
    ingestion_id: state.ingestionId,
    final_status: 'governance_passed',
    governance_result_v1: {
      schema_version: 'governance-result-v1',
      candidate_id: genId('cand'),
      decision: 'PASS',
      classification: {
        entity_type: 'customer',
        confidence: 0.88,
      },
      rule_version: 'mock-rule-v1',
      violations: [],
      write: {
        status: 'not_attempted',
        target_table: 'mock_customer_table',
        target_record_id: null,
      },
      review: {
        status: 'not_required',
        review_task_id: null,
      },
      audit: {
        audit_id: genId('audit'),
        timestamp: now,
        source_record_id: state.request.source_record_id,
        idempotency_key: genId('idem'),
        rule_version: 'mock-rule-v1',
      },
    },
    write_logs: [],
    completed_at: now,
  };
}
