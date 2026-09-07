import mcp_server
import json

print("\n--- Starting Real-Time Scenario Generation ---")

print("\n1. Testing 'get_service_status' (No approval required)")
# This simulates an LLM calling the tool through FastMCP
result1 = mcp_server.mcp.tools["get_service_status"](json.dumps({"serviceName": "W3SVC"}), dry_run=False)
print("Result:\n" + result1)

print("\n2. Testing 'restart_service' (Mutating action without dry_run/approval)")
result2 = mcp_server.mcp.tools["restart_service"](json.dumps({"serviceName": "W3SVC"}), dry_run=False)
print("Result:\n" + result2)

print("\n3. Testing 'restart_service' (Mutating action WITH dry_run)")
result3 = mcp_server.mcp.tools["restart_service"](json.dumps({"serviceName": "W3SVC"}), dry_run=True)
print("Result:\n" + result3)

print("\n--- Audit Log Verification ---")
with open("mcp_audit.log", "r") as f:
    print(f.read())
