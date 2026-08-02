'use client';

import type { ProcessingStage } from '@/lib/types';

/**
 * 流程步骤条
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 UI 规范
 *
 * 01 上传材料 -> 02 核对证据 -> 03 修正候选 -> 04 写入预览 -> 05 执行与结果
 *
 * 完成步骤显示勾选，当前步骤高亮，未完成步骤不可随意跳转。
 */

const STEPS = [
  { num: '01', label: '上传材料', stage: 'uploading' as ProcessingStage },
  { num: '02', label: '核对证据', stage: 'ocr' as ProcessingStage },
  { num: '03', label: '修正候选', stage: 'candidate' as ProcessingStage },
  { num: '04', label: '写入预览', stage: 'preview' as ProcessingStage },
  { num: '05', label: '执行与结果', stage: 'done' as ProcessingStage },
];

const STAGE_ORDER: ProcessingStage[] = [
  'idle', 'uploading', 'ocr', 'candidate', 'governance', 'preview', 'write', 'done',
];

interface Props {
  currentStage: ProcessingStage;
}

export function StepIndicator({ currentStage }: Props) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {STEPS.map((step, idx) => {
        const stepIdx = STAGE_ORDER.indexOf(step.stage);
        const isDone = currentIdx > stepIdx;
        const isCurrent = currentIdx === stepIdx ||
          (idx === 2 && (currentStage === 'governance' || currentStage === 'candidate')) ||
          (idx === 3 && currentStage === 'write') ||
          (idx === 4 && (currentStage === 'done' || currentStage === 'write'));

        return (
          <div key={step.num} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-xs font-semibold border-2 transition-all
                  ${isDone ? 'bg-green-500 border-green-500 text-white' : ''}
                  ${isCurrent && !isDone ? 'bg-blue-600 border-blue-600 text-white' : ''}
                  ${!isDone && !isCurrent ? 'bg-white border-gray-200 text-gray-400' : ''}`}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  step.num
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs whitespace-nowrap ${
                  isCurrent || isDone ? 'text-gray-800 font-medium' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-4 sm:w-8 mx-0.5 mt-[-12px] ${
                  currentIdx > stepIdx ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
