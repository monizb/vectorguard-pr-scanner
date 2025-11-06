import { Octokit } from '@octokit/rest';
import { CommentPostResult, DiffFile, PRContext, InlineHint } from './types';
declare const BOT_MARKER = "<!-- This is an auto-generated comment: summarize by coderabbit.ai -->";
export declare function getOctokit(): Octokit;
export declare function fetchPRContext(octokit: Octokit, opts?: {
    owner?: string;
    repo?: string;
    pr_number?: number;
}): Promise<PRContext>;
export declare function listPRFiles(octokit: Octokit, ctx: PRContext): Promise<DiffFile[]>;
export declare function getFileContentAtRef(octokit: Octokit, ctx: PRContext, path: string, ref: string): Promise<string>;
export declare function postOrUpdateComment(octokit: Octokit, ctx: PRContext, body: string, updateExisting: boolean): Promise<CommentPostResult>;
export { BOT_MARKER };
export declare function collectHeadChangedLines(files: DiffFile[]): Map<string, Set<number>>;
export declare function postInlineReviewComments(octokit: Octokit, ctx: PRContext, comments: InlineHint[], options?: {
    files?: DiffFile[];
    body?: string;
}): Promise<void>;
