# FULL REFACTOR: Complete Priority List (2-3 Days)

## Priority 1: Critical Bugs (2-4 hours)
- [x] 1. **Alert Bug (Line 526)** - Fix incorrect delete confirmation pattern ✅ V130.0
- [x] 2. **Empty Catch Blocks (Lines 209, 224)** - Add error logging and user notifications ✅ V131.0
- [x] 3. **Race Conditions (Line 232)** - Sequential file writes instead of Promise.all ✅ V132.1
- [x] 4. **XSS Vulnerability (Lines 950-1100)** - HTML escape function for title/desc/source ✅ V133.0

## Priority 2: High Impact Issues (2-3 hours)
- [x] 5. **Memory Leak - READ_HISTORY** - Implement rotation (max 500 items) ✅ V134.0
- [x] 6. **Memory Leak - Debug Log** - Proper log rotation with max file size ✅ V135.0
- [x] 7. **Error Recovery** - User-facing notifications for fetch failures ✅ V136.0
- [x] 8. **Input Sanitization** - Validate/sanitize all user inputs before URL encoding ✅ V137.0
- [x] 9. **Remove Unused Variables** - Clean up `autoOpenTagEditor` (Line 586) ✅ V138.0

## Priority 3: Performance Optimization (3-4 hours)
- [ ] 10. **Cache Clustered Results** - Single-source clustering cached, not recalculated
- [ ] 11. **Optimize DOM Queries** - Cache `querySelectorAll` results in variables
- [ ] 12. **Debounce Search Input** - 300ms delay to reduce filterNews() calls
- [ ] 13. **Virtual Scrolling** - Only render visible cards for 1000+ feeds
- [ ] 14. **Lazy Load Images** - Defer description image loading until scroll

## Priority 4: Code Quality (4-6 hours)
- [ ] 15. **Remove Dead Code** - Delete commented lines (1318, 1351, 1388, 1403)
- [ ] 16. **Extract Magic Numbers** - Create constants for thresholds/time windows
- [ ] 17. **Consistent Naming** - Standardize UPPER_CASE vs camelCase
- [ ] 18. **Consolidate Tag Handlers** - Merge duplicate save/add/delete logic
- [ ] 19. **Consolidate Bulk Actions** - Unified handler for play/read/bookmark/fav
- [ ] 20. **Fix Code Duplication** - DRY principle for repeated patterns

## Priority 5: Architecture - Modular Design (6-8 hours)
- [ ] 21. **Split into Modules**:
    - [ ] `storage.js` - File I/O, history, bookmarks, favorites
    - [ ] `clustering.js` - Jaccard similarity, groupArticles, entity extraction
    - [ ] `rss.js` - fetchSingleFeed, generateMasterFeed, validation
    - [ ] `ui-components.js` - Reusable HTML builders
    - [ ] `ui-reader.js` - renderReader
    - [ ] `ui-menu.js` - renderMenu, renderManager, renderTagEditor
    - [ ] `main.js` - Orchestration and routing
- [ ] 22. **Template System** - Replace inline HTML with component functions
- [ ] 23. **State Management** - Centralized app state object instead of globals
- [ ] 24. **Config System** - Single config object for all constants/settings

## Priority 6: Enhanced Features (3-4 hours)
- [ ] 25. **Batch Operations Safety** - URL length validation before shortcuts:// call
- [ ] 26. **Offline Mode** - Graceful degradation when iCloud unavailable
- [ ] 27. **Export/Import** - Backup/restore for all settings and history
- [ ] 28. **Keyboard Shortcuts** - Quick navigation support
- [ ] 29. **Accessibility** - ARIA labels and screen reader support

## Priority 7: Testing & Documentation (4-6 hours)
- [ ] 30. **Unit Tests** - Test clustering algorithm, deduplication, tag parsing
- [ ] 31. **Integration Tests** - Test RSS fetch, cache generation, file I/O
- [ ] 32. **Error Scenario Tests** - Network failures, corrupt JSON, missing files
- [ ] 33. **JSDoc Comments** - Document all functions with params/returns
- [ ] 34. **README.md** - Installation, configuration, troubleshooting
- [ ] 35. **CHANGELOG.md** - Version history and migration notes
- [ ] 36. **Inline Comments** - Explain complex clustering/filtering logic

## Priority 8: Advanced Optimization (2-3 hours)
- [ ] 37. **IndexedDB Migration** - Move from file-based to IndexedDB for faster queries
- [ ] 38. **Web Workers** - Offload clustering to background thread
- [ ] 39. **Progressive Loading** - Stream results as they arrive
- [ ] 40. **Smart Prefetch** - Preload next page while user reads current
- [ ] 41. **Analytics** - Track usage patterns to optimize performance

---

## Time Estimates by Phase

| Phase | Tasks | Time |
|-------|-------|------|
| P1 - Critical Bugs | 1-4 | 2-4 hours |
| P2 - High Impact | 5-9 | 2-3 hours |
| P3 - Performance | 10-14 | 3-4 hours |
| P4 - Code Quality | 15-20 | 4-6 hours |
| P5 - Architecture | 21-24 | 6-8 hours |
| P6 - Features | 25-29 | 3-4 hours |
| P7 - Testing/Docs | 30-36 | 4-6 hours |
| P8 - Advanced | 37-41 | 2-3 hours |
| **TOTAL** | **41 tasks** | **26-38 hours (2-3 days)** |

---

## Milestones

**Minimum Production-Ready:** P1+P2 = 4-6 hours  
**Solid Production:** P1-P4 = 11-17 hours  
**Full Professional Refactor:** P1-P8 = 26-38 hours
