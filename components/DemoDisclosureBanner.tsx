'use client';

import type { ReactNode } from 'react';
import type { ApiMode } from '@/lib/types';
import { getApiBaseUrl } from '@/lib/api-client';

/**
 * 运行边界披露横幅。
 *
 * 重要：API mode 只证明浏览器调用了 Collator，不能证明 Collator 使用了真实 OCR。
 * OCR 标识必须来自后端 status/evidence 响应中的 engine/version。
 */

interface Props {
  apiMode: ApiMode;
  dryRun: boolean;
  ocrEngine?: string;
  ocrVersion?: string;
}

const TRUSTED_REAL_OCR_ENGINES = new Set(['tesseract', 'feishu']);

export function DemoDisclosureBanner({ apiMode, dryRun, ocrEngine, ocrVersion }: Props) {
  const isMock = apiMode === 'mock';
  const isLive = !isMock && !dryRun;
  const normalizedEngine = ocrEngine?.trim().toLowerCase();
  const hasBackendOcrEvidence = Boolean(normalizedEngine);
  const trustedRealOcr = Boolean(
    !isMock && normalizedEngine && TRUSTED_REAL_OCR_ENGINES.has(normalizedEngine),
  );
  const untrustedOcr = Boolean(!isMock && normalizedEngine && !trustedRealOcr);

  const theme = isLive
    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-900', badge: 'bg-emerald-600' }
    : isMock
      ? { bg: 'bg-amber-50', border: 'border-amber-300', title: 'text-amber-900', badge: 'bg-amber-500' }
      : { bg: 'bg-blue-50', border: 'border-blue-300', title: 'text-blue-900', badge: 'bg-blue-600' };

  const ocrLabel = isMock
    ? 'Mock OCR'
    : !hasBackendOcrEvidence
      ? 'OCR：等待后端证据'
      : trustedRealOcr
        ? `OCR：${formatEngineName(normalizedEngine!)}`
        : `OCR：${ocrEngine}（非受信）`;
  const ocrBadgeClass = untrustedOcr ? 'bg-red-600' : theme.badge;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-lg border ${theme.border} ${theme.bg} px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs sm:text-sm`}
    >
      <span className={`font-bold ${theme.title}`}>
        {isMock ? '演示环境' : '真实 API 模式'}
      </span>
      <span aria-hidden className="text-gray-300">|</span>
      {isMock ? (
        <>
          <Pill className={ocrBadgeClass}>{ocrLabel}</Pill>
          <Pill className={theme.badge}>Mock Collator</Pill>
          <span className="text-gray-600">本地 mock，不调用 collator</span>
        </>
      ) : (
        <>
          <Pill className={ocrBadgeClass}>{ocrLabel}</Pill>
          {ocrVersion && (
            <span className="text-gray-500">{ocrVersion}</span>
          )}
          {!hasBackendOcrEvidence && (
            <span className="text-gray-600">上传后以 OCR evidence 为准</span>
          )}
          {untrustedOcr && (
            <span className="font-medium text-red-700">受控写入必须阻断</span>
          )}
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
        <Pill className={theme.badge}>Execute 触发受控写入</Pill>
      )}
    </div>
  );
}

function formatEngineName(engine: string): string {
  if (engine === 'tesseract') return 'Tesseract';
  if (engine === 'feishu') return '飞书 OCR';
  return engine;
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
