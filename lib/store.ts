/**
 * 全局状态管理（zustand）
 *
 * 管理截图列表、API 模式、以及异步 API 调用流程。
 *
 * 幂等与防重复（AC-B07、AC-B08）：
 * - 每个 ScreenshotItem 有 submitting 标记，提交期间禁用按钮
 * - 失败时保留 corrections，允许重试
 * - 服务端以幂等键为准
 */

import { create } from 'zustand';
import type {
  ApiMode,
  ScreenshotItem,
  ProcessingStage,
  CreateScreenshotRequest,
  SubmitCorrectionsRequest,
  ConfirmWriteRequest,
  EscalateReviewRequest,
} from './types';
import { getApiClient, ScreenshotApiError, getApiMode } from './api-client';

/** 生成前端临时 ID */
function genLocalId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 默认提交者标识（前端无凭据，仅标识来源） */
const DEFAULT_REVIEWER_ID = 'portal-user';

/** 文件转 Base64 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:image/xxx;base64, 前缀
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface PortalState {
  /** 截图列表 */
  screenshots: ScreenshotItem[];
  /** API 模式 */
  apiMode: ApiMode;
  /** 当前选中截图的 localId（用于详情展示） */
  selectedLocalId: string | null;
  /** 全局加载标记 */
  globalLoading: boolean;

  // === Actions ===
  setApiMode: (mode: ApiMode) => void;
  setSelected: (localId: string | null) => void;

  /** 添加截图文件（1~10 张） */
  addFiles: (files: File[]) => Promise<void>;
  /** 删除截图 */
  removeScreenshot: (localId: string) => void;
  /** 重新排序（拖拽） */
  reorderScreenshots: (fromIndex: number, toIndex: number) => void;
  /** 更新某个截图的字段 */
  updateScreenshot: (localId: string, patch: Partial<ScreenshotItem>) => void;
  /** 更新某个截图的修正字段 */
  setCorrection: (localId: string, field: string, value: unknown) => void;
  /** 设置修正原因 */
  setCorrectionReason: (localId: string, reason: string) => void;

  /** 提交截图到 collator（创建） */
  submitScreenshot: (localId: string, dryRun?: boolean) => Promise<void>;
  /** 轮询状态并自动推进 */
  pollStatus: (localId: string) => Promise<void>;
  /** 加载证据 */
  loadEvidence: (localId: string) => Promise<void>;
  /** 提交人工修正 */
  submitCorrections: (localId: string) => Promise<void>;
  /** 确认写入（legacy，保留向后兼容） */
  confirmWrite: (localId: string, dryRun?: boolean) => Promise<void>;
  /** 生成写入 Preview（FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §7: Confirm/Execute 分离） */
  generatePreview: (localId: string) => void;
  /** 确认 Preview（UI 状态变更，不调用 API） */
  confirmPreview: (localId: string) => void;
  /** 执行真实写入（仅在 Preview 确认后可调用，调用 confirm API） */
  executeWrite: (localId: string, dryRun?: boolean) => Promise<void>;
  /** 转人工复核 */
  escalateReview: (localId: string, reasonCode: string, reason: string) => Promise<void>;
  /** 加载最终结果 */
  loadFinalResult: (localId: string) => Promise<void>;
  /** 清空所有 */
  clearAll: () => void;
}

