import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * FAMP-R3 AC-01：把构建期的 Git 标识注入客户端包，供界面只读展示。
 *
 * Vercel 构建时提供 VERCEL_GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_REF / VERCEL_ENV，
 * 但它们不是 NEXT_PUBLIC_ 前缀，不会自动进入浏览器包，必须显式映射。
 * 本地构建则回退到 PORTAL_BUILD_SHA 或 `git rev-parse HEAD`。
 * 全部取不到时留空，界面会显式显示 unknown（失败可见，不伪造）。
 */
function resolveLocalGitSha(): string {
  if (process.env.PORTAL_BUILD_SHA) return process.env.PORTAL_BUILD_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // 无 git 或仓库不可读（例如本项目当前的对象库损坏场景）→ 不猜测。
    return "";
  }
}

function resolveLocalGitRef(): string {
  if (process.env.PORTAL_BUILD_REF) return process.env.PORTAL_BUILD_REF;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? resolveLocalGitSha();
const buildRef = process.env.VERCEL_GIT_COMMIT_REF ?? resolveLocalGitRef();
const buildEnv = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_REF: buildRef,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_ENV: buildEnv,
  },
};

export default nextConfig;
