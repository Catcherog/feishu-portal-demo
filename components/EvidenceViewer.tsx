'use client';

import type { GetScreenshotEvidenceResponse } from '@/lib/types';

/**
 * OCR 证据查看器
 * - 展示 OCR 原文与候选字段对照（AC-B03）
 * - 候选字段可查看对应证据
 * - 响应式布局（AC-B11）
 */

interface Props {
  evidence: GetScreenshotEvidenceResponse;
}

export function EvidenceViewer({ evidence }: Props) {
  const { ocr_evidence, candidate_v1 } = evidence;

  return (
    <div className="space-y-4">
      {/* OCR 概览 */}
      <div className="rounded-lg bg-gray-50 p-3 border border-gray-200">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="font-medium">OCR 引擎:</span>
          <code className="px-1.5 py-0.5 rounded bg-white border border-gray-200">{ocr_evidence.engine}</code>
          <span className="font-medium ml-2">版本:</span>
          <code className="px-1.5 py-0.5 rounded bg-white border border-gray-200">{ocr_evidence.ocr_version}</code>
          <span className="font-medium ml-2">置信度:</span>
          <span className="text-green-700 font-medium">{(ocr_evidence.confidence * 100).toFixed(0)}%</span>
          <span className="font-medium ml-2">文本块:</span>
          <span>{ocr_evidence.text_blocks.length}</span>
        </div>
      </div>

      {/* 原文展示 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">OCR 原文</h4>
        <pre className="text-xs text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-200 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
          {ocr_evidence.raw_text}
        </pre>
      </div>

      {/* 候选字段 + 证据来源 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">候选字段与证据来源</h4>
        <p className="text-xs text-gray-500 mb-2">
          以下为 OCR 提取的候选字段，每个字段标注了对应的 OCR 文本块作为证据来源。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">字段名</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">候选值</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">证据来源（OCR 文本块）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(candidate_v1.normalized_fields).map(([key, value]) => {
                const evidenceBlock = findEvidenceBlock(key, ocr_evidence.text_blocks, String(value));
                return (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-700 font-mono">{key}</td>
                    <td className="px-3 py-2 text-xs text-gray-900 break-all">{String(value)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {evidenceBlock ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="break-all">&ldquo;{evidenceBlock.text}&rdquo;</span>
                          <span className="text-[10px] text-gray-400">
                            类型: {evidenceBlock.type}
                            {evidenceBlock.confidence != null && ` | 置信度: ${(evidenceBlock.confidence * 100).toFixed(0)}%`}
                            {evidenceBlock.line != null && ` | 行: ${evidenceBlock.line}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 质量信息 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">候选质量</h4>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`px-2 py-0.5 rounded font-medium ${
              candidate_v1.quality.status === 'OK'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {candidate_v1.quality.status}
          </span>
          {candidate_v1.quality.score != null && (
            <span className="text-gray-600">评分: {(candidate_v1.quality.score * 100).toFixed(0)}%</span>
          )}
          {candidate_v1.quality.issues.length > 0 && (
            <ul className="w-full mt-1 space-y-0.5">
              {candidate_v1.quality.issues.map((issue, idx) => (
                <li key={idx} className="text-amber-700">
                  <code className="text-xs">{issue.code}</code>: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** 根据字段名和值查找对应的 OCR 文本块作为证据 */
function findEvidenceBlock(
  fieldKey: string,
  blocks: GetScreenshotEvidenceResponse['ocr_evidence']['text_blocks'],
  value: string,
) {
  // 优先按字段名推断的文本块类型匹配
  const typeMap: Record<string, GetScreenshotEvidenceResponse['ocr_evidence']['text_blocks'][number]['type']> = {
    customer_name: 'name',
    contact_phone: 'phone',
    phone: 'phone',
    email: 'email',
    project_amount: 'price',
    amount: 'price',
    appointment_date: 'date',
    date: 'date',
  };
  const expectedType = typeMap[fieldKey];
  if (expectedType) {
    const match = blocks.find((b) => b.type === expectedType);
    if (match) return match;
  }
  // 回退：按值匹配
  const valueMatch = blocks.find((b) => b.text.includes(value) || value.includes(b.text));
  return valueMatch ?? null;
}
