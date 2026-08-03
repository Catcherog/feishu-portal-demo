import type { ProcessingStage } from './types';

/**
 * internal-controlled preview 的可操作阶段必须以服务端 preview.status 为准，
 * 不能仅依赖前端的 stage / previewConfirmed 镜像状态。
 */
export function isControlledPreviewGenerated(status: string | undefined): boolean {
  return status === 'preview_generated';
}

export function isControlledPreviewConfirmed(status: string | undefined): boolean {
  return status === 'confirmed';
}

/**
 * 一旦进入 Preview / Execute 子流程，就停止截图状态轮询。
 * 截图 GET /v1/screenshots/:id 只反映 ingestion 主流程，通常仍停留在
 * governance_passed；继续轮询会把前端 stage 从 preview 回退到 governance。
 */
export function shouldStopAutoPolling(
  stage: ProcessingStage,
  hasInternalPreview: boolean,
): boolean {
  return (
    stage === 'preview' ||
    stage === 'write' ||
    stage === 'done' ||
    hasInternalPreview
  );
}

/**
 * 防止已发出的异步轮询在 Preview/Execute 状态更新后返回，使用旧响应覆盖新状态。
 */
export function shouldPreserveControlledWorkflowState(
  stage: ProcessingStage,
  hasInternalPreview: boolean,
  hasInternalWriteResult: boolean,
): boolean {
  return (
    hasInternalPreview ||
    hasInternalWriteResult ||
    stage === 'preview' ||
    stage === 'write' ||
    stage === 'done'
  );
}
