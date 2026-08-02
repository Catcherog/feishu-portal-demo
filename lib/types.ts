/**
 * Portal 类型定义
 *
 * 严格适配 collator 受控 API 契约 screenshot-api-v1.ts（冻结于 2026-07-22）。
 * Portal 不直接依赖 collator 代码，仅手动复制类型定义。
 *
 * 7 个 API：
 *   1. POST   /v1/screenshots                      — 创建截图提交
 *   2. GET    /v1/screenshots/:id                  — 查询处理状态
 *   3. GET    /v1/screenshots/:id/evidence          — 获取 OCR 证据和 Candidate
 *   4. POST   /v1/screenshots/:id/corrections       — 提交人工修正
 *   5. POST   /v1/screenshots/:id/confirm            — 确认写入
 *   6. POST   /v1/screenshots/:id/escalate-review    — 转人工复核
 *   7. GET    /v1/screenshots/:id/final-result       — 获取最终治理和写入结果
 */

// ============================================================================
// 公共类型
// ============================================================================

export const SCREENSHOT_API_VERSION = 'v1' as const;

/** 截图处理状态枚举 */
export type ScreenshotStatus =
  | 'received'
  | 'ocr_processing'
  | 'ocr_completed'
  | 'candidate_drafted'
  | 'governance_passed'
  | 'governance_needs_review'
  | 'governance_blocked'
  | 'write_succeeded'
  | 'write_failed'
  | 'duplicate_skipped'
  | 'review_pending'
  | 'review_resolved'
  | 'expired';

/** 标准错误响应 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 写入结果状态 — 放宽为 string 以容忍 SOP 大写枚举值 */
export type WriteResultStatus = string;

/** 单实体写入结果 */
export interface WriteResult {
  entity_type: 'customer' | 'project' | 'model';
  target_table_id: string;
  business_record_id?: string | null;
  created: boolean;
  status: WriteResultStatus;
  error_code?: string;
  write_log_id?: string;
}

// ============================================================================
// 1. POST /v1/screenshots — 创建截图提交
// ============================================================================

export interface CreateScreenshotRequest {
  source_system: string;
  source_record_id: string;
  submitted_at: string;
  submitted_by?: string;
  image_base64?: string;
  image_filename?: string;
  image_url?: string;
  dry_run?: boolean;
}

export interface CreateScreenshotResponse {
  screenshot_id: string;
  ingestion_id: string;
  status: ScreenshotStatus;
  idempotent_replay: boolean;
  ocr_task_id?: string;
  created_at: string;
}

// ============================================================================
// 2. GET /v1/screenshots/:id — 查询处理状态
// ============================================================================

