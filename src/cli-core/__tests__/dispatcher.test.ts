import { Dispatcher } from "../dispatcher";
import { PlatformClient, PlatformResponse } from "../platform-client";
import { AgentType, TaskContext, DispatchRequest } from "../types";

// 创建一个 Mock PlatformClient
class MockPlatformClient extends PlatformClient {
  private response: PlatformResponse;
  private shouldFail: boolean;
  private failCount: number = 0;

  constructor(response: PlatformResponse, shouldFail: boolean = false) {
    super();
    this.response = response;
    this.shouldFail = shouldFail;
  }

  async sendPrompt(): Promise<PlatformResponse> {
    if (this.shouldFail) {
      this.failCount++;
      throw new Error("Mock failure");
    }
    return this.response;
  }
}

const baseContext: TaskContext = {
  taskId: "test-1",
  title: "Test",
  description: "A test task",
  taskType: "implementation",
  designContext: { designDocRef: "", relevantSpecs: [], architectureNotes: "" },
  input: {
    files: [],
    dependencies: [],
    environment: {
      language: "ts",
      framework: "",
      buildTool: "",
      testFramework: "",
    },
  },
  output: { expectedArtifacts: [], constraints: { mustPassTests: true } },
  change: {
    activeChange: "",
    artifacts: {
      openspecChange: "",
      proposal: "",
      specDelta: "",
      implementationPlan: "",
      verificationReport: "",
    },
  },
  methodology: {
    openspec: { mode: "compatible" },
    superpowers: { mode: "compatible" },
    ecc: { mode: "compatible" },
  },
  implementation: {
    method: "implementation",
    specRefs: [],
    acceptanceRefs: [],
  },
  verification: { commands: [] },
  evidence: { required: [] },
  acceptanceCriteria: [],
  guardConditions: { requireReview: true, requireTests: true, blocking: false },
  metadata: {
    createdBy: "test",
    createdAt: new Date().toISOString(),
    priority: "medium",
    estimatedComplexity: 1,
  },
};

describe("Dispatcher", () => {
  test("returns success on valid response", async () => {
    const mockClient = new MockPlatformClient({
      content: JSON.stringify({ done: true }),
    });
    const dispatcher = new Dispatcher(mockClient);
    const request: DispatchRequest = {
      agent: AgentType.CODER,
      context: baseContext,
    };
    const result = await dispatcher.execute(request);
    expect(result.status).toBe("success");
    expect(result.output).toEqual({ done: true });
  });

  test("retries on failure and eventually succeeds", async () => {
    // 模拟前两次失败，第三次成功
    const mockClient = new MockPlatformClient({ content: "ok" }, true);
    // 重写 sendPrompt 来控制失败次数
    let callCount = 0;
    mockClient.sendPrompt = async () => {
      callCount++;
      if (callCount < 3) throw new Error("fail");
      return { content: "success" };
    };
    const dispatcher = new Dispatcher(mockClient);
    const request: DispatchRequest = {
      agent: AgentType.CODER,
      context: baseContext,
      retry: { maxAttempts: 3, backoff: "fixed" },
    };
    const result = await dispatcher.execute(request);
    expect(result.status).toBe("success");
    expect(callCount).toBe(3);
  });

  test("fails after max retries", async () => {
    const mockClient = new MockPlatformClient({ content: "" }, true);
    mockClient.sendPrompt = async () => {
      throw new Error("persistent error");
    };
    const dispatcher = new Dispatcher(mockClient);
    const request: DispatchRequest = {
      agent: AgentType.CODER,
      context: baseContext,
      retry: { maxAttempts: 2, backoff: "fixed" },
    };
    const result = await dispatcher.execute(request);
    expect(result.status).toBe("failed");
    expect(result.errors?.[0]?.message).toContain("persistent error");
  });
});