export const usePortalStore = create<PortalState>((set, get) => ({
  screenshots: [],
  // AC-A03：apiMode 由 NEXT_PUBLIC_DEMO_MODE 环境变量决定默认值
  // 生产构建缺失环境变量时 getApiMode() 会直接抛错
  apiMode: getApiMode(),
  selectedLocalId: null,
  globalLoading: false,

  setApiMode: (mode) => set({ apiMode: mode }),
  setSelected: (localId) => set({ selectedLocalId: localId }),

  addFiles: async (files) => {
    const state = get();
    const remaining = 10 - state.screenshots.length;
    if (remaining <= 0) {
      throw new Error('最多支持 10 张截图');
    }
    const toAdd = files.slice(0, remaining);
    if (toAdd.length < files.length) {
      console.warn(`仅添加前 ${toAdd.length} 张，超出 10 张上限`);
    }
    const items: ScreenshotItem[] = [];
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) {
        console.warn(`跳过非图片文件: ${file.name}`);
        continue;
      }
      const base64 = await fileToBase64(file);
      items.push({
        localId: genLocalId(),
        filename: file.name,
        previewUrl: `data:${file.type};base64,${base64}`,
        imageBase64: base64,
        size: file.size,
        stage: 'idle',
        corrections: {},
        hasCorrections: false,
        submitting: false,
        previewConfirmed: false,
        executing: false,
      });
    }
    if (items.length === 0) return;
    set((s) => ({
      screenshots: [...s.screenshots, ...items],
      selectedLocalId: s.selectedLocalId ?? items[0].localId,
    }));
  },

  removeScreenshot: (localId) =>
    set((s) => {
      const screenshots = s.screenshots.filter((it) => it.localId !== localId);
      const selectedLocalId =
        s.selectedLocalId === localId
          ? (screenshots[0]?.localId ?? null)
          : s.selectedLocalId;
      return { screenshots, selectedLocalId };
    }),

  reorderScreenshots: (fromIndex, toIndex) =>
    set((s) => {
      const list = [...s.screenshots];
      if (fromIndex < 0 || fromIndex >= list.length) return {};
      if (toIndex < 0 || toIndex >= list.length) return {};
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { screenshots: list };
    }),

  updateScreenshot: (localId, patch) =>
    set((s) => ({
      screenshots: s.screenshots.map((it) =>
        it.localId === localId ? { ...it, ...patch } : it,
      ),
    })),

  setCorrection: (localId, field, value) =>
    set((s) => ({
      screenshots: s.screenshots.map((it) =>
        it.localId === localId
          ? {
              ...it,
              corrections: { ...it.corrections, [field]: value },
              hasCorrections: true,
            }
          : it,
      ),
    })),

  setCorrectionReason: (localId, reason) =>
    set((s) => ({
      screenshots: s.screenshots.map((it) =>
        it.localId === localId ? { ...it, correctionReason: reason } : it,
      ),
    })),

  submitScreenshot: async (localId, dryRun = false) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item) return;
    if (item.submitting) return; // 防重复（AC-B08）
    get().updateScreenshot(localId, { submitting: true, stage: 'uploading', error: undefined });
    try {
      const client = getApiClient(state.apiMode);
      const req: CreateScreenshotRequest = {
        source_system: 'portal',
        source_record_id: item.localId,
        submitted_at: new Date().toISOString(),
        submitted_by: DEFAULT_REVIEWER_ID,
        image_base64: item.imageBase64,
        image_filename: item.filename,
        dry_run: dryRun,
      };
      const resp = await client.createScreenshot(req);
      get().updateScreenshot(localId, {
        screenshotId: resp.screenshot_id,
        serverStatus: resp.status,
        stage: 'ocr',
        submitting: false,
      });
      // 自动轮询一次
      await get().pollStatus(localId);
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, {
        submitting: false,
        error: `提交失败: ${message}`,
      });
    }
  },

  pollStatus: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    try {
      const client = getApiClient(state.apiMode);
      const resp = await client.getScreenshotStatus(item.screenshotId);
      const stage = mapStatusToStage(resp.status);
      get().updateScreenshot(localId, {
        statusResponse: resp,
        serverStatus: resp.status,
        stage,
      });
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, { error: `状态查询失败: ${message}` });
    }
  },

  loadEvidence: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    try {
      const client = getApiClient(state.apiMode);
      const resp = await client.getScreenshotEvidence(item.screenshotId);
      // 初始化 corrections 为候选字段（便于用户在原值上修改）
      get().updateScreenshot(localId, {
        evidenceResponse: resp,
        stage: 'candidate',
        corrections: { ...resp.candidate_v1.normalized_fields },
      });
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, { error: `证据加载失败: ${message}` });
    }
  },

  submitCorrections: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting) return;
    get().updateScreenshot(localId, { submitting: true, error: undefined });
    try {
      const client = getApiClient(state.apiMode);
      const req: SubmitCorrectionsRequest = {
        reviewer_id: DEFAULT_REVIEWER_ID,
        corrections: item.corrections,
        correction_reason: item.correctionReason,
      };
      const resp = await client.submitCorrections(item.screenshotId, req);
      get().updateScreenshot(localId, {
        submitting: false,
        stage: 'governance',
        // 用修正后的字段更新 corrections 展示
        corrections: { ...item.corrections, ...resp.candidate_v1.normalized_fields },
      });
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      // 失败保留修改（AC-B07）
      get().updateScreenshot(localId, {
        submitting: false,
        error: `修正提交失败: ${message}`,
      });
    }
  },

  confirmWrite: async (localId, dryRun = false) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting) return;
    get().updateScreenshot(localId, { submitting: true, error: undefined, stage: 'write' });
    try {
      const client = getApiClient(state.apiMode);
      const req: ConfirmWriteRequest = {
        reviewer_id: DEFAULT_REVIEWER_ID,
        candidate_v1_id: item.evidenceResponse?.candidate_v1.candidate_id ?? '',
        dry_run: dryRun,
      };
      const resp = await client.confirmWrite(item.screenshotId, req);
      get().updateScreenshot(localId, {
        submitting: false,
        confirmResponse: resp,
        serverStatus: resp.status,
        stage: resp.status === 'write_succeeded' ? 'done' : 'write',
      });
      // 加载最终结果
      await get().loadFinalResult(localId);
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      // 失败保留修改（AC-B07）
      get().updateScreenshot(localId, {
        submitting: false,
        error: `确认写入失败: ${message}`,
      });
    }
  },

  // FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §7: Confirm/Execute 分离
  generatePreview: (localId) => {
    get().updateScreenshot(localId, {
      stage: 'preview',
      previewConfirmed: false,
      error: undefined,
    });
  },

  confirmPreview: (localId) => {
    get().updateScreenshot(localId, { previewConfirmed: true });
  },

  executeWrite: async (localId, dryRun = false) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (!item.previewConfirmed) return; // AC-14: Preview 未确认时禁止执行
    if (item.submitting || item.executing) return; // 防重复
    get().updateScreenshot(localId, { executing: true, error: undefined, stage: 'write' });
    try {
      const client = getApiClient(state.apiMode);
      const req: ConfirmWriteRequest = {
        reviewer_id: DEFAULT_REVIEWER_ID,
        candidate_v1_id: item.evidenceResponse?.candidate_v1.candidate_id ?? '',
        dry_run: dryRun,
      };
      const resp = await client.confirmWrite(item.screenshotId, req);
      get().updateScreenshot(localId, {
        executing: false,
        submitting: false,
        confirmResponse: resp,
        serverStatus: resp.status,
        stage: resp.status === 'write_succeeded' ? 'done' : 'write',
      });
      await get().loadFinalResult(localId);
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, {
        executing: false,
        error: `执行写入失败: ${message}`,
      });
    }
  },

  escalateReview: async (localId, reasonCode, reason) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting) return;
    get().updateScreenshot(localId, { submitting: true, error: undefined, stage: 'write' });
    try {
      const client = getApiClient(state.apiMode);
      const req: EscalateReviewRequest = {
        reviewer_id: DEFAULT_REVIEWER_ID,
        reason_code: reasonCode,
        reason,
      };
      const resp = await client.escalateReview(item.screenshotId, req);
      get().updateScreenshot(localId, {
        submitting: false,
        escalateResponse: resp,
        serverStatus: 'review_pending',
        stage: 'done',
      });
      await get().loadFinalResult(localId);
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, {
        submitting: false,
        error: `转复核失败: ${message}`,
      });
    }
  },

  loadFinalResult: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    try {
      const client = getApiClient(state.apiMode);
      const resp = await client.getFinalResult(item.screenshotId);
      get().updateScreenshot(localId, {
        finalResultResponse: resp,
        serverStatus: resp.final_status,
        stage: mapStatusToStage(resp.final_status),
      });
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, { error: `最终结果加载失败: ${message}` });
    }
  },

  clearAll: () => set({ screenshots: [], selectedLocalId: null }),
}));

/** 服务端状态映射到 UI 阶段 */
function mapStatusToStage(status: import('./types').ScreenshotStatus): ProcessingStage {
  switch (status) {
    case 'received':
    case 'ocr_processing':
      return 'ocr';
    case 'ocr_completed':
    case 'candidate_drafted':
      return 'candidate';
    case 'governance_passed':
      return 'governance';
    case 'governance_needs_review':
      return 'governance';
    // governance_blocked 是终态（AC-A04），映射到 done 以停止轮询
    case 'governance_blocked':
    case 'write_succeeded':
    case 'write_failed':
    case 'duplicate_skipped':
    case 'review_pending':
    case 'review_resolved':
    case 'expired':
      return 'done';
    default:
      return 'idle';
  }
}
