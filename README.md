# VectorGuard Security PR Reviewer

A production-ready, reusable JavaScript GitHub Action that analyzes pull request diffs, highlights data-flows, and posts a single CodeRabbit-style summary comment powered by Google Gemini.

- Single top-level comment, idempotent updates
- Heuristic JS/TS data-flow analysis (source → [transform?] → sink)
- Optional inline review hints output
- Bundled (via ncc) Node 20 JavaScript Action

## How it works

1. Fetches PR metadata and file diffs using the GitHub API.
2. Builds a unified diff, language summary, and contextual head-file snippets around changed hunks.
3. Runs lightweight JS/TS AST heuristics to detect sensitive data flows and secrets.
4. Calls Google Gemini to draft a concise walkthrough, findings, and review focus, tuned for low false positives.
5. Renders and posts a beautifully formatted, idempotent CodeRabbit-style comment. If rerun, the existing comment is updated.

## Permissions

Grant the job these minimal permissions:

- contents: read
- pull-requests: write
- issues: write (for general comments)

## Inputs

- gemini_api_key (required) – or set env GEMINI_API_KEY
- model (default: `gemini-1.5-pro-latest`)
- temperature (default: `0.2`)
- max_output_tokens (default: `4096`)
- enable_inline (default: `false`)
- personality (default: `mentor, concise, slightly witty`)
- update_existing (default: `true`)
- fail_on_high (default: `false`)
- owner, repo, pr_number (optional for manual `workflow_dispatch`)

## Outputs

- comment_id – created/updated comment id
- risk – `None|Low|Medium|High|Critical`
- inline – JSON array string of suggested inline comments
- summary_url – URL of the PR summary comment

## Usage

Basic:

```yaml
ame: Security PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    permissions:
      contents: read
      pull-requests: write
      issues: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ORG/security-pr-reviewer@v1
        with:
          model: gemini-1.5-pro-latest
          temperature: 0.2
          enable_inline: false
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

With inline hints + fail on high:

```yaml
- uses: ORG/security-pr-reviewer@v1
  with:
    enable_inline: true
    fail_on_high: true
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

Manual invocation (workflow_dispatch): provide `owner`, `repo`, and `pr_number` inputs to target a PR.

## Comment template

The action renders the following template EXACTLY, filling placeholders. Do not alter headers/markers.

````
<!-- This is an auto-generated comment: summarize by coderabbit.ai -->
<!-- walkthrough_start -->

## Walkthrough

{{WALKTHROUGH}}

## Changes

| Cohort / File(s) | Summary |
|---|---|
{{CHANGES_TABLE_ROWS}}

## Sequence Diagram(s)

```mermaid
{{MERMAID_SEQUENCE}}
```` 

## Security Review

**Overall risk:** `{{RISK}}`
**Confidence:** `{{CONFIDENCE}}`

**Key findings**
{{FINDINGS_LIST}}

### Data-flow highlights

{{DATAFLOW_LIST}}

### Positive notes

{{POSITIVE_NOTES}}

## Estimated code review effort

🎯 `{{EFFORT}}` | ⏱️ `~{{MINUTES}} minutes`

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
* [ ] <!-- {"checkboxId": "TESTS_BRANCH", "radioGroupId": "utg-output-choice-group"} -->   Commit unit tests in branch `{{TEST_BRANCH}}`

</details>

</details>

<!-- finishing_touch_checkbox_end -->

<!-- tips_start -->

---

<sub>Comment `@coderabbitai help` to get the list of available commands and usage tips.</sub>

<!-- tips_end -->

```` 

## Development

- TypeScript source lives in `src/`.
- Build a single-file bundle with `npm run build` (uses `@vercel/ncc`).
- The published package includes `dist/index.js` so consumers do not need to install dependencies.

## Tests

- Unit: data-flow extraction flags `req.query.id → string concat → db.query` as High.
- Integration (mock): rendering includes CodeRabbit markers and a finding for `dangerouslySetInnerHTML`.
- Idempotency: `postOrUpdateComment` updates in place given the marker.

## Failure behavior

- If `fail_on_high: true` and any High/Critical risk is detected, the job fails.
- If AST parsing fails, the action still posts a general summary.

## Secrets

- Provide `GEMINI_API_KEY` via repository or org secret. The action redacts and never logs raw secrets.