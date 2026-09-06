import { parseArgs } from "util";

export interface AgentCliConfig {
  url: string;
  host: string;
  orchestratorKey: string;
  agentKey: string;
  interval: number;
}

export function parseAgentArgs(args: string[]): AgentCliConfig {
  const options = {
    url: { type: "string" as const, short: "u", default: "http://localhost:3000" },
    host: { type: "string" as const, short: "h", default: "WIN-SERVER-01" },
    orchestratorKey: { type: "string" as const, short: "o" },
    agentKey: { type: "string" as const, short: "k", default: "mock_priv_key" },
    interval: { type: "string" as const, short: "i", default: "5000" },
  };

  try {
    const { values } = parseArgs({ args, options, allowPositionals: false });
    
    if (!values.orchestratorKey) {
      throw new Error("Missing required argument: --orchestratorKey");
    }

    return {
      url: values.url as string,
      host: values.host as string,
      orchestratorKey: values.orchestratorKey as string,
      agentKey: values.agentKey as string,
      interval: parseInt(values.interval as string, 10),
    };
  } catch (err: any) {
    throw new Error(`CLI Parse Error: ${err.message}`);
  }
}
