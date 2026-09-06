export class AIGuardrails {
  static readonly BANNED_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /system prompt/i,
    /drop table/i,
    /\brm\s+-rf\b/i,
    /bypass/i,
    /\bexec\(/i,
    /eval\(/i,
    /\bsudo\b/i,
    /\bbash\b/i,
    /\bpowershell\b/i,
    /\bcmd\b/i,
    /\bcurl\b/i,
    /\bwget\b/i,
    /invoke-expression/i,
    /\biex\b/i
  ];

  /**
   * Evaluates if the given payload contains potentially malicious LLM prompt injection
   * or destructive shell commands before allowing it into the execution queue.
   */
  static validatePayload(targetHost: string, actionIdentifier: string, parameters: any): { valid: boolean; reason?: string } {
    if (!targetHost || !actionIdentifier) {
      return { valid: false, reason: "Missing required fields" };
    }
    const stringifiedParams = JSON.stringify(parameters || {});
    
    // Prevent Regular Expression Denial of Service (ReDoS) by capping input length
    if (stringifiedParams.length > 50000 || targetHost.length > 1024 || actionIdentifier.length > 1024) {
      return { valid: false, reason: "Payload length exceeds maximum allowable limits for inspection" };
    }

    // Check all fields against banned patterns
    const contentsToCheck = [targetHost, actionIdentifier, stringifiedParams];
    
    for (const content of contentsToCheck) {
      for (const pattern of this.BANNED_PATTERNS) {
        if (pattern.test(content)) {
          return {
            valid: false,
            reason: `Blocked by AI Guardrails: Pattern match for ${pattern.toString()}`
          };
        }
      }
    }
    
    return { valid: true };
  }
}
