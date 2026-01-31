# 📝 Vibe Coding Todo List

## 🚀 High Priority (Immediate)
- [ ] **AI Summary Tuning:** Testing "Paragraph Chunking" (One-Paragraph-Per-Chunk) to solve retention.
- [ ] **AI Hallucinations:** Monitor if Paragraph Chunking eliminates mid-sentence artifacts.
- [x] **UI Update (Header):** Replaced "Play All" with "Refresh All" button (Sync Icon). Triggers `?refresh=true`.
- [ ] **Search Bar Polish:** 
    - Ensure 'X' (Clear) button appears when Pulse Tag is clicked (Pre-filled search).
    - Auto-clear search if "Bulk Read" results in 0 items (prevent dead end).
- [ ] **UI Update (Card Actions):** Fix icon spacing on article cards. Currently, 'Fav' and 'Link' can touch on small screens due to `justify-between`. Move ALL icons into a single container with fixed `gap-5` (20px) for consistent layout.

## 🔮 Future Enhancements (V150+)
- [ ] **Smart Badges:** Use Hugging Face token counts to display "🔥 Long Read" or "⚡ Quick Read" badges on article cards.
- [ ] **Short Mode Restoration:** Re-introduce distinct "Quick Recap" length logic once the base generation is stable.
