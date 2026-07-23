'use client';

import { useState, useEffect } from 'react';
import { usePortalStore } from '@/lib/store';
import { getApiBaseUrl } from '@/lib/api-client';
import { UploadZone } from '@/components/UploadZone';
import { ScreenshotList } from '@/components/ScreenshotList';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { EvidenceViewer } from '@/components/EvidenceViewer';
import { CorrectionForm } from '@/components/CorrectionForm';
import { ResultPanel } from '@/components/ResultPanel';
import { DemoDisclosureBanner } from '@/components/DemoDisclosureBanner';
import type { ScreenshotItem } from '@/lib/types';

export default function HomePage() {
  const screenshots = usePortalStore((s) => s.screenshots);
  const apiMode = usePortalStore((s) => s.apiMode);
  const setApiMode = usePortalStore((s) => s.setApiMode);
  const selectedLocalId = usePortalStore((s) => s.selectedLocalId);
  const submitScreenshot = usePortalStore((s) => s.submitScreenshot);
  const pollStatus = usePortalStore((s) => s.pollStatus);
  const loadEvidence = usePortalStore((s) => s.loadEvidence);
  const confirmWrite = usePortalStore((s) => s.confirmWrite);
  const escalateReview = usePortalStore((s) => s.escalateReview);
  const loadFinalResult = usePortalStore((s) => s.loadFinalResult);

  const selectedItem = screenshots.find((it) => it.localId === selectedLocalId) ?? null;
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReasonCode, setEscalateReasonCode] = useState('PROJECT_TYPE_REQUIRED');
  const [escalateReason, setEscalateReason] = useState('');
  const [dryRun, setDryRun] = useState(false);

  // 自动轮询：当选中项有 screenshotId 且未到 done 阶段时
  useEffect(() => {
    if (!selectedItem?.screenshotId) return;
    if (selectedItem.stage === 'done') return;
    const timer = setInterval(() => {
      pollStatus(selectedItem.localId);
    }, 2000);
    return () => clearInterval(timer);
  }, [selectedItem?.screenshotId, selectedItem?.stage, selectedItem?.localId, pollStatus]);

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* 顶部 Disclosure 横幅：显著标记 Demo / Mock / Dry-run 状态 */}
      <DemoDisclosureBanner apiMode={apiMode} dryRun={dryRun} />

      {/* 顶部标题栏 */}
      <header className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">智能录入台</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              飞书智能业务数据中台 · 截图智能录入 Portal MVP
            </p>
          </div>
          <ModeSwitcher apiMode={apiMode} onModeChange={setApiMode} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* 左栏：上传 + 列表 */}
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <UploadZone />
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <ScreenshotList />
          </div>
        </section>

        {/* 右栏：详情面板 */}
        <section className="lg:col-span-3">
          {selectedItem ? (
            <DetailPanel
              item={selectedItem}
              dryRun={dryRun}
              onDryRunChange={setDryRun}
              onSubmit={() => submitScreenshot(selectedItem.localId, dryRun)}
              onPoll={() => pollStatus(selectedItem.localId)}
              onLoadEvidence={() => loadEvidence(selectedItem.localId)}
              onConfirm={() => confirmWrite(selectedItem.localId, dryRun)}
              onShowEscalate={() => setShowEscalate(true)}
              onReloadFinal={() => loadFinalResult(selectedItem.localId)}
            />
          ) : (
            <EmptyDetail />
          )}
        </section>
      </div>

      {/* 转复核对话框 */}
      {showEscalate && selectedItem && (
        <EscalateDialog
          reasonCode={escalateReasonCode}
          reason={escalateReason}
          onReasonCodeChange={setEscalateReasonCode}
          onReasonChange={setEscalateReason}
          submitting={selectedItem.submitting}
          onCancel={() => {
            setShowEscalate(false);
            setEscalateReason('');
          }}
          onConfirm={async () => {
            await escalateReview(selectedItem.localId, escalateReasonCode, escalateReason || '需人工复核');
            setShowEscalate(false);
            setEscalateReason('');
          }}
        />
      )}
    </main>
  );
}

