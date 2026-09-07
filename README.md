# Enterprise Zero-Trust MCP Framework

This project is a highly secure, zero-trust execution framework designed to allow LLMs (via the Model Context Protocol) to execute scripts on remote, on-premises Windows Server infrastructure safely.

## Architecture 

The system is split into three main components:

1. **Control Plane (Orchestrator)**
   - Exposes an MCP-compliant API for LLMs.
   - Evaluates payloads against **AI Prompt Injection Guardrails** (`AIGuardrails`).
   - Cryptographically signs execution payloads using Ed25519.
   - Maintains an in-memory asynchronous queue.
   - Provides a React/Tailwind frontend to visualize fleet status and job queues.

2. **Edge Agent (Remote Execution Node)**
   - A standalone Node CLI bundled via `esbuild`.
   - Polls the Control Plane securely via CSRs.
   - Verifies cryptographic signatures.
   - Acts as the tunnel between the Cloud Control Plane and the internal Windows Server environments.

3. **Python FastMCP Server (Windows Host)**
   - Powered by `fastmcp` (FastAPI/Uvicorn).
   - Serves as the localized execution bridge on the Windows Server.
   - Controlled centrally via `tools_config.json` for strictly structured PowerShell integrations.
   - Implements hard truncation to protect LLM token limits and intercepts state-mutating requests via `dry_run` gates.

## Deployment: Windows Server & IIS (FastMCP)

To host the Python MCP Server behind IIS using Application Request Routing (ARR) and Active Directory authentication:

### 1. Prerequisites
- Windows Server with **IIS** installed.
- **ARR (Application Request Routing)** and **URL Rewrite** modules installed in IIS.
- **HttpPlatformHandler v1.2** installed in IIS.
- **Python 3.10+** installed (ensure it's in the system PATH).

### 2. Python Setup
Clone this repository to your target directory (e.g., `C:\App\ZeroTrustMCP`).

```cmd
cd C:\App\ZeroTrustMCP
pip install fastmcp uvicorn pyyaml
```

### 3. IIS Configuration
1. Open IIS Manager.
2. Create a new Website or Application pointing to `C:\App\ZeroTrustMCP`.
3. In IIS Manager, double-click **Authentication**.
   - Disable **Anonymous Authentication**.
   - Enable **Windows Authentication**.
4. The provided `web.config` will automatically use the `httpPlatformHandler` to spin up the Python `uvicorn` worker and route traffic to it.

```xml
<!-- Example web.config included in repo -->
<httpPlatform processPath="c:\python310\python.exe"
              arguments="-m uvicorn mcp_server:mcp --port %HTTP_PLATFORM_PORT%"
              stdoutLogEnabled="true"
              stdoutLogFile=".\logs\python-stdout">
  <environmentVariables>
    <environmentVariable name="MCP_CONFIG_PATH" value="C:\App\tools_config.json" />
  </environmentVariables>
</httpPlatform>
```

### 4. Tool Configuration
Edit the `tools_config.json` to map your custom PowerShell scripts.

```json
{
  "tools": [
    {
      "name": "restart_service",
      "description": "Restarts a Windows Service.",
      "script_path": "scripts/restart_service.ps1",
      "requires_approval": true,
      "parameters": [
        { "name": "serviceName", "type": "string", "required": true }
      ]
    }
  ]
}
```
*Note: Any tool marked with `requires_approval: true` will immediately block LLM execution unless the LLM passes the `dry_run: true` parameter or an AD admin has actively flagged the job as approved.*

## Development & Testing (Control Plane)

```bash
npm install
npm run test
```

### Building for Production
```bash
# Builds the Control Plane (dist/server.cjs) and React SPA
npm run build

# Builds the Standalone Edge Agent CLI (dist/agent.cjs)
npm run build:agent
```
