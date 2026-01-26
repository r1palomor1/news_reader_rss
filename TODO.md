# News Reader (RSS) - TODO List

## 🚨 MANDATORY DEVELOPMENT RULES
1. **Version Bump:** ALWAYS update the version number (e.g., V114.x) in `News Reader (RSS).js` (Line 5) whenever code is modified.
2. **Status Update:** Update the Status comment (Line 7) to reflect the specific change.

---

# News Reader (RSS) - TODO List

## 🚨 MANDATORY DEVELOPMENT RULES
1. **Version Bump:** ALWAYS update the version number (e.g., V114.x) in `News Reader (RSS).js` (Line 5) whenever code is modified.
2. **Status Update:** Update the Status comment (Line 7) to reflect the specific change.

---

## 🌟 COMPLETED (V119.x - V120.x Series)

### ✅ Footer Select All
**Status:** DONE - V120.1
- Added "SELECT ALL VISIBLE" button above pagination.
- Allows one-tap selection of all articles on the current page to easily perform bulk actions (Read/Save/Favorite).

### ✅ Loading Sources Flow (State Optimization)
**Status:** DONE - V120.x
- **Resolution:** Re-evaluated and optimized source loading/syncing method.
- **Outcome:** Improved performance during state transitions (choosing sources, tag editor) by reducing redundant syncs.

### ✅ Smart Cluster Logic (V120.0)
**Status:** DONE - V120.0
- **Granular Child Actions:** Interacting with a child item (Listen, Bookmark, Read) ONLY affects that specific item.
- **Nuclear Parent Actions:** Interacting with the Parent card still affects the entire cluster (marks all read).
- **Fix:** Prevents accidental "nuking" of unread content when user only wants to save/hear one specific angle of a story.

### ✅ Bulk Favorites & Icon Update
**Status:** DONE - V119.9 / V120.0
- Added "Fav" (Star) button to Bulk Actions Bar.
- Updated Bulk "Save" icon to Bookmark style.
- Implemented bulk favoriting logic.

### ✅ In-App Browser Navigation
**Status:** DONE - V119.8
- Changed article links to use `Safari.openInApp(url, false)`.
- Keeps user inside the Scriptable environment, preserving scroll position and app state when returning from an article.

### ✅ Clickable Parent Titles
**Status:** DONE - V119.7
- Parent card titles are now clickable (link to article), improving accessibility and ease of use.

### ✅ Header UI Refactor
**Status:** DONE - V119.6
- Moved "% Clustered" stats from H1 to Subtitle.
- Cleaned up Header UI to be less cluttered.

## 🌟 COMPLETED (V114.x Series)

### ✅ Bookmarks Return Preserves Page
**Status:** DONE - V114.6
- Key Logic: Added `PREV_PAGE_FILE` to persistent store current feed page before entering bookmarks.
- Fixed both Header and Kebab Menu navigation.

### ✅ Smart Play All & Bulk Selection
**Status:** DONE - V114.0
- Implemented `playAll()` with smart priority: Bulk Check -> Search/Filter -> All Visible.
- Connected Top-Right Play button and Bulk "Listen" button.
- Uses iOS Shortcut with specific URL list.

### ✅ Tag Editor Save Preserves Page
**Status:** DONE - V114.4
- Fixed "Flash to Page 1" bug by passing `&page=${PAGE}` through all Tag Editor redirects (Save, Smart Edit, Switch Mode).

### ✅ Floating Jump Buttons (UX)
**Status:** DONE - V114.1
- Added "Float Up" and "Float Down" buttons.
- Logic: Scroll down shows Down Arrow (Jump to Pagination); Scroll up shows Up Arrow (Jump to Header).

### ✅ Pagination State After Playing Article
**Status:** DONE - V113.5
- Callback URL includes `&page=${PAGE}` to return to correct spot.

---

## Future Enhancements / Backlog

### Article Image Fetching (Thumbnails)
**Status:** Planned
**Priority:** Medium
**Task:** Update RSS parser to extract image URLs (`media:content`, `enclosure`, or `<img>` in description).
**Notes:** Store URL only (lightweight). Required for Immersive View.

### Immersive View / Card Mode (Toggle)
**Status:** Planned - Standard vs. Immersive
**Priority:** Medium (Requires Image Fetching)
**Concept:** Replace Header "Play All" button with a View Toggle (List/Card).
1. **State Management:** Implement `viewMode` persistence (`card` vs `compact`).
2. **Render Logic:** Create a second render HTML template for "Card Mode" (bigger image, badges, source count bubble).
3. **Badges:** Calculate "Breaking", "Developing", "Steady" tags based on cluster velocity and time.

### Exact Pulse Tag Filtering
**Status:** Deferred - Complex logic required
**Priority:** Low - Current "fuzzy match" is acceptable for now.

