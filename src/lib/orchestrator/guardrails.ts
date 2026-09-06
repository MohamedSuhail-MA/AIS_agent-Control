export class AIGuardrails {
  static readonly BANNED_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /system prompt/i,
    /drop table/i,
    /rm -rf/i,
    /bypass/i,
    /\bexec\(/i,
    /eval\(/i
  ];

  /**
   * Evaluates if the given payload contains potentially malicious LLM prompt injection
   * or destructive shell commands before allowing it into the execution queue.
   */
  static validatePayload(targetHost: string, actionIdentifier: string, parameters: any): { valid: boolean; reason?: string } {
    const stringifiedParams = JSON.stringify(parameters || {});
    
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
