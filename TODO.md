# 📝 Project To-Do List

## 🚀 Active Features (Stable)
- [x] **Async Polling Architecture:** Validated. 100% Success rate.
- [x] **Split Summary Modes:**
    - "Quick Recap" (~20% retention).
    - "Smart Summary" (~45% retention).
- [x] **Server Tuning:** Parameter tuning confirmed working.
- [x] **Logging:** Added `Retention %` to `app.py` logs.

## 🔮 Future Improvements
- [ ] **Prompt Tuning:** Refine BART guidelines if "Gibberish" returns.
- [ ] **Caching:** Redis/Disk cache for `JOBS` if memory gets tight.


## ✅ Completed
- [x] **V163.0: Selective Playback (Inbox)**
  - [x] Add checkboxes to "AI Summaries" list in the Inbox Menu.
  - [x] Update "Play Unread" button to dynamically change to "Play Selected (N)" when items are checked.
  - [x] Modify `playDigest` logic to accept a list of IDs and play only those specific summaries.
  - [x] Maintain "Dimming" behavior: Played items should be marked read and dimmed upon return.
- [x] **V162.8: Robust RSS Extraction** (Fixed "Unknown Title" issues via fallback tags and HTML hardening).
- [x] **V160: In-House Inbox Architecture ("The Green Icon")**
    - **Server:** Added `/completed_jobs` endpoint.
    - **App:** Added Inbox Poll, Green Mailbox Icon, Inbox Menu.
    - **Shortcut:** Integrated "Play Digest" shortcut.
- [x] **Async Polling Architecture:** Validated. 100% Success rate.
- [x] **Split Summary Modes:** Quick Recap vs Smart Summary.
- [x] **Server Tuning:** Parameter tuning confirmed working.
- [x] **Logging:** Added `Retention %` to `app.py` logs.
