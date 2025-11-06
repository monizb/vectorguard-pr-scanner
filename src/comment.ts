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

// IMPORTANT: Keep this EXACT template shape and markers.
const TEMPLATE = String.raw`<!-- This is an auto-generated comment: summarize by coderabbit.ai -->
<!-- walkthrough_start -->

## Walkthrough

{{WALKTHROUGH}}

## Changes

| Cohort / File(s) | Summary |
|---|---|
{{CHANGES_TABLE_ROWS}}

## Sequence Diagram(s)

\`\`\`mermaid
{{MERMAID_SEQUENCE}}
\`\`\`

## Security Review

**Overall risk:** \`{{RISK}}\`
**Confidence:** \`{{CONFIDENCE}}\`

**Key findings**
{{FINDINGS_LIST}}

### Data-flow highlights

{{DATAFLOW_LIST}}

### Positive notes

{{POSITIVE_NOTES}}

## Estimated code review effort

🎯 \`{{EFFORT}}\` | ⏱️ \`~{{MINUTES}} minutes\`

* Focus review on:
  {{FOCUS_LIST}}

## Possibly related PRs

{{RELATED_PRS}}

## Suggested labels

{{SUGGESTED_LABELS}}

## Poem

> {{POEM}}

<!-- walkthrough_end -->

<!-- pre_merge_checks_walkthrough_start -->

## Pre-merge checks and finishing touches

<details>
<summary>✅ Passed checks ({{CHECKS_PASSED}} passed)</summary>

|     Check name    | Status   | Explanation          |
| :---------------: | :------- | :------------------- |
| Description Check | ✅ Passed | {{DESC_CHECK_EXPL}}  |
|    Title check    | ✅ Passed | {{TITLE_CHECK_EXPL}} |

</details>

<!-- pre_merge_checks_walkthrough_end -->

<!-- finishing_touch_checkbox_start -->

<details>
<summary>✨ Finishing touches</summary>

* [ ] <!-- {"checkboxId": "DOCSTRINGS"} --> 📝 Generate docstrings

<details>
<summary>🧪 Generate unit tests (beta)</summary>

* [ ] <!-- {"checkboxId": "TESTS_PR", "radioGroupId": "utg-output-choice-group"} -->   Create PR with unit tests
* [ ] <!-- {"checkboxId": "TESTS_COMMENT", "radioGroupId": "utg-output-choice-group"} -->   Post copyable unit tests in a comment
* [ ] <!-- {"checkboxId": "TESTS_BRANCH", "radioGroupId": "utg-output-choice-group"} -->   Commit unit tests in branch \`{{TEST_BRANCH}}\`

</details>

</details>

<!-- finishing_touch_checkbox_end -->

<!-- tips_start -->

---

<sub>Comment \`@coderabbitai help\` to get the list of available commands and usage tips.</sub>

<!-- tips_end -->`;

export function renderComment(input: CommentRenderInput): string {
  return TEMPLATE
    .replace('{{WALKTHROUGH}}', input.walkthrough || 'No material changes.')
    .replace('{{CHANGES_TABLE_ROWS}}', input.changesTableRows || '| — | No material changes |')
    .replace('{{MERMAID_SEQUENCE}}', input.mermaidSequence || 'sequenceDiagram\nNote over Reviewer: No sequence changes')
    .replace('{{RISK}}', input.risk)
    .replace('{{CONFIDENCE}}', input.confidence)
    .replace('{{FINDINGS_LIST}}', input.findingsList || '\n- No significant security concerns identified.')
    .replace('{{DATAFLOW_LIST}}', input.dataflowList || '\n- No impactful data flows identified.')
    .replace('{{POSITIVE_NOTES}}', input.positiveNotes || '\n- Good separation of concerns and clear diffs.')
    .replace('{{EFFORT}}', input.effort || 'Light')
    .replace('{{MINUTES}}', String(input.minutes ?? 5))
    .replace('{{FOCUS_LIST}}', input.focusList || '\n- Review any auth or input validation boundaries.')
    .replace('{{RELATED_PRS}}', input.relatedPrs || 'None found')
    .replace('{{SUGGESTED_LABELS}}', input.suggestedLabels || '`security` `automated-review`')
    .replace('{{POEM}}', input.poem || 'Code flows like rivers, guardrails keep it sure; inputs meet outputs, sanitized and pure.')
    .replace('{{CHECKS_PASSED}}', String(input.checksPassed ?? 2))
    .replace('{{DESC_CHECK_EXPL}}', input.descCheckExpl || 'PR description present and informative.')
    .replace('{{TITLE_CHECK_EXPL}}', input.titleCheckExpl || 'Title is concise and scoped.')
    .replace('{{TEST_BRANCH}}', input.testBranch || 'tests/auto-generated');
}

export function formatDataflowList(flows: DataFlowItem[]): string {
  if (!flows.length) return '\n- No impactful data flows identified.';
  return flows
    .slice(0, 5)
    .map((f) => `- ${f.source} ${f.transform ? `→ [${f.transform}] ` : '→ '}→ ${f.sink}  (\`${f.sourceLoc.file}:${f.sourceLoc.startLine}\` → \`${f.sinkLoc.file}:${f.sinkLoc.startLine}\`)`)
    .join('\n');
}