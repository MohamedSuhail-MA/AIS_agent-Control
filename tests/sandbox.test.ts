import { describe, it, expect } from "vitest";
import { WindowsSandbox } from "../src/lib/agent/sandbox";

describe("Windows Sandbox (Constrained Language Mode & WDAC) Suite", () => {
  it("[Sandbox-1] should allow safe commands", async () => {
    const cmd = "Get-Process | Where-Object CPU -gt 10";
    const result = await WindowsSandbox.executeInConstrainedLanguageMode(cmd);
    expect(result).toContain("Command executed safely");
  });

  it("[Sandbox-2] should block arbitrary C# compilation / Add-Type", async () => {
    const cmd = 'Add-Type -TypeDefinition "using System; public class Malicious { }"';
    await expect(WindowsSandbox.executeInConstrainedLanguageMode(cmd)).rejects.toThrowError(/WDAC_BLOCK.*Add-Type/i);
  });

  it("[Sandbox-3] should block Reflection assembly loads", async () => {
    const cmd = '[System.Reflection.Assembly]::Load([Convert]::FromBase64String("..."))';
    await expect(WindowsSandbox.executeInConstrainedLanguageMode(cmd)).rejects.toThrowError(/WDAC_BLOCK.*Reflection/i);
  });

  it("[Sandbox-4] should block COM object instantiation", async () => {
    const cmd = '$excel = New-Object -ComObject Excel.Application';
    await expect(WindowsSandbox.executeInConstrainedLanguageMode(cmd)).rejects.toThrowError(/WDAC_BLOCK.*COM/i);
  });

  it("[Sandbox-5] should block memory allocation / VirtualAlloc patterns", async () => {
    const cmd = '$alloc = VirtualAlloc(0, 1024, 0x1000, 0x40)';
    await expect(WindowsSandbox.executeInConstrainedLanguageMode(cmd)).rejects.toThrowError(/WDAC_BLOCK.*Memory/i);
  });

  it("[Sandbox-6] should successfully encapsulate clean execution in a JobObject", async () => {
    const result = await WindowsSandbox.wrapInJobObject(async () => "success");
    expect(result).toBe("success");
  });

  it("[Sandbox-7] should cleanly report JobObject teardown errors when a child throws", async () => {
    await expect(
      WindowsSandbox.wrapInJobObject(async () => { throw new Error("Access Denied"); })
    ).rejects.toThrowError("JobObject Teardown: Access Denied");
  });
});
