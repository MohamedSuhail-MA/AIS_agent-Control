import { getAllAgents, getAllJobs } from "./db";

export class HealthSweeper {
  /**
   * Sweeps agents and marks them as 'offline' if they haven't sent a heartbeat 
   * within the timeout threshold.
   * 
   * @param timeoutMs Default 30s
   * @returns Number of agents marked offline
   */
  static sweepOfflineAgents(timeoutMs = 30000): number {
    const now = Date.now();
    const agents = getAllAgents();
    let swept = 0;

    for (const agent of agents) {
      if (agent.status === "approved" && agent.last_seen < now - timeoutMs) {
        agent.status = "offline";
        swept++;
      }
    }
    return swept;
  }

  /**
   * Sweeps jobs and resets them to 'pending' if their visibility timeout 
   * has expired while still 'in_progress'. This handles worker crashes.
   * 
   * @param timeoutMs Default 60s
   * @returns Number of jobs reset
   */
  static sweepStaleJobs(timeoutMs = 60000): number {
    const now = Date.now();
    const jobs = getAllJobs();
    let swept = 0;

    for (const job of jobs) {
      if (job.status === "in_progress" && job.visible_at < now - timeoutMs) {
        job.status = "pending";
        job.visible_at = 0;
        swept++;
      }
    }
    return swept;
  }
}
