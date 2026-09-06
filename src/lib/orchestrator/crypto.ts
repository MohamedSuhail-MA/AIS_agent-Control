import nacl from "tweetnacl";

// Simulated Orchestrator Keypair for Zero-Trust Ed25519 Verification
export const ORCHESTRATOR_PUBLIC_KEY_B64 = "gOSnGCF990juI37Lk1igoO+vtWllBjR/KTNrqmXxX8M=";
export const ORCHESTRATOR_SECRET_KEY_B64 = "hk9IRKYjX7b26zTGVNsp3XJXIXbPYDdG3n+RcFU3bVCA5KcYIX33SO4jfsuTWKCg76+1aWUGNH8pM2uqZfFfww==";

/**
 * Signs a payload using Ed25519
 */
export function signJobPayload(targetHost: string, actionIdentifier: string, parameters: any, timestamp: number): string {
  const secretKey = Buffer.from(ORCHESTRATOR_SECRET_KEY_B64, "base64");
  
  // Construct the canonical string to sign
  const messageString = JSON.stringify({
    targetHost,
    actionIdentifier,
    parameters,
    timestamp
  });
  
  const messageBytes = Buffer.from(messageString, "utf-8");
  const signatureBytes = nacl.sign.detached(messageBytes, secretKey);
  
  return Buffer.from(signatureBytes).toString("base64");
}

/**
 * Verifies an Ed25519 payload signature
 */
export function verifyJobPayload(targetHost: string, actionIdentifier: string, parameters: any, timestamp: number, signatureB64: string): boolean {
  try {
    const publicKey = Buffer.from(ORCHESTRATOR_PUBLIC_KEY_B64, "base64");
    const signatureBytes = Buffer.from(signatureB64, "base64");
    
    const messageString = JSON.stringify({
      targetHost,
      actionIdentifier,
      parameters,
      timestamp
    });
    const messageBytes = Buffer.from(messageString, "utf-8");
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
  } catch (err) {
    return false;
  }
}
