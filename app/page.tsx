'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePortalStore } from '@/lib/store';
import {
  isTerminalStatus,
  isControlledWriteEnvironment,
} from '@/lib/api-client';
import { UploadZone } from '@/components/UploadZone';
import { ScreenshotList } from '@/components/ScreenshotList';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { EvidenceViewer } from '@/components/EvidenceViewer';
import { CorrectionForm } from '@/components/CorrectionForm';
import { ResultPanel } from '@/components/ResultPanel';
import { DemoDisclosureBanner } from '@/components/DemoDisclosureBanner';
import { RuntimeStatusBar } from '@/components/RuntimeStatusBar';
import { StepIndicator } from '@/components/StepIndicator';
import { GovernanceCard } from '@/components/GovernanceCard';
import { WritePreview } from '@/components/WritePreview';
import { ExecuteConfirmDialog } from '@/components/ExecuteConfirmDialog';
import type { ScreenshotItem, ProcessingStage } from '@/lib/types';
import {
  isControlledPreviewConfirmed,
  isControlledPreviewGenerated,
  shouldStopAutoPolling,
} from '@/lib/write-flow-state';

export default function HomePage() {
  const screenshots = usePortalStore((s) => s.screenshots);
  const apiMode = usePortalStore((s) => s.apiMode);
  const selectedLocalId = usePortalStore((s) => s.selectedLocalId);
  const submitScreenshot = usePortalStore((s) => s.submitScreenshot);
  const pollStatus = usePortalStore((s) => s.pollStatus);
  const loadEvidence = usePortalStore((s) => s.loadEvidence);
  const generatePreview = usePortalStore((s) => s.generatePreview);
  const confirmPreview = usePortalStore((s) => s.confirmPreview);
  const executeWrite = usePortalStore((s) => s.executeWrite);
  const escalateReview = usePortalStore((s) => s.escalateReview);
  const loadFinalResult = usePortalStore((s) => s.loadFinalResult);

  const selectedItem = screenshots.find((it) => it.localId === selectedLocalId) ?? null;
  // OCR 真伪只能以后端返回的 evidence/status 为准，不能由 API mode 推断。
  const activeOcrEngine =
    selectedItem?.evidenceResponse?.ocr_evidence.engine ??
    selectedItem?.statusResponse?.ocr?.engine;
  const activeOcrVersion = selectedItem?.evidenceResponse?.ocr_evidence.ocr_version;
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReasonCode, setEscalateReasonCode] = useState('PROJECT_TYPE_REQUIRED');
  const [escalateReason, setEscalateReason] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);

  const isControlled = isControlledWriteEnvironment();
  const handleRuntimeResult = useCallback((result: { collatorReady: boolean; sopReady: boolean }) => {
    setRuntimeReady(result.collatorReady && result.sopReady);
  }, []);

  // internal-controlled 的 Execute 是真实写入端点，不接受 dry-run 参数。
  useEffect(() => {
    if (isControlled) setDryRun(false);
  }, [isControlled]);

  // 自动轮询
  useEffect(() => {
    if (!selectedItem?.screenshotId) return;
    if (shouldStopAutoPolling(selectedItem.stage, !!selectedItem.internalPreview)) return;
    if (selectedItem.serverStatus && isTerminalStatus(selectedItem.serverStatus)) return;

    let attempts = 0;
    const MAX_POLL_ATTEMPTS = 60;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        console.warn(`[Portal] 轮询达到最大次数 (${MAX_POLL_ATTEMPTS})，停止轮询。`);
        clearInterval(timer);
        return;
      }
      pollStatus(selectedItem.localId);
    }, 2000);
    return () => clearInterval(timer);
  }, [
    selectedItem?.screenshotId,
    selectedItem?.stage,
    selectedItem?.localId,
    selectedItem?.serverStatus,
    selectedItem?.internalPreview?.preview_id,
    pollStatus,
  ]);

  // 治理通过后自动加载证据（如果尚未加载）
  useEffect(() => {
    if (!selectedItem?.screenshotId) return;
    if (selectedItem.serverStatus === 'candidate_drafted' && !selectedItem.evidenceResponse) {
      loadEvidence(selectedItem.localId);
    }
  }, [selectedItem?.screenshotId, selectedItem?.serverStatus, selectedItem?.evidenceResponse, selectedItem?.localId, loadEvidence]);

  return (
    <>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200 px-4 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">飞书智能录入台</h1>
            <p className="text-[10px] sm:text-xs text-gray-400 hidden sm:block">AI-native Intake Console</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <RuntimeStatusBar onResult={handleRuntimeResult} />
            {isControlled && (
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                受控写入环境
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Demo 披露横幅 */}
      <div className="px-3 sm:px-6 pt-3">
        <div className="max-w-6xl mx-auto">
          <DemoDisclosureBanner
            apiMode={apiMode}
            dryRun={dryRun}
            ocrEngine={activeOcrEngine}
            ocrVersion={activeOcrVersion}
          />
        </div>
      </div>

      {/* 步骤条 */}
      {selectedItem && (
        <div className="px-3 sm:px-6 py-3 bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto">
            <StepIndicator currentStage={selectedItem.stage} />
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-28 sm:pb-24">
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
                isControlled={isControlled}
                runtimeReady={runtimeReady}
                onSubmit={() => submitScreenshot(selectedItem.localId, dryRun)}
                onPoll={() => pollStatus(selectedItem.localId)}
                onLoadEvidence={() => loadEvidence(selectedItem.localId)}
                onGeneratePreview={() => { void generatePreview(selectedItem.localId); }}
                onConfirmPreview={() => { void confirmPreview(selectedItem.localId); }}
                onExecuteClick={() => setShowExecuteDialog(true)}
                onShowEscalate={() => setShowEscalate(true)}
                onReloadFinal={() => loadFinalResult(selectedItem.localId)}
              />
            ) : (
              <EmptyDetail />
            )}
          </section>
        </div>
      </main>

      {/* 执行确认弹窗 */}
      {selectedItem && (
        <ExecuteConfirmDialog
          open={showExecuteDialog}
          dryRun={dryRun}
          executing={selectedItem.executing}
          onConfirm={async () => {
            setShowExecuteDialog(false);
            await executeWrite(selectedItem.localId, dryRun);
          }}
          onCancel={() => setShowExecuteDialog(false)}
        />
      )}

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
    </>
  );
}

