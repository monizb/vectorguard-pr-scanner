import { PRContext, DiffStats, FileContextSnippet, DataFlowItem } from './types';

interface PromptBuildOpts {
  personality: string;
  model: string;
  enableInline: boolean;
  languages: string[];
  unifiedDiff: string;
  fileContexts: FileContextSnippet[];
  flows: DataFlowItem[];
  secretFindings: string[];
  stats: DiffStats;
}

export function buildSystemPrompt(personality: string): string {
  return `You are a senior security code reviewer. Persona: ${personality}. \nPriorities: minimize false positives, highlight actual exploitable paths, detect unsanitized data from user-controlled sources reaching dangerous sinks. Return concise markdown segments mapping exactly to placeholders requested.`;
}

export function buildUserPrompt(ctx: PRContext, opts: PromptBuildOpts): string {
  const flowSummary = opts.flows
    .map((f, i) => `Flow ${i + 1}: ${f.source} -> ${f.transform ? '[' + f.transform + '] -> ' : ''}${f.sink} (${f.severity}/${f.confidence})`)
    .join('\n');
  const secrets = opts.secretFindings.length ? `Secrets detected: ${opts.secretFindings.join(', ')}` : 'No secrets detected in diff.';
  const contexts = opts.fileContexts
    .slice(0, 12)
    .map((fc) => `File: ${fc.path}\n${fc.content}`)
    .join('\n---\n');
  return `PR META:\nTitle: ${ctx.title}\nAuthor: ${ctx.author}\nURL: ${ctx.url}\nLanguages: ${opts.languages.join(', ')}\nChanges: files=${opts.stats.filesChanged} +${opts.stats.additions} -${opts.stats.deletions}\n\nUNIFIED DIFF:\n${truncate(opts.unifiedDiff, 18000)}\n\nCONTEXT SNIPPETS:\n${truncate(contexts, 18000)}\n\nDATA FLOWS:\n${flowSummary || 'None'}\n\n${secrets}\n\nTASK: Produce sections for the given template placeholders. Provide:\n- WALKTHROUGH (overview of change sets)\n- CHANGES_TABLE_ROWS (markdown table rows)\n- MERMAID_SEQUENCE (sequence diagram or simple placeholder)\n- FINDINGS_LIST (bullet list of security findings; mark severity)\n- DATAFLOW_LIST (bullet list summarizing flows)\n- POSITIVE_NOTES (at least one)\n- EFFORT qualitative (Light/Medium/Moderate/Heavy)\n- MINUTES estimate integer\n- FOCUS_LIST (bullets)\n- RELATED_PRS (if guessable else 'None found')\n- SUGGESTED_LABELS (markdown inline code labels)\n- POEM (short, tasteful)\nReturn raw content without wrapping markers (the action will inject). ${opts.enableInline ? 'ALSO produce JSON array of inline hints with path,line,body under INLINE_JSON:' : ''}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n/* truncated */' : s;
}