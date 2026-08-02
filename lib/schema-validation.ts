/**
 * Response Schema Validation (AC-A06)
 *
 * 使用 zod 对 realApiClient 返回的数据进行结构校验。
 * 对复杂嵌套类型（candidate_v1、governance_result_v1）使用 .loose() 允许额外字段，
 * 但强制校验必需字段与枚举值，防止畸形数据进入 UI。
 *
 * 设计决策：
 * - 本文件仅导出 zod schema，不导入 api-client.ts（避免循环依赖）
 * - validateOrThrow 辅助函数定义在 api-client.ts 中，抛出 ScreenshotApiError
 */

import { z } from 'zod';

// ============================================================================
// 公共枚举（镜像 types.ts）
// ============================================================================

export const screenshotStatusSchema = z.enum([
  'received',
  'ocr_processing',
  'ocr_completed',
  'candidate_drafted',
  'governance_passed',
  'governance_needs_review',
  'governance_blocked',
  'write_succeeded',
  'write_failed',
  'duplicate_skipped',
  'review_pending',
  'review_resolved',
  'expired',
]);

export const writeResultStatusSchema = z.enum([
  'succeeded',
  'failed',
  'rolled_back',
  'not_attempted',
]);

const ocrStatusSchema = z.enum(['pending', 'processing', 'succeeded', 'failed']);
const candidateStatusSchema = z.enum(['drafted', 'confirmed', 'rejected']);
const governanceDecisionSchema = z.enum(['PASS', 'NEEDS_REVIEW', 'BLOCKED']);
const reviewStatusSchema = z.enum(['CREATED', 'ALREADY_EXISTS']);
const textBlockTypeSchema = z.enum([
  'text',
  'date',
  'phone',
  'email',
  'price',
  'name',
]);

// ============================================================================
// 1. POST /v1/screenshots — CreateScreenshotResponse
// ============================================================================

export const createScreenshotResponseSchema = z
  .object({
    screenshot_id: z.string(),
    ingestion_id: z.string(),
    status: screenshotStatusSchema,
    idempotent_replay: z.boolean(),
    ocr_task_id: z.string().optional(),
    created_at: z.string(),
  })
  .loose();

// ============================================================================
// 2. GET /v1/screenshots/:id — GetScreenshotStatusResponse
// ============================================================================

