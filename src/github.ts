import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { CommentPostResult, DiffFile, PRContext, InlineHint } from './types';

const BOT_MARKER = '<!-- This is an auto-generated comment: summarize by coderabbit.ai -->';

export function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) core.warning('GITHUB_TOKEN not set; GitHub API calls may fail.');
  return new Octokit({ auth: token });
}

export async function fetchPRContext(octokit: Octokit, opts?: { owner?: string; repo?: string; pr_number?: number }): Promise<PRContext> {
  const repoCtx = github.context.repo;
  const owner = opts?.owner || repoCtx.owner;
  const repo = opts?.repo || repoCtx.repo;
  const pull_number = opts?.pr_number || (github.context.payload.pull_request?.number as number);
  if (!owner || !repo || !pull_number) {
    throw new Error('Unable to determine PR context. Provide inputs owner/repo/pr_number or run on pull_request event.');
  }
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number });
  return {
    owner,
    repo,
    pull_number,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    title: pr.title || '',
    body: pr.body || null,
    author: pr.user?.login || 'unknown',
    url: pr.html_url,
  };
}

export async function listPRFiles(octokit: Octokit, ctx: PRContext): Promise<DiffFile[]> {
  const files: DiffFile[] = [];
  const iterator = octokit.paginate.iterator(octokit.pulls.listFiles, { owner: ctx.owner, repo: ctx.repo, pull_number: ctx.pull_number, per_page: 100 });
  for await (const page of iterator) {
    for (const f of page.data) {
      files.push({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
        raw_url: f.raw_url || undefined,
      });
    }
  }
  return files;
}

export async function getFileContentAtRef(octokit: Octokit, ctx: PRContext, path: string, ref: string): Promise<string> {
  try {
    const { data } = await octokit.repos.getContent({ owner: ctx.owner, repo: ctx.repo, path, ref });
    if ('content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
    return '';
  } catch (e) {
    core.debug(`Failed to fetch content for ${path}@${ref}: ${(e as Error).message}`);
    return '';
  }
}

export async function postOrUpdateComment(
  octokit: Octokit,
  ctx: PRContext,
  body: string,
  updateExisting: boolean
): Promise<CommentPostResult> {
  // Find existing bot comment by marker
  const { data: comments } = await octokit.issues.listComments({ owner: ctx.owner, repo: ctx.repo, issue_number: ctx.pull_number, per_page: 100 });
  const existing = comments.find((c) => c.body?.includes(BOT_MARKER));
  if (existing && updateExisting) {
    const res = await octokit.issues.updateComment({ owner: ctx.owner, repo: ctx.repo, comment_id: existing.id, body });
    return { id: res.data.id, url: res.data.html_url! };
  }
  const res = await octokit.issues.createComment({ owner: ctx.owner, repo: ctx.repo, issue_number: ctx.pull_number, body });
  return { id: res.data.id, url: res.data.html_url! };
}

export { BOT_MARKER };

// Parse changed head-side line numbers from a unified patch string
function headChangedLinesFromPatch(patch?: string): Set<number> {
  const set = new Set<number>();
  if (!patch) return set;
  const lines = patch.split(/\r?\n/);
  let headLine = 0;
  for (const ln of lines) {
    const hunk = /^@@\s+-\d+,?\d*\s+\+(\d+),?(\d*)\s+@@/.exec(ln);
    if (hunk) {
      headLine = parseInt(hunk[1], 10);
      continue;
    }
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      set.add(headLine);
      headLine += 1;
    } else if (ln.startsWith('-') && !ln.startsWith('---')) {
      // deletion; does not advance head
      continue;
    } else {
      // context
      headLine += 1;
    }
  }
  return set;
}

export function collectHeadChangedLines(files: DiffFile[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const f of files) {
    map.set(f.filename, headChangedLinesFromPatch(f.patch));
  }
  return map;
}

export async function postInlineReviewComments(
  octokit: Octokit,
  ctx: PRContext,
  comments: InlineHint[],
  options?: { files?: DiffFile[]; body?: string }
): Promise<void> {
  if (!comments.length) return;
  const files = options?.files || [];
  const changed = collectHeadChangedLines(files);

  // Filter to comments that point to changed lines; fallback: keep if no patch info
  const eligible = comments.filter((c) => {
    const set = changed.get(c.path);
    if (!set || set.size === 0) return true;
    return set.has(c.line);
  });

  if (!eligible.length) return;

  // Prepare review with multiple comments
  const reviewComments = eligible.slice(0, 50).map((c) => ({
    path: c.path,
    body: `${BOT_MARKER}\n\n${c.body}`,
    line: c.line,
    side: 'RIGHT' as const,
  }));

  await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pull_number,
    event: 'COMMENT',
    body: options?.body,
    comments: reviewComments,
  });
}