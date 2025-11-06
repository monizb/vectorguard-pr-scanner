import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { DataFlowItem, DataFlowNodeInfo, RiskLevel, Confidence } from '../types';

interface SourceCandidate {
  id: string;
  loc: DataFlowNodeInfo;
}

interface SinkCandidate {
  id: string;
  kind: string;
  loc: DataFlowNodeInfo;
}

const SOURCE_PATTERNS = [
  /req\.(body|query|params)\b/,
  /process\.env\.[A-Z0-9_]+/,
  /window\.location/,
  /localStorage\.[gs]etItem/,
];

const SINK_APIS = [
  { kind: 'eval', match: (node: t.Node) => t.isCallExpression(node) && t.isIdentifier(node.callee, { name: 'eval' }) },
  { kind: 'child_process', match: (node: t.Node) => t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.object, { name: 'child_process' }) },
  { kind: 'exec', match: (node: t.Node) => t.isCallExpression(node) && t.isIdentifier(node.callee, { name: 'exec' }) },
  { kind: 'dangerouslySetInnerHTML', match: (node: t.Node) => t.isJSXAttribute(node) && t.isJSXIdentifier(node.name, { name: 'dangerouslySetInnerHTML' }) },
];

const TRANSFORMS = [/sanitize/i, /encodeURI/, /encodeURIComponent/, /zod\.(parse|safeParse)/];

export function analyzeJavaScript(path: string, code: string): DataFlowItem[] {
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (e) {
    return [];
  }
  const sources: SourceCandidate[] = [];
  const sinks: SinkCandidate[] = [];
  const transforms: SourceCandidate[] = [];

  traverse(ast, {
    enter(p: NodePath<t.Node>) {
      const node = p.node;
      const loc = node.loc;
      if (!loc) return;
      const srcText = code.slice(node.start ?? 0, node.end ?? 0).slice(0, 200);
      // Simple textual match for sources
      if (t.isIdentifier(node) || t.isMemberExpression(node) || t.isCallExpression(node)) {
        const text = srcText;
        if (SOURCE_PATTERNS.some((r) => r.test(text))) {
          sources.push({
            id: text.slice(0, 60),
            loc: { file: path, startLine: loc.start.line, endLine: loc.end.line },
          });
        }
        if (TRANSFORMS.some((r) => r.test(text))) {
          transforms.push({
            id: text.slice(0, 60),
            loc: { file: path, startLine: loc.start.line, endLine: loc.end.line },
          });
        }
      }
      // Sinks structural
      for (const s of SINK_APIS) {
        if (s.match(node) && loc) {
          sinks.push({
            id: s.kind,
            kind: s.kind,
            loc: { file: path, startLine: loc.start.line, endLine: loc.end.line },
          });
        }
      }
      // Additional sink heuristics: string concatenation into query
      if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
        const obj = node.callee.object;
        const prop = node.callee.property;
        if (t.isIdentifier(obj) && t.isIdentifier(prop) && /query|execute/i.test(prop.name)) {
          sinks.push({ id: 'db.query', kind: 'db.query', loc: { file: path, startLine: loc.start.line, endLine: loc.end.line } });
        }
      }
    },
  });

  // Naive pairing: each source to nearest sink (same file) with optional transform between line ranges
  const flows: DataFlowItem[] = [];
  for (const s of sources) {
    const candidateSinks = sinks.filter((k) => k.loc.startLine > s.loc.startLine).sort((a, b) => a.loc.startLine - b.loc.startLine);
    if (!candidateSinks.length) continue;
    const sink = candidateSinks[0];
    const betweenTransforms = transforms.filter((t) => t.loc.startLine >= s.loc.startLine && t.loc.startLine <= sink.loc.startLine);
    const transform = betweenTransforms[0];
    const severity: RiskLevel = classifySeverity(s, sink, transform);
    const confidence: Confidence = transform ? 'High' : 'Medium';
    flows.push({
      source: s.id,
      sink: sink.id,
      transform: transform?.id,
      sourceLoc: s.loc,
      sinkLoc: sink.loc,
      transformLoc: transform?.loc,
      severity,
      confidence,
      description: `${s.id} flows to ${sink.id}${transform ? ' via transform' : ''}`,
    });
    if (flows.length >= 5) break; // limit
  }
  return flows;
}

function classifySeverity(source: SourceCandidate, sink: SinkCandidate, transform?: SourceCandidate): RiskLevel {
  if (!sink) return 'None';
  if (/dangerouslySetInnerHTML|eval/.test(sink.kind) && !transform) return 'High';
  if (/db\.query/.test(sink.kind) && !transform) return 'High';
  if (/child_process/.test(sink.kind)) return transform ? 'Medium' : 'High';
  return transform ? 'Low' : 'Medium';
}

// Simple helper for tests: construct a fake code snippet and run analyzer
export function analyzeSnippet(code: string): DataFlowItem[] {
  return analyzeJavaScript('snippet.js', code);
}