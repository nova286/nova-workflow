# Proposal: {title}

## Problem Statement

<!-- What problem exists, and why does it matter? -->

## Proposed Solution

<!-- High-level approach — what are we building, and how? -->

## User Stories

<!-- Who needs what, in priority order -->

## Scope & Deliverables

<!-- What is in scope, what is out, and what concrete outputs will we produce? -->

## Change Mode

<!-- Classify before marking propose done:
- changeMode: existing | incremental | new
- affectedAreas: existing modules/routes/components/APIs/workflows touched by this change
- legacyPreflightRequired: true when changeMode=existing

Definitions:
- existing: modifies existing business logic, page, route, component, API, or workflow
- incremental: adds a new page/entry/flow that connects to existing product navigation
- new: creates an isolated new capability with no legacy behavior dependency
-->

## Figma Traceability

<!-- If the request includes a Figma URL, record:
- url: Figma file/frame URL
- nodeIds: relevant frame/component node IDs
- pageMode: existing | incremental | new
- routeOrScreen: affected route, screen, or component
- entryPoint: navigation/menu/flow entry for incremental pages
- assetRequirements: exported images, icons, slices, tokens, and component mappings needed during implementation
- blockedReason: why Figma details could not be inspected, if Figma MCP is unavailable
-->

## Test Strategy

<!-- Confirm with the user before generating the proposal:
- [ ] 自动化 UI 测试
- [ ] UI 还原度测试
- [ ] 单元测试

Testing intent:
- 自动化 UI 测试: compare the current behavior with the baseline/version-before-change UI for logic changes that should not alter UI.
- UI 还原度测试: compare the implementation with design sources such as Figma, design specs, or reference screenshots.
- 单元测试: cover isolated business logic, data transforms, and edge cases.

Record the selected strategy:
- automatedUiTesting: true | false
- uiFidelityTesting: true | false
- unitTesting: true | false
- uiFlows: name, entryPoint, routeOrScreen, steps, expectedResult, requiresMobileMcp
- uiFidelityTargets: name, designRef, routeOrScreen, acceptanceThreshold, requiresMobileMcp
- unitTestTargets: functions/components/modules to cover
- rationale: why omitted or blocked, if a selected test type cannot be fully defined
-->

## Success Criteria

<!-- Measurable outcomes that define success -->

## Risks & Constraints

<!-- Known risks, limitations, dependencies, or constraints -->

<!-- Before marking propose done, record artifacts:
nova checkpoint artifacts --proposal docs/proposals/<file>.md --spec-delta <spec-ref-or-path> --active-change <change-id> --change-mode existing|incremental|new --test-strategy '<json>'
-->
