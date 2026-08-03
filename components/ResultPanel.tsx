'use client';

import type { ScreenshotItem, GetFinalResultResponse, GovernanceDecision } from '@/lib/types';
import { FeishuRecordRef } from './FeishuRecordRef';

/**
 * 最终结果展示
 * - 显示四类核心结果状态（AC-B06）：PASS / NEEDS_REVIEW / BLOCKED / DUPLICATE_SKIPPED
 * - 响应式布局（AC-B11）
 */

interface Props {
  item: ScreenshotItem;
}

export function ResultPanel({ item }: Props) {
  const { finalResultResponse, confirmResponse, escalateResponse, serverStatus } = item;

  // 推断决策结果
  const decision = inferDecision(item);

  if (!finalResultResponse && !confirmResponse && !escalateResponse) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">最终结果</h4>

      {/* 决策状态卡片 */}
      <div
        className={`rounded-lg border-2 p-4 ${getDecisionStyle(decision, serverStatus)}`}
      >
        <div className="flex items-center gap-2">
          <DecisionIcon decision={decision} />
          <div>
            <p className="text-base font-bold">{getDecisionLabel(decision)}</p>
            <p className="text-xs opacity-80">{getDecisionDescription(decision, serverStatus)}</p>
          </div>
        </div>
      </div>

      {/* 最终结果详情 */}
      {finalResultResponse && (
        <div className="space-y-2">
          {/* 执行终态：治理 PASS 与写入成功是两个独立结论 */}
          <div className={`rounded-lg p-3 border ${getExecutionStatusStyle(finalResultResponse.final_status)}`}>
            <h5 className="text-xs font-semibold mb-1">写入终态</h5>
            <div className="flex flex-wrap gap-2 text-xs">
              <span>状态：<code>{finalResultResponse.final_status}</code></span>
              {finalResultResponse.error_code && (
                <span>错误码：<code>{finalResultResponse.error_code}</code></span>
              )}
              {finalResultResponse.governance_result_v1.write.error_code &&
                finalResultResponse.governance_result_v1.write.error_code !== finalResultResponse.error_code && (
                  <span>写入错误：<code>{finalResultResponse.governance_result_v1.write.error_code}</code></span>
                )}
            </div>
          </div>

          {/* 治理信息 */}
          {finalResultResponse.governance_result_v1 && (
            <div className="rounded-lg bg-gray-50 p-3 border border-gray-200">
              <h5 className="text-xs font-semibold text-gray-700 mb-2">治理结果</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <InfoCell label="规则版本" value={finalResultResponse.governance_result_v1.rule_version} />
                <InfoCell
                  label="实体类型"
                  value={finalResultResponse.governance_result_v1.classification.entity_type}
                />
                {finalResultResponse.governance_result_v1.classification.confidence != null && (
                  <InfoCell
                    label="分类置信度"
                    value={`${(finalResultResponse.governance_result_v1.classification.confidence * 100).toFixed(0)}%`}
                  />
                )}
              </div>

              {/* 违规项 */}
              {finalResultResponse.governance_result_v1.violations.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-red-700 mb-1">违规项：</p>
                  <ul className="space-y-0.5">
                    {finalResultResponse.governance_result_v1.violations.map((v, idx) => (
                      <li key={idx} className="text-xs text-red-600">
                        <code className="text-[10px] bg-red-50 px-1 rounded">{v.code}</code>
                        <span className="ml-1">{v.message}</span>
                        <span className="ml-1 text-gray-400">({v.severity})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 写入日志 */}
          {finalResultResponse.write_logs.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3 border border-gray-200">
              <h5 className="text-xs font-semibold text-gray-700 mb-2">写入日志</h5>
              <div className="space-y-1">
                {finalResultResponse.write_logs.map((log, idx) => (
                  <div key={idx} className="text-xs flex flex-wrap gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium ${getWriteStatusStyle(log.status)}`}
                    >
                      {log.status}
                    </span>
                    <span className="text-gray-600">表: {log.target_table_id}</span>
                    {log.business_record_id && (
                      <span className="text-gray-600">记录: {log.business_record_id}</span>
                    )}
                    {log.error_code && <span className="text-red-600">错误: {log.error_code}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 事务快照 */}
          {finalResultResponse.transaction_snapshot && (
            <div className="rounded-lg bg-gray-50 p-3 border border-gray-200">
              <h5 className="text-xs font-semibold text-gray-700 mb-2">事务快照</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <InfoCell label="快照ID" value={finalResultResponse.transaction_snapshot.snapshot_id} />
                <InfoCell label="状态" value={finalResultResponse.transaction_snapshot.status} />
                <InfoCell
                  label="创建记录"
                  value={String(finalResultResponse.transaction_snapshot.records_created)}
                />
                <InfoCell
                  label="回滚记录"
                  value={String(finalResultResponse.transaction_snapshot.records_rolled_back)}
                />
              </div>
            </div>
          )}

          {/* 复核任务 */}
          {finalResultResponse.review_task && (
            <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
              <h5 className="text-xs font-semibold text-amber-700 mb-2">复核任务</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoCell label="任务ID" value={finalResultResponse.review_task.review_task_id} />
                <InfoCell label="状态" value={finalResultResponse.review_task.status} />
                <InfoCell label="创建时间" value={finalResultResponse.review_task.created_at} />
                {finalResultResponse.review_task.resolved_at && (
                  <InfoCell label="解决时间" value={finalResultResponse.review_task.resolved_at} />
                )}
              </div>
            </div>
          )}

          {/* 飞书记录引用 */}
          {finalResultResponse.governance_result_v1?.write?.target_record_id && (
            <FeishuRecordRef
              recordId={finalResultResponse.governance_result_v1.write.target_record_id}
              tableId={
                finalResultResponse.write_logs[0]?.target_table_id ??
                finalResultResponse.governance_result_v1.write.target_table
              }
            />
          )}

          {/* AI 解释 */}
          {finalResultResponse.governance_result_v1?.review?.ai_explanation?.available && (
            <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
              <h5 className="text-xs font-semibold text-blue-700 mb-1">AI 解释</h5>
              <p className="text-xs text-blue-800">
                {finalResultResponse.governance_result_v1.review.ai_explanation.summary ??
                  finalResultResponse.governance_result_v1.review.ai_explanation.reason}
              </p>
              {finalResultResponse.governance_result_v1.review.ai_explanation.suggested_fix && (
                <p className="text-xs text-blue-700 mt-1">
                  建议: {finalResultResponse.governance_result_v1.review.ai_explanation.suggested_fix}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 审计信息 */}
      {finalResultResponse?.governance_result_v1?.audit && (
        <div className="text-xs text-gray-400 border-t pt-2">
          <p>审计ID: {finalResultResponse.governance_result_v1.audit.audit_id}</p>
          <p>幂等键: {finalResultResponse.governance_result_v1.audit.idempotency_key}</p>
          <p>时间: {finalResultResponse.governance_result_v1.audit.timestamp}</p>
        </div>
      )}
    </div>
  );
}

/** 从截图状态推断决策类型 */
function inferDecision(item: ScreenshotItem): GovernanceDecision {
  const finalResp = item.finalResultResponse;
  if (finalResp) {
    if (finalResp.final_status === 'duplicate_skipped') return 'DUPLICATE_SKIPPED';
    const decision = finalResp.governance_result_v1?.decision;
    if (decision === 'PASS') {
      // 如果写入失败但治理通过，仍然显示 PASS 但会标注
      return 'PASS';
    }
    if (decision === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
    if (decision === 'BLOCKED') return 'BLOCKED';
  }
  if (item.serverStatus === 'duplicate_skipped') return 'DUPLICATE_SKIPPED';
  if (item.escalateResponse) return 'NEEDS_REVIEW';
  if (item.confirmResponse) return 'PASS';
  return 'NEEDS_REVIEW';
}

function getDecisionLabel(d: GovernanceDecision): string {
  switch (d) {
    case 'PASS':
      return '通过';
    case 'NEEDS_REVIEW':
      return '需复核';
    case 'BLOCKED':
      return '已阻止';
    case 'DUPLICATE_SKIPPED':
      return '重复跳过';
  }
}

function getDecisionDescription(d: GovernanceDecision, status?: string): string {
  switch (d) {
    case 'PASS':
      switch (status) {
        case 'write_succeeded':
          return '治理通过并写入成功';
        case 'write_partial':
          return '治理通过，但写入仅部分完成';
        case 'write_result_unknown':
          return '治理通过，但写入结果未知，禁止重试';
        case 'write_needs_reconciliation':
          return '治理通过，但写入需要人工对账';
        case 'write_failed':
          return '治理通过，但写入失败';
        default:
          return '治理通过，尚未确认写入成功';
      }
    case 'NEEDS_REVIEW':
      return '需人工复核后处理';
    case 'BLOCKED':
      return '治理规则阻止，无法写入';
    case 'DUPLICATE_SKIPPED':
      return '检测到重复提交，已跳过';
  }
}

function getDecisionStyle(d: GovernanceDecision, status?: string): string {
  if (d === 'PASS') {
    if (status === 'write_partial' || status === 'write_needs_reconciliation') {
      return 'border-amber-500 bg-amber-50 text-amber-800';
    }
    if (status === 'write_failed' || status === 'write_result_unknown') {
      return 'border-red-500 bg-red-50 text-red-800';
    }
  }
  switch (d) {
    case 'PASS':
      return 'border-green-500 bg-green-50 text-green-800';
    case 'NEEDS_REVIEW':
      return 'border-amber-500 bg-amber-50 text-amber-800';
    case 'BLOCKED':
      return 'border-red-500 bg-red-50 text-red-800';
    case 'DUPLICATE_SKIPPED':
      return 'border-gray-500 bg-gray-50 text-gray-800';
  }
}

function getExecutionStatusStyle(status: string): string {
  switch (status) {
    case 'write_succeeded':
      return 'border-green-200 bg-green-50 text-green-800';
    case 'write_partial':
    case 'write_needs_reconciliation':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    case 'write_failed':
    case 'write_result_unknown':
      return 'border-red-300 bg-red-50 text-red-800';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

function getWriteStatusStyle(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'rolled_back':
      return 'bg-amber-100 text-amber-700';
    case 'not_attempted':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function DecisionIcon({ decision }: { decision: GovernanceDecision }) {
  const className = 'w-6 h-6 shrink-0';
  switch (decision) {
    case 'PASS':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'NEEDS_REVIEW':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case 'BLOCKED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      );
    case 'DUPLICATE_SKIPPED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      );
  }
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className="text-gray-700 break-all font-mono text-[11px]">{value}</span>
    </div>
  );
}
