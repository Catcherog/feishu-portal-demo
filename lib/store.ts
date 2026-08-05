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
import { getApiClient, ScreenshotApiError, getApiMode, isInternalControlledReady, isControlledWriteEnvironment } from './api-client';
import {
  isControlledPreviewConfirmed,
  isControlledPreviewGenerated,
  shouldPreserveControlledWorkflowState,
} from './write-flow-state';

/** 生成前端临时 ID */
function genLocalId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 默认提交者标识（前端无凭据，仅标识来源） */
const DEFAULT_REVIEWER_ID = 'portal-user';

/**
 * 前端状态版本号（Phase 4: 清理旧前端状态）。
 * 当前 store 仅使用内存状态（zustand），不持久化到 localStorage。
 * 但旧版本前端可能曾在 localStorage 写入 preview/screenshot 状态，
 * 此处在页面加载时检测版本不匹配则清除残留 key，防止旧数据干扰。
 */
const STATE_VERSION = 2;
const STATE_VERSION_KEY = 'portal_state_version';

if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage.getItem(STATE_VERSION_KEY);
    if (stored !== String(STATE_VERSION)) {
      // 版本不匹配：清除所有 portal 相关的旧 localStorage key
      const keysToClean = Object.keys(window.localStorage).filter(
        (k) =>
          k.startsWith('portal_') ||
          k.startsWith('screenshot_') ||
          k.startsWith('preview_'),
      );
      keysToClean.forEach((k) => window.localStorage.removeItem(k));
      window.localStorage.setItem(STATE_VERSION_KEY, String(STATE_VERSION));
    }
  } catch {
    // localStorage 不可用时静默跳过
  }
}

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
  /** 生成写入 Preview（FAMP-INTERNAL-CONTROLLED-WRITE-01: controlled 模式下调用 createInternalPreview API） */
  generatePreview: (localId: string) => Promise<void>;
  /** 确认 Preview（controlled 模式下调用 confirmInternalPreview API） */
  confirmPreview: (localId: string) => Promise<void>;
  /** 执行真实写入（controlled 模式下调用 executeInternalWrite API；legacy 模式调用 confirmWrite） */
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
        // FAMP-INTERNAL-CONTROLLED-WRITE-01: internal-controlled 流程状态
        internalPreview: undefined,
        internalWriteResult: undefined,
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
      // 轮询请求可能在生成 Preview 前发出、在 Preview 创建后才返回。
      // 必须读取最新状态，禁止旧 ingestion 响应把 preview/write 回退为 governance。
      const latest = get().screenshots.find((it) => it.localId === localId);
      if (!latest) return;
      if (
        shouldPreserveControlledWorkflowState(
          latest.stage,
          !!latest.internalPreview,
          !!latest.internalWriteResult,
        )
      ) {
        // 可保留诊断响应，但不覆盖受控写入子流程的 stage/serverStatus。
        get().updateScreenshot(localId, { statusResponse: resp });
        return;
      }
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

  // FAMP-INTERNAL-CONTROLLED-WRITE-01: 在 controlled 模式下走 3 步 internal-controlled 流程
  // 步骤 1: generatePreview → 调用 createInternalPreview API，获取 preview_id + nonce
  // 步骤 2: confirmPreview → 调用 confirmInternalPreview API，锁定 preview
  // 步骤 3: executeWrite → 调用 executeInternalWrite API，执行真实写入
  generatePreview: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting) return;
    // Phase 4: 防止重复生成 preview（防止旧 preview 被复用）
    if (item.internalPreview) {
      get().updateScreenshot(localId, {
        error: '已存在写入预览，禁止重复生成。如需重新生成，请先删除该截图重新上传。',
      });
      return;
    }
    // Phase 4: 会话一致性校验——确保 ingestion、candidate、preview 属于同一会话
    if (
      item.evidenceResponse &&
      item.evidenceResponse.screenshot_id !== item.screenshotId
    ) {
      get().updateScreenshot(localId, {
        error: '会话不一致：证据与当前截图不匹配，请重新加载证据。',
      });
      return;
    }
    const previousStage = item.stage;
    get().updateScreenshot(localId, {
      stage: 'preview',
      previewConfirmed: false,
      error: undefined,
      submitting: true,
    });
    try {
      // 受控写入环境必须完整走 internal-controlled 3 步流程。
      // 缺少 JWT 时禁止静默降级到 legacy confirmWrite，否则 UI 会看似完成
      // Preview/Confirm，实际却执行了另一条写入路径。
      if (isControlledWriteEnvironment()) {
        if (!isInternalControlledReady()) {
          throw new ScreenshotApiError(
            'INTERNAL_CONTROLLED_NOT_CONFIGURED',
            '受控写入未配置操作员 JWT：请设置 NEXT_PUBLIC_PORTAL_OPERATOR_JWT。',
          );
        }
        const client = getApiClient(state.apiMode);
        const candidateId = item.evidenceResponse?.candidate_v1.candidate_id ?? '';
        if (!candidateId) {
          throw new ScreenshotApiError('CANDIDATE_MISSING', '候选 ID 缺失，无法生成 preview');
        }
        const preview = await client.createInternalPreview({
          screenshot_id: item.screenshotId,
          candidate_v1_id: candidateId,
        });
        // Phase 3: 校验业务状态码，确保 preview 已成功生成
        if (preview.status !== 'preview_generated') {
          throw new ScreenshotApiError(
            'UNEXPECTED_PREVIEW_STATUS',
            `预览生成返回异常状态: ${preview.status}（期望: preview_generated）`,
            preview,
          );
        }
        get().updateScreenshot(localId, {
          submitting: false,
          internalPreview: preview,
          // Preview 由服务端在真实 SOP PASS 后生成。同步服务端治理状态，
          // 避免 Execute 按钮因本地旧状态仍为 candidate_drafted 而被误禁用。
          serverStatus: 'governance_passed',
          // preview 状态为 preview_generated，等待用户确认
          previewConfirmed: false,
        });
      } else {
        // 显式 Demo 或 dry-only 模式保留旧流程；受控模式绝不进入此分支。
        get().updateScreenshot(localId, { submitting: false });
      }
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, {
        submitting: false,
        stage: previousStage,
        error: `生成预览失败: ${message}`,
      });
    }
  },

  confirmPreview: async (localId) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting) return;
    const controlled = isControlledWriteEnvironment();
    // controlled 模式以服务端 preview.status 判定幂等；本地 previewConfirmed 仅作 UI 镜像。
    if (controlled && isControlledPreviewConfirmed(item.internalPreview?.status)) {
      if (!item.previewConfirmed) {
        get().updateScreenshot(localId, { previewConfirmed: true, stage: 'preview' });
      }
      return;
    }
    if (!controlled && item.previewConfirmed) return;

    // 受控写入环境必须调用 confirm API，不允许缺配置时静默切换本地状态。
    if (controlled) {
      if (!isInternalControlledReady()) {
        get().updateScreenshot(localId, {
          error: '确认预览失败: 受控写入未配置 NEXT_PUBLIC_PORTAL_OPERATOR_JWT。',
        });
        return;
      }
      if (!item.internalPreview) {
        get().updateScreenshot(localId, {
          error: '确认预览失败: 服务端写入预览不存在，请重新生成预览。',
        });
        return;
      }
      if (!isControlledPreviewGenerated(item.internalPreview.status)) {
        get().updateScreenshot(localId, {
          error: `确认预览失败: 当前服务端 Preview 状态为 ${item.internalPreview.status}，期望 preview_generated。`,
        });
        return;
      }
      get().updateScreenshot(localId, { submitting: true, error: undefined });
      try {
        const client = getApiClient(state.apiMode);
        const confirmed = await client.confirmInternalPreview(item.internalPreview.preview_id, {
          nonce: item.internalPreview.nonce,
          candidate_v1_id: item.internalPreview.candidate_id,
        });
        // Phase 3: 校验业务状态码，确保 preview 已确认
        if (confirmed.status !== 'confirmed') {
          throw new ScreenshotApiError(
            'UNEXPECTED_CONFIRM_STATUS',
            `预览确认返回异常状态: ${confirmed.status}（期望: confirmed）`,
            confirmed,
          );
        }
        get().updateScreenshot(localId, {
          submitting: false,
          internalPreview: confirmed,
          previewConfirmed: true,
        });
      } catch (err) {
        const message = err instanceof ScreenshotApiError ? err.message : String(err);
        get().updateScreenshot(localId, {
          submitting: false,
          error: `确认预览失败: ${message}`,
        });
      }
    } else {
      // 非 controlled 模式 → 仅切换 UI 状态（兼容旧 test 模式）
      get().updateScreenshot(localId, { previewConfirmed: true });
    }
  },

  executeWrite: async (localId, dryRun = false) => {
    const state = get();
    const item = state.screenshots.find((it) => it.localId === localId);
    if (!item || !item.screenshotId) return;
    if (item.submitting || item.executing) return; // 防重复
    const controlled = isControlledWriteEnvironment();
    const previewConfirmed = controlled
      ? isControlledPreviewConfirmed(item.internalPreview?.status)
      : item.previewConfirmed;
    if (!previewConfirmed) {
      get().updateScreenshot(localId, {
        error: '执行写入失败: Preview 尚未由服务端确认。',
      });
      return;
    }
    if (controlled) {
      if (dryRun) {
        get().updateScreenshot(localId, {
          error: '受控三步写入不支持“执行干运行”。Preview 本身不会写入；取消干运行后再执行真实写入。',
        });
        return;
      }
      if (!isInternalControlledReady()) {
        get().updateScreenshot(localId, {
          error: '执行写入失败: 受控写入未配置 NEXT_PUBLIC_PORTAL_OPERATOR_JWT。',
        });
        return;
      }
      if (!item.internalPreview || item.internalPreview.status !== 'confirmed') {
        get().updateScreenshot(localId, {
          error: '执行写入失败: 服务端 Preview 尚未确认，禁止执行。',
        });
        return;
      }
    }
    get().updateScreenshot(localId, { executing: true, error: undefined, stage: 'write' });
    try {
      // 受控写入环境完整走 execute API；上方已完成配置与状态校验。
      if (controlled && item.internalPreview) {
        const client = getApiClient(state.apiMode);
        const result = await client.executeInternalWrite(item.internalPreview.preview_id, {
          nonce: item.internalPreview.nonce,
          candidate_v1_id: item.internalPreview.candidate_id,
        });
        // 后端 internal-controlled 状态必须无损映射到截图契约。
        // 旧实现把 partial / result_unknown / needs_reconciliation 全部伪装成
        // write_failed，随后 getFinalResult 返回真实状态时又被前端旧枚举拒绝。
        const serverStatus = mapInternalResultStatusToScreenshotStatus(result.status);
        get().updateScreenshot(localId, {
          executing: false,
          submitting: false,
          internalWriteResult: result,
          serverStatus,
          // execute 已返回终态，无论成功、部分完成或需对账都进入结果页。
          stage: 'done',
          error: internalWriteOutcomeMessage(result.status),
        });
        // 加载最终结果以获取 write_logs 和 transaction_snapshot
        await get().loadFinalResult(localId);
      } else {
        // 非 controlled 模式 → 走旧 confirmWrite 流程（兼容 test 模式）
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
      }
    } catch (err) {
      const message = err instanceof ScreenshotApiError ? err.message : String(err);
      get().updateScreenshot(localId, {
        executing: false,
        stage: controlled ? 'preview' : item.stage,
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
    case 'ocr_failed':
      return 'done';
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
    case 'write_result_unknown':
    case 'write_needs_reconciliation':
    case 'write_partial':
    case 'duplicate_skipped':
    case 'review_pending':
    case 'review_resolved':
    case 'expired':
      return 'done';
    default:
      return 'idle';
  }
}

/** 将 internal-controlled 执行状态映射为冻结的截图状态契约。 */
function mapInternalResultStatusToScreenshotStatus(
  status: string,
): import('./types').ScreenshotStatus {
  switch (status) {
    case 'succeeded':
      return 'write_succeeded';
    case 'partial':
      return 'write_partial';
    case 'result_unknown':
      return 'write_result_unknown';
    case 'needs_reconciliation':
      return 'write_needs_reconciliation';
    case 'failed':
    default:
      return 'write_failed';
  }
}

/** 终态提示；undefined 表示无错误横幅。 */
function internalWriteOutcomeMessage(status: string): string | undefined {
  switch (status) {
    case 'succeeded':
      return undefined;
    case 'partial':
      return '写入部分完成（partial）：至少一个真实业务记录已产生，禁止直接重试，请查看写入日志并人工核查。';
    case 'result_unknown':
      return '写入结果未知（result_unknown）：请求可能已到达飞书，禁止重试，必须先执行对账。';
    case 'needs_reconciliation':
      return '写入需要对账（needs_reconciliation）：请根据记录 ID 与审计日志完成恢复。';
    default:
      return '写入失败：请查看实体级错误码和最终结果，确认未产生记录后再决定是否重试。';
  }
}
