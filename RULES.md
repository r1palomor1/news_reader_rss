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
   **NO GIT CHECKOUTS:**
   - Request approval first to Use `replace_file_content` to undo.

4. **AVOID THESE PITFALLS ALWAYS:**
   - **DON'T assume - trace the actual execution path** before coding solutions. Map complete data flow (what variables contain, what functions return, what gets saved) BEFORE writing new code.
   
   - **DON'T patch symptoms - debug root causes**. When bugs occur, ask "What is the actual value?" instead of immediately adding fixes. Stop and trace the data instead of building on broken assumptions.
   
   - **DON'T declare solutions without verification**. Never say "found it!" or "this is the bug" until systematically confirming each claim by reading the actual code. Methodically check every line before stating conclusions.

   **Bottom line:** Prove understanding through verification, not assumption. Accuracy over speed.

**PENALTY FOR VIOLATION:** IMMEDIATE STOP.

5. **MANDATORY VERSION & STATUS UPDATES:**
   - **ALWAYS** update the header in `News Reader (RSS).js` when modifying code.
   - **New Feature/Task:** Increment major version (e.g., V147.0 → V148.0).
   - **Fix/Sub-task:** Increment minor version (e.g., V147.1 → V147.2).
   - **Status Comment:** Must accurately reflect the specific work done.