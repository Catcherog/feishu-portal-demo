'use client';

import type { ReactNode } from 'react';
import type { ApiMode } from '@/lib/types';
import { getApiBaseUrl } from '@/lib/api-client';

/**
 * 演示边界披露横幅
 *
 * 显著标注当前运行模式与写入边界，避免误以为在生产飞书写入：
 * - 演示环境（mock）：本地模拟，不调用 collator
 * - dry-run 模式：调用真实 API 但不写入生产飞书
 * - 生产环境：调用真实 API 并写入生产飞书
 *
 * 安全约束（AC-B09）：浏览器端不存放飞书 Secret，仅展示模式状态。
 */

interface Props {
  apiMode: ApiMode;
  dryRun: boolean;
}

export function DemoDisclosureBanner({ apiMode, dryRun }: Props) {
  const isMock = apiMode === 'mock';
  const isLive = !isMock && !dryRun;

  const theme = isLive
    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-900', badge: 'bg-emerald-600' }
    : isMock
      ? { bg: 'bg-amber-50', border: 'border-amber-300', title: 'text-amber-900', badge: 'bg-amber-500' }
      : { bg: 'bg-blue-50', border: 'border-blue-300', title: 'text-blue-900', badge: 'bg-blue-600' };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-lg border ${theme.border} ${theme.bg} px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs sm:text-sm`}
    >
      <span className={`font-bold ${theme.title}`}>
        {isLive ? '生产环境' : isMock ? '演示环境' : 'Real API 模式'}
      </span>
      <span aria-hidden className="text-gray-300">|</span>
      {isMock ? (
        <>
          <Pill className={theme.badge}>Mock OCR</Pill>
          <Pill className={theme.badge}>Mock Collator</Pill>
          <span className="text-gray-600">本地 mock，不调用 collator</span>
        </>
      ) : (
        <>
          <Pill className={theme.badge}>Real OCR</Pill>
          <span className="text-gray-600 hidden sm:inline">→ {getApiBaseUrl()}</span>
        </>
      )}
      <span aria-hidden className="text-gray-300">|</span>
      {isMock ? (
        <span className="text-gray-600">不写入生产飞书</span>
      ) : dryRun ? (
        <>
          <Pill className={theme.badge}>dry-run 模式</Pill>
          <span className="text-gray-600">不写入生产飞书</span>
        </>
      ) : (
        <Pill className={theme.badge}>写入生产飞书</Pill>
      )}
    </div>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${className ?? 'bg-gray-500'}`}
    >
      {children}
    </span>
  );
}
