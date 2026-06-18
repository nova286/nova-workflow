# Design

## Architecture Overview

<!-- High-level architecture, patterns, and system structure -->

## Tech Stack

<!-- Languages, frameworks, key dependencies -->

## Component Breakdown

<!-- Each module/component and its responsibility -->

## Data Flow

<!-- How data moves through the system, key interfaces -->

## Project Context Contract

<!-- Required before marking design done. Record the exact JSON passed to
nova checkpoint artifacts --project-context '<json>'.

Required shape:
projectContext:
  rules:
    sources: string[]              # e.g. AGENTS.md, README.md, .cursor/rules/api.md
    must: string[]                 # mandatory project rules
    mustNot: string[]              # forbidden project patterns
    verificationCommands: string[] # actual project commands required for verify
  bestPractices:
    projectType: string            # .nova.yaml projectType, e.g. ios-xcodegen, go, node-cli
    sources: string[]              # metadata/code sources used to infer practices
    must: string[]                 # best practices required for this project type
    should: string[]               # recommended practices
    risks: string[]                # project-type risks to verify
  conflicts:
    - projectRule: string
      bestPractice: string
      resolution: project-rule | best-practice | case-by-case
      rationale: string

Use conflicts: [] when there are no conflicts.
-->

## Legacy Preflight

<!-- Required when proposal changeMode=existing.

Inspect affected existing code before task planning:
- architecture boundaries and module/component responsibility
- state/data flow and interface contracts
- testability and available verification commands
- project conventions/design-system compliance
- technical debt that could affect this change

If issues are found, ask the user before finalizing tasks:
- [ ] 仅完成本次需求，不做重构
- [ ] 做最小必要重构，只处理会阻塞本次需求的部分
- [ ] 将相关模块一起重构到项目规范

Record:
- required: true
- performed: true
- affectedAreas: string[]
- hasIssues: true | false
- issues: area, finding, severity, recommendation
- refactorPolicy: none | minimal | full
- userDecision: exact user-facing decision
- rationale: why the selected policy is appropriate
-->

## Implementation Plan

<!-- Ordered list of tasks defined in YAML below -->

<!-- UI task planning guidance:
- Split UI work by screen, major component, state/interaction, asset/token mapping, and verification. Avoid one broad task that mixes layout, data wiring, styling, and tests.
- Choose UI implementation patterns by priority: project UI rules first, nearby existing code preference second, platform best practices third.
- iOS repeated lists/grids/feeds should prefer UICollectionView, UITableView, SwiftUI List, LazyVStack, or LazyVGrid. Use hand-rolled UIScrollView for reusable/repeating content only when a project convention or documented technical reason justifies it.
-->

```yaml
tasks:
  - id: task-1
    title: Example task
    type: implementation
    method: implementation
    description: What needs to be done
    files:
      - {path: path/to/project/file.ext, action: create}
    expectedArtifacts:
      - {type: file, description: Example project module, pathHint: project-specific source path}
    specRefs:
      - specs.example.requirement
    acceptanceRefs:
      - specs.example.acceptance
    acceptance:
      - Acceptance criterion 1
    verification:
      commands:
        - project-specific test or build command
    complianceRefs:
      projectRules:
        - rules.must.0
      bestPractices:
        - bestPractices.must.0
    priority: medium
    estimatedComplexity: 3
```

### Multi-platform Example

For projects targeting multiple platforms (iOS, Android, web, etc.), each platform MUST have its own task:

```yaml
tasks:
  - id: setup-shared-core
    title: Setup shared core module
    type: implementation
    description: Create the shared data layer and business logic
    files:
      - {path: shared/core-or-domain-file.ext, action: create}
      - {path: shared/types-or-models-file.ext, action: create}
    acceptance:
      - Shared module compiles and exports correctly
    priority: high
    estimatedComplexity: 4

  - id: implement-ios
    title: Implement iOS client
    type: implementation
    description: Build iOS-specific UI and platform integrations
    files:
      - {path: ios/Sources/MainView.swift, action: create}
      - {path: ios/Sources/PlatformBridge.swift, action: create}
    acceptance:
      - iOS app builds and runs on simulator
      - Core features work end-to-end on iOS
    priority: high
    estimatedComplexity: 6

  - id: implement-android
    title: Implement Android client
    type: implementation
    description: Build Android-specific UI and platform integrations
    files:
      - {path: android/app/src/main/java/.../MainScreen.kt, action: create}
      - {path: android/app/src/main/java/.../PlatformBridge.kt, action: create}
    acceptance:
      - Android app builds and runs on emulator
      - Core features work end-to-end on Android
    priority: high
    estimatedComplexity: 6
```

## Design Tokens

<!-- Auto-populated by Figma MCP if available. Colors, typography, spacing, components. -->

## Figma Implementation Assets

<!-- If the proposal includes Figma traceability, map required cut images/icons/tokens/components to project asset paths and implementation tasks. -->

## Test Cases

<!-- Follow the proposal Test Strategy.

Automated UI testing:
- Only required when automatedUiTesting=true.
- Define each user flow with entry point, route/screen, steps, expected result, and whether Mobile MCP is required.
- Add a testing task or verification command that can run the flow.
- This is baseline/current-page comparison for logic changes that should not alter UI unexpectedly.

UI fidelity testing:
- Only required when uiFidelityTesting=true.
- Define each design fidelity target with designRef, routeOrScreen, expected states, and acceptanceThreshold.
- Add a testing task or verification command that compares implementation screenshots/rendered UI against Figma/design specs/reference screenshots.
- This is design-source comparison for visual reconstruction and restoration fidelity.

Unit testing:
- Only required when unitTesting=true.
- Define unit test targets and expected assertions.
- Add unit test files/commands to implementation or testing tasks.

If a test type is not selected, do not force it; record a concise rationale when useful.
-->

## Risks & Mitigations

<!-- Known risks, what could go wrong, and how to handle it -->

<!-- Before marking design done, record artifacts:
nova checkpoint artifacts --design-doc docs/designs/<file>.md
For existing changes, also pass:
nova checkpoint artifacts --legacy-preflight '<json>'
-->
