import nacl from "tweetnacl";

export interface AgentKeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateAgentKeyPair(): AgentKeyPair {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString("base64"),
    privateKey: Buffer.from(keyPair.secretKey).toString("base64")
  };
}
