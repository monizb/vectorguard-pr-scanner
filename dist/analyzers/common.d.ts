import { Confidence, DataFlowItem, RiskLevel } from '../types';
export declare const SECRET_PATTERNS: {
    name: string;
    regex: RegExp;
}[];
export declare function detectSecrets(diff: string): string[];
export declare function maxRisk(flows: DataFlowItem[]): RiskLevel;
export declare function combineConfidence(flows: DataFlowItem[]): Confidence;
export declare function riskFromFlow(flow: DataFlowItem): RiskLevel;
export declare function estimateEffort(changedFiles: number, flows: number): {
    effort: string;
    minutes: number;
};
