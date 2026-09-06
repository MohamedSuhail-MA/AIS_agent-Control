# Windows Execution Sandbox (Simulation)

## Architecture
The Edge Agent operates in a highly adversarial enterprise environment where even the LLM Orchestrator is treated as potentially compromised. To mitigate "jailbroken" LLMs executing arbitrary malware, the Agent employs local OS-level guardrails.

### 1. Job Objects (`JOBOBJECT_BASIC_LIMIT_INFORMATION`)
- **Risk:** If the main Agent executable crashes (or is killed by an EDR), any child processes (like `cmd.exe` or `powershell.exe`) it spawned might remain active ("orphan process creep").
- **Mitigation:** The `wrapInJobObject()` simulation represents the NT Kernel's `KILL_ON_JOB_CLOSE` flag. All child execution paths are tied to the parent's lifecycle.

### 2. PowerShell Constrained Language Mode (CLM)
- **Risk:** Fileless malware executed via PowerShell.
- **Mitigation:** The `executeInConstrainedLanguageMode()` simulation drops all jobs containing:
  - `Add-Type` (Arbitrary C# compilation)
  - `New-Object -ComObject` (Lateral movement via COM)
  - `VirtualAlloc` (Memory injection)
  - `[System.Reflection.*]` (In-memory assembly loading)

These simulations correspond to real-world WDAC (Windows Defender Application Control) AppLocker policies enforced on the executing endpoints.
