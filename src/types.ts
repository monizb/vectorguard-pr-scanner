export type RiskLevel = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';
export type Confidence = 'Low' | 'Medium' | 'High';

export interface PRContext {
  owner: string;
  repo: string;
  pull_number: number;
  baseRef: string;
  headRef: string;
  headSha: string;
  title: string;
  body: string | null;
  author: string;
  url: string;
}

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

export interface DiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface FileContextSnippet {
  path: string;
  content: string; // head content
}

export interface DataFlowNodeInfo {
  file: string;
  startLine: number;
  endLine: number;
  code?: string;
}

export interface DataFlowItem {
  source: string;
  transform?: string;
  sink: string;
  sourceLoc: DataFlowNodeInfo;
  sinkLoc: DataFlowNodeInfo;
  transformLoc?: DataFlowNodeInfo;
  severity: RiskLevel;
  confidence: Confidence;
  description?: string;
}

export interface InlineHint {
  path: string;
  line: number;
  body: string;
}

export interface RenderedComment {
  body: string;
  risk: RiskLevel;
  confidence: Confidence;
}

export interface CommentPostResult {
  id: number;
  url: string;
}