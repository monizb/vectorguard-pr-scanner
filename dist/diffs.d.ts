import { DiffFile, DiffStats, FileContextSnippet, PRContext } from './types';
import { Octokit } from '@octokit/rest';
export interface UnifiedResult {
    unifiedDiff: string;
    stats: DiffStats;
    fileContexts: FileContextSnippet[];
    languages: string[];
}
export declare function buildUnified(octokit: Octokit, ctx: PRContext, files: DiffFile[]): Promise<UnifiedResult>;
