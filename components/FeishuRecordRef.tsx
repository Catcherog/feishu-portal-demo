'use client';

/**
 * 飞书记录引用展示
 * - 展示写入成功后的飞书记录 ID 和目标表
 * - 仅展示引用信息，不含任何凭据（AC-B09）
 * - 响应式布局（AC-B11）
 */

interface Props {
  recordId: string;
  tableId: string;
}

export function FeishuRecordRef({ recordId, tableId }: Props) {
  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
      <h5 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
          />
        </svg>
        飞书记录引用
      </h5>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 shrink-0">记录 ID</span>
          <code className="flex-1 text-xs text-blue-800 bg-white px-2 py-1 rounded border border-blue-100 break-all">
            {recordId}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(recordId)}
            className="text-xs text-blue-600 hover:text-blue-800 shrink-0 px-2 py-1"
            title="复制"
          >
            复制
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-16 shrink-0">目标表</span>
          <code className="flex-1 text-xs text-blue-800 bg-white px-2 py-1 rounded border border-blue-100 break-all">
            {tableId}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(tableId)}
            className="text-xs text-blue-600 hover:text-blue-800 shrink-0 px-2 py-1"
            title="复制"
          >
            复制
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        此为飞书业务记录引用，浏览器端不存放任何飞书凭据或写入 Token。
      </p>
    </div>
  );
}
