# News Reader (RSS) - TODO List

## 🚨 MANDATORY DEVELOPMENT RULES
1. **Version Bump:** ALWAYS update the version number (e.g., V114.x) in `News Reader (RSS).js` (Line 5) whenever code is modified.
2. **Status Update:** Update the Status comment (Line 7) to reflect the specific change.

---

### Play All & Bulk Selection Not Working
**Status:** DONE - V114.0  
**Priority:** High - Core features not implemented

**Current Behavior:**
1. **Play All button** (top right) - Does nothing ❌
2. **Bulk selection** - Select articles → Click Listen → Nothing happens ❌

**Root Cause:**
- Play All button (line 524) has no onclick handler - just a placeholder
- `bulkPlay()` function (line 623) navigates to Scriptable URL instead of calling Shortcut
- Single play works: `Safari.open('shortcuts://x-callback-url/run-shortcut?name=Read%20Article&input=URL')`
- Bulk play broken: `window.location.href = '${scriptUrl}?playall=true&bulkList=...'`

**Desired Behavior (Smart Play All):**

**Priority order:**
1. **If bulk checkboxes selected** → Play selected articles
2. **Else if search term active** → Play search results
3. **Else if pulse pill clicked** → Play pill-filtered articles
4. **Else** → Play all visible articles (respects Unread/Show All toggle)

**Examples:**
- User selects 3 articles → Play All plays those 3
- User searches "Tesla" → Play All plays all Tesla results
- User clicks "AI" pill → Play All plays all AI articles
- User in TechCrunch, Unread Only → Play All plays all unread TechCrunch
- User in All Sources, Show All → Play All plays everything

**Fix Needed:**
1. Add onclick handler to Play All button
2. Implement smart selection logic (priority order above)
3. Change `bulkPlay()` to call the "Read Article" Shortcut
4. Both should pass comma-separated URLs as input (Shortcut already handles this)
5. Add x-success callback to return to reader with page preserved

**Implementation:**

**Play All button (line 524):**
```html
<button onclick="playAll()" class="p-1">
  <span class="material-icons-round text-blue-500">play_circle</span>
</button>
```

**JavaScript functions:**
```javascript
function playAll() {
  let urls;
  
  // Priority 1: Bulk selection
  const checkedBoxes = document.querySelectorAll('.bulk-check:checked');
  if (checkedBoxes.length > 0) {
    urls = Array.from(checkedBoxes)
      .map(cb => cb.closest('.news-card').dataset.link).join(',');
  } 
  // Priority 2: Search/Filter results (visible cards only)
  else {
    urls = Array.from(document.querySelectorAll('.news-card'))
      .filter(card => !card.classList.contains('hidden-card'))
      .map(card => card.dataset.link).join(',');
  }
  
  const callback = encodeURIComponent('${scriptUrl}?page=${PAGE}');
  Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Read%20Article&input=${encodeURIComponent(urls)}&x-success=${callback}`);
}

function bulkPlay() {
  // Same as playAll() - just call it
  playAll();
}
```

---

### Bookmarks Return Doesn't Preserve Page
**Status:** TODO - Attempted V113.8-V113.10, still broken  
**Priority:** Medium - Annoying but has workaround

**Current Behavior:**
- Wired page 2 → Bookmarks → Return → Wired page 1 ❌

**Expected Behavior:**
- Wired page 2 → Bookmarks → Return → Wired page 2 ✅

**What We Tried:**
- V113.8: Added PREV_PAGE_FILE to store page
- V113.9: Fixed toggleUnread pagination
- V113.10: Added cat parameter handler
- Still doesn't work ❌

**Mystery:**
- DONE → Listen preserves page ✅ (works)
- Show All/Unread preserves page ✅ (works)
- Bookmarks → Return doesn't preserve page ❌ (broken)

**Next Steps:**
- Add debug logging to see what values are being saved/read
- Check if there's a race condition with file writes
- Verify the Return button URL is correct
- Test with simpler approach (pass page in URL instead of file)

**Workaround:**
- Use pagination buttons to navigate back to desired page

---

### Tag Editor Save Operations Don't Preserve Page
**Status:** DONE - V114.4 (Root Cause Fixed)  
**Priority:** Medium - Annoying but has workaround

**Current Behavior:**
- Page 4 → Tag Editor → Press X → Page 4 ✅ (works)
- Page 4 → Tag Editor → Save changes → Flashes to reader page 1 → Reopens editor → Close → Page 1 ❌ (broken)

**Expected Behavior:**
- Page 4 → Tag Editor → Save changes → Should return to page 4 ✅

**Root Cause:**
- Save operations use `reopenTagEditor` flow to recalculate pulse tags
- Flow: Save → Reader (page 1) → Tag Editor → Close → Page 1
- The intermediate reader render at page 1 overwrites the PAGE variable
- When Tag Editor closes, it returns to page 1 instead of original page

**What Works:**
- Opening Tag Editor preserves page ✅
- Closing without changes preserves page ✅
- All Tag Editor redirects have `&page=${PAGE}` ✅

**What's Broken:**
- The `reopenTagEditor` flow loses the original page number

**Next Steps:**
- Store original page in a separate variable/file before reopening
- Pass original page through the entire flow
- Or skip the reader render and recalculate pulse tags differently

**Workaround:**
- Use pagination buttons to navigate back to desired page

---

## High Priority Issues

### Pagination State Not Preserved After Playing Article
**Status:** TODO  
**Priority:** Medium - UX improvement

**Current Behavior:**
- User navigates to page 3
- Clicks play on an article
- After article finishes playing, returns to page 1 ❌

**Expected Behavior:**
- Should return to page 3 (last pagination state) ✅

**Root Cause:**
- Play action doesn't preserve current page number
- Return URL likely doesn't include `&page=3` parameter

**Fix Needed:**
- When playing article, include current page in return URL
- Similar to how we fixed Bookmarks return navigation (V112.1)

**Implementation:**
- Find play article handler
- Add `&page=${PAGE}` to return URL
- Test with different pages

---

### Exact Pulse Tag Filtering
**Status:** TODO - Attempted in V112.0 but broke app, reverted to V111.4  
**Priority:** High - User-requested feature

**Current Behavior:**
- Click `New 17` pill → Puts "New" in search bar
- Shows 30+ articles (matches "New", "News", "Newer", "Newest", etc.)
- ❌ Count doesn't match pill number

**Desired Behavior:**
- Click `New 17` pill → Shows exactly 17 articles that contributed to that count
- ✅ Pill gets **green border** to show it's active
- ✅ Click same pill again → Clears filter, removes green border
- ✅ Returns to **last source state** (not "All Sources" unless that's where you were)
  - If in TechCrunch → Shows TechCrunch articles (paginated)
  - If in All Sources → Shows all articles (paginated)
  - If in Bookmarks → Shows bookmarks

**Technical Requirements:**
1. Track which specific articles match each pulse tag during calculation
2. Store article links for each tag (e.g., `pulseTagArticles["Tesla"] = [link1, link2, ...]`)
3. On pill click: Filter cards to show only matching articles
4. Add green border to active pill (`border-green-500`)
5. Toggle on/off functionality
6. Restore to `filteredPool` state when cleared (respects category, unread filter, pagination)

**Implementation Notes:**
- V112.0 attempt had syntax error in onclick handler (`'  )` with extra spaces)
- Need to test incrementally with small changes
- Commit after each working step
- Use safe revert if breaks

