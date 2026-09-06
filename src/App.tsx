import { useEffect, useState } from "react";
import { 
  Server, 
  Activity, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Cpu, 
  TerminalSquare, 
  RefreshCw,
  Play
} from "lucide-react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { JobRecord, AgentRecord } from "./types";

export default function App() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/ui/dashboard");
      const data = await res.json();
      setJobs(data.jobs);
      setAgents(data.agents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleApproveAgent = async (agentId: string) => {
    await fetch("/api/ui/approve-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId })
    });
    fetchData();
  };

  const handleTestJob = async (hostname: string) => {
    await fetch("/api/mcp/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetHost: hostname,
        actionIdentifier: "restart_service",
        parameters: { serviceName: "w3svc" }
      })
    });
    fetchData();
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <header className="bg-neutral-900 text-white px-8 py-5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-medium tracking-tight">Zero-Trust Remote Execution Control Plane</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            System Operational
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-12">
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Server className="w-6 h-6" /> Node Fleet
            </h2>
            <div className="text-sm text-neutral-500">
              Total Agents: {agents.length}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={agent.id}
                className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-8 h-8 text-neutral-400" />
                      <div>
                        <h3 className="font-medium text-lg">{agent.hostname}</h3>
                        <p className="text-xs text-neutral-500 font-mono truncate w-40" title={agent.id}>{agent.id.split('-')[0]}...</p>
                      </div>
                    </div>
                    {agent.status === "approved" ? (
                      <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending CSR
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-neutral-600 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> 
                    Last seen: {formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true })}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-neutral-100">
                  {agent.status === "pending" && (
                    <button 
                      onClick={() => handleApproveAgent(agent.id)}
                      className="flex-1 bg-neutral-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-neutral-800 transition-colors"
                    >
                      Approve CSR
                    </button>
                  )}
                  {agent.status === "approved" && (
                    <button 
                      onClick={() => handleTestJob(agent.hostname)}
                      className="flex-1 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Test MCP Job
                    </button>
                  )}
                </div>
              </motion.div>
            ))}

            {agents.length === 0 && !loading && (
              <div className="col-span-full py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-200 rounded-xl">
                No agents registered yet. Run the mock agent to see it here.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <TerminalSquare className="w-6 h-6" /> Execution Queue
            </h2>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4 font-medium">Job ID</th>
                  <th className="px-6 py-4 font-medium">Target Host</th>
                  <th className="px-6 py-4 font-medium">Action</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {jobs.map((job) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={job.id}
                    className="hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-neutral-500">
                      {job.id.split('-')[0]}...
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {job.targetHost}
                    </td>
                    <td className="px-6 py-4 text-neutral-600">
                      {job.payload.tool_name}
                    </td>
                    <td className="px-6 py-4">
                      {job.status === 'completed' && <span className="text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Completed</span>}
                      {job.status === 'failed' && <span className="text-red-600 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Failed</span>}
                      {job.status === 'pending' && <span className="text-amber-600 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Pending</span>}
                      {job.status === 'in_progress' && <span className="text-blue-600 flex items-center gap-1.5"><RefreshCw className="w-4 h-4 animate-spin" /> In Progress</span>}
                    </td>
                    <td className="px-6 py-4 text-neutral-500">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </td>
                  </motion.tr>
                ))}
                {jobs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                      No jobs in the queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
