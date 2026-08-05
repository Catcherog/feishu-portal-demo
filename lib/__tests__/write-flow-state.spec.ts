import { describe, expect, it } from 'vitest';
import {
  isControlledPreviewConfirmed,
  isControlledPreviewGenerated,
  shouldPreserveControlledWorkflowState,
  shouldStopAutoPolling,
} from '../write-flow-state';

describe('controlled write UI state', () => {
  it('recognizes server preview statuses as the source of truth', () => {
    expect(isControlledPreviewGenerated('preview_generated')).toBe(true);
    expect(isControlledPreviewGenerated('confirmed')).toBe(false);
    expect(isControlledPreviewConfirmed('confirmed')).toBe(true);
    expect(isControlledPreviewConfirmed('preview_generated')).toBe(false);
  });

  it('stops ingestion polling once preview workflow starts', () => {
    expect(shouldStopAutoPolling('preview', false)).toBe(true);
    expect(shouldStopAutoPolling('governance', true)).toBe(true);
    expect(shouldStopAutoPolling('governance', false)).toBe(false);
  });

  it('preserves newer preview/write state from stale poll responses', () => {
    expect(shouldPreserveControlledWorkflowState('preview', true, false)).toBe(true);
    expect(shouldPreserveControlledWorkflowState('write', true, false)).toBe(true);
    expect(shouldPreserveControlledWorkflowState('done', true, true)).toBe(true);
    expect(shouldPreserveControlledWorkflowState('governance', false, false)).toBe(false);
  });
});