### Pulse Tags Disappearing in Tag Editor
**Status:** Low Priority - Minor UX Glitch
**Issue:** Pills disappear after Apply/Save until re-entry.
**Workaround:** Exit and re-enter.

---


### Tag Editor UX
- [ ] Consider hiding "Save Changes" button until bulk text area is edited (show/hide vs dim)
- [ ] Add "✓ Changes saved" confirmation message after Apply
- [ ] Add keyboard shortcut for Apply (Enter key)
- [ ] Add keyboard shortcut for Save Changes (Cmd+S / Ctrl+S)

### Pulse Tags
- [ ] Add ability to click pulse tag to search for it (in addition to exclude/include)
- [ ] Show pulse tag trend (↑ ↓) compared to previous session
- [ ] Add filter to show only "hot" tags (🔥)

### Performance
- [ ] Cache pulse tags calculation to avoid recalculating on every Tag Editor open
- [ ] Lazy load pulse tags (show Tag Editor first, load pills after)

### Source Selection UX
- [ ] Polish source selection page design
- [ ] Consider source cards landing page (if source page design improves)
  - Show source name + count + scrollable pulse tags per source
  - Click card to view articles, click pill to filter
  - Keep existing header (search, play all, kebab)
- [ ] Alternative: Improve current dropdown/source list styling
- [ ] Note: Current source page design needs improvement before implementing cards

---

## Completed Features (V111.4)

✅ External link handler (opens in Safari with Close button)  
✅ Bulk Tag Editor with comma/newline support  
✅ Smart Quick Edit (+add, -delete syntax)  
✅ Pulse tags in Tag Editor  
✅ Identical pulse tags between Reader and Editor  
✅ Smart button states (Apply/Save Changes)  
✅ Collapsible preview (collapsed by default)  
✅ Better Exclude/Include toggle  
✅ Mode preservation when reopening Tag Editor  
✅ Fixed getTags() to parse comma-separated tags in files  

### Tag Editor UX
- [ ] Consider hiding "Save Changes" button until bulk text area is edited (show/hide vs dim)
- [ ] Add "Cancel" button to Text Editor to return to Quick Edit without saving?


### ✅ Permanent Favorites (Split Sources)
**Status:** DONE - V116.0
- **Logic:** Created `FAVORITES` source. Renamed Bookmarks to `Read Later`.
- **UI:** Independant "Later" and "Fav" buttons.
- **Migration:** Auto-moves existing V115 favorites to new file.


---

## 🧠 Cognitive Load Reduction Strategy (Proposed)
*Goal: Reduce visible article count from ~800 to ~50 manageable items without hiding content.*

### 1. SMART CLUSTERING (V117.0 - Priority Phase 1)
**Objective:** Reduce feed noise by grouping similar headlines (Deduplication).

**Logic:**
- **Algorithm:** Jaccard Similarity (Word Overlap > 60%).
- **Scope:** Compare against articles within +/- 36 hours (Pull-Forward Logic).
- **UI:** 
  - Show "Cluster Card" with the newest headline.
  - Badge: "+ 3 similar sources".
  - Tap to Expand (Accordion).
  - Swipe to "Mark Cluster Read" (Clears all matched items).
  - **Review:** Current match rate ~4% (39/942). Add TODO to revisit algorithm (Cosine Similarity or TF-IDF?).

### 2. TIME-BASED DASHBOARD (V118.0 - Phase 2)
**Objective:** Replace infinite scrolling with a bucketed dashboard.

**Logic:**
- **Buckets:** Hot (<6h), Today (6-24h), Yesterday (24-48h), Older (>48h).
- **Interaction:** Collapsed accordions, Batch 30 items, Mark Visible Read.

### 4. SOURCE WEIGHTING (Soft Ranking)
**Objective:** Surface trusted sources higher within buckets.
**Logic:**
- Favorite Source: +3 points
- Enabled Source: +1 point
- Disabled Source: 0 points
- Freshness: Hot (+2), Today (+1)
- Unread: +1
**Sort Order:** `articleScore` DESC, then `date` DESC.

### 3. PULSE TAGS → STORY CLUSTERS
**Objective:** Turn pulse tags into active grouping controls rather than just filters.
**Logic:**
- Group articles by their dominant Pulse Tag.
- Show "Cluster Cards" (e.g., "Tesla — 18 articles • 6 sources").
- Click to expand.
**Result:** Story-centric feed instead of headline flood.



### 4. HEADLINE DEDUPLICATION
**Objective:** Collapse near-duplicate headlines.
**Logic:**
- Normalize titles (lowercase, remove stop words).
- Compare first 5-7 meaningful words.
- If ≥70% match, group into a single expandable item: "Apple unveils M4 chip (5 sources)".

