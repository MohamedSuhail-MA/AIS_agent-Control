# AI Agent Execution Rules

## Workflow Completion Rule
When the user uses words like "resume", "go", "next", or similar continuation prompts, the agent MUST confirm completion ONLY AFTER meeting ALL of the following criteria sequentially:
1. **Code:** All new code for the milestone is written and integrated.
2. **Tests:** Exhaustive tests (unit/integration) are added or updated to cover the new code.
3. **Tests Run:** The full test suite (`npm run test`) is executed and 100% passes successfully.
4. **Docs:** Documentation is added or updated to reflect the changes.
5. **Docs Verified:** The documentation changes are reviewed for accuracy against the implementation.

Do NOT output a final response confirming the step is done until the background test task has successfully completed.
