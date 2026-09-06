import { RemoteExecutionAgent } from "../lib/mcp-agent";

async function runMockAgent() {
  const url = "http://localhost:3000";
  const agent = new RemoteExecutionAgent(
    url,
    "WIN-PROD-SERVER-01",
    "mock_public_key_ed25519",
    "mock_private_key_ed25519"
  );

  await agent.register();
  // Automatically start polling (in a real system, would wait for approval)
  agent.startPolling(5000);
  
  console.log("Mock agent running. Press Ctrl+C to stop.");
}

runMockAgent();
