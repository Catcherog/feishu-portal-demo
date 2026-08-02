'use client';

import { useState } from 'react';
import type { ScreenshotItem, GetScreenshotEvidenceResponse } from '@/lib/types';

/**
 * 写入 Preview 实体卡
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 UI 规范
 *
 * 使用实体卡而非原始 JSON：
 * - Customer: 操作 Create, 业务键已脱敏, 字段数 N
 * - Project: 操作 Create, 关联 Customer, 关键字段已脱敏
 * 允许折叠查看开发者 JSON，但默认不展开。
 */

interface Props {
  item: ScreenshotItem;
  evidence: GetScreenshotEvidenceResponse;
}

export function WritePreview({ item, evidence }: Props) {
  const [showJson, setShowJson] = useState(false);
  const fields = item.corrections ?? evidence.candidate_v1.normalized_fields;
  const fieldEntries = Object.entries(fields);

  // 脱敏处理：隐藏手机号、微信号等敏感字段的部分内容
  const maskedValue = (key: string, value: unknown): string => {
    const str = String(value ?? '');
    if (/phone|contact|mobile|电话|联系/i.test(key)) {
      return str.length > 4 ? str.slice(0, 3) + '****' + str.slice(-2) : str;
    }
    if (/wechat|weixin|微信/i.test(key)) {
      return str.length > 2 ? str.slice(0, 1) + '***' : str;
    }
    return str;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">写入预览</h4>
        <button
          type="button"
          onClick={() => setShowJson(!showJson)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {showJson ? '隐藏 JSON' : '查看开发者 JSON'}
        </button>
      </div>

      {/* 实体卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Customer 实体卡 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700">Customer</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              Create
            </span>
          </div>
          <div className="text-[10px] text-gray-500">业务键: 已脱敏</div>
          <div className="text-[10px] text-gray-500">字段数: {fieldEntries.length}</div>
          <div className="space-y-1 mt-2">
            {fieldEntries.slice(0, 4).map(([key, value]) => (
              <div key={key} className="flex justify-between text-[11px]">
                <span className="text-gray-500 font-mono">{key}</span>
                <span className="text-gray-800 ml-2 truncate max-w-[60%]">{maskedValue(key, value)}</span>
              </div>
            ))}
            {fieldEntries.length > 4 && (
              <div className="text-[10px] text-gray-400">... 共 {fieldEntries.length} 个字段</div>
            )}
          </div>
        </div>

        {/* Project 实体卡 */}
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700">Project</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
              Create
            </span>
          </div>
          <div className="text-[10px] text-gray-500">关联: Customer</div>
          <div className="text-[10px] text-gray-500">关键字段: 已脱敏</div>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500 font-mono">entity_type</span>
              <span className="text-gray-800">{evidence.candidate_v1.entity_type}</span>
            </div>
            {evidence.candidate_v1.quality.status && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500 font-mono">quality</span>
                <span className="text-gray-800">{evidence.candidate_v1.quality.status}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 开发者 JSON（默认折叠） */}
      {showJson && (
        <pre className="text-[10px] text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200 overflow-x-auto max-h-48 overflow-y-auto font-mono">
          {JSON.stringify({ fields, candidate_id: evidence.candidate_v1.candidate_id }, null, 2)}
        </pre>
      )}

      {/* 关联关系图示 */}
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-600">Customer</span>
        <span>←</span>
        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600">Project</span>
        <span className="ml-1">（Project 关联到 Customer）</span>
      </div>
    </div>
  );
}
