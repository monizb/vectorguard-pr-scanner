import { describe, it, expect } from 'vitest';
import { renderComment } from '../src/comment';

describe('comment renderer', () => {
  it('includes marker and placeholders', () => {
    const body = renderComment({
      walkthrough: 'Test walkthrough',
      changesTableRows: '| file.js | change |',
      mermaidSequence: 'sequenceDiagram',
      risk: 'Low',
      confidence: 'High',
      findingsList: '- Finding',
      dataflowList: '- flow',
      positiveNotes: '- positive',
      effort: 'Light',
      minutes: 5,
      focusList: '- focus',
      relatedPrs: 'None',
      suggestedLabels: '`security`',
      poem: 'Roses are red',
      checksPassed: 2,
      descCheckExpl: 'ok',
      titleCheckExpl: 'ok',
      testBranch: 'tests/branch'
    });
    expect(body).toContain('<!-- This is an auto-generated comment: summarize by coderabbit.ai -->');
    expect(body).toContain('## Security Review');
    expect(body).toContain('Roses are red');
  });
});