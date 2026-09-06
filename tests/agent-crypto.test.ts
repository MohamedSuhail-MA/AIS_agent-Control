import { describe, it, expect } from "vitest";
import { generateAgentKeyPair } from "../src/lib/agent/crypto";

describe("Dynamic mTLS CA Key Generation", () => {
  it("[Agent-Crypto-1] should generate valid Ed25519 keypair format", () => {
    const keypair = generateAgentKeyPair();
    
    expect(keypair.publicKey).toBeDefined();
    expect(keypair.privateKey).toBeDefined();
    
    expect(typeof keypair.publicKey).toBe("string");
    expect(typeof keypair.privateKey).toBe("string");
    
    // Ed25519 public keys in base64 are 44 chars (32 bytes -> base64)
    expect(keypair.publicKey.length).toBeGreaterThan(30);
  });
});
