'use client';

import { getPortalBuildInfo, formatBuildLabel } from '@/lib/build-info';
import { getApiBaseUrl } from '@/lib/api-client';

/**
 * 只读构建标识徽章（FAMP-R3 AC-01）。
 *
 * 让验收方一眼确认"线上这份 Portal 到底是哪个 commit"，
 * 避免修复已部署但界面表现不符时无法归因。
 *
 * 取不到 SHA 时显示醒目的 unknown，而不是静默隐藏。
 */
export function BuildIdentityBadge() {
  const info = getPortalBuildInfo();
  const unknown = info.commitSha === null;

  return (
    <span
      data-testid="build-identity"
      data-build-sha={info.commitSha ?? 'unknown'}
      title={[
        `commit: ${info.commitSha ?? 'unknown'}`,
        `ref: ${info.branch ?? 'unknown'}`,
        `built: ${info.builtAt ?? 'unknown'}`,
        `env: ${info.environment}`,
        `api base: ${getApiBaseUrl()}`,
      ].join('\n')}
      className={[
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
        'font-mono text-[10px] leading-none select-all',
        unknown
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-gray-200 bg-gray-50 text-gray-600',
      ].join(' ')}
    >
      {unknown ? 'build unknown' : formatBuildLabel(info)}
    </span>
  );
}
