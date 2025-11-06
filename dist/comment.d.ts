import { Confidence, DataFlowItem, RiskLevel } from './types';
export interface CommentRenderInput {
    walkthrough: string;
    changesTableRows: string;
    mermaidSequence: string;
    risk: RiskLevel;
    confidence: Confidence;
    findingsList: string;
    dataflowList: string;
    positiveNotes: string;
    effort: string;
    minutes: number;
    focusList: string;
    relatedPrs: string;
    suggestedLabels: string;
    poem: string;
    checksPassed: number;
    descCheckExpl: string;
    titleCheckExpl: string;
    testBranch: string;
}
export declare function renderComment(input: CommentRenderInput): string;
export declare function formatDataflowList(flows: DataFlowItem[]): string;
