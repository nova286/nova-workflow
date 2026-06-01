# Design

## Architecture Overview

<!-- High-level architecture, patterns, and system structure -->

## Tech Stack

<!-- Languages, frameworks, key dependencies -->

## Component Breakdown

<!-- Each module/component and its responsibility -->

## Data Flow

<!-- How data moves through the system, key interfaces -->

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
    acceptance:
      - Acceptance criterion 1
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

## Risks & Mitigations

<!-- Known risks, what could go wrong, and how to handle it -->