/** 模式切换器 */
function ModeSwitcher({
  apiMode,
  onModeChange,
}: {
  apiMode: 'mock' | 'real';
  onModeChange: (m: 'mock' | 'real') => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <span className="text-gray-500">API 模式:</span>
      <div className="flex rounded-md border border-gray-300 overflow-hidden">
        <button
          type="button"
          onClick={() => onModeChange('mock')}
          className={`px-3 py-1 font-medium transition-colors ${
            apiMode === 'mock' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Mock
        </button>
        <button
          type="button"
          onClick={() => onModeChange('real')}
          className={`px-3 py-1 font-medium transition-colors ${
            apiMode === 'real' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Real
        </button>
      </div>
      {apiMode === 'real' && (
        <span className="text-[10px] text-gray-400 hidden sm:inline">
          → {getApiBaseUrl()}
        </span>
      )}
    </div>
  );
}

/** 空详情提示 */
function EmptyDetail() {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 h-full flex flex-col items-center justify-center text-center min-h-[300px]">
      <svg
        className="w-16 h-16 text-gray-300 mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      <p className="text-gray-500 text-sm">请上传截图后查看处理详情</p>
    </div>
  );
}

/** 详情面板 */
interface DetailProps {
  item: ScreenshotItem;
  dryRun: boolean;
  onDryRunChange: (v: boolean) => void;
  onSubmit: () => void;
  onPoll: () => void;
  onLoadEvidence: () => void;
  onConfirm: () => void;
  onShowEscalate: () => void;
  onReloadFinal: () => void;
}

function DetailPanel({
  item,
  dryRun,
  onDryRunChange,
  onSubmit,
  onPoll,
  onLoadEvidence,
  onConfirm,
  onShowEscalate,
  onReloadFinal,
}: DetailProps) {
  const canLoadEvidence =
    item.screenshotId &&
    (item.stage === 'candidate' ||
      item.stage === 'governance' ||
      item.stage === 'write' ||
      item.stage === 'done' ||
      item.serverStatus === 'candidate_drafted' ||
      item.serverStatus === 'ocr_completed' ||
      item.serverStatus === 'governance_passed');
  const canConfirm = item.evidenceResponse && item.stage !== 'done';
  const canEscalate = item.evidenceResponse && item.stage !== 'done';

  return (
    <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm border border-gray-100 space-y-4">
      {/* 截图预览 + 文件信息 */}
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt={item.filename}
          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-gray-200 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.filename}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            ID: {item.screenshotId ?? '未提交'}
          </p>
          {item.hasCorrections && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              已修改
            </span>
          )}
        </div>
      </div>

      {/* 处理状态 */}
      <div className="border-t pt-3">
        <ProcessingStatus item={item} />
      </div>

      {/* 操作按钮区 */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* 提交按钮 */}
          {!item.screenshotId && (
            <button
              type="button"
              disabled={item.submitting}
              onClick={onSubmit}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {item.submitting ? '提交中...' : '提交到 collator'}
            </button>
          )}

          {/* 轮询按钮 */}
          {item.screenshotId && item.stage !== 'done' && (
            <button
              type="button"
              onClick={onPoll}
              className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              刷新状态
            </button>
          )}

          {/* 加载证据按钮 */}
          {canLoadEvidence && !item.evidenceResponse && (
            <button
              type="button"
              onClick={onLoadEvidence}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              加载 OCR 证据
            </button>
          )}
        </div>

        {/* 干运行开关 */}
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => onDryRunChange(e.target.checked)}
            className="rounded"
          />
          干运行（Dry Run，不实际写入飞书）
        </label>
      </div>

      {/* 证据查看器 */}
      {item.evidenceResponse && (
        <div className="border-t pt-3">
          <EvidenceViewer evidence={item.evidenceResponse} />
        </div>
      )}

      {/* 修正表单 */}
      {item.evidenceResponse && item.stage !== 'done' && (
        <div className="border-t pt-3">
          <CorrectionForm item={item} evidence={item.evidenceResponse} />
        </div>
      )}

      {/* 确认写入 / 转复核 */}
      {item.evidenceResponse && item.stage !== 'done' && (
        <div className="border-t pt-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">写入操作</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={item.submitting || !canConfirm}
              onClick={onConfirm}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {item.submitting ? '处理中...' : dryRun ? '确认写入（干运行）' : '确认写入飞书'}
            </button>
            <button
              type="button"
              disabled={item.submitting || !canEscalate}
              onClick={onShowEscalate}
              className="px-4 py-2 rounded-md text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              转人工复核
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            确认写入后，数据将通过 collator 写入飞书业务表。重复点击已被禁用，服务端以幂等键为准。
          </p>
        </div>
      )}

      {/* 最终结果 */}
      {item.stage === 'done' && (
        <div className="border-t pt-3">
          <ResultPanel item={item} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onReloadFinal}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              重新加载结果
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 转复核对话框 */
function EscalateDialog({
  reasonCode,
  reason,
  onReasonCodeChange,
  onReasonChange,
  submitting,
  onCancel,
  onConfirm,
}: {
  reasonCode: string;
  reason: string;
  onReasonCodeChange: (v: string) => void;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-base font-semibold text-gray-900">转人工复核</h3>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">原因码</label>
            <select
              value={reasonCode}
              onChange={(e) => onReasonCodeChange(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="PROJECT_TYPE_REQUIRED">项目类型缺失</option>
              <option value="CUSTOMER_MISSING">客户信息缺失</option>
              <option value="DATA_INCONSISTENT">数据不一致</option>
              <option value="LOW_CONFIDENCE">OCR 置信度过低</option>
              <option value="OTHER">其他</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">原因描述</label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              placeholder="请描述转复核的原因..."
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 transition-colors"
          >
            {submitting ? '提交中...' : '确认转复核'}
          </button>
        </div>
      </div>
    </div>
  );
}
