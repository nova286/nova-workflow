import { ContextGenerator } from "../context-generator";
import { StateManager } from "../state";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";

describe("ContextGenerator", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-ctx-test-"));
    originalCwd = process.cwd();
    process.chdir(testDir);
    await fs.writeFile(
      "package.json",
      JSON.stringify({
        dependencies: { express: "^4.0.0" },
        devDependencies: { typescript: "^5.0.0", jest: "^29.0.0" },
        scripts: { test: "jest", build: "tsc" },
      }),
      "utf-8"
    );
    // 创建一个包含 projectType 的 state 文件
    const state = {
      version: 1,
      project: "test",
      projectType: "node",
      environment: ["generic"],
      activeChange: "add-login",
      changeMode: "existing",
      integrations: {
        openspec: { mode: "compatible" },
        superpowers: { mode: "native" },
        ecc: { mode: "compatible" },
      },
      artifacts: {
        openspecChange: ".openspec/changes/add-login",
        proposal: ".openspec/changes/add-login/proposal.md",
        specDelta: ".openspec/changes/add-login/specs/auth/spec.md",
        implementationPlan: "docs/superpowers/plans/add-login.md",
        verificationReport: "",
        changeMode: "existing",
        legacyPreflight: {
          required: true,
          performed: true,
          affectedAreas: ["src/login.ts"],
          hasIssues: true,
          issues: [{
            area: "src/login.ts",
            finding: "Existing login module mixes validation and token creation.",
            severity: "medium",
          }],
          refactorPolicy: "minimal",
          userDecision: "做最小必要重构，只处理会阻塞本次需求的部分",
        },
        projectContext: "docs/project-context.md",
      },
      projectContext: {
        rules: {
          sources: ["AGENTS.md"],
          must: ["Use parameterized SQL"],
          mustNot: ["Concatenate SQL strings"],
          verificationCommands: ["npm test"],
        },
        bestPractices: {
          projectType: "node",
          sources: ["package.json"],
          must: ["Keep TypeScript strict"],
          should: ["Prefer small modules"],
          risks: ["ESM interop"],
        },
        conflicts: [],
      },
      phases: {
        propose: {
          status: "done",
          proposal: ".openspec/changes/add-login/proposal.md",
          changeMode: "existing",
          testStrategy: {
            automatedUiTesting: true,
            unitTesting: true,
            unitTestTargets: ["src/login.ts"],
            uiFlows: [{
              name: "Login happy path",
              entryPoint: "/login",
              steps: ["Open login", "Submit credentials"],
              expectedResult: "Dashboard is shown",
              routeOrScreen: "LoginScreen",
              requiresMobileMcp: true,
            }],
          },
        },
        design: {
          status: "done",
          designDoc: "docs/design.md",
          legacyPreflight: {
            required: true,
            performed: true,
            affectedAreas: ["src/login.ts"],
            hasIssues: true,
            issues: [{
              area: "src/login.ts",
              finding: "Existing login module mixes validation and token creation.",
              severity: "medium",
            }],
            refactorPolicy: "minimal",
            userDecision: "做最小必要重构，只处理会阻塞本次需求的部分",
          },
          tasks: [],
        },
      },
    };
    await fs.writeFile(".nova.yaml", yaml.stringify(state), "utf-8");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("generateFromTask builds complete TaskContext", async () => {
    const task = {
      id: "build-login",
      title: "Implement login",
      description: "Create login endpoint",
      type: "implementation",
      method: "tdd",
      specRefs: ["auth.requirements.valid-credential-login"],
      acceptanceRefs: ["auth.acceptance.valid-login-returns-token"],
      complianceRefs: {
        projectRules: ["rules.must.0"],
        bestPractices: ["bestPractices.must.0"],
      },
      files: [{ path: "src/login.ts", action: "create" }],
      verification: {
        commands: ["npm test -- login", "npx tsc --noEmit"],
      },
      evidence: {
        required: ["failing-test-before-implementation", "spec-ref-covered"],
      },
      expectedArtifacts: [
        { type: "code", description: "Login module", pathHint: "src/login.ts" },
      ],
      acceptance: ["Returns JWT on success"],
      blocking: true,
      priority: "high",
      estimatedComplexity: 7,
    };

    const context = await ContextGenerator.generateFromTask(task);

    expect(context.taskId).toBe("build-login");
    expect(context.taskType).toBe("implementation");
    expect(context.input.files).toHaveLength(1);
    expect(context.input.files[0].path).toBe("src/login.ts");
    expect(context.acceptanceCriteria).toContain("Returns JWT on success");
    expect(context.guardConditions.blocking).toBe(true);
    expect(context.metadata.priority).toBe("high");
    expect(context.metadata.estimatedComplexity).toBe(7);
    expect(context.change.activeChange).toBe("add-login");
    expect(context.change.artifacts.openspecChange).toBe(".openspec/changes/add-login");
    expect(context.methodology.openspec.mode).toBe("compatible");
    expect(context.methodology.superpowers.mode).toBe("native");
    expect(context.implementation.method).toBe("tdd");
    expect(context.designContext.legacyPreflight?.refactorPolicy).toBe("minimal");
    expect(context.designContext.architectureNotes).toContain("minimal");
    expect(context.implementation.specRefs).toEqual(["auth.requirements.valid-credential-login"]);
    expect(context.implementation.acceptanceRefs).toEqual(["auth.acceptance.valid-login-returns-token"]);
    expect(context.implementation.complianceRefs).toEqual({
      projectRules: ["rules.must.0"],
      bestPractices: ["bestPractices.must.0"],
    });
    expect(context.designContext.complianceRefs?.projectRules).toEqual(["rules.must.0"]);
    expect(context.projectContext?.rules.must).toContain("Use parameterized SQL");
    expect(context.change.artifacts.projectContext).toBe("docs/project-context.md");
    expect(context.verification.commands).toEqual(["npm test -- login", "npx tsc --noEmit"]);
    expect(context.verification.testStrategy?.automatedUiTesting).toBe(true);
    expect(context.verification.testStrategy?.unitTesting).toBe(true);
    expect(context.verification.testStrategy?.uiFlows?.[0].entryPoint).toBe("/login");
    expect(context.evidence.required).toEqual(["failing-test-before-implementation", "spec-ref-covered"]);
    // 环境信息应被检测
    expect(context.input.environment.language).toBe("TypeScript");
    expect(context.input.environment.framework).toBe("Express.js");
  });
});
