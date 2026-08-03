'use client';

import type { ProcessingStage, ScreenshotStatus } from '@/lib/types';
import type { ScreenshotItem } from '@/lib/types';

/**
 * 处理阶段展示组件
 * - 显示上传→OCR→候选→治理→写入 阶段（AC-B02）
 * - 响应式布局（AC-B11）
 */

const STAGES: Array<{ key: ProcessingStage; label: string }> = [
  { key: 'uploading', label: '上传' },
  { key: 'ocr', label: 'OCR' },
  { key: 'candidate', label: '候选' },
  { key: 'governance', label: '治理' },
  { key: 'preview', label: '预览' },
  { key: 'write', label: '写入' },
  { key: 'done', label: '完成' },
];

const STAGE_ORDER: ProcessingStage[] = ['idle', 'uploading', 'ocr', 'candidate', 'governance', 'preview', 'write', 'done'];

interface Props {
  item: ScreenshotItem;
}

export function ProcessingStatus({ item }: Props) {
  const currentIdx = STAGE_ORDER.indexOf(item.stage);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
        {STAGES.map((s, idx) => {
          const stageIdx = STAGE_ORDER.indexOf(s.key);
          const isDone = currentIdx > stageIdx;
          const isCurrent = currentIdx === stageIdx;
          const isFailed = item.stage === 'done' && isWriteFailed(item.serverStatus);
          const isWarning = item.stage === 'done' && isWriteWarning(item.serverStatus);

          return (
            <div key={s.key} className="flex items-center shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-medium border-2 transition-colors
                    ${isDone ? 'bg-green-500 border-green-500 text-white' : ''}
                    ${isCurrent && !isFailed && !isWarning ? 'bg-blue-500 border-blue-500 text-white animate-pulse' : ''}
                    ${isCurrent && isFailed ? 'bg-red-500 border-red-500 text-white' : ''}
                    ${isCurrent && isWarning ? 'bg-amber-500 border-amber-500 text-white' : ''}
                    ${!isDone && !isCurrent ? 'bg-white border-gray-300 text-gray-400' : ''}`}
                >
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-[10px] sm:text-xs ${
                    isCurrent && isFailed
                      ? 'text-red-600 font-medium'
                      : isCurrent && isWarning
                        ? 'text-amber-700 font-medium'
                        : isCurrent || isDone
                        ? 'text-gray-800 font-medium'
                        : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-0.5 w-4 sm:w-8 mx-0.5 ${
                    currentIdx > stageIdx ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 服务端状态 */}
      {item.serverStatus && (
        <p className="mt-2 text-xs text-gray-500">
          服务端状态：<code className="px-1 py-0.5 rounded bg-gray-100 text-gray-700">{item.serverStatus}</code>
          {item.statusResponse?.ocr?.confidence != null && (
            <span className="ml-2">OCR 置信度: {(item.statusResponse.ocr.confidence * 100).toFixed(0)}%</span>
          )}
        </p>
      )}

      {/* 错误提示 */}
      {item.error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {item.error}
        </p>
      )}

      {/* 重复提示（幂等重放） */}
      {item.statusResponse && item.serverStatus === 'duplicate_skipped' && (
        <p className="mt-2 text-sm text-amber-600">
          该截图已被处理过（重复跳过），无需重复提交。
        </p>
      )}
    </div>
  );
}

function isWriteFailed(status?: ScreenshotStatus): boolean {
  return (
    status === 'ocr_failed' ||
    status === 'write_failed' ||
    status === 'write_result_unknown' ||
    status === 'governance_blocked'
  );
}

function isWriteWarning(status?: ScreenshotStatus): boolean {
  return status === 'write_partial' || status === 'write_needs_reconciliation';
}
