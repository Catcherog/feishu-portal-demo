import { describe, it, expect } from 'vitest';
import { resolveBuildInfo, formatBuildLabel } from '../build-info';

/**
 * FAMP-R3 AC-01 回归防护。
 * 核心不变量：拿不到可信 SHA 时必须显式 unknown，绝不伪造或静默隐藏。
 */

const FULL_SHA = '3f9a1c2d4e5f60718293a4b5c6d7e8f901234567';

describe('resolveBuildInfo', () => {
  it('从 Vercel production 构建变量解析出完整标识', () => {
    const info = resolveBuildInfo({
      NEXT_PUBLIC_BUILD_SHA: FULL_SHA,
      NEXT_PUBLIC_BUILD_REF: 'main',
      NEXT_PUBLIC_BUILD_TIME: '2026-08-04T16:00:00.000Z',
      NEXT_PUBLIC_BUILD_ENV: 'production',
    });

    expect(info.commitSha).toBe(FULL_SHA);
    expect(info.shortSha).toBe('3f9a1c2');
    expect(info.branch).toBe('main');
    expect(info.builtAt).toBe('2026-08-04T16:00:00.000Z');
    expect(info.environment).toBe('production');
    expect(info.source).toBe('vercel');
  });

  it('preview 环境同样归类为 vercel 来源', () => {
    expect(
      resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: FULL_SHA, NEXT_PUBLIC_BUILD_ENV: 'preview' })
        .source,
    ).toBe('vercel');
  });

  it('本地构建归类为 local 来源', () => {
    expect(
      resolveBuildInfo({
        NEXT_PUBLIC_BUILD_SHA: FULL_SHA,
        NEXT_PUBLIC_BUILD_ENV: 'development',
      }).source,
    ).toBe('local');
  });

  it('缺失 SHA 时显式 unknown，不伪造', () => {
    const info = resolveBuildInfo({});

    expect(info.commitSha).toBeNull();
    expect(info.shortSha).toBe('unknown');
    expect(info.source).toBe('unknown');
    expect(info.environment).toBe('unknown');
  });

  it('空串 / 纯空白 SHA 等同于缺失', () => {
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: '' }).commitSha).toBeNull();
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: '   ' }).commitSha).toBeNull();
  });

  it('非 commit SHA 形态的值一律拒绝（不做尽力猜测）', () => {
    // 未替换的构建占位符是最典型的"看起来有值其实无意义"来源
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: '$VERCEL_GIT_COMMIT_SHA' }).commitSha)
      .toBeNull();
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: 'unknown' }).commitSha).toBeNull();
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: 'abc' }).commitSha).toBeNull(); // 少于 7 位
    expect(resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: 'zzzzzzz' }).commitSha).toBeNull(); // 非十六进制
  });

  it('接受 7 位短 SHA 并统一为小写', () => {
    const info = resolveBuildInfo({ NEXT_PUBLIC_BUILD_SHA: '3F9A1C2' });
    expect(info.commitSha).toBe('3f9a1c2');
    expect(info.shortSha).toBe('3f9a1c2');
  });
});

describe('formatBuildLabel', () => {
  it('拼出可供人工比对的一行摘要', () => {
    const label = formatBuildLabel(
      resolveBuildInfo({
        NEXT_PUBLIC_BUILD_SHA: FULL_SHA,
        NEXT_PUBLIC_BUILD_REF: 'famp/real-ocr-write-result-r3',
        NEXT_PUBLIC_BUILD_ENV: 'production',
      }),
    );
    expect(label).toBe('build 3f9a1c2 · famp/real-ocr-write-result-r3 · production');
  });

  it('无标识时仍产出可读文案', () => {
    expect(formatBuildLabel(resolveBuildInfo({}))).toBe('build unknown');
  });
});
