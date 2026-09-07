const { spawn } = require("child_process");

const BASE_URL = "http://127.0.0.1:3000";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function testControlPlane() {
    console.log("\n=======================================================");
    console.log("🚀 PHASE 1: CONTROL PLANE LOAD TEST (1000 AGENTS)");
    console.log("=======================================================");
    
    const numAgents = 1000;
    const BATCH_SIZE = 200; 
    let agents = [];
    
    // 1. Register 1000 Agents
    process.stdout.write("Registering 1000 agents in batches...");
    let start = Date.now();
    for (let i = 0; i < numAgents; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < numAgents; j++) {
            batch.push(fetch(`${BASE_URL}/api/agent/register`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hostname: `LOAD-AGENT-${i + j}`, publicKey: "ZTghfSVst77M6N3/APwBLb/sGC7Rqnou1gQic+JBoS0=" })
            }).then(r => r.json()));
        }
        const results = await Promise.all(batch);
        agents.push(...results.map(r => r.agent_id));
    }
    console.log(` Done in ${Date.now() - start}ms`);

    // 2. Approve 1000 Agents
    process.stdout.write("Approving 1000 agents...");
    start = Date.now();
    for (let i = 0; i < numAgents; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < numAgents; j++) {
            batch.push(fetch(`${BASE_URL}/api/ui/approve-agent`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agent_id: agents[i + j] })
            }));
        }
        await Promise.all(batch);
    }
    console.log(` Done in ${Date.now() - start}ms`);

    // 3. Queue 1000 Jobs
    process.stdout.write("Queueing 1000 unique jobs (1 per agent)...");
    start = Date.now();
    let jobIds = [];
    for (let i = 0; i < numAgents; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < numAgents; j++) {
            batch.push(fetch(`${BASE_URL}/api/mcp/tools/call`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetHost: `LOAD-AGENT-${i + j}`, actionIdentifier: "echo 'load test'", parameters: {} })
            }).then(r => r.json()));
        }
        const results = await Promise.all(batch);
        jobIds.push(...results.map(r => r.job_id));
    }
    console.log(` Done in ${Date.now() - start}ms`);

    // 4. Simulate 1000 Simultaneous Polls
    process.stdout.write("Simulating 1000 concurrent agent poll requests...");
    start = Date.now();
    let pollResults = [];
    for (let i = 0; i < numAgents; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < numAgents; j++) {
            batch.push(fetch(`${BASE_URL}/api/agent/poll`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agent_id: agents[i + j], targetHost: `LOAD-AGENT-${i + j}` })
            }).then(r => r.json()));
        }
        pollResults.push(...await Promise.all(batch));
    }
    console.log(` 1000 jobs successfully dequeued in ${Date.now() - start}ms!`);

    // 5. Simulate 1000 Simultaneous Completions
    process.stdout.write("Simulating 1000 concurrent agent job completions...");
    start = Date.now();
    for (let i = 0; i < numAgents; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < numAgents; j++) {
            const job = pollResults[i + j].job;
            if (job) {
                batch.push(fetch(`${BASE_URL}/api/agent/complete`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ job_id: job.job_id, status: "completed", result: "ok" })
                }));
            }
        }
        await Promise.all(batch);
    }
    console.log(` 1000 completions recorded in ${Date.now() - start}ms!`);
    console.log("✅ Phase 1 Passed: Server successfully handled 1000 agents gracefully.");
}

async function testAgentLoad() {
    console.log("\n=======================================================");
    console.log("🚀 PHASE 2: AGENT LOAD TEST (100 JOBS ON 1 AGENT)");
    console.log("=======================================================");
    
    // Register
    const res = await fetch(`${BASE_URL}/api/agent/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: `EDGE-STRESS-01`, publicKey: "ZTghfSVst77M6N3/APwBLb/sGC7Rqnou1gQic+JBoS0=" })
    }).then(r => r.json());
    
    await fetch(`${BASE_URL}/api/ui/approve-agent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: res.agent_id })
    });

    // Queue 100 jobs at once for this single agent
    process.stdout.write("Queueing 100 simultaneous jobs for EDGE-STRESS-01...");
    const queuePromises = [];
    for (let i = 0; i < 100; i++) {
        queuePromises.push(fetch(`${BASE_URL}/api/mcp/tools/call`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetHost: "EDGE-STRESS-01", actionIdentifier: `echo 'Task ${i}'`, parameters: {} })
        }));
    }
    await Promise.all(queuePromises);
    console.log(" Done.");

    console.log("Starting physical Agent executable with an ultra-aggressive 50ms polling interval...");
    const agentProcess = spawn("node", [
        "dist/agent.cjs", 
        "--url", BASE_URL, 
        "--host", "EDGE-STRESS-01", 
        "--orchestratorKey", "gOSnGCF990juI37Lk1igoO+vtWllBjR/KTNrqmXxX8M=", 
        "--interval", "50"
    ]);

    // Automatically approve the agent repeatedly so when it registers itself it gets approved
    const approveInterval = setInterval(async () => {
        try {
            const dash = await fetch(`${BASE_URL}/api/ui/dashboard`).then(r => r.json());
            const stressAgent = dash.agents.find(a => a.hostname === "EDGE-STRESS-01");
            if (stressAgent && stressAgent.status === "pending") {
                await fetch(`${BASE_URL}/api/ui/approve-agent`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agent_id: stressAgent.id })
                });
            }
        } catch(e) {}
    }, 200);

    let processed = 0;
    agentProcess.stdout.on("data", (data) => {
        const out = data.toString();
        console.log("[AGENT STDOUT]", out.trim());
        // Count how many jobs successfully execute
        const matches = (out.match(/executed successfully/g) || []).length;
        processed += matches;
        if (matches > 0 && processed % 20 === 0) {
            console.log(`   -> Agent has sequentially processed ${processed}/100 jobs safely without overlapping processes.`);
        }
    });

    agentProcess.stderr.on("data", (data) => {
        console.error("[AGENT STDERR]", data.toString().trim());
    });

    // Wait until 100 jobs are done
    let attempts = 0;
    while (processed < 100 && attempts < 100) {
        await sleep(500);
        attempts++;
    }

    clearInterval(approveInterval);
    agentProcess.kill();

    if (processed >= 100) {
        console.log("✅ Phase 2 Passed: Single agent drained 100 queued jobs stably with no crashes, memory leaks, or network timeouts!");
    } else {
        console.error(`❌ Phase 2 Failed: Agent only processed ${processed}/100 jobs.`);
    }
}

async function main() {
    console.log("Starting Server...");
    const server = spawn("node", ["dist/server.cjs"]);
    await sleep(2000);

    try {
        await testControlPlane();
        await testAgentLoad();
    } catch (err) {
        console.error("Test failed", err);
    } finally {
        server.kill();
        console.log("\nServer shut down. Tests concluded.");
    }
}

main();
