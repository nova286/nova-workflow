import { McpServers } from '../types';

export const FIGMA_STEP = `
## Step 3.5: Read Figma Design (Figma MCP detected)

1. Use Figma MCP to get file metadata and pages
2. For each relevant frame/component:
   - Extract color tokens (fills, strokes → RGBA)
   - Extract typography (font family, size, weight, line height)
   - Extract spacing (auto-layout padding, item spacing)
   - Extract component properties and variants
3. Generate \`## Design Tokens\` section in \`docs/designs/design.md\`:
   - Color palette table
   - Typography scale table
   - Spacing system table
   - Component inventory with props
4. Reference Figma node IDs for traceability
`;

export const MOBILE_STEP = `
## Step 5.5: UI Verification (Mobile MCP detected)

1. Build and launch app in simulator via Mobile MCP
2. For each key user flow:
   - Navigate to screen
   - Take screenshot
   - Query accessibility tree (element labels, states)
   - Compare against design tokens from \`docs/designs/design.md\`
3. Fill \`## UI Verification\` section in \`docs/reports/verification-report.md\`:
   - Screenshot gallery with captions
   - Element state audit (missing labels, wrong states)
   - Design token compliance check
4. Flag discrepancies as UI findings with severity
`;

export type SkillTemplateFn = (mcp?: McpServers) => string;

export const SKILL_DESCRIPTIONS: Record<string, string> = {
  'nova.md': 'Nova — unified entry point. Shows progress and suggests next action.',
  'nova-propose.md': 'Nova propose phase — specify an OpenSpec-compatible change contract',
  'nova-design.md': 'Nova design phase — plan spec-bound work from an approved change',
  'nova-implement.md': 'Nova implement phase — execute spec-bound tasks with evidence',
  'nova-verify.md': 'Nova verify phase — run spec conformance, code, and security review',
  'nova-iterate.md': 'Nova iterate — roll back to a previous phase for iteration',
  'nova-status.md': 'Nova status — display phase progress, task completion, and stuck detection',
  'nova-detect.md': 'Nova detect — check installation status of CodeGraph, OpenSpec, Figma-mcp, Superpowers, ECC, mobile-mcp and provide install instructions',
};
