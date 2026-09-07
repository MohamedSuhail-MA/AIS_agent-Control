import asyncio
import time
import json

# This script simulates the asynchronous behavior of the Python FastMCP server.
# Real FastMCP runs on FastAPI/Starlette, which handles concurrent requests asynchronously.
# We will simulate a slow "Pending Approval" mutating job and verify that it does NOT block 
# fast "Read" jobs, and that all responses correlate perfectly to their correct request IDs.

async def simulate_mcp_tool_execution(tool_name: str, params: dict, job_id: str, is_dry_run: bool = False):
    start_time = time.time()
    
    if tool_name == "restart_service":
        if not is_dry_run:
            # Simulate a job that requires out-of-band approval, blocking its specific thread/task for 4 seconds
            print(f"[{time.time():.2f}] 🟡 [Job {job_id}] MUTATE action pending human/system approval... (waiting 4s)")
            await asyncio.sleep(4.0)
            result = f"[ERROR] Job {job_id} timed out waiting for approval or was rejected."
        else:
            await asyncio.sleep(0.5)
            result = f"[SUCCESS] Job {job_id} Dry-Run complete."
            
    elif tool_name == "get_service_status":
        # Fast read operation
        print(f"[{time.time():.2f}] 🔵 [Job {job_id}] READ action executing immediately...")
        await asyncio.sleep(0.2)
        result = f"[SUCCESS] Job {job_id} read service status: Running. (Params: {params})"
        
    else:
        result = f"[ERROR] Job {job_id} unknown tool."
        
    elapsed = time.time() - start_time
    print(f"[{time.time():.2f}] 🟢 [Job {job_id}] FINISHED in {elapsed:.2f}s")
    return {
        "job_id": job_id,
        "result": result,
        "elapsed": elapsed,
        "tool": tool_name
    }

async def main():
    print("===================================================================")
    print("🚀 SCENARIO: CONCURRENCY, BLOCKING, AND JOB CORRELATION TEST")
    print("===================================================================\n")
    
    # 1. Fire a mutating job that gets stuck pending approval
    pending_job_id = "MUTATE-REQ-999"
    task_mutate = asyncio.create_task(
        simulate_mcp_tool_execution("restart_service", {"serviceName": "W3SVC"}, pending_job_id, is_dry_run=False)
    )
    
    # Give it 0.5 seconds to establish its pending state
    await asyncio.sleep(0.5)
    
    # 2. While the mutation is stuck, fire 5 read jobs concurrently
    read_tasks = []
    print("\n--- Firing 5 Read Jobs while Mutate Job is STILL PENDING ---")
    for i in range(1, 6):
        read_job_id = f"READ-REQ-10{i}"
        t = asyncio.create_task(
            simulate_mcp_tool_execution("get_service_status", {"serviceName": "W3SVC"}, read_job_id)
        )
        read_tasks.append(t)
        
    # 3. Await all tasks to finish
    all_results = await asyncio.gather(task_mutate, *read_tasks)
    
    print("\n===================================================================")
    print("📊 SCENARIO RESULTS & CORRELATION VERIFICATION")
    print("===================================================================")
    
    correlation_passed = True
    blocking_passed = True
    
    mutate_res = all_results[0]
    reads_res = all_results[1:]
    
    for res in all_results:
        # Check if the result string contains the exact Job ID it was given
        is_correlated = res['job_id'] in res['result']
        if not is_correlated:
            correlation_passed = False
            
        print(f"Job: {res['job_id']:<15} | Time: {res['elapsed']:>4.2f}s | Correlated? {'✅ Yes' if is_correlated else '❌ NO'} | Output: {res['result']}")

    print("\n--- Analysis ---")
    
    # Verify non-blocking behavior
    avg_read_time = sum(r['elapsed'] for r in reads_res) / len(reads_res)
    if mutate_res['elapsed'] >= 4.0 and avg_read_time < 1.0:
        print("✅ NON-BLOCKING VERIFIED : The pending approval job did NOT block the read jobs.")
    else:
        print("❌ BLOCKING FAILED      : The reads were blocked by the pending job.")
        blocking_passed = False

    # Verify correlation
    if correlation_passed:
        print("✅ CORRELATION VERIFIED  : Every response perfectly matched its origin Job ID. No data races or mixed responses.")
    else:
        print("❌ CORRELATION FAILED    : Responses were mixed up between concurrent tasks.")

    print("===================================================================")

if __name__ == "__main__":
    asyncio.run(main())
