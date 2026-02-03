# 📝 Project To-Do List

## 🚀 Active Features (Stable)
- [x] **Async Polling Architecture:** Validated. 100% Success rate.
- [x] **Split Summary Modes:**
    - "Quick Recap" (~20% retention).
    - "Smart Summary" (~45% retention).
- [x] **Server Tuning:** Parameter tuning confirmed working.
- [x] **Logging:** Added `Retention %` to `app.py` logs.

## 🔮 Future Improvements
- [x] **Async Polling Architecture:** Validated. 100% Success rate on long articles.
- [x] **Logging:** Added `Retention %` to `app.py` logs.
- [x] **Shortcut:** "Summarize Article" is fully functional (Async Loop).

## 🔮 V160 NEXT SESSION: In-House Inbox Architecture ("The Green Icon")
**Goal: Eliminate Shortcut POLLING by using an app-integrated mailbox.**

1.  **Server Upgrades (`app.py`):**
    *   Create `GET /completed_jobs` endpoint.
    *   Return list of finished jobs: `[{"id": "...", "title": "..."}]`.

2.  **App Upgrades (`News Reader.js`):**
    *   **Check Mail:** Poll `/completed_jobs` on refresh/load.
    *   **UI:** Add "Green Mailbox Icon" to header if jobs > 0.
    *   **Inbox Menu:** Tap icon -> Show list of summaries.
    *   **Wiring:** Tap item -> Run "Play Summary" shortcut.

3.  **Shortcut creation:**
    *   **"Play Summary"**: Input = JobID -> fetch Text -> Speak.
    *   *Note:* The "Submit" shortcuts are already pruned (IH versions).

## 🚀 Active Features (Stable V150)
- [ ] **Prompt Tuning:** Refine BART guidelines if "Gibberish" returns.
- [ ] **Caching:** Redis/Disk cache for `JOBS` if memory gets tight.
