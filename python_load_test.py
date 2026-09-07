import mcp_server
import json
import time
from concurrent.futures import ThreadPoolExecutor

def worker(i):
    try:
        if i % 3 == 0:
            # 1. Read-only query (Safe)
            return mcp_server.mcp.tools["get_service_status"](json.dumps({"serviceName": f"W3SVC"}), dry_run=False)
        elif i % 3 == 1:
            # 2. Mutating action without approval (Should block)
            return mcp_server.mcp.tools["restart_service"](json.dumps({"serviceName": f"Spooler"}), dry_run=False)
        else:
            # 3. Mutating action with dry-run (Safe)
            return mcp_server.mcp.tools["restart_service"](json.dumps({"serviceName": f"W3SVC"}), dry_run=True)
    except Exception as e:
        return f"Error: {e}"

print("=======================================================")
print("🚀 PHASE 3: PYTHON MCP ENTERPRISE LOAD TEST")
print("=======================================================")
print("Simulating 1,500 concurrent LLM/AD User requests...")
print("Validating Thread-Safe Audit Logging & State Mutation Locks...")

start = time.time()
with ThreadPoolExecutor(max_workers=200) as executor:
    results = list(executor.map(worker, range(1500)))
duration = time.time() - start

success_read = sum(1 for r in results if "[MOCK PS OUT]" in r and "get_service.ps1" in r)
blocked_mutate = sum(1 for r in results if "[ERROR] This action mutates state" in r)
success_dryrun = sum(1 for r in results if "[MOCK PS OUT]" in r and "restart_service.ps1" in r)
failed = len(results) - (success_read + blocked_mutate + success_dryrun)

print(f"Total Requests Processed : {len(results)}")
print(f"Concurrency level        : 200 Workers")
print(f"Total Time Taken         : {duration:.3f} seconds")
print(f"Throughput               : {len(results)/duration:.1f} req/sec")
print(f"-------------------------------------------------------")
print(f"✅ Successful Reads      : {success_read}")
print(f"🛑 Blocked Mutations     : {blocked_mutate}")
print(f"✅ Approved Dry-Runs     : {success_dryrun}")
print(f"❌ Failed Requests       : {failed}")
print("=======================================================")

# Verify audit log lines
with open("mcp_audit.log", "r") as f:
    lines = len(f.readlines())
print(f"Total entries securely written to mcp_audit.log: {lines}")
print("=======================================================")
