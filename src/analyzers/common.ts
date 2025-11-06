import { Confidence, DataFlowItem, RiskLevel } from '../types';

// Simple secret regexes (heuristic, low FP tolerance)
export const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Generic API Key', regex: /(?<![A-Za-z0-9])[A-Za-z0-9]{32}(?![A-Za-z0-9])/g },
  { name: 'JWT', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
];

export function detectSecrets(diff: string): string[] {
  const findings: string[] = [];
  for (const p of SECRET_PATTERNS) {
    if (p.regex.test(diff)) findings.push(p.name);
    p.regex.lastIndex = 0; // reset
  }
  return findings;
}

export function maxRisk(flows: DataFlowItem[]): RiskLevel {
  const order: RiskLevel[] = ['None', 'Low', 'Medium', 'High', 'Critical'];
  let idx = 0;
  for (const f of flows) {
    const i = order.indexOf(f.severity);
    if (i > idx) idx = i;
  }
  return order[idx];
}

export function combineConfidence(flows: DataFlowItem[]): Confidence {
  if (flows.some((f) => f.confidence === 'Low')) return 'Low';
  if (flows.some((f) => f.confidence === 'Medium')) return 'Medium';
  return flows.length ? 'High' : 'Medium';
}

export function riskFromFlow(flow: DataFlowItem): RiskLevel {
  return flow.severity;
}

export function estimateEffort(changedFiles: number, flows: number): { effort: string; minutes: number } {
  const base = Math.min(30, Math.max(5, changedFiles * 2 + flows * 3));
  let effort: string = 'Light';
  if (base > 25) effort = 'Heavy';
  else if (base > 15) effort = 'Moderate';
  else if (base > 9) effort = 'Medium';
  return { effort, minutes: base };
}