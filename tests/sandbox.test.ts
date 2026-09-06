import { describe, it, expect } from "vitest";
import { WindowsSandbox } from "../src/lib/agent/sandbox";

describe("Windows Sandbox (Constrained Language Mode & WDAC) Suite", () => {
  it("[Sandbox-1] should allow safe commands", () => {
    const cmd = "Get-Process | Where-Object CPU -gt 10";
    const result = WindowsSandbox.executeInConstrainedLanguageMode(cmd);
    expect(result).toContain("Command executed safely");
  });

  it("[Sandbox-2] should block arbitrary C# compilation / Add-Type", () => {
    const cmd = 'Add-Type -TypeDefinition "using System; public class Malicious { }"';
    expect(() => WindowsSandbox.executeInConstrainedLanguageMode(cmd)).toThrowError(/WDAC_BLOCK.*Add-Type/i);
  });

  it("[Sandbox-3] should block Reflection assembly loads", () => {
    const cmd = '[System.Reflection.Assembly]::Load([Convert]::FromBase64String("..."))';
    expect(() => WindowsSandbox.executeInConstrainedLanguageMode(cmd)).toThrowError(/WDAC_BLOCK.*Reflection/i);
  });

  it("[Sandbox-4] should block COM object instantiation", () => {
    const cmd = '$excel = New-Object -ComObject Excel.Application';
    expect(() => WindowsSandbox.executeInConstrainedLanguageMode(cmd)).toThrowError(/WDAC_BLOCK.*COM/i);
  });

  it("[Sandbox-5] should block memory allocation / VirtualAlloc patterns", () => {
    const cmd = '$alloc = VirtualAlloc(0, 1024, 0x1000, 0x40)';
    expect(() => WindowsSandbox.executeInConstrainedLanguageMode(cmd)).toThrowError(/WDAC_BLOCK.*Memory/i);
  });

  it("[Sandbox-6] should successfully encapsulate clean execution in a JobObject", () => {
    const result = WindowsSandbox.wrapInJobObject(() => "success");
    expect(result).toBe("success");
  });

  it("[Sandbox-7] should cleanly report JobObject teardown errors when a child throws", () => {
    expect(() => 
      WindowsSandbox.wrapInJobObject(() => { throw new Error("Access Denied"); })
    ).toThrowError("JobObject Teardown: Access Denied");
  });
});
