import { describe, it, expect } from 'vitest';
import { BOT_MARKER, collectHeadChangedLines } from '../src/github';
import type { DiffFile } from '../src/types';

describe('github comment idempotency marker', () => {
  it('has a stable marker string', () => {
    expect(BOT_MARKER).toBe('<!-- This is an auto-generated comment: summarize by coderabbit.ai -->');
  });

  it('collectHeadChangedLines parses simple patch', () => {
    const patch = `@@ -1,3 +1,3 @@\n line1\n-line2\n+line2 changed\n line3`;
    const files: DiffFile[] = [
      { filename: 'a.txt', status: 'modified', additions: 1, deletions: 1, changes: 2, patch }
    ];
    const map = collectHeadChangedLines(files);
    const set = map.get('a.txt');
    expect(set).toBeTruthy();
    expect(set!.has(2)).toBe(true); // head line 2 added
    expect(set!.has(1)).toBe(false);
  });
});