/** 空详情提示 */
function EmptyDetail() {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 h-full flex flex-col items-center justify-center text-center min-h-[300px]">
      <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
      <p className="text-gray-500 text-sm">上传截图后开始智能录入流程</p>
      <p className="text-gray-400 text-xs mt-1">支持 JPEG / PNG，最多 10 张</p>
    </div>
  );
}

/** 详情面板 */
interface DetailProps {
  item: ScreenshotItem;
  dryRun: boolean;
  onDryRunChange: (v: boolean) => void;
  isControlled: boolean;
  runtimeReady: boolean;
  onSubmit: () => void;
  onPoll: () => void;
  onLoadEvidence: () => void;
  onGeneratePreview: () => void;
  onConfirmPreview: () => void;
  onExecuteClick: () => void;
  onShowEscalate: () => void;
  onReloadFinal: () => void;
}

function DetailPanel({
  item,
  dryRun,
  onDryRunChange,
  isControlled,
  runtimeReady,
  onSubmit,
  onPoll,
  onLoadEvidence,
  onGeneratePreview,
  onConfirmPreview,
  onExecuteClick,
  onShowEscalate,
  onReloadFinal,
}: DetailProps) {
  const canLoadEvidence =
    item.screenshotId &&
    (item.stage === 'candidate' || item.stage === 'governance' || item.stage === 'preview' || item.stage === 'write' || item.stage === 'done' ||
      item.serverStatus === 'candidate_drafted' || item.serverStatus === 'ocr_completed' || item.serverStatus === 'governance_passed');
  const controlledPreviewGenerated = isControlledPreviewGenerated(item.internalPreview?.status);
  const controlledPreviewConfirmed = isControlledPreviewConfirmed(item.internalPreview?.status);
  const previewIsConfirmed = isControlled ? controlledPreviewConfirmed : item.previewConfirmed;
  const canGeneratePreview = item.evidenceResponse && (item.stage === 'governance' || item.stage === 'candidate') && item.serverStatus !== 'governance_blocked' && !item.internalPreview;
  // controlled 模式以服务端 preview.status 为唯一事实源，避免 stage 轮询回退后按钮消失。
  const canConfirmPreview = isControlled
    ? controlledPreviewGenerated && !item.submitting
    : item.stage === 'preview' && !item.previewConfirmed;
  // Execute 同样只接受服务端 confirmed；不依赖可能漂移的本地布尔值。
  const canExecute = isControlled
    ? controlledPreviewConfirmed && !item.executing && !item.submitting
    : item.previewConfirmed;
  // Phase 5: 治理通过判定（serverStatus 或 statusResponse.governance.decision）
  const governancePassed =
    item.serverStatus === 'governance_passed' ||
    item.statusResponse?.governance?.decision === 'PASS';
  // Phase 5: Execute 按钮额外禁用条件（runtimeReady + governance）
  const executeDisabled = isControlled
    ? !runtimeReady || !governancePassed || dryRun
    : item.executing;
  const canEscalate = item.evidenceResponse && item.stage !== 'done';
  // Phase 5: partial 状态同时检查 confirmResponse 和 internalWriteResult
  const isPartial =
    (item.confirmResponse != null &&
      item.serverStatus !== 'write_succeeded' &&
      item.serverStatus !== 'duplicate_skipped') ||
    item.internalWriteResult?.status === 'partial';

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
          <p className="text-xs text-gray-500 mt-0.5">ID: {item.screenshotId ?? '未提交'}</p>
          {item.hasCorrections && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已修改</span>
          )}
          {previewIsConfirmed && (
            <span className="inline-block mt-1 ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Preview 已确认</span>
          )}
        </div>
      </div>

      {/* 处理状态 */}
      <div className="border-t pt-3">
        <ProcessingStatus item={item} />
      </div>

      {/* 操作按钮区（步骤 01-02） */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {!item.screenshotId && (
            <button
              type="button"
              disabled={item.submitting}
              onClick={onSubmit}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {item.submitting ? '提交中...' : '上传并识别'}
            </button>
          )}
          {item.screenshotId && item.stage !== 'done' && (
            <button
              type="button"
              onClick={onPoll}
              className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              刷新状态
            </button>
          )}
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
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={dryRun}
            disabled={isControlled}
            onChange={(e) => onDryRunChange(e.target.checked)}
            className="rounded disabled:cursor-not-allowed"
          />
          {isControlled
            ? '受控写入：生成 Preview 不会写入，Execute 将执行真实写入'
            : '干运行（Dry Run，不实际写入飞书）'}
        </label>
      </div>

      {/* 证据 + 修正（步骤 02-03，桌面端双栏） */}
      {item.evidenceResponse && item.stage !== 'done' && (
        <div className="border-t pt-3">
          {/* 桌面端双栏 */}
          <div className="hidden md:grid md:grid-cols-[45%_55%] gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">证据</h4>
              <EvidenceViewer evidence={item.evidenceResponse} />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">修正</h4>
              <CorrectionForm item={item} evidence={item.evidenceResponse} />
            </div>
          </div>
          {/* 移动端单栏 */}
          <div className="md:hidden space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">证据</h4>
              <EvidenceViewer evidence={item.evidenceResponse} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">修正</h4>
              <CorrectionForm item={item} evidence={item.evidenceResponse} />
            </div>
          </div>
        </div>
      )}

      {/* SOP 治理状态卡 */}
      {(item.serverStatus === 'governance_passed' || item.serverStatus === 'governance_needs_review' || item.serverStatus === 'governance_blocked' || item.serverStatus === 'duplicate_skipped') && (
        <div className="border-t pt-3">
          <GovernanceCard item={item} />
        </div>
      )}

      {/* 写入 Preview（步骤 04） */}
      {(item.stage === 'preview' || !!item.internalPreview) && item.evidenceResponse && (
        <div className="border-t pt-3 space-y-3">
          <WritePreview item={item} evidence={item.evidenceResponse} />
        </div>
      )}

      {/* 底部操作栏（步骤 04-05：Confirm/Execute 分离） */}
      {item.evidenceResponse && item.stage !== 'done' && (
        <div className="border-t pt-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">写入操作</h4>
          <div className="flex flex-wrap gap-2">
            {/* 生成写入 Preview */}
            {canGeneratePreview && (
              <button
                type="button"
                disabled={item.submitting}
                onClick={onGeneratePreview}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
              >
                {item.submitting ? '生成中...' : '生成写入预览'}
              </button>
            )}
            {/* 确认 Preview */}
            {canConfirmPreview && (
              <button
                type="button"
                disabled={item.submitting}
                onClick={onConfirmPreview}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {item.submitting ? '确认中...' : '确认本次写入计划'}
              </button>
            )}
            {/* 执行真实写入（AC-14: Confirm 不会自动触发 Execute） */}
            {canExecute && (
              <button
                type="button"
                disabled={executeDisabled}
                onClick={onExecuteClick}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed
                  ${dryRun ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {item.executing ? '执行中...' : dryRun ? '执行干运行' : '执行真实写入'}
              </button>
            )}
            {/* 转人工复核 */}
            {canEscalate && (
              <button
                type="button"
                onClick={onShowEscalate}
                className="px-4 py-2 rounded-md text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
              >
                转人工复核
              </button>
            )}
          </div>
          {/* internal-controlled preview 状态 */}
          {item.internalPreview && (
            <div className="text-[10px] text-gray-500 space-y-0.5">
              <div>Preview ID: <span className="font-mono">{item.internalPreview.preview_id.slice(0, 8)}...</span></div>
              <div>状态: <span className="font-mono">{item.internalPreview.status}</span></div>
              <div>目标表: <span className="font-mono">{item.internalPreview.target_tables.join(', ')}</span></div>
              <div>过期时间: <span className="font-mono">{new Date(item.internalPreview.expires_at).toLocaleString()}</span></div>
            </div>
          )}
          {/* AC-14 提示 */}
          {isControlled && controlledPreviewGenerated && (
            <p className="text-[10px] text-gray-400">请先确认预览，然后才能执行写入。</p>
          )}
          {isControlled && controlledPreviewConfirmed && (
            <p className="text-[10px] text-amber-600">预览已确认，可执行写入。执行前将再次弹出确认。</p>
          )}
          {!isControlled && item.stage === 'preview' && !item.previewConfirmed && (
            <p className="text-[10px] text-gray-400">请先确认预览，然后才能执行写入。</p>
          )}
          {!isControlled && item.stage === 'preview' && item.previewConfirmed && (
            <p className="text-[10px] text-amber-600">预览已确认，可执行写入。执行前将再次弹出确认。</p>
          )}
        </div>
      )}

      {/* 最终结果（步骤 05） */}
      {item.stage === 'done' && (
        <div className="border-t pt-3">
          {/* partial 不使用绿色成功样式 */}
          {isPartial && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="text-sm font-bold text-amber-800">部分完成，需要处理</span>
              </div>
              <p className="text-xs text-amber-700 mt-1">已产生真实业务记录，禁止直接重新执行。</p>
            </div>
          )}
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
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
          <button type="button" disabled={submitting} onClick={onConfirm} className="px-4 py-1.5 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 transition-colors">
            {submitting ? '提交中...' : '确认转复核'}
          </button>
        </div>
      </div>
    </div>
  );
}
