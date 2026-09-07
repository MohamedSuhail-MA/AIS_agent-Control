import { useEffect, useState, useMemo } from "react";
import { 
  Server, 
  Activity, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Cpu, 
  TerminalSquare, 
  RefreshCw,
  Play,
  BarChart3
} from "lucide-react";
import { motion } from "motion/react";
import { formatDistanceToNow, format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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

  const chartData = useMemo(() => {
    return jobs
      .filter(j => j.status === 'completed' && j.completed_at)
      .map(j => ({
        time: format(new Date(j.completed_at!), 'HH:mm:ss'),
        latency: j.completed_at! - j.created_at
      }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-20); // Show last 20 completed jobs
  }, [jobs]);

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
                    {agent.status === "approved" && (
                      <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                    {agent.status === "pending" && (
                      <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending CSR
                      </span>
                    )}
                    {agent.status === "offline" && (
                      <span className="bg-neutral-100 text-neutral-600 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Offline
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
              <BarChart3 className="w-6 h-6" /> Processing Latency
            </h2>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
            {chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="time" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke="#a3a3a3" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}ms`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e5e5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value} ms`, 'Latency']}
                      labelStyle={{ color: '#525252', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="latency" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, fill: '#10b981' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-neutral-400 border-2 border-dashed border-neutral-100 rounded-lg">
                No completed job data available for latency charting.
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
                  <th className="px-6 py-4 font-medium">Job ID / Trace</th>
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
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-neutral-800 font-semibold mb-1">
                        {job.id.split('-')[0]}...
                      </div>
                      <div className="font-mono text-[10px] text-neutral-400" title="OpenTelemetry Traceparent">
                        {job.payload.mcp_traceparent}
                      </div>
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