export const getScreenshotStatusResponseSchema = z
  .object({
    screenshot_id: z.string(),
    ingestion_id: z.string(),
    status: screenshotStatusSchema,
    ocr: z
      .object({
        status: ocrStatusSchema,
        engine: z.string().optional(),
        confidence: z.number().optional(),
        text_blocks_count: z.number().optional(),
        error_code: z.string().optional(),
        processed_at: z.string().optional(),
      })
      .loose()
      .optional(),
    candidate: z
      .object({
        status: candidateStatusSchema,
        candidate_id: z.string().optional(),
        quality_score: z.number().optional(),
        quality_status: z.string().optional(),
      })
      .loose()
      .optional(),
    governance: z
      .object({
        decision: governanceDecisionSchema.optional(),
        rule_version: z.string().optional(),
        review_task_id: z.union([z.string(), z.null()]).optional(),
      })
      .loose()
      .optional(),
    write: z
      .object({
        status: writeResultStatusSchema.optional(),
        entity_count: z.number().optional(),
        completed_at: z.string().optional(),
      })
      .loose()
      .optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();

// ============================================================================
// 3. GET /v1/screenshots/:id/evidence — GetScreenshotEvidenceResponse
// ============================================================================

export const getScreenshotEvidenceResponseSchema = z
  .object({
    screenshot_id: z.string(),
    ocr_evidence: z
      .object({
        engine: z.string(),
        ocr_version: z.string(),
        text_blocks: z
          .array(
            z
              .object({
                type: textBlockTypeSchema,
                text: z.string(),
                line: z.number().optional(),
                confidence: z.number().optional(),
                bbox: z
                  .object({
                    x: z.number(),
                    y: z.number(),
                    width: z.number(),
                    height: z.number(),
                  })
                  .loose()
                  .optional(),
              })
              .loose(),
          ),
        raw_text: z.string(),
        confidence: z.number(),
        processed_at: z.string(),
      })
      .loose(),
    candidate_v1: z
      .object({
        schema_version: z.string(),
        candidate_id: z.string(),
        ingestion_id: z.string(),
        source: z
          .object({
            system: z.string(),
            table: z.string().optional(),
            record_id: z.string(),
            source_type: z.string(),
          })
          .loose(),
        entity_type: z.string(),
        raw_evidence: z
          .object({
            raw_text: z.string(),
            segments: z.array(z.unknown()).optional(),
            content_hash: z.string(),
          })
          .loose(),
        normalized_fields: z.record(z.string(), z.unknown()),
        quality: z
          .object({
            status: z.string(),
            issues: z
              .array(
                z
                  .object({
                    code: z.string(),
                    message: z.string(),
                    severity: z.string().optional(),
                  })
                  .loose(),
              ),
            score: z.number().optional(),
          })
          .loose(),
        processing: z
          .object({
            extractor_version: z.string(),
            attempt: z.number(),
            created_at: z.string(),
          })
          .loose(),
        idempotency_key: z.string(),
      })
      .loose(),
  })
  .loose();

// ============================================================================
// 4. POST /v1/screenshots/:id/corrections — SubmitCorrectionsResponse
// ============================================================================

export const submitCorrectionsResponseSchema = z
  .object({
    screenshot_id: z.string(),
    candidate_v1: z
      .object({
        schema_version: z.string(),
        candidate_id: z.string(),
        normalized_fields: z.record(z.string(), z.unknown()),
        quality: z
          .object({
            status: z.string(),
            issues: z.array(z.unknown()),
            score: z.number().optional(),
          })
          .loose(),
      })
      .loose(),
    field_authority: z.literal('CONFIRMED'),
    correction_applied_at: z.string(),
    reviewer_id: z.string(),
  })
  .loose();

// ============================================================================
// 5. POST /v1/screenshots/:id/confirm — ConfirmWriteResponse
// ============================================================================

export const confirmWriteResponseSchema = z
  .object({
    screenshot_id: z.string(),
    ingestion_id: z.string(),
    status: screenshotStatusSchema,
    write_results: z.array(
      z
        .object({
          entity_type: z.enum(['customer', 'project', 'model']),
          target_table_id: z.string(),
          business_record_id: z.union([z.string(), z.null()]).optional(),
          created: z.boolean(),
          // 放宽为 string：容忍 batchWriter 返回的大写值
          status: z.string(),
          error_code: z.string().optional(),
          write_log_id: z.string().optional(),
        })
        .loose(),
    ),
    transaction_snapshot_id: z.string().optional(),
    completed_at: z.string().optional(),
    error_code: z.string().optional(),
  })
  .loose();

// ============================================================================
// 6. POST /v1/screenshots/:id/escalate-review — EscalateReviewResponse
// ============================================================================

export const escalateReviewResponseSchema = z
  .object({
    screenshot_id: z.string(),
    governance_result_v1: z
      .object({
        schema_version: z.string(),
        candidate_id: z.string(),
        decision: z.literal('NEEDS_REVIEW'),
        classification: z
          .object({
            entity_type: z.string(),
            project_type: z.string().optional(),
            confidence: z.number().optional(),
          })
          .loose(),
        rule_version: z.string(),
        violations: z.array(
          z
            .object({
              code: z.string(),
              message: z.string(),
              severity: z.string(),
            })
            .loose(),
        ),
        write: z
          .object({
            status: z.literal('NOT_ATTEMPTED'),
            target_table: z.string(),
            target_record_id: z.null(),
          })
          .loose(),
        review: z
          .object({
            status: reviewStatusSchema,
            review_task_id: z.string(),
            ai_explanation: z
              .object({
                available: z.boolean(),
                reason: z.string(),
                summary: z.string().optional(),
                suggested_fix: z.string().optional(),
              })
              .loose()
              .optional(),
          })
          .loose(),
        audit: z
          .object({
            audit_id: z.string(),
            timestamp: z.string(),
            source_record_id: z.string(),
            idempotency_key: z.string(),
            rule_version: z.string(),
          })
          .loose(),
      })
      .loose(),
    review_task: z
      .object({
        review_task_id: z.string(),
        status: z.literal('pending_review'),
        feishu_review_record_id: z.string().optional(),
        created_at: z.string(),
      })
      .loose(),
  })
  .loose();

// ============================================================================
// 7. GET /v1/screenshots/:id/final-result — GetFinalResultResponse
// ============================================================================

export const getFinalResultResponseSchema = z
  .object({
    screenshot_id: z.string(),
    ingestion_id: z.string(),
    final_status: screenshotStatusSchema,
    governance_result_v1: z
      .object({
        schema_version: z.string(),
        candidate_id: z.string(),
        decision: governanceDecisionSchema,
        classification: z
          .object({
            entity_type: z.string(),
            project_type: z.string().optional(),
            confidence: z.number().optional(),
          })
          .loose(),
        rule_version: z.string(),
        violations: z.array(
          z
            .object({
              code: z.string(),
              message: z.string(),
              severity: z.string(),
            })
            .loose(),
        ),
        write: z
          .object({
            // 放宽为 string：SOP 返回大写 'NOT_ATTEMPTED' 等，
            // collator getFinalResult 重新计算为小写，但需容忍两种来源
            status: z.string(),
            target_table: z.string(),
            target_record_id: z.union([z.string(), z.null()]).optional(),
            attempted_at: z.string().optional(),
          })
          .loose(),
        review: z
          .object({
            status: z.string(),
            // 可能为 undefined（SOP 返回 null，但 JS 序列化可能丢失）
            review_task_id: z.union([z.string(), z.null()]).optional(),
            ai_explanation: z
              .object({
                available: z.boolean(),
                reason: z.string().optional(),
                summary: z.string().optional(),
                suggested_fix: z.string().optional(),
              })
              .loose()
              .optional(),
          })
          .loose(),
        audit: z
          .object({
            audit_id: z.string(),
            timestamp: z.string(),
            source_record_id: z.string().optional(),
            idempotency_key: z.string().optional(),
            rule_version: z.string().optional(),
          })
          .loose(),
      })
      .loose(),
    write_logs: z.array(
      z
        .object({
          write_log_id: z.string(),
          ingestion_id: z.string(),
          target_table_id: z.string(),
          // 可能为 undefined（WriteResult 中 business_record_id 可能未设置）
          business_record_id: z.union([z.string(), z.null()]).optional(),
          // 放宽为 string：容忍 SOP 大写值
          status: z.string(),
          error_code: z.string().optional(),
          created_at: z.string(),
        })
        .loose(),
    ),
    review_task: z
      .object({
        review_task_id: z.string(),
        status: z.string(),
        created_at: z.string(),
        resolved_at: z.string().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    transaction_snapshot: z
      .object({
        snapshot_id: z.string(),
        // 放宽为 string：后端 batchWriter 可能返回 'blocked' 等非枚举值
        status: z.string(),
        records_created: z.number(),
        records_rolled_back: z.number(),
      })
      .loose()
      .optional(),
    completed_at: z.string().optional(),
  })
  .loose();

// ============================================================================
// 8. POST /v1/internal-controlled-writes/* — Internal-controlled 3 步流程
// ============================================================================

const writeTableSchema = z.enum(['customer', 'project', 'model']);

export const internalControlledWriteResultSchema = z
  .object({
    status: z.string(),
    write_results: z.array(
      z
        .object({
          entity_type: writeTableSchema,
          target_table_id: z.string(),
          business_record_id: z.union([z.string(), z.null()]).optional(),
          created: z.boolean(),
          status: z.string(),
          error_code: z.string().optional(),
          write_log_id: z.string().optional(),
        })
        .loose(),
    ),
    transaction_snapshot_id: z.string().optional(),
    error_code: z.string().optional(),
    additional_create_calls: z.number(),
    completed_at: z.string().optional(),
    reconciliation: z.string().optional(),
  })
  .loose();

export const internalWritePreviewSchema = z
  .object({
    preview_id: z.string(),
    nonce: z.string(),
    ingestion_id: z.string(),
    candidate_id: z.string(),
    candidate_digest: z.string(),
    governance_digest: z.string(),
    authoritative_plan_digest: z.string(),
    operator: z.string(),
    target_tables: z.array(writeTableSchema),
    target_table_digests: z.record(z.string(), z.string()).optional(),
    base_token_digest: z.string().optional(),
    created_at: z.string(),
    expires_at: z.string(),
    // 放宽为 string：容忍后端未来扩展的状态值
    status: z.string(),
    confirmed_by: z.string().optional(),
    confirmed_at: z.string().optional(),
    executed_by: z.string().optional(),
    executed_at: z.string().optional(),
    result: internalControlledWriteResultSchema.optional(),
  })
  .loose();

// ============================================================================
// 统一导出
// ============================================================================

export const responseSchemas = {
  createScreenshot: createScreenshotResponseSchema,
  getScreenshotStatus: getScreenshotStatusResponseSchema,
  getScreenshotEvidence: getScreenshotEvidenceResponseSchema,
  submitCorrections: submitCorrectionsResponseSchema,
  confirmWrite: confirmWriteResponseSchema,
  escalateReview: escalateReviewResponseSchema,
  getFinalResult: getFinalResultResponseSchema,
  internalWritePreview: internalWritePreviewSchema,
  internalControlledWriteResult: internalControlledWriteResultSchema,
};
