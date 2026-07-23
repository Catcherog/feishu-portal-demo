'use client';

import { usePortalStore } from '@/lib/store';
import type { ScreenshotItem } from '@/lib/types';

/**
 * 截图列表组件
 * - 展示上传的截图缩略图
 * - 支持预览、删除、重新排序（AC-B01）
 * - 响应式布局（AC-B11）
 */
export function ScreenshotList() {
  const screenshots = usePortalStore((s) => s.screenshots);
  const selectedLocalId = usePortalStore((s) => s.selectedLocalId);
  const setSelected = usePortalStore((s) => s.setSelected);
  const removeScreenshot = usePortalStore((s) => s.removeScreenshot);
  const reorderScreenshots = usePortalStore((s) => s.reorderScreenshots);

  if (screenshots.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700">
          截图列表（{screenshots.length}/10）
        </h2>
      </div>
      <ul className="flex flex-col gap-2">
        {screenshots.map((item, index) => (
          <ScreenshotRow
            key={item.localId}
            item={item}
            index={index}
            total={screenshots.length}
            selected={item.localId === selectedLocalId}
            onSelect={() => setSelected(item.localId)}
            onRemove={() => removeScreenshot(item.localId)}
            onMoveUp={() => reorderScreenshots(index, index - 1)}
            onMoveDown={() => reorderScreenshots(index, index + 1)}
          />
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  item: ScreenshotItem;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ScreenshotRow({
  item,
  index,
  total,
  selected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RowProps) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border p-2 transition-colors cursor-pointer
        ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
      onClick={onSelect}
    >
      {/* 排序按钮 */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="上移"
          title="上移"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="下移"
          title="下移"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* 序号 */}
      <span className="text-xs text-gray-400 w-5 text-center shrink-0">{index + 1}</span>

      {/* 缩略图 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={item.filename}
        className="w-12 h-12 object-cover rounded shrink-0 border border-gray-200"
      />

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{item.filename}</p>
        <p className="text-xs text-gray-500">
          {formatSize(item.size)}
          {item.screenshotId && <span className="ml-2 text-blue-600">已提交</span>}
          {item.hasCorrections && <span className="ml-2 text-amber-600">已修改</span>}
        </p>
      </div>

      {/* 删除按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-gray-400 hover:text-red-600 shrink-0 p-1"
        aria-label="删除"
        title="删除"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>
    </li>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
