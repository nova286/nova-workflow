# Design

## Architecture Overview

<!-- High-level architecture, patterns, and system structure -->

## Tech Stack

<!-- Languages, frameworks, key dependencies -->

## Component Breakdown

<!-- Each module/component and its responsibility -->

## Data Flow

<!-- How data moves through the system, key interfaces -->

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

```yaml
tasks:
  - id: task-1
    title: Example task
    type: implementation
    description: What needs to be done
    files:
      - {path: src/example.ts, action: create}
    expectedArtifacts:
      - {type: file, description: Example module, pathHint: src/example.ts}
    specRefs:
      - specs.example.requirement
    acceptanceRefs:
      - specs.example.acceptance
    acceptance:
      - Acceptance criterion 1
    verification:
      commands:
        - npm test
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
      - {path: src/shared/core.ts, action: create}
      - {path: src/shared/types.ts, action: create}
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
