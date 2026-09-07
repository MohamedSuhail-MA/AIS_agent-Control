import os
import json
import subprocess
import logging
import datetime

# In a real environment, you would run: pip install fastmcp
# from fastmcp import FastMCP 

logging.basicConfig(
    filename='mcp_audit.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Load configuration
CONFIG_PATH = os.getenv("MCP_CONFIG_PATH", "tools_config.json")
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

# Mocking FastMCP for environment without pip installed
class MockFastMCP:
    def __init__(self, name):
        self.name = name
        self.tools = {}
    
    def tool(self):
        def decorator(func):
            self.tools[func.__name__] = func
            return func
        return decorator
        
    def run(self):
        print(f"[{self.name}] Server running on port 8000...")

mcp = MockFastMCP("EnterpriseAD-MCP")

MAX_OUTPUT_LENGTH = 100

def run_powershell(script_path, params, requires_approval, dry_run=False):
    if requires_approval and not dry_run:
        logging.warning(f"BLOCKED: Execution of {script_path} requires approval or dry-run flag.")
        return "[ERROR] This action mutates state. Please provide 'dry_run=True' or obtain explicit approval flag."

    ps_command = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", script_path
    ]
    
    for key, value in params.items():
        ps_command.extend([f"-{key}", str(value)])
        
    logging.info(f"AUDIT EXEC: {script_path} Params: {params} DryRun: {dry_run}")
    
    try:
        # Mocking for Linux test env
        if os.name != 'nt':
            # Simulate a long output for truncation testing
            mock_output = f"[MOCK PS OUT] Executed {script_path} with params {params} | DryRun={dry_run}\n"
            mock_output += "Line 1: Status OK\n"
            mock_output += "Line 2: Service is running\n"
            mock_output += "Line 3: Memory usage: 45MB\n"
            mock_output += "Line 4: CPU usage: 2%\n"
            mock_output += "Line 5: Uptime: 45d 2h\n"
            mock_output += "Line 6: Thread count: 24\n"
            output = mock_output
        else:
            result = subprocess.run(
                ps_command,
                capture_output=True,
                text=True,
                timeout=30
            )
            output = result.stdout + result.stderr
        
        if len(output) > MAX_OUTPUT_LENGTH:
            output = output[:MAX_OUTPUT_LENGTH] + f"\n\n[OUTPUT TRUNCATED - Showing first {MAX_OUTPUT_LENGTH} chars]"
            
        return output
    except subprocess.TimeoutExpired:
        logging.error(f"AUDIT FAIL: {script_path} timed out.")
        return "[ERROR] PowerShell script execution timed out."
    except Exception as e:
        logging.error(f"AUDIT FAIL: {script_path} error: {str(e)}")
        return f"[ERROR] Execution failed: {str(e)}"

# Dynamically register tools
for tool_config in config.get("tools", []):
    tool_name = tool_config["name"]
    tool_desc = tool_config["description"]
    script_path = tool_config["script_path"]
    req_approval = tool_config.get("requires_approval", False)
    
    # We define a function generator to capture variables in closure
    def make_tool_function(s_path, r_approval, t_name, t_desc):
        def tool_func(params: str, dry_run: bool = True) -> str:
            try:
                param_dict = json.loads(params)
            except Exception:
                param_dict = {}
            return run_powershell(s_path, param_dict, r_approval, dry_run)
        
        tool_func.__name__ = t_name
        tool_func.__doc__ = f"{t_desc}\nExpects a JSON string of parameters."
        return tool_func

    mcp.tool()(make_tool_function(script_path, req_approval, tool_name, tool_desc))

if __name__ == "__main__":
    logging.info("MCP Server starting...")
    mcp.run()
