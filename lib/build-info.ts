/**
 * Portal 构建标识（FAMP-R3 AC-01）。
 *
 * 背景：验收方无法区分"线上 Portal 是否为本次修复后的版本"，导致线上表现
 * 与预期文案冲突时无法归因。因此 Portal 必须在界面上只读展示其构建 SHA。
 *
 * 取值来源（构建期注入，见 next.config.ts）：
 *   - Vercel: VERCEL_GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_REF / VERCEL_ENV
 *   - 本地:   PORTAL_BUILD_SHA（可由 CI 或 `git rev-parse HEAD` 注入）
 *
 * 失败可见原则：拿不到 SHA 时显式展示 `unknown`，绝不隐藏或伪造，
 * 否则会重演"界面文案与真实部署不一致"的问题。
 */

export type BuildSource = 'vercel' | 'local' | 'unknown';

export interface PortalBuildInfo {
  /** 完整 40 位 commit SHA；未知为 null。 */
  commitSha: string | null;
  /** 用于展示的短 SHA；未知为 'unknown'。 */
  shortSha: string;
  /** 分支或 tag；未知为 null。 */
  branch: string | null;
  /** 构建时间（ISO 8601）；未知为 null。 */
  builtAt: string | null;
  /** 部署环境标识：production / preview / development / unknown。 */
  environment: string;
  /** SHA 的来源，便于判断展示值可信度。 */
  source: BuildSource;
}

/** 一次性展示用的环境快照字段。 */
export interface BuildInfoEnv {
  NEXT_PUBLIC_BUILD_SHA?: string;
  NEXT_PUBLIC_BUILD_REF?: string;
  NEXT_PUBLIC_BUILD_TIME?: string;
  NEXT_PUBLIC_BUILD_ENV?: string;
}

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function sanitize(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 纯函数形式，便于测试。
 * 只接受形如 commit SHA 的十六进制串；任何非法值一律视为 unknown，
 * 不做"尽力猜测"，避免展示出无法回溯的假标识。
 */
export function resolveBuildInfo(env: BuildInfoEnv): PortalBuildInfo {
  const rawSha = sanitize(env.NEXT_PUBLIC_BUILD_SHA);
  const validSha = rawSha && SHA_PATTERN.test(rawSha) ? rawSha.toLowerCase() : null;
  const environment = sanitize(env.NEXT_PUBLIC_BUILD_ENV) ?? 'unknown';

  let source: BuildSource = 'unknown';
  if (validSha) {
    source =
      environment === 'production' || environment === 'preview' ? 'vercel' : 'local';
  }

  return {
    commitSha: validSha,
    shortSha: validSha ? validSha.slice(0, 7) : 'unknown',
    branch: sanitize(env.NEXT_PUBLIC_BUILD_REF),
    builtAt: sanitize(env.NEXT_PUBLIC_BUILD_TIME),
    environment,
    source,
  };
}

/**
 * 读取当前构建标识。
 *
 * 注意：Next.js 只对**字面量** `process.env.NEXT_PUBLIC_X` 做构建期内联，
 * 因此这里必须逐个字面量引用，不能用动态下标访问。
 */
export function getPortalBuildInfo(): PortalBuildInfo {
  return resolveBuildInfo({
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
    NEXT_PUBLIC_BUILD_REF: process.env.NEXT_PUBLIC_BUILD_REF,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
    NEXT_PUBLIC_BUILD_ENV: process.env.NEXT_PUBLIC_BUILD_ENV,
  });
}

/** 面向界面的一行式摘要，例如 `build 3f9a1c2 · main · production`。 */
export function formatBuildLabel(info: PortalBuildInfo): string {
  const parts = [`build ${info.shortSha}`];
  if (info.branch) parts.push(info.branch);
  if (info.environment !== 'unknown') parts.push(info.environment);
  return parts.join(' · ');
}
