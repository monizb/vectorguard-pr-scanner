import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs';
import { getOctokit, fetchPRContext, listPRFiles, postOrUpdateComment } from './github';
import { analyzeJavaScript } from './analyzers/javascript';
import { buildUnified } from './diffs';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { formatDataflowList, renderComment } from './comment';
import { Confidence, DataFlowItem, InlineHint, PRContext, RiskLevel, DiffFile } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { combineConfidence, detectSecrets, estimateEffort, maxRisk } from './analyzers/common';

async function run() {
  try {
    const apiKey = core.getInput('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing gemini_api_key input or GEMINI_API_KEY env.');
    const modelName = core.getInput('model') || 'gemini-1.5-pro-latest';
    const temperature = parseFloat(core.getInput('temperature') || '0.2');
    const maxOutputTokens = parseInt(core.getInput('max_output_tokens') || '4096', 10);
    const enableInline = (core.getInput('enable_inline') || 'false').toLowerCase() === 'true';
    const updateExisting = (core.getInput('update_existing') || 'true').toLowerCase() === 'true';
    const failOnHigh = (core.getInput('fail_on_high') || 'false').toLowerCase() === 'true';
    const personality = core.getInput('personality') || 'mentor, concise, slightly witty';
    const owner = core.getInput('owner') || undefined;
    const repo = core.getInput('repo') || undefined;
    const prNumberStr = core.getInput('pr_number') || '';
    const pr_number = prNumberStr ? parseInt(prNumberStr, 10) : undefined;

    const octokit = getOctokit();
    const prCtx: PRContext = await fetchPRContext(octokit, { owner, repo, pr_number });
    const files = await listPRFiles(octokit, prCtx);
    const unified = await buildUnified(octokit, prCtx, files);

    // Analyze flows (JS/TS only for now)
    const flows: DataFlowItem[] = [];
    for (const fc of unified.fileContexts) {
      if (/\.(js|jsx|ts|tsx)$/.test(fc.path)) {
        flows.push(...analyzeJavaScript(fc.path, fc.content));
      }
    }
    const secrets = detectSecrets(unified.unifiedDiff);
    const risk = maxRisk(flows);
    const confidence: Confidence = combineConfidence(flows);
    const { effort, minutes } = estimateEffort(unified.stats.filesChanged, flows.length);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature, maxOutputTokens } });
    const systemPrompt = buildSystemPrompt(personality);
    const userPrompt = buildUserPrompt(prCtx, {
      personality,
      model: modelName,
      enableInline,
      languages: unified.languages,
      unifiedDiff: unified.unifiedDiff,
      fileContexts: unified.fileContexts,
      flows,
      secretFindings: secrets,
      stats: unified.stats,
    });

    const prompt = `${systemPrompt}\n---\n${userPrompt}`;
    let walkthrough = '';
    let changesTableRows = '';
    let mermaidSequence = '';
    let findingsList = '';
    let positiveNotes = '';
    let focusList = '';
    let relatedPrs = '';
    let suggestedLabels = '';
    let poem = '';
    let inline: InlineHint[] = [];
    let aiUsed = false;
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Simple key extraction using tags we requested
      const sections = parseSections(text);
      // If strict tag-based parsing failed to populate, try markdown-based extraction
      const mdFallback = ensureSectionsWithMarkdown(text, sections);
      Object.assign(sections, mdFallback);
      walkthrough = sections.WALKTHROUGH || '';
      changesTableRows = sections.CHANGES_TABLE_ROWS || '';
      mermaidSequence = sections.MERMAID_SEQUENCE || '';
      findingsList = sections.FINDINGS_LIST || '';
      positiveNotes = sections.POSITIVE_NOTES || '';
      focusList = sections.FOCUS_LIST || '';
      relatedPrs = sections.RELATED_PRS || '';
      suggestedLabels = sections.SUGGESTED_LABELS || '';
      poem = sections.POEM || '';
      aiUsed = Boolean(walkthrough || changesTableRows || findingsList || mermaidSequence);
      if (enableInline && sections.INLINE_JSON) {
        inline = JSON.parse(sections.INLINE_JSON);
      }
    } catch (err) {
      core.warning(`Gemini generation failed: ${(err as Error).message}`);
      walkthrough = 'Automated analysis fallback due to LLM unavailability.';
      findingsList = secrets.length ? `\n- Secrets detected: ${secrets.join(', ')}` : '';
    }

    // Deterministic fallbacks if model output was empty or weak
    if (!changesTableRows.trim()) {
      changesTableRows = buildChangesTableRows(files);
    }
    if (!walkthrough.trim()) {
      walkthrough = buildWalkthroughSummary(unified.stats, files);
    }
    if (!mermaidSequence.trim()) {
      mermaidSequence = buildDefaultSequence(files);
    }
    if (!focusList.trim()) {
      focusList = buildFocusList(files);
    }

    const dataflowList = formatDataflowList(flows);
    const body = renderComment({
      walkthrough,
      changesTableRows,
      mermaidSequence,
      risk,
      confidence,
      findingsList,
      dataflowList,
      positiveNotes,
      effort,
      minutes,
      focusList,
      relatedPrs,
      suggestedLabels,
      poem,
      checksPassed: 2,
      descCheckExpl: (prCtx.body ? 'Description present.' : 'No description; still passed with minimal info.') + `  (LLM: ${aiUsed ? 'used' : 'fallback'})`,
      titleCheckExpl: (prCtx.title ? 'Title is set.' : 'Title missing? Please set a clear title.') + `  (Model: ${modelName})`,
      testBranch: `tests/${prCtx.headRef}`,
    });

    const { id, url } = await postOrUpdateComment(octokit, prCtx, body, updateExisting);
    await setOutput('comment_id', String(id));
    await setOutput('risk', risk);
    await setOutput('inline', JSON.stringify(enableInline ? inline : []));
    await setOutput('summary_url', url);

    if (failOnHigh && (risk === 'High' || risk === 'Critical')) {
      core.setFailed(`Risk level is ${risk}`);
      return;
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

function parseSections(text: string): Record<string, string> {
  const keys = [
    'WALKTHROUGH',
    'CHANGES_TABLE_ROWS',
    'MERMAID_SEQUENCE',
    'FINDINGS_LIST',
    'DATAFLOW_LIST',
    'POSITIVE_NOTES',
    'EFFORT',
    'MINUTES',
    'FOCUS_LIST',
    'RELATED_PRS',
    'SUGGESTED_LABELS',
    'POEM',
    'INLINE_JSON',
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const m = new RegExp(`${k}:\\n([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`).exec(text);
    if (m) out[k] = m[1].trim();
  }
  return out;
}

// Try to extract sections from common markdown that LLMs often produce
function ensureSectionsWithMarkdown(text: string, current: Record<string, string>): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  const md = text || '';
  const grab = (header: string): string => {
    const re = new RegExp(`^##\\s+${header}\\s*\n([\\s\\S]*?)(?=\n##\\s+|$)`, 'mi');
    const m = md.match(re);
    return m ? m[1].trim() : '';
  };
  if (!current.WALKTHROUGH) out.WALKTHROUGH = grab('Walkthrough');
  if (!current.CHANGES_TABLE_ROWS) {
    const changes = grab('Changes');
    // Extract only table rows by removing header if present
    const rows = changes
      .split(/\n/)
      .filter((ln) => ln.trim().startsWith('|') && !/\|\s*-{3,}\s*\|/.test(ln))
      .join('\n')
      .trim();
    if (rows) out.CHANGES_TABLE_ROWS = rows;
  }
  if (!current.MERMAID_SEQUENCE) {
    const mermaid = /```mermaid\n([\s\S]*?)```/im.exec(md);
    if (mermaid) out.MERMAID_SEQUENCE = mermaid[1].trim();
  }
  if (!current.POSITIVE_NOTES) out.POSITIVE_NOTES = grab('Positive notes');
  if (!current.FINDINGS_LIST) out.FINDINGS_LIST = grab('Key findings');
  if (!current.FOCUS_LIST) {
    const focusBlock = /\*\s*Focus review on:\s*\n([\s\S]*?)(?=\n\n|\n##\s+|$)/im.exec(md);
    if (focusBlock) out.FOCUS_LIST = focusBlock[1].trim();
  }
  if (!current.RELATED_PRS) out.RELATED_PRS = grab('Possibly related PRs') || grab('Possibly related PRs') || grab('Possibly related PRs');
  if (!current.SUGGESTED_LABELS) out.SUGGESTED_LABELS = grab('Suggested labels');
  if (!current.POEM) out.POEM = grab('Poem');
  return out;
}

function buildChangesTableRows(files: DiffFile[]): string {
  if (!files.length) return '| — | No material changes |';
  const cohorts: { cohort: string; file: string; summary: string }[] = files.slice(0, 50).map((f) => ({
    cohort: cohortFor(f.filename),
    file: f.filename,
    summary: `${statusEmoji(f.status)} ${humanStatus(f.status)} (+${f.additions}/-${f.deletions})`,
  }));
  return cohorts
    .map((c) => `| **${c.cohort}** <br> \`${c.file}\` | ${c.summary} |`)
    .join('\n');
}

function buildWalkthroughSummary(stats: { filesChanged: number; additions: number; deletions: number }, files: DiffFile[]): string {
  if (!files.length) return 'No material changes.';
  const top = files
    .slice()
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 5)
    .map((f) => `\`${f.filename}\` (${humanStatus(f.status)}, +${f.additions}/-${f.deletions})`)
    .join(', ');
  return `Updates ${stats.filesChanged} files (+${stats.additions}/-${stats.deletions}). Notable: ${top}.`;
}

