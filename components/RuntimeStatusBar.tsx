'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  checkRuntimeHealth,
  type HealthCheckResult,
  type RuntimeStatus,
} from '@/lib/api-client';

/**
 * 本地运行时状态指示器
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 §5
 *
 * 状态颜色：
 * - 绿色：本地运行时已连接
 * - 黄色：正在连接本地运行时
 * - 红色：Collator 未启动 / SOP 未就绪
 * - 灰色：浏览器拒绝本地网络访问
 *
 * 不无限轮询：页面首次加载一次、用户点击"重新检测"一次
 */

const STATUS_CONFIG: Record<RuntimeStatus, { color: string; dot: string; label: string }> = {
  checking: { color: 'text-amber-600', dot: 'bg-amber-400 animate-pulse', label: '正在连接本地运行时' },
  connected: { color: 'text-green-600', dot: 'bg-green-500', label: '本地运行时已连接' },
  collator_offline: { color: 'text-red-600', dot: 'bg-red-500', label: 'Collator 未启动' },
  sop_unavailable: { color: 'text-red-600', dot: 'bg-red-500', label: 'SOP 未就绪' },
  browser_blocked: { color: 'text-gray-500', dot: 'bg-gray-400', label: '浏览器拒绝本地网络访问' },
};

interface RuntimeStatusBarProps {
  onResult?: (result: HealthCheckResult) => void;
}

export function RuntimeStatusBar({ onResult }: RuntimeStatusBarProps) {
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const doCheck = useCallback(async () => {
    setChecking(true);
    const r = await checkRuntimeHealth();
    setResult(r);
    onResult?.(r);
    setChecking(false);
  }, [onResult]);

  // 页面首次加载时检查一次
  useEffect(() => {
    doCheck();
  }, [doCheck]);

  const status: RuntimeStatus = checking ? 'checking' : (result?.status ?? 'checking');
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <span className={`inline-block w-2 h-2 rounded-full ${config.dot}`} />
      <span className={`${config.color} font-medium hidden sm:inline`}>{config.label}</span>
      <span className={`${config.color} font-medium sm:hidden`}>
        {status === 'connected' ? '已连接' : status === 'checking' ? '连接中' : '离线'}
      </span>
      {status !== 'connected' && status !== 'checking' && (
        <button
          type="button"
          onClick={doCheck}
          disabled={checking}
          className="ml-1 text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 underline"
        >
          重新检测
        </button>
      )}
    </div>
  );
}
