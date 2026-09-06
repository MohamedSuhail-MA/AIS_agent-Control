import { RemoteExecutionAgent } from "../lib/mcp-agent";
import { ORCHESTRATOR_PUBLIC_KEY_B64 } from "../lib/orchestrator/crypto";
import { generateAgentKeyPair } from "../lib/agent/crypto";

async function runMockAgent() {
  const url = "http://localhost:3000";
  const keypair = generateAgentKeyPair();
  
  const agent = new RemoteExecutionAgent(
    url,
    "WIN-PROD-SERVER-01",
    ORCHESTRATOR_PUBLIC_KEY_B64,
    keypair.privateKey
  );
  
  await agent.register(keypair.publicKey);
  // Automatically start polling (in a real system, would wait for approval)
  agent.startPolling(5000);
  
  console.log("Mock agent running. Press Ctrl+C to stop.");
}

runMockAgent();

