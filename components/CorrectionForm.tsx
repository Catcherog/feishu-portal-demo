'use client';

import { useState } from 'react';
import { usePortalStore } from '@/lib/store';
import type { ScreenshotItem, GetScreenshotEvidenceResponse } from '@/lib/types';

/**
 * 人工修正表单
 * - 修改的字段有视觉标记（AC-B04）
 * - 失败后保留用户修改，可重试（AC-B07）
 * - 重复点击在客户端被禁用（AC-B08）
 * - 响应式布局（AC-B11）
 */

interface Props {
  item: ScreenshotItem;
  evidence: GetScreenshotEvidenceResponse;
}

export function CorrectionForm({ item, evidence }: Props) {
  const setCorrection = usePortalStore((s) => s.setCorrection);
  const setCorrectionReason = usePortalStore((s) => s.setCorrectionReason);
  const submitCorrections = usePortalStore((s) => s.submitCorrections);

  const originalFields = evidence.candidate_v1.normalized_fields;
  const corrections = item.corrections;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">人工修正</h4>
        <span className="text-xs text-gray-500">
          修改的字段会以 <span className="text-amber-600 font-medium">琥珀色</span> 标记
        </span>
      </div>

      <div className="space-y-2">
        {Object.entries(originalFields).map(([key, originalValue]) => {
          const currentValue = corrections[key] ?? originalValue;
          const isModified = JSON.stringify(currentValue) !== JSON.stringify(originalValue);
          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <label
                className={`text-xs sm:text-sm font-mono w-full sm:w-40 shrink-0 ${
                  isModified ? 'text-amber-700 font-semibold' : 'text-gray-600'
                }`}
              >
                {key}
                {isModified && <span className="ml-1 text-amber-600">*</span>}
              </label>
              <input
                type="text"
                value={String(currentValue ?? '')}
                onChange={(e) => setCorrection(item.localId, key, e.target.value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors
                  ${isModified
                    ? 'border-amber-400 bg-amber-50 text-amber-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                    : 'border-gray-300 bg-white text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'}`}
                placeholder={String(originalValue ?? '')}
              />
            </div>
          );
        })}
      </div>

      {/* 修正原因 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs sm:text-sm text-gray-600 font-medium">修正原因（可选）</label>
        <textarea
          value={item.correctionReason ?? ''}
          onChange={(e) => setCorrectionReason(item.localId, e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="说明修改原因，便于审计追溯"
        />
      </div>

      {/* 提交按钮 */}
      <button
        type="button"
        disabled={item.submitting || !item.hasCorrections}
        onClick={() => submitCorrections(item.localId)}
        className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {item.submitting ? '提交中...' : '提交修正'}
      </button>
      {!item.hasCorrections && (
        <p className="text-xs text-gray-400">请至少修改一个字段后再提交</p>
      )}
    </div>
  );
}
