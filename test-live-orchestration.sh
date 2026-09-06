#!/bin/bash
set -e

echo "Starting Control Plane Server..."
node dist/server.cjs > server.log 2>&1 &
SERVER_PID=$!

sleep 2 # Wait for server to boot

echo "Starting Agent EDGE-01..."
node dist/agent.cjs --url http://127.0.0.1:3000 --host EDGE-01 --orchestratorKey "gOSnGCF990juI37Lk1igoO+vtWllBjR/KTNrqmXxX8M=" > agent1.log 2>&1 &
AGENT1_PID=$!

echo "Starting Agent EDGE-02..."
node dist/agent.cjs --url http://127.0.0.1:3000 --host EDGE-02 --orchestratorKey "gOSnGCF990juI37Lk1igoO+vtWllBjR/KTNrqmXxX8M=" > agent2.log 2>&1 &
AGENT2_PID=$!

sleep 2 # Wait for agents to register

echo "Fetching Agents from Dashboard..."
curl -s http://127.0.0.1:3000/api/ui/dashboard > dashboard.json
cat dashboard.json

# Parse Agent IDs and approve them
AGENT1_ID=$(node -p "require('./dashboard.json').agents.find(a => a.hostname === 'EDGE-01').id")
AGENT2_ID=$(node -p "require('./dashboard.json').agents.find(a => a.hostname === 'EDGE-02').id")

echo "Approving EDGE-01 ($AGENT1_ID)..."
curl -s -X POST http://127.0.0.1:3000/api/ui/approve-agent -H "Content-Type: application/json" -d "{\"agent_id\": \"$AGENT1_ID\"}"
echo ""

echo "Approving EDGE-02 ($AGENT2_ID)..."
curl -s -X POST http://127.0.0.1:3000/api/ui/approve-agent -H "Content-Type: application/json" -d "{\"agent_id\": \"$AGENT2_ID\"}"
echo ""

echo "Dispatching Jobs to Agents..."
# Job for EDGE-01
curl -s -X POST http://127.0.0.1:3000/api/mcp/tools/call -H "Content-Type: application/json" -d "{
  \"targetHost\": \"EDGE-01\",
  \"actionIdentifier\": \"Restart-Service -Name W3SVC\",
  \"parameters\": {}
}"
echo ""

# Job for EDGE-02
curl -s -X POST http://127.0.0.1:3000/api/mcp/tools/call -H "Content-Type: application/json" -d "{
  \"targetHost\": \"EDGE-02\",
  \"actionIdentifier\": \"Get-Process -Name svchost\",
  \"parameters\": {}
}"
echo ""

echo "Waiting for agents to poll and execute (8 seconds)..."
sleep 8

echo "Fetching Final Dashboard State..."
curl -s http://127.0.0.1:3000/api/ui/dashboard > final_dashboard.json
cat final_dashboard.json

echo "Shutting down processes..."
kill $AGENT1_PID
kill $AGENT2_PID
kill $SERVER_PID

echo ""
echo "==== Server Log ===="
cat server.log
echo ""
echo "==== Agent 1 Log ===="
cat agent1.log
echo ""
echo "==== Agent 2 Log ===="
cat agent2.log
