'use client';

import type { ScreenshotItem, GovernanceDecision } from '@/lib/types';

/**
 * SOP 治理状态卡
 * FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01 UI 规范
 *
 * 独立状态卡显示 PASS / NEEDS_REVIEW / BLOCKED
 * 不能只用颜色表达，必须同时有文字、图标和原因。
 */

interface Props {
  item: ScreenshotItem;
}

export function GovernanceCard({ item }: Props) {
  const decision = inferGovernanceDecision(item);
  if (!decision) return null;

  const config = GOVERNANCE_CONFIG[decision];

  return (
    <div className={`rounded-lg border-2 p-3 sm:p-4 ${config.container}`}>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.iconBg}`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${config.title}`}>{config.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.badge}`}>
              SOP Gate
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${config.desc}`}>{config.description}</p>
          {item.statusResponse?.governance?.decision && (
            <p className="text-[10px] text-gray-400 mt-1">
              规则版本: {item.statusResponse.governance.rule_version ?? '-'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function inferGovernanceDecision(item: ScreenshotItem): GovernanceDecision | null {
  const status = item.serverStatus;
  if (status === 'governance_passed') return 'PASS';
  if (status === 'governance_needs_review') return 'NEEDS_REVIEW';
  if (status === 'governance_blocked') return 'BLOCKED';
  if (status === 'duplicate_skipped') return 'DUPLICATE_SKIPPED';
  // 从 finalResult 推断
  const final = item.finalResultResponse;
  if (final?.governance_result_v1?.decision) {
    return final.governance_result_v1.decision as GovernanceDecision;
  }
  return null;
}

const GOVERNANCE_CONFIG: Record<GovernanceDecision, {
  container: string;
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  badge: string;
  desc: string;
  label: string;
  description: string;
}> = {
  PASS: {
    container: 'border-green-300 bg-green-50',
    iconBg: 'bg-green-100',
    icon: <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    title: 'text-green-800',
    badge: 'bg-green-200 text-green-800',
    desc: 'text-green-700',
    label: '治理通过',
    description: '数据已通过 SOP 治理门禁，可生成写入预览',
  },
  NEEDS_REVIEW: {
    container: 'border-amber-300 bg-amber-50',
    iconBg: 'bg-amber-100',
    icon: <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
    title: 'text-amber-800',
    badge: 'bg-amber-200 text-amber-800',
    desc: 'text-amber-700',
    label: '需人工复核',
    description: '数据存在风险或低置信度内容，需人工确认后方可写入',
  },
  BLOCKED: {
    container: 'border-red-300 bg-red-50',
    iconBg: 'bg-red-100',
    icon: <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>,
    title: 'text-red-800',
    badge: 'bg-red-200 text-red-800',
    desc: 'text-red-700',
    label: '已阻止',
    description: '数据违反治理规则，禁止写入业务表',
  },
  DUPLICATE_SKIPPED: {
    container: 'border-gray-300 bg-gray-50',
    iconBg: 'bg-gray-100',
    icon: <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>,
    title: 'text-gray-800',
    badge: 'bg-gray-200 text-gray-800',
    desc: 'text-gray-600',
    label: '重复跳过',
    description: '检测到重复提交，已跳过处理',
  },
};
