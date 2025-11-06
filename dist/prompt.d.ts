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
export declare function buildSystemPrompt(personality: string): string;
export declare function buildUserPrompt(ctx: PRContext, opts: PromptBuildOpts): string;
export {};