**Potential Solutions:**
1. Fix the onclick syntax error from V112.0
2. Test pill click in isolation first
3. Add article tracking to pulseTags function
4. Implement toggle logic carefully
5. Test with different categories (All Sources, specific source, Bookmarks)

---

## Known Issues

### Pulse Tags Disappearing in Tag Editor
**Status:** Low Priority - Feature still works, just minor UX issue  
**Issue:** After clicking Apply or Save Changes in Tag Editor, pulse tag pills sometimes disappear until you exit and re-enter the editor.

**Current Behavior:**
- Click Apply in Quick Edit → Pills disappear
- Click Save Changes → Pills disappear
- Exit and re-enter Tag Editor → Pills reappear

**Expected Behavior:**
- Pills should persist after all operations

**Technical Details:**
- `reopenTagEditor` flow is implemented (V111.2)
- Auto-opens Tag Editor with pulse tags via `setTimeout(() => { openTagEditor(mode); }, 100);`
- Mode is preserved correctly (V111.4)
- Pulse tags are passed via URL parameter
- Issue might be timing-related or WebView rendering

**Potential Solutions to Investigate:**
1. Increase setTimeout delay from 100ms to 200ms
2. Check if WebView is fully loaded before calling openTagEditor
3. Add a loading indicator during the reload
4. Store pulse tags in a temp file instead of URL parameter (URL might be too long)
5. Debug the exact flow to see where pills are lost

**Workaround:**
Exit and re-enter Tag Editor to see pills again.

---

## Future Enhancements

### Page Number Visibility
**Status:** DONE - V114.1 (Floating Jump Buttons)  
**Priority:** Low - Nice to have

**Problem:**
- Pagination is at the bottom of the page
- User must scroll through ~25 article cards to see current page number
- No quick way to check what page you're on

**Proposed Solutions:**

**Option 1: Floating "Jump" Buttons (Bidirectional)**
- **Scroll Down:** Show floating "⬇" arrow to jump to bottom (pagination)
- **Scroll Up:** Show floating "⬆" arrow to jump to top (header)
- **Logic:**
  - If near top: Show only ⬇
  - If near bottom: Show only ⬆
  - If in middle: Show both? Or toggle based on scroll direction?
  - Recommendation: Toggle based on scroll direction (Scroll down = show down arrow, Scroll up = show up arrow)
- Minimal, non-intrusive, auto-hides when stopped?

**Option 2: Sticky Page Indicator**
- Small page number badge in corner (e.g., "Page 3")
- Only shows when scrolled past first few cards
- Fades in/out based on scroll position
- Click to jump to pagination

**Option 3: Scroll Progress Indicator**
- Thin progress bar at top showing scroll position
- Page number appears when scrolling
- Similar to mobile browser URL bar behavior

**Constraints:**
- Header is already full (source, count, play, menu)
- Don't want permanent page number at top
- Should be subtle and non-intrusive

**Recommendation:**
- Option 1 (Jump to Bottom button) - Simplest, most useful
- Floating button with down arrow icon
- Only appears when scrolled down
- Quick way to reach pagination

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
