# 📝 Vibe Coding Todo List

## 🚀 High Priority (Immediate)
- [ ] **AI Summary Tuning:** Investigate why retention is stuck at ~12% (Target 35%). T5 is compressing too aggressively despite relaxed params.
- [ ] **AI Hallucinations:** Fix "garbled endings" (e.g., `versiune`, `whl»`). Consider switching to `flan-t5-base` or `bart-large-cnn` for better coherence.
- [ ] **UI Update (Header):** Replace the "Play All" button (Triangle Icon) in the main header with a "Refresh All" button. It should trigger the `?refresh=true` logic (same as the Kebab Menu option).
- [ ] **UI Update (Card Actions):** Fix icon spacing on article cards. Currently, 'Fav' and 'Link' can touch on small screens due to `justify-between`. Move ALL icons into a single container with fixed `gap-5` (20px) for consistent layout.

## 🔮 Future Enhancements (V150+)
- [ ] **Smart Badges:** Use Hugging Face token counts to display "🔥 Long Read" or "⚡ Quick Read" badges on article cards.
- [ ] **Short Mode Restoration:** Re-introduce distinct "Quick Recap" length logic once the base generation is stable.
