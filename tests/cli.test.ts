import { describe, it, expect } from "vitest";
import { parseAgentArgs } from "../src/lib/agent/cli";

describe("Agent CLI Argument Parser", () => {
  it("[CLI-Parse-1] should successfully parse complete arguments", () => {
    const args = [
      "--url", "https://api.corp.com",
      "--host", "WIN-02",
      "--orchestratorKey", "mock_key_123",
      "--agentKey", "mock_priv",
      "--interval", "2000"
    ];

    const config = parseAgentArgs(args);
    expect(config.url).toBe("https://api.corp.com");
    expect(config.host).toBe("WIN-02");
    expect(config.orchestratorKey).toBe("mock_key_123");
    expect(config.agentKey).toBe("mock_priv");
    expect(config.interval).toBe(2000);
  });

  it("[CLI-Parse-2] should throw error when required orchestratorKey is missing", () => {
    const args = [
      "--url", "https://api.corp.com",
      "--host", "WIN-02"
    ];

    expect(() => parseAgentArgs(args)).toThrowError(/Missing required argument: --orchestratorKey/);
  });

  it("[CLI-Parse-3] should generate dynamic key when agentKey is omitted", () => {
    const args = [
      "--orchestratorKey", "mock_key_123"
    ];

    const config = parseAgentArgs(args);
    expect(config.url).toBe("http://localhost:3000");
    expect(config.host).toBe("WIN-SERVER-01");
    expect(config.orchestratorKey).toBe("mock_key_123");
    expect(config.interval).toBe(5000);
    // Dynamic generation asserts
    expect(config.agentKey).toBeDefined();
    expect(typeof config.agentKey).toBe("string");
    expect(config.agentKey.length).toBeGreaterThan(30);
    expect(config.agentPublicKey).toBeDefined();
    expect(config.agentPublicKey.length).toBeGreaterThan(30);
  });

  it("[CLI-Parse-4] should support short flags", () => {
    const args = [
      "-u", "https://test.com",
      "-h", "SHORT-HOST",
      "-o", "short_key",
      "-i", "1000"
    ];

    const config = parseAgentArgs(args);
    expect(config.url).toBe("https://test.com");
    expect(config.host).toBe("SHORT-HOST");
    expect(config.orchestratorKey).toBe("short_key");
    expect(config.interval).toBe(1000);
  });

  it("[CLI-Parse-5] should throw on unknown arguments", () => {
    const args = [
      "--orchestratorKey", "mock_key_123",
      "--unknownFlag", "bad"
    ];

    expect(() => parseAgentArgs(args)).toThrowError(/CLI Parse Error/);
  });
});