function buildFocusList(files: DiffFile[]): string {
  const list: string[] = [];
  if (files.some((f) => /package\.json|lock/.test(f.filename))) list.push('- Dependency changes: verify versions and license impacts.');
  if (files.some((f) => /\.(tsx?|jsx?)$/.test(f.filename))) list.push('- JS/TS changes: validate input validation and escape paths.');
  if (files.some((f) => /\.(ya?ml)$/.test(f.filename))) list.push('- CI/config changes: ensure least-privilege and safe defaults.');
  if (!list.length) list.push('- Review any auth or input validation boundaries.');
  return list.join('\n');
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'added':
      return '🆕';
    case 'modified':
      return '✏️';
    case 'removed':
      return '🗑️';
    case 'renamed':
      return '🔁';
    default:
      return '▫️';
  }
}

function humanStatus(status: string): string {
  switch (status) {
    case 'added':
      return 'Added';
    case 'modified':
      return 'Modified';
    case 'removed':
      return 'Removed';
    case 'renamed':
      return 'Renamed';
    default:
      return status;
  }
}

function cohortFor(filename: string): string {
  if (/^src\//.test(filename)) return 'Source';
  if (/^tests?\//.test(filename)) return 'Tests';
  if (/^app\//.test(filename)) return 'App';
  if (/^config|\.ya?ml$/.test(filename)) return 'Config';
  if (/package\.json|tsconfig\.json/.test(filename)) return 'Build';
  return 'General';
}

function buildDefaultSequence(files: DiffFile[]): string {
  // Show a simple pipeline; augment with key cohorts if present
  const hasConfig = files.some((f) => /\.github\/workflows\//.test(f.filename));
  const hasSource = files.some((f) => /^src\//.test(f.filename));
  const hasTests = files.some((f) => /^tests?\//.test(f.filename));
  const lines = [
    'sequenceDiagram',
    '    participant PR as Pull Request',
    '    participant GH as GitHub Actions',
    '    participant Reviewer as VectorGuard',
  ];
  if (hasSource) lines.push('    participant Code as Source');
  if (hasTests) lines.push('    participant Tests');
  if (hasConfig) lines.push('    participant CI as Workflow Config');
  lines.push('    PR->>GH: Event (opened/sync)');
  if (hasConfig) lines.push('    GH->>CI: Load workflow');
  lines.push('    GH->>Reviewer: Run security scan');
  if (hasSource) lines.push('    Reviewer->>Code: Analyze diff hunks');
  if (hasTests) lines.push('    Reviewer->>Tests: Consider coverage');
  lines.push('    Reviewer-->>PR: Summary comment');
  return lines.join('\n');
}

async function setOutput(name: string, value: string) {
  try {
    core.setOutput(name, value);
  } catch {
    const file = process.env.GITHUB_OUTPUT;
    if (file) {
      // Write to GITHUB_OUTPUT file as fallback
      fs.appendFileSync(file, `${name}=${value}\n`);
    }
  }
}

run();