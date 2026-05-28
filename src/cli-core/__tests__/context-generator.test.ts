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
    // 创建一个包含 projectType 的 state 文件
    const state = {
      version: 1,
      project: "test",
      projectType: "node",
      environment: ["generic"],
      phases: {
        design: {
          status: "done",
          designDoc: "docs/design.md",
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
      files: [{ path: "src/login.ts", action: "create" }],
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
    // 环境信息应被检测
    expect(context.input.environment.language).toBe("TypeScript");
    expect(context.input.environment.framework).toBe("Express.js");
  });
});
