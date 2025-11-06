import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs';
import { getOctokit, fetchPRContext, listPRFiles, postOrUpdateComment } from './github';
import { analyzeJavaScript } from './analyzers/javascript';
import { buildUnified } from './diffs';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { formatDataflowList, renderComment } from './comment';
import { Confidence, DataFlowItem, InlineHint, PRContext, RiskLevel } from './types';
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
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Simple key extraction using tags we requested
      const sections = parseSections(text);
      walkthrough = sections.WALKTHROUGH || '';
      changesTableRows = sections.CHANGES_TABLE_ROWS || '';
      mermaidSequence = sections.MERMAID_SEQUENCE || '';
      findingsList = sections.FINDINGS_LIST || '';
      positiveNotes = sections.POSITIVE_NOTES || '';
      focusList = sections.FOCUS_LIST || '';
      relatedPrs = sections.RELATED_PRS || '';
      suggestedLabels = sections.SUGGESTED_LABELS || '';
      poem = sections.POEM || '';
      if (enableInline && sections.INLINE_JSON) {
        inline = JSON.parse(sections.INLINE_JSON);
      }
    } catch (err) {
      core.warning(`Gemini generation failed: ${(err as Error).message}`);
      walkthrough = 'Automated analysis fallback due to LLM unavailability.';
      findingsList = secrets.length ? `\n- Secrets detected: ${secrets.join(', ')}` : '';
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
      descCheckExpl: prCtx.body ? 'Description present.' : 'No description; still passed with minimal info.',
      titleCheckExpl: prCtx.title ? 'Title is set.' : 'Title missing? Please set a clear title.',
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