export interface GetScreenshotStatusResponse {
  screenshot_id: string;
  ingestion_id: string;
  status: ScreenshotStatus;
  ocr?: {
    status: 'pending' | 'processing' | 'succeeded' | 'failed';
    engine?: string;
    confidence?: number;
    text_blocks_count?: number;
    error_code?: string;
    processed_at?: string;
  };
  candidate?: {
    status: 'drafted' | 'confirmed' | 'rejected';
    candidate_id?: string;
    quality_score?: number;
    quality_status?: string;
  };
  governance?: {
    decision?: 'PASS' | 'NEEDS_REVIEW' | 'BLOCKED';
    rule_version?: string;
    review_task_id?: string | null;
  };
  write?: {
    status?: WriteResultStatus;
    entity_count?: number;
    completed_at?: string;
  };
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 3. GET /v1/screenshots/:id/evidence — 获取 OCR 证据和 Candidate
// ============================================================================

export interface GetScreenshotEvidenceResponse {
  screenshot_id: string;
  ocr_evidence: {
    engine: string;
    ocr_version: string;
    text_blocks: Array<{
      type: 'text' | 'date' | 'phone' | 'email' | 'price' | 'name';
      text: string;
      line?: number;
      confidence?: number;
      bbox?: { x: number; y: number; width: number; height: number };
    }>;
    raw_text: string;
    confidence: number;
    processed_at: string;
  };
  candidate_v1: {
    schema_version: string;
    candidate_id: string;
    ingestion_id: string;
    source: {
      system: string;
      table?: string;
      record_id: string;
      source_type: string;
    };
    entity_type: string;
    raw_evidence: {
      raw_text: string;
      segments?: unknown[];
      content_hash: string;
    };
    normalized_fields: Record<string, unknown>;
    quality: {
      status: string;
      issues: Array<{ code: string; message: string; severity?: string }>;
      score?: number;
    };
    processing: {
      extractor_version: string;
      attempt: number;
      created_at: string;
    };
    idempotency_key: string;
  };
}

// ============================================================================
// 4. POST /v1/screenshots/:id/corrections — 提交人工修正
// ============================================================================

export interface SubmitCorrectionsRequest {
  reviewer_id: string;
  corrections: Record<string, unknown>;
  correction_reason?: string;
}

export interface SubmitCorrectionsResponse {
  screenshot_id: string;
  candidate_v1: {
    schema_version: string;
    candidate_id: string;
    normalized_fields: Record<string, unknown>;
    quality: {
      status: string;
      issues: unknown[];
      score?: number;
    };
  };
  field_authority: 'CONFIRMED';
  correction_applied_at: string;
  reviewer_id: string;
}

// ============================================================================
// 5. POST /v1/screenshots/:id/confirm — 确认写入
// ============================================================================

export interface ConfirmWriteRequest {
  reviewer_id: string;
  candidate_v1_id: string;
  dry_run?: boolean;
  target_tables?: Array<'customer' | 'project' | 'model'>;
}

export interface ConfirmWriteResponse {
  screenshot_id: string;
  ingestion_id: string;
  status: ScreenshotStatus;
  write_results: WriteResult[];
  transaction_snapshot_id?: string;
  completed_at?: string;
  error_code?: string;
}

// ============================================================================
// 6. POST /v1/screenshots/:id/escalate-review — 转人工复核
// ============================================================================

export interface EscalateReviewRequest {
  reviewer_id: string;
  reason_code: string;
  reason: string;
  suggested_fields?: Record<string, unknown>;
}

export interface EscalateReviewResponse {
  screenshot_id: string;
  governance_result_v1: {
    schema_version: string;
    candidate_id: string;
    decision: 'NEEDS_REVIEW';
    classification: {
      entity_type: string;
      project_type?: string;
      confidence?: number;
    };
    rule_version: string;
    violations: Array<{
      code: string;
      message: string;
      severity: string;
    }>;
    write: {
      status: 'NOT_ATTEMPTED';
      target_table: string;
      target_record_id: null;
    };
    review: {
      status: 'CREATED' | 'ALREADY_EXISTS';
      review_task_id: string;
      ai_explanation?: {
        available: boolean;
        reason: string;
        summary?: string;
        suggested_fix?: string;
      };
    };
    audit: {
      audit_id: string;
      timestamp: string;
      source_record_id: string;
      idempotency_key: string;
      rule_version: string;
    };
  };
  review_task: {
    review_task_id: string;
    status: 'pending_review';
    feishu_review_record_id?: string;
    created_at: string;
  };
}

// ============================================================================
// 7. GET /v1/screenshots/:id/final-result — 获取最终治理和写入结果
// ============================================================================

export interface GetFinalResultResponse {
  screenshot_id: string;
  ingestion_id: string;
  final_status: ScreenshotStatus;
  governance_result_v1: {
    schema_version: string;
    candidate_id: string;
    decision: 'PASS' | 'NEEDS_REVIEW' | 'BLOCKED';
    classification: {
      entity_type: string;
      project_type?: string;
      confidence?: number;
    };
    rule_version: string;
    violations: Array<{
      code: string;
      message: string;
      severity: string;
    }>;
    write: {
      status: WriteResultStatus;
      target_table: string;
      target_record_id?: string | null;
      attempted_at?: string;
    };
    review: {
      status: string;
      review_task_id?: string | null;
      ai_explanation?: {
        available: boolean;
        reason?: string;
        summary?: string;
        suggested_fix?: string;
      };
    };
    audit: {
      audit_id: string;
      timestamp: string;
      source_record_id?: string;
      idempotency_key?: string;
      rule_version?: string;
    };
  };
  write_logs: Array<{
    write_log_id: string;
    ingestion_id: string;
    target_table_id: string;
    business_record_id?: string | null;
    status: WriteResultStatus;
    error_code?: string;
    created_at: string;
  }>;
  review_task?: {
    review_task_id: string;
    status: string;
    created_at: string;
    resolved_at?: string;
  } | null;
  transaction_snapshot?: {
    snapshot_id: string;
    status: string;
    records_created: number;
    records_rolled_back: number;
  };
  completed_at?: string;
}

// ============================================================================
// 8. POST /v1/internal-controlled-writes/previews — Internal-controlled 3 步流程
// ============================================================================
// FAMP-INTERNAL-CONTROLLED-WRITE-01: internal-controlled 写入模式
// 3 步流程（每步都需 Authorization: Bearer <JWT>）：
//   8a. POST /v1/internal-controlled-writes/previews           — 生成 preview
//   8b. POST /v1/internal-controlled-writes/previews/:id/confirm — 确认 preview
//   8c. POST /v1/internal-controlled-writes/previews/:id/execute — 执行写入

export interface InternalWritePreviewRequest {
  screenshot_id: string;
  candidate_v1_id: string;
}

export interface InternalWriteConfirmationRequest {
  nonce: string;
  candidate_v1_id: string;
}

/** internal-controlled preview 状态 */
export type InternalWriteStatus =
  | 'not_started'
  | 'preview_generated'
  | 'confirmed'
  | 'executing'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'result_unknown'
  | 'needs_reconciliation'
  | 'partial';

/** internal-controlled 单实体写入结果 */
export interface InternalWriteResultItem {
  entity_type: 'customer' | 'project' | 'model';
  target_table_id: string;
  business_record_id: string | null;
  created: boolean;
  status: 'succeeded' | 'failed' | 'unknown' | 'not_attempted';
  error_code?: string;
  write_log_id?: string;
}

/** internal-controlled 写入结果 */
export interface InternalControlledWriteResult {
  // 放宽为 string：容忍后端新增的状态值
  status: string;
  write_results: InternalWriteResultItem[];
  transaction_snapshot_id?: string;
  error_code?: string;
  additional_create_calls: number;
  completed_at?: string;
  reconciliation?: string;
}

/** internal-controlled preview 响应（8a/8b 共用） */
export interface InternalWritePreview {
  preview_id: string;
  nonce: string;
  ingestion_id: string;
  candidate_id: string;
  candidate_digest: string;
  governance_digest: string;
  authoritative_plan_digest: string;
  operator: string;
  target_tables: Array<'customer' | 'project' | 'model'>;
  target_table_digests?: Partial<Record<'customer' | 'project' | 'model', string>>;
  base_token_digest?: string;
  created_at: string;
  expires_at: string;
  // 放宽为 string：容忍后端新增的状态值
  status: string;
  confirmed_by?: string;
  confirmed_at?: string;
  executed_by?: string;
  executed_at?: string;
  result?: InternalControlledWriteResult;
}

// ============================================================================
// Portal 前端专用类型（不在 API 契约中）
// ============================================================================

/** API 模式：mock 使用本地模拟数据，real 调用 collator HTTP 服务 */
export type ApiMode = 'mock' | 'real';

/** 处理阶段（用于 UI 展示） */
export type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'ocr'
  | 'candidate'
  | 'governance'
  | 'preview'
  | 'write'
  | 'done';

/** 截图上传项（前端状态） */
export interface ScreenshotItem {
  /** 前端生成的临时 ID */
  localId: string;
  /** 文件名 */
  filename: string;
  /** Base64 缩略图（用于预览） */
  previewUrl: string;
  /** Base64 编码的完整图片（用于 API 调用） */
  imageBase64: string;
  /** 文件大小（字节） */
  size: number;
  /** 服务端返回的截图 ID（上传后填充） */
  screenshotId?: string;
  /** 当前处理阶段 */
  stage: ProcessingStage;
  /** 服务端状态（轮询得到） */
  serverStatus?: ScreenshotStatus;
  /** 错误信息（如有） */
  error?: string;
  /** 状态查询响应 */
  statusResponse?: GetScreenshotStatusResponse;
  /** 证据响应 */
  evidenceResponse?: GetScreenshotEvidenceResponse;
  /** 人工修正（用户编辑的字段，key -> value） */
  corrections: Record<string, unknown>;
  /** 修正原因 */
  correctionReason?: string;
  /** 用户是否修改过字段 */
  hasCorrections: boolean;
  /** 确认写入响应 */
  confirmResponse?: ConfirmWriteResponse;
  /** 转复核响应 */
  escalateResponse?: EscalateReviewResponse;
  /** 最终结果响应 */
  finalResultResponse?: GetFinalResultResponse;
  /** 写入 Preview 是否已确认（Confirm/Execute 分离，AC-14/AC-15） */
  previewConfirmed: boolean;
  /** 是否正在执行写入（区别于 submitting） */
  executing: boolean;
  /** 是否正在提交（防止重复点击） */
  submitting: boolean;
  /** FAMP-INTERNAL-CONTROLLED-WRITE-01: internal-controlled preview 响应 */
  internalPreview?: InternalWritePreview;
  /** FAMP-INTERNAL-CONTROLLED-WRITE-01: internal-controlled 写入结果 */
  internalWriteResult?: InternalControlledWriteResult;
}

/** 治理决策展示类型 */
export type GovernanceDecision = 'PASS' | 'NEEDS_REVIEW' | 'BLOCKED' | 'DUPLICATE_SKIPPED';
