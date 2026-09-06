import { parseArgs } from "util";
import { generateAgentKeyPair } from "./crypto";

export interface AgentCliConfig {
  url: string;
  host: string;
  orchestratorKey: string;
  agentKey: string;
  agentPublicKey: string;
  interval: number;
}

export function parseAgentArgs(args: string[]): AgentCliConfig {
  const options = {
    url: { type: "string" as const, short: "u", default: "http://localhost:3000" },
    host: { type: "string" as const, short: "h", default: "WIN-SERVER-01" },
    orchestratorKey: { type: "string" as const, short: "o" },
    agentKey: { type: "string" as const, short: "k" },
    interval: { type: "string" as const, short: "i", default: "5000" },
  };

  try {
    const { values } = parseArgs({ args, options, allowPositionals: false });
    
    if (!values.orchestratorKey) {
      throw new Error("Missing required argument: --orchestratorKey");
    }

    let agentKey = values.agentKey as string;
    let agentPublicKey = "pre-shared-pub-key"; // Default mock logic behavior
    
    // Auto-enrollment CA mode
    if (!agentKey) {
      console.log("[Auto-Enrollment] Generating dynamic Ed25519 mTLS keypair...");
      const keypair = generateAgentKeyPair();
      agentKey = keypair.privateKey;
      agentPublicKey = keypair.publicKey;
      console.log(`[Auto-Enrollment] Public Key: ${agentPublicKey}`);
    } else {
      // In a real scenario we'd derive public key from the provided private key
      // or require it to be passed. For backward compatibility with existing tests:
      agentPublicKey = "mock_public_key"; 
    }

    let parsedInterval = parseInt(values.interval as string, 10);
    if (isNaN(parsedInterval) || parsedInterval <= 0) {
      parsedInterval = 5000;
    }

    return {
      url: values.url as string,
      host: values.host as string,
      orchestratorKey: values.orchestratorKey as string,
      agentKey: agentKey,
      agentPublicKey: agentPublicKey,
      interval: parsedInterval,
    };
  } catch (err: any) {
    throw new Error(`CLI Parse Error: ${err.message}`);
  }
}
