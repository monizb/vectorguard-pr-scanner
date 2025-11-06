import { describe, it, expect } from 'vitest';
import { BOT_MARKER } from '../src/github';

describe('github comment idempotency marker', () => {
  it('has a stable marker string', () => {
    expect(BOT_MARKER).toBe('<!-- This is an auto-generated comment: summarize by coderabbit.ai -->');
  });
});