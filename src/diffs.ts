import { DiffFile, DiffStats, FileContextSnippet, PRContext } from './types';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import { getFileContentAtRef } from './github';

export interface UnifiedResult {
  unifiedDiff: string;
  stats: DiffStats;
  fileContexts: FileContextSnippet[];
  languages: string[];
}

const EXT_LANG: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rb': 'Ruby',
  '.java': 'Java',
  '.cs': 'C#',
  '.php': 'PHP',
  '.rs': 'Rust',
  '.sql': 'SQL',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.json': 'JSON',
};

export async function buildUnified(octokit: Octokit, ctx: PRContext, files: DiffFile[]): Promise<UnifiedResult> {
  let unifiedDiff = '';
  let additions = 0;
  let deletions = 0;
  const languagesSet = new Set<string>();
  const fileContexts: FileContextSnippet[] = [];

  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
    if (f.patch) unifiedDiff += `\n# File: ${f.filename}\n${f.patch}\n`;
    // language detection (safe for no-extension paths)
    const dotIdx = f.filename.lastIndexOf('.');
    if (dotIdx >= 0) {
      const ext = f.filename.slice(dotIdx);
      if (EXT_LANG[ext]) languagesSet.add(EXT_LANG[ext]);
    }
    // fetch content head
    const content = await getFileContentAtRef(octokit, ctx, f.filename, ctx.headSha);
    if (content) {
      const snippet = contextualSnippet(content, f.patch, f.filename);
      fileContexts.push({ path: f.filename, content: snippet });
    }
  }
  return {
    unifiedDiff,
    stats: { filesChanged: files.length, additions, deletions },
    fileContexts,
    languages: Array.from(languagesSet),
  };
}

function contextualSnippet(content: string, patch: string | undefined, path: string): string {
  if (!patch) return truncate(content, 8000);
  // Extract changed line numbers from patch
  const lines: number[] = [];
  const hunkRegex = /^@@\s+-\d+,?\d*\s+\+(\d+),?(\d*)\s+@@/gm;
  let m;
  while ((m = hunkRegex.exec(patch))) {
    const start = parseInt(m[1], 10);
    const count = m[2] ? parseInt(m[2], 10) : 1;
    for (let i = start; i < start + count; i++) lines.push(i);
  }
  const contentLines = content.split(/\r?\n/);
  const collected: string[] = [];
  for (const ln of lines) {
    const from = Math.max(0, ln - 61);
    const to = Math.min(contentLines.length, ln + 60);
    collected.push(`// Context slice for ${path}:${ln}`, ...contentLines.slice(from, to));
    if (collected.join('\n').length > 8000) break;
  }
  return collected.length ? collected.join('\n') : truncate(content, 8000);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n/* truncated */' : s;
}