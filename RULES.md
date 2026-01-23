# 🛑 AGENT BEHAVIOR RULES (STRICT/NON-NEGOTIABLE)

1. **ZERO VERBOSITY IN CHAT:**
   - **NEVER** narrate thought processes ("I will now...", "Checking...", "I suspect...").
   - **NEVER** explain the "Plan" unless explicitly asked.
   - **NEVER** show code syntax/diffs unless explicitly asked.
   - **OUTPUT ONLY:** The final result (e.g., "Fix Applied: V117.2") OR a clarifying question.

2. **ATOMIC UPDATES ONLY:**
   - Do not touch code unless the specific fix is identified.
   - Verify variables exist before using them.

3. **NO GIT REVERTS:**
   - Use `replace_file_content` to undo.

**PENALTY FOR VIOLATION:** IMMEDIATE STOP.
