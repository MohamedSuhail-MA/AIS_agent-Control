import { RemoteExecutionAgent } from "../lib/mcp-agent";
import { ORCHESTRATOR_PUBLIC_KEY_B64 } from "../lib/orchestrator/crypto";

async function runMockAgent() {
  const url = "http://localhost:3000";
  const agent = new RemoteExecutionAgent(
    url,
    "WIN-PROD-SERVER-01",
    ORCHESTRATOR_PUBLIC_KEY_B64,
    "mock_private_key_ed25519" // Agent's private key (unused in this mock)
  );

  await agent.register();
  // Automatically start polling (in a real system, would wait for approval)
  agent.startPolling(5000);
  
  console.log("Mock agent running. Press Ctrl+C to stop.");
}

runMockAgent();
