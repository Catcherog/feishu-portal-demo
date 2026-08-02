'use client';

/**
 * 执行写入最终确认弹窗
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §7
 *
 * AC-15: Execute 前存在第二次显式确认
 * 最终弹窗至少显示：
 * - 环境：受控正式业务写入
 * - 预计创建：Customer 1
 * - 预计创建：Project 1
 * - 预计关联：Project -> Customer 1
 * - 不可自动撤销
 *
 * 录屏时必须能够在 Execute 前停住。
 */

interface Props {
  open: boolean;
  dryRun: boolean;
  executing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExecuteConfirmDialog({ open, dryRun, executing, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="execute-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 id="execute-confirm-title" className="text-base sm:text-lg font-bold text-gray-900">
            确认执行真实写入
          </h3>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">环境</span>
            <span className="text-gray-900 font-medium">
              {dryRun ? '干运行（不实际写入）' : '受控正式业务写入'}
            </span>
          </div>
          {!dryRun && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">预计创建</span>
                <span className="text-blue-700 font-medium">Customer × 1</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">预计创建</span>
                <span className="text-indigo-700 font-medium">Project × 1</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">预计关联</span>
                <span className="text-gray-900 font-medium">Project → Customer</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">撤销</span>
                <span className="text-red-600 font-medium">不可自动撤销</span>
              </div>
            </>
          )}
        </div>

        {!dryRun && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            此操作将在飞书业务表中创建真实记录。请确保已核对所有候选字段，写入后不可自动撤销。
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={executing}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={executing}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50
              ${dryRun ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {executing
              ? '执行中...'
              : dryRun
                ? '执行干运行'
                : '执行真实写入'}
          </button>
        </div>
      </div>
    </div>
  );
}
