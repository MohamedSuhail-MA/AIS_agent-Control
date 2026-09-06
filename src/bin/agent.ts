import { parseAgentArgs } from "../lib/agent/cli";
import { RemoteExecutionAgent } from "../lib/mcp-agent";

async function run() {
  try {
    // Process args skipping node and script path
    const args = process.argv.slice(2);
    const config = parseAgentArgs(args);

    console.log("========================================");
    console.log("Zero-Trust MCP Edge Agent Bootstrapping");
    console.log("========================================");
    console.log(`Control Plane URL: ${config.url}`);
    console.log(`Target Hostname  : ${config.host}`);
    console.log(`Poll Interval    : ${config.interval}ms`);

    const agent = new RemoteExecutionAgent(
      config.url,
      config.host,
      config.orchestratorKey,
      config.agentKey
    );

    // Enroll with the key (either passed or dynamically generated in parseAgentArgs)
    await agent.register(config.agentPublicKey);
    
    agent.startPolling(config.interval);
    
    // Keep alive gracefully
    process.on("SIGINT", () => {
      console.log("\nShutting down agent...");
      agent.stopPolling();
      process.exit(0);
    });

  } catch (err: any) {
    console.error(err.message);
    console.log("\nUsage:");
    console.log("  node agent.cjs --url <url> --host <hostname> --orchestratorKey <b64_pub_key> [--agentKey <key>] [--interval <ms>]");
    process.exit(1);
  }
}

run();

