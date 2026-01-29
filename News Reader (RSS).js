// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// =======================================
// Version: V149.1
// Status: Route Full Audio to Read Article (IN PROGRESS - AI Quality Issues)
// =======================================

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const CONFIG_FILE = fm.joinPath(dir, "global_news_feeds.json")
const CAT_FILE = fm.joinPath(dir, "global_news_category.txt")
const PREV_CAT_FILE = fm.joinPath(dir, "prev_category.txt")
const PREV_PAGE_FILE = fm.joinPath(dir, "prev_page.txt")
const HISTORY_FILE = fm.joinPath(dir, "read_history.json")
const BOOKMARK_FILE = fm.joinPath(dir, "bookmarks.json")
const FAV_FILE = fm.joinPath(dir, "favorites.json")
const CACHE_DIR = fm.joinPath(dir, "news_cache")
const TOGGLE_FILE = fm.joinPath(dir, "unread_toggle.txt")
const VISIT_FILE = fm.joinPath(dir, "last_visit.txt")
const MASTER_FEED_FILE = fm.joinPath(dir, "master_feed.json")
// New Tag Editor Files
const EXCLUSION_FILE = fm.joinPath(dir, "tag_exclusions.txt")
const INCLUSION_FILE = fm.joinPath(dir, "tag_inclusions.txt")

// Configuration Constants
const MAX_HISTORY = 250  // Maximum read history items to retain
const MAX_LOG_SIZE = 10000  // Maximum debug log size in characters

// Clustering Algorithm Constants
const BASE_THRESHOLD = 0.28  // Jaccard similarity threshold for standard titles
const SHORT_THRESHOLD = 0.20  // Lower threshold for short titles (≤5 tokens)
const TIME_WINDOW = 36 * 60 * 60 * 1000  // 36-hour clustering window (ms)
const HF_API_URL = "https://r1palomor1-news-reader-summarizer.hf.space/summarize"

if (!fm.fileExists(CACHE_DIR)) fm.createDirectory(CACHE_DIR)

async function getJsonFile(path) {
  if (!fm.fileExists(path)) return []
  if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path)
  try {
    return JSON.parse(fm.readString(path))
  } catch (error) {
    logToFile(`[JSON Parse Error] ${path}: ${error.message}`)
    return []
  }
}

function getTags(path) {
  if (!fm.fileExists(path)) return []
  return fm.readString(path)
    .split(/[,\n]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

function saveTags(path, tags) {
  fm.writeString(path, tags.join("\n"))
}

function saveHistory(arr) {
  const trimmed = arr.slice(-MAX_HISTORY)  // Keep only most recent items
  fm.writeString(HISTORY_FILE, JSON.stringify(trimmed))
}
function saveBookmarks(arr) { fm.writeString(BOOKMARK_FILE, JSON.stringify(arr)) }
function saveFavorites(arr) { fm.writeString(FAV_FILE, JSON.stringify(arr)) }

// Global Stats Object (Moved to Top Scope to fix ReferenceError)
const CLUSTER_STATS = { compared: 0, matched: 0, rejectedByThreshold: 0, rejectedByTime: 0, shortTitleBoosts: 0 };

let READ_HISTORY = await getJsonFile(HISTORY_FILE)
let BOOKMARKS = await getJsonFile(BOOKMARK_FILE)
let FAVORITES = await getJsonFile(FAV_FILE)
let FEEDS = await getJsonFile(CONFIG_FILE)
logToFile(`[Init] Script Loaded: V117.2 (Time: ${new Date().toLocaleTimeString()})`);

// Migration: Move V115 favorites to new file
const favoritesToMove = BOOKMARKS.filter(b => b.favorite === true);
if (favoritesToMove.length > 0) {
  // Clean 'favorite' flag as it's implied by source now
  const cleanFavs = favoritesToMove.map(f => { delete f.favorite; return f; });
  FAVORITES.push(...cleanFavs);
  BOOKMARKS = BOOKMARKS.filter(b => !b.favorite);
  saveBookmarks(BOOKMARKS);
  saveFavorites(FAVORITES);
}

let savedCat = fm.fileExists(CAT_FILE) ? fm.readString(CAT_FILE) : "ALL SOURCES"
// Logic Update: If URL param exists, use it AND SAVE IT immediately
if (args.queryParameters.cat) {
  savedCat = args.queryParameters.cat
  fm.writeString(CAT_FILE, savedCat)
}
let CATEGORY = FEEDS.some(f => f.name === savedCat) || ["ALL SOURCES", "BOOKMARKS", "FAVORITES"].includes(savedCat) ? savedCat : "ALL SOURCES"

let SHOW_UNREAD_ONLY = fm.fileExists(TOGGLE_FILE) ? fm.readString(TOGGLE_FILE) === "true" : true
if (args.queryParameters.toggleUnread) {
  SHOW_UNREAD_ONLY = !SHOW_UNREAD_ONLY
  fm.writeString(TOGGLE_FILE, String(SHOW_UNREAD_ONLY))
}

let APP_STATE = args.queryParameters.state || "READER"
let SEARCH_TERM = args.queryParameters.search || ""

const DEBUG_FILE = fm.joinPath(dir, "debug_log.txt")
function logToFile(msg) {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}\n`;

    let content = fm.fileExists(DEBUG_FILE) ? fm.readString(DEBUG_FILE) : "";
    content += entry;

    // Rotate if exceeds max size
    if (content.length > MAX_LOG_SIZE) {
      // Keep last MAX_LOG_SIZE characters
      content = content.substring(content.length - MAX_LOG_SIZE);
      // Trim to start of first complete line
      const firstNewline = content.indexOf('\n');
      if (firstNewline > 0) {
        content = content.substring(firstNewline + 1);
      }
    }

    fm.writeString(DEBUG_FILE, content);
  } catch (e) {
    // Silent fail - logging shouldn't crash the app
  }
}

let PAGE = parseInt(args.queryParameters.page) || 1
logToFile(`PAGE Init: ${PAGE} (Params: ${JSON.stringify(args.queryParameters)})`)
const ITEMS_PER_PAGE = 25

const scriptName = Script.name()
const scriptUrl = `scriptable:///run/${encodeURIComponent(scriptName)}`
const searchParam = SEARCH_TERM ? `&search=${encodeURIComponent(SEARCH_TERM)}` : ""

// Helper to Centralize PrevCat Writes (Nuclear Option against Rogue Writes)
function writePrevCategory(cat) {
  if (!cat) return;
  const c = cat.trim();
  const virtuals = ["FAVORITES", "BOOKMARKS", "READ LATER"];

  // Guard 1: Block Virtuals
  if (virtuals.includes(c.toUpperCase())) return;

  // Guard 2: Allowlist (True Feeds OR ALL SOURCES)
  const isTrue = (c === "ALL SOURCES") || FEEDS.some(f => f.name === c);

  if (isTrue) {
    fm.writeString(PREV_CAT_FILE, c)
  }
}

// Initial Logic: Handle incoming prevCat using the Safe Helper
if (args.queryParameters.prevCat) {
  writePrevCategory(args.queryParameters.prevCat);
}

function getFirstTrueSource() {
  const firstEnabled = FEEDS.find(f => f.enabled)
  return firstEnabled ? firstEnabled.name : "ALL SOURCES"
}

function getNewCutoffMs() {
  const hour = new Date().getHours()
  const windowHours = (hour < 12) ? 12 : 6
  return windowHours * 60 * 60 * 1000
}

function getExpiryCutoffMs() { return 3 * 24 * 60 * 60 * 1000 }

// --- MASTER FILE LOGIC ---

// --- MASTER FILE LOGIC ---

async function generateMasterFeed() {
  const files = fm.listContents(CACHE_DIR)
  let allItems = []

  // Aggregate all source files
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    const path = fm.joinPath(CACHE_DIR, file)
    try {
      const data = JSON.parse(fm.readString(path))
      allItems.push(...data)
    } catch (e) { continue }
  }

  // Deduplicate by Link (Safety)
  const seen = new Set();
  const unique = [];
  allItems.forEach(item => {
    if (!seen.has(item.link)) {
      seen.add(item.link);
      unique.push(item);
    }
  });

  // Sort by Date (Newest First)
  unique.sort((a, b) => new Date(b.date) - new Date(a.date))

  // CAP SIZE: Keep top 1000 items to prevent memory crashes
  const capped = unique.slice(0, 1000)

  // V118.1: CLUSTER IMMEDIATELY (Bake into Master File)
  logToFile(`[Master] Clustering ${capped.length} items...`)
  const clustered = groupArticles(capped)

  // V118.5: Natural Sort (Date Based) - Removed Force Clusters to Top
  clustered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write Master File (Now contains CLUSTERS, not just raw items)
  fm.writeString(MASTER_FEED_FILE, JSON.stringify(clustered))
  logToFile(`[Master] Generated Master Feed with ${clustered.length} Entities (from ${unique.length} Articles)`)
}

// --- CORE UTILITIES ---

// V144.0 Refactor: Helper for Code Deduplication & Entity Fix
function getCachePath(name) {
  return fm.joinPath(CACHE_DIR, name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json")
}

function extract(b, tag) {
  const m = b.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, "is"))
  if (m) {
    let text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/<[^>]+>/g, " ").replace(/\s+/g, ' ').trim()

    // V144.0: Improved Entity Decoding
    text = text.replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, '-')
      .replace(/&#8212;/g, '--')

    return text
  }
  if (tag === "link") {
    const linkMatch = b.match(/<link [^>]*href=["']([^"']+)["']/)
    return linkMatch ? linkMatch[1] : ""
  }
  return ""
}

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // V144.0 Fix double escaping: Don't escape quotes excessively if not needed for attribute safety
    // We keep basic escaping for HTML safety but avoid turning ' directly into &#039; if it's just text
    .replace(/'/g, '&#039;')
}

function sanitizeInput(text, maxLength = 200) {
  if (!text) return ''
  // Trim and limit length
  let cleaned = text.trim().substring(0, maxLength)
  // Remove control characters and null bytes
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '')
  return cleaned
}

async function fetchSingleFeed(url, name) {
  // Refactor: Use Helper
  const path = getCachePath(name)
  const freshUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
  const expiry = getExpiryCutoffMs()
  try {
    const req = new Request(freshUrl); req.timeoutInterval = 5;
    const xml = await req.loadString()
    const itemsRaw = xml.includes("<item") ? xml.split(/<item[^>]*>/).slice(1) : xml.split(/<entry[^>]*>/).slice(1)
    const items = itemsRaw.map(b => {
      // Decode entities in ALL fields during extraction
      return {
        title: extract(b, "title"),
        link: extract(b, "link"),
        date: extract(b, "pubDate") || extract(b, "updated") || extract(b, "published"),
        desc: extract(b, "description") || extract(b, "summary") || extract(b, "content"),
        source: name
      }
    })
    const filtered = items.filter(i => (Date.now() - new Date(i.date).getTime()) < expiry)
    fm.writeString(path, JSON.stringify(filtered));
    return { success: true, name: name }
  } catch (error) {
    logToFile(`[Fetch Error] ${name}: ${error.message}`)
    if (fm.fileExists(path)) {
      logToFile(`[Fetch] Using cached data for ${name}`)
      const cached = JSON.parse(fm.readString(path))
      return { success: false, name: name, cached: true }
    }
    logToFile(`[Fetch] No cache available for ${name}`)
    return { success: false, name: name, cached: false }
  }
}

async function syncAllFeeds() {
  const hud = new WebView()
  const enabledFeeds = FEEDS.filter(f => f.enabled)
  const hudHtml = `<html><head><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="bg-[#0f172a] flex flex-col items-center justify-center h-full text-slate-100 font-sans">
      <div class="animate-spin rounded-full h-20 w-20 border-t-4 border-blue-500 mb-10"></div>
      <div id="status" class="text-4xl font-black text-white text-center px-6">Loading sources<span id="dots"></span></div>
      <script>
        let dots = 0;
        setInterval(() => { dots = (dots + 1) % 4; document.getElementById('dots').innerText = ".".repeat(dots); }, 400);
      </script>
    </body></html>`
  await hud.loadHTML(hudHtml); hud.present(false)
  const results = await Promise.all(enabledFeeds.map(f => fetchSingleFeed(f.url, f.name)));

  // Small delay to ensure all file writes complete
  await new Promise(resolve => Timer.schedule(100, false, resolve));

  await generateMasterFeed()
  fm.writeString(VISIT_FILE, String(Date.now()))

  // Show failure notification if any feeds failed
  const failures = results.filter(r => !r.success && !r.cached);
  if (failures.length > 0) {
    const alert = new Alert()
    alert.title = "⚠️ Feed Sync Issues"
    alert.message = `${failures.length} feed${failures.length > 1 ? 's' : ''} failed to sync:\n\n${failures.map(f => f.name).join('\n')}\n\nCheck Debug Logs for details.`
    alert.addAction("OK")
    await alert.present()
  }
}

// --- TAG EDITOR ACTIONS ---

// V142.1 Refactor: Consolidated Tag Handler
function updateTagFile(type, updateFn) {
  const file = type === 'exclude' ? EXCLUSION_FILE : INCLUSION_FILE
  let tags = getTags(file)
  const result = updateFn(tags)
  if (result) saveTags(file, result)
}

if (args.queryParameters.addPulseTag) {
  const type = args.queryParameters.type
  const tag = sanitizeInput(args.queryParameters.tag)

  if (tag) {
    updateTagFile(type, (tags) => {
      // Add if unique
      if (!tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
        tags.push(tag)
        return tags
      }
      return null
    })
    Safari.open(`${scriptUrl}?reopenTagEditor=true&mode=${type}&page=${PAGE}`)
  } else {
    // If no tag provided, just open editor
    Safari.open(`${scriptUrl}?state=TAG_EDITOR&mode=${type}&page=${PAGE}`)
  }
  return
}

if (args.queryParameters.smartEditTags) {
  const type = args.queryParameters.type
  const input = args.queryParameters.input || ""

  updateTagFile(type, (tags) => {
    const items = input.split(',').map(t => t.trim())
    let toAdd = [], toRemove = []

    items.forEach(item => {
      if (item.startsWith('+')) toAdd.push(item.substring(1).trim())
      else if (item.startsWith('-')) toRemove.push(item.substring(1).trim())
      else if (item.length > 0) toAdd.push(item)
    })

    // 1. Remove tags
    if (toRemove.length > 0) {
      tags = tags.filter(t => !toRemove.some(r => r.toLowerCase() === t.toLowerCase()))
    }

    // 2. Add tags (avoid duplicates)
    toAdd.forEach(tag => {
      if (!tags.some(t => t.toLowerCase() === tag.toLowerCase())) tags.push(tag)
    })

    return tags
  })

  Safari.open(`${scriptUrl}?state=TAG_EDITOR&mode=${type}&page=${PAGE}`)
  return
}

if (args.queryParameters.addBulkTags) {
  const type = args.queryParameters.type
  const newTags = args.queryParameters.newTags || ""

  updateTagFile(type, (tags) => {
    const parsed = newTags.split(',').map(t => t.trim()).filter(t => t.length > 0)
    // Combine and deduplicate
    const combined = [...tags, ...parsed]
    return combined.filter((t, i, arr) => arr.indexOf(t) === i)
  })

  Safari.open(`${scriptUrl}?reopenTagEditor=true&mode=${type}&page=${PAGE}`)
  return
}

if (args.queryParameters.saveBulkTags || args.queryParameters.saveTags) {
  const type = args.queryParameters.type
  const tagsText = args.queryParameters.tags || ""

  updateTagFile(type, () => {
    // Complete overwrite
    return tagsText.split('\n').map(t => t.trim()).filter(t => t.length > 0)
  })

  Safari.open(`${scriptUrl}?reopenTagEditor=true&mode=${type}&page=${PAGE}`)
  return
}

if (args.queryParameters.addTag) {
  const type = args.queryParameters.type
  const val = args.queryParameters.val ? args.queryParameters.val.trim() : ""

  if (val) {
    updateTagFile(type, (tags) => {
      if (!tags.includes(val)) {
        tags.push(val)
        return tags
      }
      return null
    })
  }
  Safari.open(`${scriptUrl}?state=TAG_EDITOR&mode=${type}`)
  return
}

if (args.queryParameters.deleteTag) {
  const type = args.queryParameters.type
  const idx = parseInt(args.queryParameters.idx)

  updateTagFile(type, (tags) => {
    if (!isNaN(idx) && idx >= 0 && idx < tags.length) {
      tags.splice(idx, 1)
      return tags
    }
    return null
  })
  Safari.open(`${scriptUrl}?state=TAG_EDITOR&mode=manage`)
  return
}

// --- STANDARD ACTION HANDLERS ---

if (args.queryParameters.playall) {
  try {
    const urls = args.queryParameters.urls;
    const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : urls.split(',');

    readLinks.forEach(l => { if (!READ_HISTORY.includes(l)) READ_HISTORY.push(l) });
    saveHistory(READ_HISTORY);

    const callback = encodeURIComponent(`${scriptUrl}?page=${PAGE}${searchParam}`);
    Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Read%20Article&input=${encodeURIComponent(urls)}&x-success=${callback}`);
  } catch (e) {
    new Alert().addCancelAction("Bulk Transfer Error: Selection too large for URL scheme. Try selecting fewer items.").present();
  }
  return;
}

if (args.queryParameters.bulkRead) {
  const links = JSON.parse(decodeURIComponent(args.queryParameters.bulkRead))
  links.forEach(l => { if (!READ_HISTORY.includes(l)) READ_HISTORY.push(l) })
  saveHistory(READ_HISTORY); Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.refresh) {
  const files = fm.listContents(CACHE_DIR);
  files.forEach(f => fm.remove(fm.joinPath(CACHE_DIR, f)))
  await syncAllFeeds(); Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.bulkBookmark) {
  try {
    const data = JSON.parse(decodeURIComponent(args.queryParameters.bulkBookmark))
    const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : []
    data.forEach(item => { if (!BOOKMARKS.some(b => b.link === item.link)) BOOKMARKS.push(item) })
    saveBookmarks(BOOKMARKS);
    readLinks.forEach(l => { if (!READ_HISTORY.includes(l)) READ_HISTORY.push(l) });
    saveHistory(READ_HISTORY);
  } catch (e) {
    new Alert().addCancelAction("Bulk Bookmark Error: Selection too large. Try fewer items.").present();
  }
  Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.showLogs) {
  if (fm.fileExists(DEBUG_FILE)) {
    const logs = fm.readString(DEBUG_FILE);
    const a = new Alert();
    a.title = "Debug Logs";
    a.message = logs;
    a.addAction("Copy to Clipboard");
    a.addAction("Clear Logs");
    a.addCancelAction("Close");
    const id = await a.present();
    if (id === 0) {
      Pasteboard.copy(logs);
      const c = new Alert(); c.title = "Copied to Clipboard"; c.addCancelAction("OK"); await c.present();
    } else if (id === 1) {
      fm.remove(DEBUG_FILE);
    }
  } else {
    const a = new Alert(); a.message = "No logs found."; await a.present();
  }
  // Return to reader
  Safari.open(scriptUrl + '?page=' + PAGE);
  return;
}



if (args.queryParameters.playall) {
  const urls = decodeURIComponent(args.queryParameters.urls)

  // Logic Update: Mark associated items (parents & descendants) as read
  if (args.queryParameters.readLinks) {
    try {
      const readToMark = JSON.parse(decodeURIComponent(args.queryParameters.readLinks))
      let historyUpdated = false
      readToMark.forEach(link => {
        if (!READ_HISTORY.includes(link)) {
          READ_HISTORY.push(link)
          historyUpdated = true
        }
      })
      if (historyUpdated) saveHistory(READ_HISTORY)
    } catch (e) {
      logToFile('[Error] Failed to parse bulk read links during playall: ' + e.message)
    }
  }

  // Logic Update: Hand off to iOS Shortcuts
  // The 'Read Article' shortcut receives the comma-separated list of URLs.
  // x-success callback ensures we return to the specific page and search state.
  const completionState = encodeURIComponent(`${scriptUrl}?page=${PAGE}`)
  const shortcutName = args.queryParameters.shortcutName || 'Read Article';
  Safari.open(`shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=${encodeURIComponent(urls)}&x-success=${completionState}`)
  return
}

if (args.queryParameters.listen) {
  const url = args.queryParameters.listen

  // Handling Read Later (Bookmarks) - Always remove after listening
  const bIdx = BOOKMARKS.findIndex(b => b.link === url)
  if (bIdx > -1) {
    BOOKMARKS.splice(bIdx, 1); saveBookmarks(BOOKMARKS);
    if (BOOKMARKS.length === 0 && CATEGORY === "BOOKMARKS") {
      const prev = fm.fileExists(PREV_CAT_FILE) ? fm.readString(PREV_CAT_FILE) : getFirstTrueSource();
      fm.writeString(CAT_FILE, prev)
    }
  }

  // Handling History - Add if not already read
  const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : [url];
  readLinks.forEach(link => {
    const isFav = FAVORITES.some(f => f.link === link);
    if (!isFav && !READ_HISTORY.includes(link)) {
      READ_HISTORY.push(link);
    }
  });
  saveHistory(READ_HISTORY)

  // Always play - clear callback to avoid loops
  // Update: Pass FULL State (Category + PrevCat)
  const prevCatParam = args.queryParameters.prevCat ? `&prevCat=${encodeURIComponent(args.queryParameters.prevCat)}` : '';
  const callback = encodeURIComponent(`${scriptUrl}?page=${PAGE}&cat=${encodeURIComponent(CATEGORY)}${prevCatParam}`);
  Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Read%20Article&input=${encodeURIComponent(url)}&x-success=${callback}`);
  return;
}

if (args.queryParameters.summarize) {
  const url = args.queryParameters.summarize

  // Handling Read Later (Bookmarks) - Always remove after listening
  const bIdx = BOOKMARKS.findIndex(b => b.link === url)
  if (bIdx > -1) {
    BOOKMARKS.splice(bIdx, 1); saveBookmarks(BOOKMARKS);
    if (BOOKMARKS.length === 0 && CATEGORY === "BOOKMARKS") {
      const prev = fm.fileExists(PREV_CAT_FILE) ? fm.readString(PREV_CAT_FILE) : getFirstTrueSource();
      fm.writeString(CAT_FILE, prev)
    }
  }

  // Handling History - Add if not already read
  const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : [url];
  readLinks.forEach(link => {
    const isFav = FAVORITES.some(f => f.link === link);
    if (!isFav && !READ_HISTORY.includes(link)) {
      READ_HISTORY.push(link);
    }
  });
  saveHistory(READ_HISTORY)

  // V149.0: Smart Shortcut Protocol
  // Check if we already have the summary mode from the UI menu
  const mode = args.queryParameters.mode || "full";

  if (mode === "full") {
    // Legacy Behavior: Just send the URL
    const prevCatParam = args.queryParameters.prevCat ? `&prevCat=${encodeURIComponent(args.queryParameters.prevCat)}` : '';
    const callback = encodeURIComponent(`${scriptUrl}?page=${PAGE}&cat=${encodeURIComponent(CATEGORY)}${prevCatParam}`);
    Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Read%20Article&input=${encodeURIComponent(url)}&x-success=${callback}`);
  } else {
    // Smart Mode: Send "MODE:URL" command to Shortcut
    // The Shortcut will handle extraction (Clean Reader) and API calling
    const command = `${mode.toUpperCase()}:${url}`;

    const prevCatParam = args.queryParameters.prevCat ? `&prevCat=${encodeURIComponent(args.queryParameters.prevCat)}` : '';
    const callback = encodeURIComponent(`${scriptUrl}?page=${PAGE}&cat=${encodeURIComponent(CATEGORY)}${prevCatParam}`);

    Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Summarize%20Article&input=${encodeURIComponent(command)}&x-success=${callback}`);
  }
  return;
}

if (args.queryParameters.bulkSummarize) {
  const urls = args.queryParameters.bulkSummarize;

  // Handling Read Later (Bookmarks) - Remove processed items
  const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : [];
  let bookmarksChanged = false;

  readLinks.forEach(link => {
    const idx = BOOKMARKS.findIndex(b => b.link === link);
    if (idx > -1) {
      BOOKMARKS.splice(idx, 1);
      bookmarksChanged = true;
    }
  });

  if (bookmarksChanged) {
    saveBookmarks(BOOKMARKS);
    if (BOOKMARKS.length === 0 && CATEGORY === "BOOKMARKS") {
      const prev = fm.fileExists(PREV_CAT_FILE) ? fm.readString(PREV_CAT_FILE) : getFirstTrueSource();
      fm.writeString(CAT_FILE, prev);
    }
  }

  // Handling History - Add if not already read
  readLinks.forEach(link => {
    const isFav = FAVORITES.some(f => f.link === link);
    if (!isFav && !READ_HISTORY.includes(link)) {
      READ_HISTORY.push(link);
    }
  });
  saveHistory(READ_HISTORY);

  // Trigger "Summarize Article" Shortcut (Bulk Input)
  const prevCatParam = args.queryParameters.prevCat ? `&prevCat=${encodeURIComponent(args.queryParameters.prevCat)}` : '';
  const callback = encodeURIComponent(`${scriptUrl}?page=${PAGE}&cat=${encodeURIComponent(CATEGORY)}${prevCatParam}`);

  Safari.open(`shortcuts://x-callback-url/run-shortcut?name=Summarize%20Article&input=${encodeURIComponent(urls)}&x-success=${callback}`);
  return;
}

if (args.queryParameters.uncheck) {
  const url = args.queryParameters.uncheck
  const idx = READ_HISTORY.indexOf(url)
  if (idx > -1) { READ_HISTORY.splice(idx, 1); saveHistory(READ_HISTORY) }
  Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.externalLink) {
  const url = args.queryParameters.externalLink
  await Safari.openInApp(url, false)
}

if (args.queryParameters.bookmark) {
  const bLink = args.queryParameters.bookmark
  const idx = BOOKMARKS.findIndex(b => b.link === bLink)
  // V144.1: Do NOT add to History on Save (Stays Undimmed)
  // const readLinks = args.queryParameters.readLinks ? JSON.parse(args.queryParameters.readLinks) : [] 
  if (idx > -1) {
    BOOKMARKS.splice(idx, 1)
    if (BOOKMARKS.length === 0 && CATEGORY === "BOOKMARKS") {
      const prev = fm.fileExists(PREV_CAT_FILE) ? fm.readString(PREV_CAT_FILE) : getFirstTrueSource();
      fm.writeString(CAT_FILE, prev)
    }
  } else {
    BOOKMARKS.push({ title: args.queryParameters.title, link: bLink, source: args.queryParameters.source, date: args.queryParameters.date, desc: args.queryParameters.desc })
    // readLinks.forEach(l => { if (!READ_HISTORY.includes(l)) READ_HISTORY.push(l) }); <--- REMOVED
    // saveHistory(READ_HISTORY); <--- REMOVED
  }
  saveBookmarks(BOOKMARKS); Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.favorite) {
  const fLink = args.queryParameters.favorite
  const idx = FAVORITES.findIndex(b => b.link === fLink)
  if (idx > -1) {
    // Remove from Favorites
    FAVORITES.splice(idx, 1)
    if (FAVORITES.length === 0 && CATEGORY === "FAVORITES") fm.writeString(CAT_FILE, getFirstTrueSource())
  } else {
    // Add to Favorites
    FAVORITES.push({ title: args.queryParameters.title, link: fLink, source: args.queryParameters.source, date: args.queryParameters.date, desc: args.queryParameters.desc })
  }
  saveFavorites(FAVORITES); Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.bulkFavorite) {
  const items = JSON.parse(decodeURIComponent(args.queryParameters.bulkFavorite));
  let changed = false;
  items.forEach(item => {
    const idx = FAVORITES.findIndex(f => f.link === item.link);
    if (idx === -1) {
      FAVORITES.push(item);
      changed = true;
    }
  });
  if (changed) saveFavorites(FAVORITES);
  Safari.open(scriptUrl + '?' + searchParam + '&page=' + PAGE); return
}

if (args.queryParameters.idx) {
  const i = parseInt(args.queryParameters.idx)
  if (args.queryParameters.delete) {
    const a = new Alert()
    a.message = `Delete "${FEEDS[i].name}"?`
    a.addDestructiveAction("Delete")
    a.addCancelAction("Cancel")
    if (await a.present() === 0) {
      FEEDS.splice(i, 1)
    }
  }
  if (args.queryParameters.move) {
    const dir = args.queryParameters.move
    if (dir === "up" && i > 0) [FEEDS[i], FEEDS[i - 1]] = [FEEDS[i - 1], FEEDS[i]]
    else if (dir === "down" && i < FEEDS.length - 1) [FEEDS[i], FEEDS[i + 1]] = [FEEDS[i + 1], FEEDS[i]]
  }
  if (args.queryParameters.toggle) FEEDS[i].enabled = !FEEDS[i].enabled
  if (args.queryParameters.edit) {
    let a = new Alert(); a.title = "Edit Source"
    a.addTextField("Name", FEEDS[i].name)
    a.addTextField("URL", FEEDS[i].url)

    // Add Favorite toggle
    const favAction = FEEDS[i].favorite ? "Remove from Favorites" : "Add to Favorites"
    a.addAction(favAction)

    // Add Enabled toggle
    const enableAction = FEEDS[i].enabled ? "Disable" : "Enable"
    a.addAction(enableAction)

    a.addAction("Save")
    a.addCancelAction("Cancel")

    const choice = await a.present()
    if (choice === 0) { // Toggle Favorite
      FEEDS[i].favorite = !FEEDS[i].favorite
      fm.writeString(CONFIG_FILE, JSON.stringify(FEEDS))
      Safari.open(`${scriptUrl}?state=MANAGER`); return
    } else if (choice === 1) { // Toggle Enabled
      FEEDS[i].enabled = !FEEDS[i].enabled
      fm.writeString(CONFIG_FILE, JSON.stringify(FEEDS))
      Safari.open(`${scriptUrl}?state=MANAGER`); return
    } else if (choice === 2) { // Save
      FEEDS[i].name = a.textFieldValue(0)
      FEEDS[i].url = a.textFieldValue(1)
      delete FEEDS[i].validation
      delete FEEDS[i].validated
      delete FEEDS[i].format
    }
  }
  fm.writeString(CONFIG_FILE, JSON.stringify(FEEDS)); Safari.open(`${scriptUrl}?state=MANAGER`); return
}

// --- RENDERING ENGINES ---

function formatDateTime(dateStr) {
  let d = new Date(dateStr); if (isNaN(d.valueOf())) return dateStr
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()} • ${d.getHours() % 12 || 12}:${d.getMinutes().toString().padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`
}

// Handle reopening Tag Editor with fresh pulse tags
if (args.queryParameters.reopenTagEditor) {
  logToFile(`Reopen Triggered. PageParam: ${args.queryParameters.page}`)
  const mode = args.queryParameters.mode || 'exclude'
  // Will fall through to renderReader which calculates pulse tags
  // Then JavaScript will call openTagEditor() which passes them
  APP_STATE = 'READER'
  // Set a flag to auto-open Tag Editor after reader renders
  if (args.queryParameters.page) { PAGE = parseInt(args.queryParameters.page) }
}

// --- CLUSTERING LOGIC (V117 - Tuned) ---

// --- CLUSTERING LOGIC (V118.6 - Enhanced) ---

// --- CLUSTERING LOGIC (V119.0 - Entity Seeding) ---

function getJaccardSimilarity(titleA, titleB) {
  const HARD_STOP_WORDS = new Set(['breaking', 'live', 'update', 'video', 'watch', 'photos', 'the', 'and', 'for', 'with', 'this', 'that', 'from', 'news', 'exclusive', 'report', 'today', 'what', 'when', 'where', 'who', 'says', 'said', 'will', 'more', 'over', 'after', 'into', 'out', 'up', 'down']);
  const SOFT_STOP_WORDS = new Set(['review', 'guide', 'analysis', 'opinion', 'best', 'week', 'month', 'year', 'daily', 'recap', 'impressions']);

  const TOKEN_MAP = {
    'stocks': 'stock', 'shares': 'stock', 'market': 'stock',
    'plunge': 'drop', 'plunged': 'drop', 'falls': 'drop', 'falling': 'drop', 'slide': 'drop', 'slump': 'drop',
    'rise': 'gains', 'rising': 'gains', 'jump': 'gains', 'soar': 'gains', 'surges': 'gains',
    'bill': 'law', 'legislation': 'law', 'act': 'law',
    'cops': 'police', 'officers': 'police',
    'poll': 'survey',
    'talks': 'meet', 'meeting': 'meet', 'summit': 'meet',
    'deaths': 'dead', 'killed': 'dead', 'dies': 'dead', 'fatal': 'dead',
    'cuts': 'cut', 'cutting': 'cut'
  };

  const normalize = (title) => {
    // 1. Strip Prefixes (Leading "Breaking:", "Live:")
    let clean = title.replace(/^(breaking|live|opinion|analysis):\s*/i, '');

    // V119.0: Entity Extraction (Capitalized words)
    // We do this BEFORE lowercasing. 
    // We look for words that start with Uppercase, but are NOT the first word of the title (to avoid false positives from sentence case),
    // UNLESS the title is fully capitalized.

    // Remove non-alphanumeric chars for entity extraction to avoid "Biden," "Apple's"
    const rawEntities = clean.replace(/[^\w\s]/g, ' ').split(/\s+/);
    const entities = new Set();

    rawEntities.forEach((w, index) => {
      if (w.length < 2) return;
      // Simple logic: if it's capitalized
      if (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) {
        const lowerW = w.toLowerCase();
        if (HARD_STOP_WORDS.has(lowerW)) return; // Skip "The", "A", "In" even if capitalized
        entities.add(lowerW); // Store as lowercase for easier comparison
      }
    });

    const raw = clean.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // V118.8: Replace punctuation with SPACE, don't delete (Spider-Man -> spider man)
      .split(/\s+/) // Split on any whitespace
      .slice(0, 15); // V118.8: Increased cap to 15 to catch more context

    const tokens = [];
    for (const w of raw) {
      if (w.length < 2) continue; // Allow 2-letter words (US, AI)
      if (HARD_STOP_WORDS.has(w)) continue;
      tokens.push(TOKEN_MAP[w] || w);
    }

    // Soft stop words only removed for longer titles (>5 tokens)
    let finalTokens;
    if (tokens.length > 5) {
      finalTokens = new Set(tokens.filter(w => !SOFT_STOP_WORDS.has(w)));
    } else {
      finalTokens = new Set(tokens);
    }

    return { tokens: finalTokens, entities: entities };
  };

  const a = normalize(titleA);
  const b = normalize(titleB);

  // Base Jaccard on TOKENS
  if (a.tokens.size === 0 || b.tokens.size === 0) return { score: 0, minTokens: 0 };

  const tokenIntersection = new Set([...a.tokens].filter(x => b.tokens.has(x)));
  const tokenUnion = new Set([...a.tokens, ...b.tokens]);
  let baseScore = tokenUnion.size === 0 ? 0 : tokenIntersection.size / tokenUnion.size;

  // V119.0: Entity Bonus
  // If we have at least one shared ENTITY, and the base score implies *some* relevance (> 0.1), give a boost.
  const entityIntersection = new Set([...a.entities].filter(x => b.entities.has(x)));

  if (entityIntersection.size > 0 && baseScore > 0.1) {
    // Bonus: +0.12 (The "Context Lever")
    baseScore += 0.12;
    // Cap at 1.0
    if (baseScore > 1.0) baseScore = 1.0;
  }

  return { score: baseScore, minTokens: Math.min(a.tokens.size, b.tokens.size) };
}

function groupArticles(items) {
  // 1. Hard Deduplication: Remove items with the exact same URL first
  const uniqueItems = [];
  const seenLinks = new Set();
  items.forEach(item => {
    if (!seenLinks.has(item.link)) {
      seenLinks.add(item.link);
      uniqueItems.push(item);
    }
  });

  const clusters = [];

  // Reset Stats
  CLUSTER_STATS.compared = 0; CLUSTER_STATS.matched = 0; CLUSTER_STATS.rejectedByThreshold = 0; CLUSTER_STATS.rejectedByTime = 0;

  uniqueItems.forEach(newItem => {
    let matchIdx = -1;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const existing = clusters[i];
      const target = existing.type === 'cluster' ? existing.primaryItem : existing;

      CLUSTER_STATS.compared++;

      if (Math.abs(new Date(newItem.date) - new Date(target.date)) > TIME_WINDOW) {
        CLUSTER_STATS.rejectedByTime++;
        break;
      }

      const result = getJaccardSimilarity(newItem.title, target.title);
      const effectiveThreshold = result.minTokens <= 5 ? SHORT_THRESHOLD : BASE_THRESHOLD;
      if (result.minTokens <= 5) CLUSTER_STATS.shortTitleBoosts++;

      if (result.score >= effectiveThreshold) {
        // Source Guard: Same source requires higher match, but lowered to 0.40 (was 0.45)
        if (newItem.source === target.source && result.score < 0.40) {
          CLUSTER_STATS.rejectedByThreshold++;
          continue;
        }

        CLUSTER_STATS.matched++;
        matchIdx = i;
        break;
      } else {
        CLUSTER_STATS.rejectedByThreshold++;
      }
    }

    if (matchIdx >= 0) {
      const match = clusters[matchIdx];
      if (match.type === 'cluster') {
        match.relatedItems.push(newItem);
      } else {
        clusters[matchIdx] = {
          type: 'cluster',
          primaryItem: match,
          relatedItems: [newItem],
          date: match.date,
          source: match.source,
          link: match.link,
          title: match.title,
          desc: match.desc // Preservation for UI
        };
      }
    } else if (matchIdx === -1) {
      clusters.push(newItem);
    }
  });

  logToFile(`[Clustering Stats] Compared: ${CLUSTER_STATS.compared}, Matches: ${CLUSTER_STATS.matched}, Time Rejects: ${CLUSTER_STATS.rejectedByTime}, Score Rejects: ${CLUSTER_STATS.rejectedByThreshold}, Short Boosts: ${CLUSTER_STATS.shortTitleBoosts}`);
  return clusters;
}

// Helper: Render Header (V145.0 Retry)
async function renderReaderHeader(scriptUrl, page, searchTerm, returnSource, headerTitle, headerSubText, showUnreadOnly, pulseTagsList, heatThreshold, category, queryParams) {
  // Pulse Pills HTML Generation
  const pulseHtml = pulseTagsList.map(([tag, count]) => {
    const isHot = count >= heatThreshold;
    return `<div onclick="setPulseSearch('${tag}')" class="pulse-pill bg-slate-800/40 border ${isHot ? 'border-blue-500/50' : 'border-slate-700'} px-3 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
          <span class="text-[11px] font-bold text-blue-400">${isHot ? '🔥 ' : ''}${tag}</span>
          <span class="text-[10px] bg-slate-700 text-slate-400 px-1.5 rounded-md font-bold">${count}</span>
        </div>`;
  }).join('');

  // Action Menu "Return" Button Logic
  let returnBtnHtml = '';
  if (category === 'BOOKMARKS' || category === 'FAVORITES') {
    const p = queryParams.prevCat;
    const validP = (p && p !== "FAVORITES" && p !== "BOOKMARKS" && p !== "READ LATER") ? p : returnSource;
    returnBtnHtml = `<div onclick="window.location.href='${scriptUrl}?cat=${encodeURIComponent(validP)}'" class="menu-item"><span class="material-icons-round text-blue-400">arrow_back</span><span>Return</span></div>`;
  }

  return `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/><style>
  body { font-family: ui-sans-serif; background-color: #0f172a; color: #f1f5f9; -webkit-user-select: none; scroll-behavior: smooth; } 
  .glass { backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid #1e293b; } 
  .hidden-card { display: none !important; }
  .highlight-card { border: 1.5px solid #3b82f6 !important; box-shadow: 0 0 12px rgba(59, 130, 246, 0.15); }
  .pulse-pill { scroll-snap-align: start; flex-shrink: 0; }
  .bulk-check { -webkit-appearance: none; width: 22px; height: 22px; border: 1.5px solid #475569; border-radius: 6px; position: relative; }
  .bulk-check:checked { background-color: #2563eb; border-color: #2563eb; }
  .bulk-check:checked::after { content: 'check'; font-family: 'Material Icons Round'; position: absolute; color: white; font-size: 16px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  #actionMenu { display: none; position: fixed; top: 55px; right: 20px; width: 200px; border-radius: 12px; overflow: hidden; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.2); border: 1px solid #334155; background: #1e293b; }
  .menu-item { padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 1px solid #334155; }
</style></head>
<body class="pb-32">
  <header class="fixed top-0 left-0 right-0 z-40 glass">
    <div class="px-5 pt-3 pb-2 flex justify-between items-center">
      <div onclick="window.location.href='${scriptUrl}?state=MENU&search=' + encodeURIComponent(document.getElementById('searchInput').value) + '&page=${page}&prevCat=' + encodeURIComponent('${returnSource}')">
        <h1 class="text-[14px] font-bold tracking-widest uppercase text-blue-500">${headerTitle} ▼</h1>
        <span id="headerSub" class="text-[12px] uppercase font-medium ${showUnreadOnly ? 'text-blue-400' : 'text-red-500 font-bold'}">${headerSubText}</span>
      </div>
      <div class="flex gap-4 items-center">
        <button id="playBtn" onclick="playAll()" class="p-1"><span class="material-icons-round text-blue-500">play_circle</span></button>
        <button onclick="toggleMenu(event)" class="p-1"><span class="material-icons-round ${showUnreadOnly ? 'text-slate-500' : 'text-red-500'}">more_vert</span></button>
      </div>
    </div>
    <div class="px-4 pb-2 relative">
      <div class="relative flex items-center">
        <span class="material-icons-round absolute left-3 text-slate-500 text-sm">search</span>
        <input type="search" id="searchInput" oninput="debouncedFilter()" value="${searchTerm}" placeholder="Search for topics or -exclude keywords" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 pl-10 pr-10 text-[15px] focus:outline-none focus:border-blue-500 text-slate-100">
        <span id="clearSearch" onclick="clearSearchBar()" class="material-icons-round absolute right-3 text-slate-400 text-sm cursor-pointer ${searchTerm ? '' : 'hidden'}">close</span>
      </div>
    </div>
    <div class="flex overflow-x-auto px-4 pb-3 gap-2 no-scrollbar" style="scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;">
      ${pulseHtml}
    </div>
  </header>

  <div id="actionMenu">
    ${returnBtnHtml}
    <div onclick="window.location.href='${scriptUrl}?cat=FAVORITES&prevCat=${encodeURIComponent(category)}&prevPage=${page}'" class="menu-item"><span class="material-icons-round text-yellow-400">star</span><span>Favorites</span></div>
    <div onclick="window.location.href='${scriptUrl}?cat=BOOKMARKS&prevCat=${encodeURIComponent(category)}&prevPage=${page}'" class="menu-item"><span class="material-icons-round text-orange-500">bookmark</span><span>Read Later</span></div>
    <div onclick="window.location.href='${scriptUrl}?toggleUnread=true&search=' + encodeURIComponent(document.getElementById('searchInput').value) + '&page=${page}&prevCat=' + encodeURIComponent('${returnSource}')" class="menu-item"><span class="material-icons-round text-blue-500">visibility</span><span>${showUnreadOnly ? 'Show All' : 'Unread Only'}</span></div>
    <div onclick="openTagEditor()" class="menu-item"><span class="material-icons-round text-green-400">label</span><span>Tag Editor</span></div>
    <div onclick="window.location.href='${scriptUrl}?state=MANAGER'" class="menu-item"><span class="material-icons-round text-orange-400">tune</span><span>Manage Sources</span></div>
    <div onclick="window.location.href='${scriptUrl}?showLogs=true&page=${page}&prevCat=' + encodeURIComponent('${returnSource}')" class="menu-item"><span class="material-icons-round text-slate-500">bug_report</span><span>Debug Logs</span></div>
    <div onclick="window.location.href='${scriptUrl}?refresh=true&prevCat=' + encodeURIComponent('${returnSource}')" class="menu-item"><span class="material-icons-round text-slate-400">refresh</span><span>Refresh All</span></div>
  </div>`;

}

async function renderReader() {
  const lastVisit = fm.fileExists(VISIT_FILE) ? parseInt(fm.readString(VISIT_FILE)) : 0
  const isStale = (Date.now() - lastVisit) > (10 * 60 * 1000)

  // V118 Grace Period: Only auto-sync if stale AND we are on the Home Page (Page 1).
  // This prevents interrupting the user if they are deep in pagination (Page 2+).
  if (fm.listContents(CACHE_DIR).length === 0 || (isStale && PAGE === 1)) {
    await syncAllFeeds()
  }

  let CACHED_ITEMS = []
  if (CATEGORY === "BOOKMARKS") {
    CACHED_ITEMS = [...BOOKMARKS]; // Read Later - Raw List
  }
  else if (CATEGORY === "FAVORITES") {
    CACHED_ITEMS = [...FAVORITES]; // Perm Favorites
  }
  else if (CATEGORY === "ALL SOURCES") {
    // V118: Master File Optimization
    // Instead of reading 20 files, we read ONE master file.
    if (fm.fileExists(MASTER_FEED_FILE)) {
      try {
        CACHED_ITEMS = JSON.parse(fm.readString(MASTER_FEED_FILE))
      } catch (e) {
        // Fallback if master corrupt
        CACHED_ITEMS = []
        await syncAllFeeds()
        CACHED_ITEMS = JSON.parse(fm.readString(MASTER_FEED_FILE))
      }
    } else {
      await syncAllFeeds()
      CACHED_ITEMS = JSON.parse(fm.readString(MASTER_FEED_FILE))
    }
  } else {
    // Single Source Mode (Reads individual file)
    const path = fm.joinPath(CACHE_DIR, CATEGORY.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json")
    CACHED_ITEMS = fm.fileExists(path) ? JSON.parse(fm.readString(path)) : []
  }
  CACHED_ITEMS.sort((a, b) => new Date(b.date) - new Date(a.date))

  // DEBUGGING V117.4: FORCE Clusters to Top
  // This logic is moved inside renderReader later, but we need the sorting function here
  // to prioritize clusters for visibility.


  const pulseTags = (items) => {
    let rawCounts = {};
    let tagArticles = {}; // Track which articles match each tag
    const userExclusions = new Set(getTags(EXCLUSION_FILE));
    const userInclusions = getTags(INCLUSION_FILE);
    const blacklist = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Updated', 'New', 'News', 'Today', 'Breaking', 'Source', 'Photo', 'Video', 'Home', 'Page', 'Live', 'The', 'How', 'What', 'Why', 'Who', 'Where', 'When', 'This', 'That', 'And', 'But', 'For', 'With', 'From', 'Into', 'Their', 'Them', 'Your', 'They', 'Will', 'More', 'About', 'Annual', 'Transcript', 'Presents', 'Inc', 'Conference', 'Healthcare']);

    const pool = (SHOW_UNREAD_ONLY && CATEGORY !== "BOOKMARKS") ? items.filter(i => !READ_HISTORY.includes(i.link)) : items;

    pool.forEach(item => {
      let titleWork = item.title;
      const seenInThisItem = new Set();

      // Priority 1: User Inclusions (e.g., YouTube)
      userInclusions.forEach(phrase => {
        if (titleWork.toLowerCase().includes(phrase.toLowerCase())) {
          let masterKey = Object.keys(rawCounts).find(k => k.toLowerCase() === phrase.toLowerCase()) || phrase;
          rawCounts[masterKey] = (rawCounts[masterKey] || 0) + 1;
          seenInThisItem.add(masterKey.toLowerCase());
          // Track article for this tag
          if (!tagArticles[masterKey]) tagArticles[masterKey] = [];
          tagArticles[masterKey].push(item.link);
          // Remove to prevent regex from double-counting parts of the phrase
          titleWork = titleWork.replace(new RegExp(phrase, 'gi'), " ");
        }
      });

      // Priority 2: Standard Capitalization Logic
      const regex = /(([A-Z][a-z0-9]*\.)*[A-Z][a-z0-9.']+(\\s+([A-Z][a-z0-9]*\.)*[A-Z][a-z0-9.']+)*)/g;
      const matches = titleWork.match(regex) || [];
      matches.forEach(phrase => {
        let clean = phrase.trim().replace(/[.:,;]$/, "").replace(/'s$/i, "");

        // CHECK BLACKLIST FIRST (before pluralization) to prevent "This" → "Thi"
        if (blacklist.has(clean) || userExclusions.has(clean) || clean.length < 3) return;

        // THEN do pluralization
        let root = clean;
        if (clean.length > 3 && clean.toLowerCase().endsWith('s')) {
          if (clean.toLowerCase().endsWith('ies')) root = clean.slice(0, -3) + 'y';
          else if (!clean.toLowerCase().endsWith('ss')) root = clean.slice(0, -1);
        }
        const lowerRoot = root.toLowerCase();
        if (!seenInThisItem.has(lowerRoot)) {
          let masterKey = Object.keys(rawCounts).find(k => k.toLowerCase() === lowerRoot);
          if (masterKey) {
            rawCounts[masterKey]++;
            tagArticles[masterKey].push(item.link);
          } else {
            rawCounts[root] = 1;
            tagArticles[root] = [item.link];
          }
          seenInThisItem.add(lowerRoot);
        }
      });
    });
    return {
      tags: Object.entries(rawCounts).filter(e => e[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12),
      articles: tagArticles
    };
  };

  const pulseData = pulseTags(CACHED_ITEMS);
  const pulseTagsList = pulseData.tags;
  const pulseTagArticles = pulseData.articles;
  const heatThreshold = (CATEGORY === "ALL SOURCES") ? 8 : 4;

  let filteredPool = []

  // V118.1: If ALL SOURCES, items are ALREADY clustered in the file.
  if (CATEGORY === "ALL SOURCES") {
    let rawPool = (SHOW_UNREAD_ONLY && CATEGORY !== "BOOKMARKS") ? CACHED_ITEMS.filter(i => !READ_HISTORY.includes(i.link)) : CACHED_ITEMS;
    filteredPool = rawPool; // Data is already {type: 'cluster', ...}
    logToFile(`[Render] Using Pre-Clustered Master File: ${filteredPool.length} entities.`);
  } else {
    // V139.3: Lazy clustering cache for single sources
    // Avoids re-clustering on every view by caching clustered results
    const rawCachePath = fm.joinPath(CACHE_DIR, CATEGORY.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
    const clusteredCachePath = fm.joinPath(CACHE_DIR, CATEGORY.replace(/[^a-z0-9]/gi, '_').toLowerCase() + "_clustered.json");

    // Check if clustered cache is valid (newer than raw source)
    let useCache = false;
    if (fm.fileExists(clusteredCachePath) && fm.fileExists(rawCachePath)) {
      const rawModTime = fm.modificationDate(rawCachePath).getTime();
      const clusteredModTime = fm.modificationDate(clusteredCachePath).getTime();
      useCache = clusteredModTime > rawModTime; // Cache valid if newer than source
    }

    if (useCache) {
      // FAST PATH: Load pre-clustered data from cache
      logToFile(`[Render] Using Cached Clustered Results for ${CATEGORY}`);
      // V139.4: Fixed missing await - getJsonFile is async
      const cached = await getJsonFile(clusteredCachePath);
      filteredPool = Array.isArray(cached) ? cached : [];

      // Apply unread filter to already-clustered entities
      if (SHOW_UNREAD_ONLY && CATEGORY !== "BOOKMARKS") {
        filteredPool = filteredPool.filter(entity => {
          if (entity.type === 'cluster') {
            const mainUnread = !READ_HISTORY.includes(entity.link);
            const hasUnreadRelated = entity.relatedItems && entity.relatedItems.some(r => !READ_HISTORY.includes(r.link));
            return mainUnread || hasUnreadRelated;
          } else {
            return !READ_HISTORY.includes(entity.link);
          }
        });
      }
    } else {
      // SLOW PATH: Cluster from scratch and save to cache
      logToFile(`[Render] Clustering ${CATEGORY} and caching...`);

      // Apply unread filter to raw articles before clustering (for display)
      let rawPool = (SHOW_UNREAD_ONLY && CATEGORY !== "BOOKMARKS") ? CACHED_ITEMS.filter(i => !READ_HISTORY.includes(i.link)) : CACHED_ITEMS;
      filteredPool = groupArticles(rawPool);

      // Save FULL clustered dataset to cache (unfiltered for reusability)
      const fullClustered = groupArticles(CACHED_ITEMS);
      fm.writeString(clusteredCachePath, JSON.stringify(fullClustered));
    }

    // Natural Sort
    if (Array.isArray(filteredPool)) {
      filteredPool.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  const totalCount = filteredPool.length;
  const startIdx = (PAGE - 1) * ITEMS_PER_PAGE;
  const returnSource = fm.fileExists(PREV_CAT_FILE) ? fm.readString(PREV_CAT_FILE) : "ALL SOURCES";
  const newCutoff = getNewCutoffMs();

  // V119.5: Simple Layout (Requested)
  // 1. Title gets the %.
  // 2. Subtitle gets the count.

  let headerTitle = CATEGORY === 'BOOKMARKS' ? 'READ LATER' : CATEGORY;
  let headerSubText = `${filteredPool.length} Items`; // Reset to simple
  let clusterHtml = '';

  if (CATEGORY === "ALL SOURCES") {
    let totalArticles = 0;
    let clusteredArticles = 0;
    filteredPool.forEach(item => {
      if (item.type === 'cluster') {
        const groupSize = 1 + item.relatedItems.length;
        totalArticles += groupSize;
        clusteredArticles += groupSize;
      } else {
        totalArticles += 1;
      }
    });

    if (totalArticles > 0) {
      const percent = Math.round((clusteredArticles / totalArticles) * 100);
      clusterHtml = `<span class="text-[10px] text-slate-200 font-bold ml-1 opacity-90">(${percent}% Clustered)</span>`;
    }
  }

  let html = await renderReaderHeader(scriptUrl, PAGE, SEARCH_TERM, returnSource, headerTitle, headerSubText, SHOW_UNREAD_ONLY, pulseTagsList, heatThreshold, CATEGORY, args.queryParameters);

  html += `<main id="newsContainer" class="pt-44 px-4 space-y-3">


  ${filteredPool.map((item, idx) => {
    // Headers removed for Split Source UI 
    const header = '';

    // V145.2 Fix: Filter children BEFORE deciding card type
    let validChildren = [];
    if (item.type === 'cluster') {
      const raw = item.relatedItems || [];
      if (SHOW_UNREAD_ONLY && CATEGORY !== 'BOOKMARKS') {
        validChildren = raw.filter(r => !READ_HISTORY.includes(r.link));
      } else {
        validChildren = raw;
      }
    }

    if (item.type === 'cluster' && validChildren.length > 0) {
      // CLUSTER CARD RENDERING
      const p = item.primaryItem;
      const count = validChildren.length;
      // V144.2 Fix: Never dim items in Read Later (Bookmarks) view
      const hasRead = READ_HISTORY.includes(p.link) && CATEGORY !== 'BOOKMARKS';
      const isSaved = BOOKMARKS.some(b => b.link === p.link);
      const isFav = FAVORITES.some(f => f.link === p.link);
      const isNew = (new Date() - new Date(p.date)) < newCutoff;

      // V144.3: Child Save Indication (Correct Block)
      const isChildSaved = validChildren.some(r => BOOKMARKS.some(b => b.link === r.link));
      const viewCoverageColor = isChildSaved ? 'text-orange-500 font-bold' : 'text-indigo-400';

      // Aggregate Sources (Use validChildren)
      const sources = [p.source, ...validChildren.map(r => r.source)];
      const uniqueSources = [...new Set(sources)];
      const sourceLabel = uniqueSources.length > 1 ? `${uniqueSources.length} SOURCES` : p.source;

      return header + `<article class="news-card relative bg-[#1e293b] rounded-xl border border-indigo-500/80 shadow-lg transition-all ${hasRead ? 'opacity-40' : ''}" data-search="${escapeHtml(p.title.toLowerCase())}" data-link="${p.link}" data-title="${escapeHtml(p.title)}" data-source="${escapeHtml(p.source)}" data-date="${p.date}" data-desc="${escapeHtml(p.desc || '')}" data-related-links="${encodeURIComponent(JSON.stringify(validChildren.map(r => r.link)))}" data-related-items="${encodeURIComponent(JSON.stringify(validChildren))}" data-index="${idx}" ontouchstart="handleTouchStart(event)" ontouchend="handleSwipe(event, this)">
          <div class="absolute top-4 right-4 z-10"><input type="checkbox" class="bulk-check parent-check" onchange="updateBulkBar()"></div>
          <div class="px-4 pt-4 pb-2">
            <div class="flex justify-between items-baseline mb-1.5">
              <div class="flex items-center gap-2">
                 <span class="text-[12px] font-bold uppercase text-blue-400">${escapeHtml(sourceLabel)}</span>
                 ${isNew ? '<span class="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-black tracking-tighter">NEW</span>' : ''}
              </div>
              <span class="text-[12px] font-medium text-slate-400 uppercase mr-10">${formatDateTime(p.date)}</span>
            </div>
            <h2 class="text-[15px] font-semibold leading-tight text-slate-100 pr-10 cursor-pointer" onclick="window.location.href='${scriptUrl}?externalLink=${encodeURIComponent(p.link)}${searchParam}&page=${PAGE}'">${escapeHtml(p.title)}</h2>
            
            <div class="flex items-center justify-between pb-3 mt-3 border-b border-slate-700/50">
              <div class="flex gap-6">
                <div onclick="event.stopPropagation(); executeAction(this, '${hasRead ? 'uncheck' : 'listen'}')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${hasRead ? 'text-blue-500' : 'text-slate-400'}">${hasRead ? 'check_circle' : 'volume_up'}</span><span class="text-[12px] font-bold uppercase ${hasRead ? 'text-blue-500' : 'text-slate-400'}">${hasRead ? 'Done' : 'Listen'}</span></div>
                <div onclick="event.stopPropagation(); executeAction(this, 'summarize')" class="flex items-center gap-1.5"><span class="material-icons-round text-base text-slate-400">auto_awesome</span><span class="text-[12px] font-bold uppercase text-slate-400">AI</span></div>
                <div onclick="event.stopPropagation(); executeAction(this, 'bookmark')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${isSaved ? 'text-orange-500' : 'text-slate-400'}">${isSaved ? 'bookmark' : 'bookmark_border'}</span><span class="text-[10px] font-bold uppercase ${isSaved ? 'text-orange-500' : 'text-slate-400'} whitespace-nowrap">Read Later</span></div>
                <div onclick="event.stopPropagation(); executeAction(this, 'favorite')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${isFav ? 'text-yellow-400' : 'text-slate-400'}">${isFav ? 'star' : 'star_border'}</span><span class="text-[12px] font-bold uppercase ${isFav ? 'text-yellow-400' : 'text-slate-400'}">Fav</span></div>
              </div>
              <div class="text-slate-400 p-1 shrink-0"><a href="${scriptUrl}?externalLink=${encodeURIComponent(p.link)}${searchParam}&page=${PAGE}" class="material-icons-round text-xl">link</a></div>
            </div>
            
            <!-- Accordion Details (Moved to Bottom) -->
            <details class="group mt-2">
                <summary class="list-none cursor-pointer text-[11px] ${viewCoverageColor} uppercase tracking-wide flex items-center gap-1">
                   <span>View Coverage (+${count} Articles)</span>
                   <span class="material-icons-round text-sm transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div class="mt-2 space-y-3 pt-1">
                   ${validChildren.map(r => {
        // Check specific child match
        const isChildThisSaved = BOOKMARKS.some(b => b.link === r.link);
        const childTitleColor = isChildThisSaved ? 'text-orange-400' : 'text-slate-400';

        return `<div class="flex justify-between items-center gap-3">
                       <input type="checkbox" class="bulk-check child-check shrink-0 w-4 h-4 border-slate-600 rounded" data-link="${r.link}" data-title="${escapeHtml(r.title)}" data-source="${escapeHtml(r.source)}" data-date="${r.date}" onchange="updateBulkBar()">
                       <div class="flex-1 min-w-0">
                         <div class="flex items-baseline justify-between">
                           <span class="text-[11px] font-bold text-slate-300 truncate">${escapeHtml(r.source)}</span>
                           <span class="text-[10px] text-slate-500 whitespace-nowrap ml-2">${formatDateTime(r.date).split('•')[1] || ''}</span>
                         </div>
                         <div class="text-[12px] ${childTitleColor} truncate leading-snug cursor-pointer" onclick="window.location.href='${scriptUrl}?externalLink=${encodeURIComponent(r.link)}${searchParam}&page=${PAGE}'">${escapeHtml(r.title)}</div>
                       </div>
                     </div>`;
      }).join('')}
                </div>
            </details>
          </div>
        </article>`
    }

    // STANDARD ITEM RENDERING (Fallback)
    // If it was a cluster but downgraded (validChildren.length == 0), 'item' is the cluster object (primary data)
    // and we proceed here.
    const hasRead = READ_HISTORY.includes(item.link) && CATEGORY !== 'BOOKMARKS';
    const isSaved = BOOKMARKS.some(b => b.link === item.link);

    // V144.1: Child Save Indication (for standard items that happen to have relatedLinks from RSS, rare but possible)
    let isChildSaved = false;
    if (item.relatedLinks) {
      try {
        const children = JSON.parse(decodeURIComponent(item.relatedLinks));
        isChildSaved = children.some(link => BOOKMARKS.some(b => b.link === link));
      } catch (e) { }
    }

    const isFav = FAVORITES.some(f => f.link === item.link);
    const isNew = (new Date() - new Date(item.date)) < newCutoff;
    const showSave = CATEGORY !== 'FAVORITES';
    const bookmarkIcon = isSaved ? 'bookmark' : 'bookmark_border';
    const bookmarkColor = (isSaved || isChildSaved) ? 'text-orange-500' : 'text-slate-400';
    const bookmarkLabelColor = (isSaved || isChildSaved) ? 'text-orange-500' : 'text-slate-400';

    return header + `<article class="news-card relative bg-[#1e293b] rounded-xl border border-slate-800 transition-all ${hasRead ? 'opacity-40' : ''}" data-search="${escapeHtml(item.title.toLowerCase())}" data-link="${item.link}" data-title="${escapeHtml(item.title)}" data-source="${escapeHtml(item.source)}" data-date="${item.date}" data-desc="${escapeHtml(item.desc || '')}" data-related-links="${item.relatedLinks || ''}" data-index="${idx}" ontouchstart="handleTouchStart(event)" ontouchend="handleSwipe(event, this)">
      <div class="absolute top-4 right-4 z-10"><input type="checkbox" class="bulk-check parent-check" onchange="updateBulkBar()"></div>
      <div class="px-4 pt-4 pb-2">
        <div class="flex justify-between items-baseline mb-1.5">
          <div class="flex items-center gap-2"><span class="text-[12px] font-bold uppercase text-blue-500">${escapeHtml(item.source)}</span>${isNew ? '<span class="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-black tracking-tighter">NEW</span>' : ''}</div>
          <span class="text-[12px] font-medium text-slate-400 uppercase mr-10">${formatDateTime(item.date)}</span>
        </div>
        <h2 class="text-[15px] font-semibold leading-tight text-slate-100 pr-10 cursor-pointer" onclick="window.location.href='${scriptUrl}?externalLink=${encodeURIComponent(item.link)}${searchParam}&page=${PAGE}'">${escapeHtml(item.title)}</h2>
        <p class="text-[13px] text-slate-400 mt-1 leading-snug line-clamp-2 pr-4">${escapeHtml(item.desc || '')}</p>
        <div class="flex items-center justify-between pt-2 mt-2 border-t border-slate-800/50">
          <div class="flex gap-6">
            <div onclick="event.stopPropagation(); executeAction(this, '${hasRead ? 'uncheck' : 'listen'}')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${hasRead ? 'text-blue-500' : 'text-slate-400'}">${hasRead ? 'check_circle' : 'volume_up'}</span><span class="text-[12px] font-bold uppercase ${hasRead ? 'text-blue-500' : 'text-slate-400'}">${hasRead ? 'Done' : 'Listen'}</span></div>
            <div onclick="event.stopPropagation(); executeAction(this, 'summarize')" class="flex items-center gap-1.5"><span class="material-icons-round text-base text-slate-400">auto_awesome</span><span class="text-[12px] font-bold uppercase text-slate-400">AI</span></div>
            <div onclick="event.stopPropagation(); executeAction(this, 'bookmark')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${bookmarkColor}">${bookmarkIcon}</span><span class="text-[10px] font-bold uppercase ${bookmarkLabelColor} whitespace-nowrap">Read Later</span></div>
            <div onclick="event.stopPropagation(); executeAction(this, 'favorite')" class="flex items-center gap-1.5"><span class="material-icons-round text-base ${isFav ? 'text-yellow-400' : 'text-slate-400'}">${isFav ? 'star' : 'star_border'}</span><span class="text-[12px] font-bold uppercase ${isFav ? 'text-yellow-400' : 'text-slate-400'}">Fav</span></div>
          </div>
          <div class="text-slate-400 p-1 shrink-0"><a href="${scriptUrl}?externalLink=${encodeURIComponent(item.link)}${searchParam}&page=${PAGE}" class="material-icons-round text-xl">link</a></div>
        </div>
      </div>
    </article>`}).join('')}

    <div id="paginationControls" class="flex justify-center items-center gap-3 pb-4 pt-8 text-slate-500">
      ${(() => {
      const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
      if (totalPages <= 1) return '';

      let pages = [];

      // Home button (first page)
      pages.push(PAGE > 1
        ? `<a href="${scriptUrl}?page=1${searchParam}" class="material-icons-round text-xl text-slate-400 hover:text-blue-500">first_page</a>`
        : `<span class="material-icons-round text-xl opacity-20">first_page</span>`
      );

      // Previous button
      pages.push(PAGE > 1
        ? `<a href="${scriptUrl}?page=${PAGE - 1}${searchParam}" class="material-icons-round text-2xl">chevron_left</a>`
        : `<span class="material-icons-round text-2xl opacity-20">chevron_left</span>`
      );

      // Page numbers with smart ellipsis
      const maxVisible = 5;
      let startPage, endPage;

      if (totalPages <= maxVisible) {
        // Show all pages
        startPage = 1;
        endPage = totalPages;
      } else {
        // Smart windowing
        if (PAGE <= 3) {
          startPage = 1;
          endPage = maxVisible;
        } else if (PAGE >= totalPages - 2) {
          startPage = totalPages - maxVisible + 1;
          endPage = totalPages;
        } else {
          startPage = PAGE - 2;
          endPage = PAGE + 2;
        }
      }

      // Leading ellipsis
      if (startPage > 1) {
        pages.push('<span class="text-slate-600">...</span>');
      }

      // Page numbers
      for (let i = startPage; i <= endPage; i++) {
        if (i === PAGE) {
          pages.push(`<span class="px-2 py-1 text-sm font-bold text-blue-500">${i}</span>`);
        } else {
          pages.push(`<a href="${scriptUrl}?page=${i}${searchParam}" class="px-2 py-1 text-sm font-medium text-slate-400 hover:text-blue-500">${i}</a>`);
        }
      }

      // Trailing ellipsis
      if (endPage < totalPages) {
        pages.push('<span class="text-slate-600">...</span>');
      }

      // Next button
      pages.push(PAGE < totalPages
        ? `<a href="${scriptUrl}?page=${PAGE + 1}${searchParam}" class="material-icons-round text-2xl">chevron_right</a>`
        : `<span class="material-icons-round text-2xl opacity-20">chevron_right</span>`
      );

      return pages.join('');
    })()}
    </div>
    <div class="flex justify-center pb-12">
       <button onclick="selectAllVisible()" class="text-[10px] font-black uppercase text-white bg-blue-600 tracking-widest px-6 py-3 rounded-full hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/40">
          Select All Cards
       </button>
    </div>
  </main>
  <div id="floatUp" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" class="fixed bottom-6 right-6 glass border border-slate-700 rounded-full p-3 shadow-xl z-40 hidden transition-all duration-300 hover:bg-slate-800">
    <span class="material-icons-round text-blue-400 text-2xl">arrow_upward</span>
  </div>
  <div id="floatDown" onclick="window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})" class="fixed bottom-6 right-6 glass border border-slate-700 rounded-full p-3 shadow-xl z-40 hidden transition-all duration-300 hover:bg-slate-800">
    <span class="material-icons-round text-blue-400 text-2xl">arrow_downward</span>
  </div>
   <div id="bulkBar" class="fixed bottom-6 left-1/2 -translate-x-1/2 glass border border-slate-700 rounded-full px-6 py-3 hidden items-center gap-6 shadow-2xl z-50">
      <button onclick="playAll()" class="flex flex-col items-center"><span class="material-icons-round text-blue-500">volume_up</span><span class="text-[9px] uppercase font-bold text-blue-500">Listen</span></button>
      <button onclick="bulkSummarize()" class="flex flex-col items-center"><span class="material-icons-round text-purple-400">auto_awesome</span><span class="text-[9px] uppercase font-bold text-purple-400">AI</span></button>
      <button onclick="bulkBookmark()" class="flex flex-col items-center"><span class="material-icons-round text-orange-500">bookmark</span><span class="text-[9px] uppercase font-bold text-orange-500">Save</span></button>
      <button onclick="bulkRead()" class="flex flex-col items-center"><span class="material-icons-round text-green-500">check_circle</span><span class="text-[9px] uppercase font-bold text-green-500">Read</span></button>
      <button onclick="bulkFav()" class="flex flex-col items-center"><span class="material-icons-round text-yellow-500">star</span><span class="text-[9px] uppercase font-bold text-yellow-500">Fav</span></button>
      <button onclick="clearSelection()" class="material-icons-round text-slate-400">close</button>
   </div>
<script>
  let xDown = null, yDown = null;
  const START_IDX = ${startIdx}; const BASE_TOTAL = ${totalCount}; const CLUSTER_HTML = \`${clusterHtml}\`;
  
  function toggleMenu(e) { e.stopPropagation(); const m = document.getElementById('actionMenu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; }
  window.addEventListener('click', () => { document.getElementById('actionMenu').style.display = 'none'; });
  function setPulseSearch(tag) { document.getElementById('searchInput').value = tag; filterNews(); }
  function openTagEditor(targetMode, explicitPage) {
    const pulseData = encodeURIComponent(JSON.stringify(${JSON.stringify(pulseTagsList)}));
    const mode = targetMode || 'exclude';
    const p = explicitPage || ${PAGE};
    window.location.href = '${scriptUrl}?state=TAG_EDITOR&mode=' + mode + '&pulseTags=' + pulseData + '&page=' + p;
  }
  function handleTouchStart(evt) { xDown = evt.touches[0].clientX; yDown = evt.touches[0].clientY; }
  function handleSwipe(evt, el) { if (!xDown || !yDown) return; let xDiff = xDown - evt.changedTouches[0].clientX; let yDiff = yDown - evt.changedTouches[0].clientY; if (Math.abs(xDiff) > 80 && Math.abs(xDiff) > Math.abs(yDiff)) executeAction(el, xDiff > 0 ? 'bookmark' : 'check'); xDown = null; yDown = null; }
  function executeAction(el, type) { 
    const card = el.closest('.news-card'); 
    
    // V148.0: Intercept Summary for Menu
    if (type === 'summarize') {
        showSummaryMenu(card.dataset.link, card.dataset.relatedLinks);
        return;
    }

    const search = encodeURIComponent(document.getElementById('searchInput').value); 
    let extra = '';
    if ((type === 'listen' || type === 'bookmark') && card.dataset.relatedLinks) {
       extra = '&readLinks=' + card.dataset.relatedLinks;
    }
    const params = 'search=' + search + '&page=${PAGE}&title=' + encodeURIComponent(card.dataset.title) + '&source=' + encodeURIComponent(card.dataset.source) + '&date=' + encodeURIComponent(card.dataset.date) + '&desc=' + encodeURIComponent(card.dataset.desc); 
    window.location.href = '${scriptUrl}?' + type + '=' + encodeURIComponent(card.dataset.link) + '&' + params + extra; 
  }

  // V148.1: Smart Summary Menu (Refactored for Reliability)
  function showSummaryMenu(link, relatedLinks) {
      const existing = document.getElementById('summaryMenuOverlay');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.id = 'summaryMenuOverlay';
      menu.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm';
      
      // We store the data on the menu itself to avoid passing it through HTML strings
      menu.dataset.link = link;
      menu.dataset.related = relatedLinks || '';

      menu.innerHTML = \`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-[85%] max-w-sm shadow-2xl transform scale-100 transition-all">
           <h3 class="text-xl font-black text-white mb-2 uppercase tracking-tight">AI Summary Mode</h3>
           <p class="text-slate-400 text-xs mb-6">Choose how you want to listen to this article.</p>
           
           <div class="space-y-3">
              <button data-mode="full" class="summary-btn w-full flex items-center justify-between p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-colors group">
                 <div class="text-left">
                    <div class="text-blue-400 font-bold text-sm uppercase">Full Audio</div>
                    <div class="text-slate-500 text-[10px]">Read the entire article text</div>
                 </div>
                 <span class="material-icons-round text-blue-500">volume_up</span>
              </button>

              <button data-mode="half" class="summary-btn w-full flex items-center justify-between p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-purple-500 transition-colors group">
                 <div class="text-left">
                    <div class="text-purple-400 font-bold text-sm uppercase">Smart Summary</div>
                    <div class="text-slate-500 text-[10px]">Concise 50% length (AI Generated)</div>
                 </div>
                 <span class="material-icons-round text-purple-500">auto_awesome</span>
              </button>

               <button data-mode="short" class="summary-btn w-full flex items-center justify-between p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-green-500 transition-colors group">
                 <div class="text-left">
                    <div class="text-green-400 font-bold text-sm uppercase">Quick Recap</div>
                    <div class="text-slate-500 text-[10px]">Super short 30% overview</div>
                 </div>
                 <span class="material-icons-round text-green-500">bolt</span>
              </button>
           </div>
           
           <button id="closeSummaryMenu" class="mt-6 w-full py-3 text-slate-500 font-bold uppercase text-xs hover:text-white">Cancel</button>
        </div>
      \`;
      document.body.appendChild(menu);

      // Attach Event Listeners Safely (No Inline JS)
      document.querySelectorAll('.summary-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
              e.stopPropagation(); // Stop bubbling
              const mode = btn.dataset.mode;
              triggerSummary(menu.dataset.link, menu.dataset.related, mode);
          });
      });

      document.getElementById('closeSummaryMenu').addEventListener('click', () => {
          menu.remove();
      });
  }

  function triggerSummary(link, relatedLinks, mode) {
      const menu = document.getElementById('summaryMenuOverlay');
      if (menu) menu.remove();
      
      const search = encodeURIComponent(document.getElementById('searchInput').value);
      let extra = '';
      if (relatedLinks && relatedLinks !== 'undefined' && relatedLinks !== 'null' && relatedLinks !== '') {
          extra = '&readLinks=' + relatedLinks;
      }
      // Pass the MODE to the script
      window.location.href = '${scriptUrl}?summarize=' + encodeURIComponent(link) + '&mode=' + mode + '&search=' + search + '&page=${PAGE}' + extra;
  }
  
  // V140.1: Debounce search input - immediate UI feedback, delayed filtering
  let searchDebounceTimer = null;
  function debouncedFilter() {
    // Immediate feedback: show/hide clear button
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearSearch');
    if (query) { clearBtn.classList.remove('hidden'); } else { clearBtn.classList.add('hidden'); }
    
    // Debounced: actual card filtering after 300ms
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(filterNews, 300);
  }
  
  function filterNews() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.news-card');
    const pagControls = document.getElementById('paginationControls');
    const headerSub = document.getElementById('headerSub');
    if (!query) { cards.forEach(card => { const idx = parseInt(card.dataset.index); card.classList.toggle('hidden-card', !(idx >= START_IDX && idx < START_IDX + 25)); card.classList.remove('highlight-card'); }); pagControls.style.display = 'flex'; headerSub.innerHTML = BASE_TOTAL + " Items " + CLUSTER_HTML; return; }
    pagControls.style.display = 'none'; const terms = query.split(/\\s+/); const includes = terms.filter(t => !t.startsWith('-')); const excludes = terms.filter(t => t.startsWith('-')).map(t => t.substring(1));
    let visibleCount = 0;
    cards.forEach(card => {
      const text = card.dataset.search;
      const isMatch = includes.every(term => { const escaped = term.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); const regex = new RegExp('(\\\\b|\\\\s|^)' + escaped + '(s)?(\\\\b|\\\\s|$)', 'i'); return regex.test(text); }) && !excludes.some(term => { const escaped = term.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); const regex = new RegExp('(\\\\b|\\\\s|^)' + escaped + '(s)?(\\\\b|\\\\s|$)', 'i'); return regex.test(text); });
      card.classList.toggle('hidden-card', !isMatch); card.classList.toggle('highlight-card', isMatch && includes.length > 0); if (isMatch) visibleCount++;
    });
    headerSub.innerText = visibleCount + " Matches";
  }
  
  // Floating Buttons Scroll Logic
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    const upBtn = document.getElementById('floatUp');
    const downBtn = document.getElementById('floatDown');
    
    // Threshold to start showing controls (150px)
    if (currentScroll < 150) {
      upBtn.classList.add('hidden');
      downBtn.classList.add('hidden');
      lastScroll = currentScroll;
      return;
    }
    
    // Check if at bottom (allow 50px buffer)
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 50) {
       downBtn.classList.add('hidden');
       upBtn.classList.remove('hidden');
       lastScroll = currentScroll;
       return;
    }

    if (currentScroll > lastScroll) {
       // Scrolling Down
       upBtn.classList.add('hidden');
       downBtn.classList.remove('hidden');
    } else {
       // Scrolling Up
       downBtn.classList.add('hidden');
       upBtn.classList.remove('hidden');
    }
    lastScroll = currentScroll <= 0 ? 0 : currentScroll;
  });

  function selectAllVisible() {
    const cards = document.querySelectorAll('.news-card:not(.hidden-card)');
    cards.forEach(card => {
        const inputs = card.querySelectorAll('.bulk-check');
        inputs.forEach(i => i.checked = true);
    });
    updateBulkBar();
    // Scroll to bottom so user sees the bulk bar
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function updateBulkBar() { const checked = document.querySelectorAll('.bulk-check:checked'); const bar = document.getElementById('bulkBar'); if (checked.length > 0) { bar.classList.remove('hidden'); bar.classList.add('flex'); } else { bar.classList.add('hidden'); bar.classList.remove('flex'); } }
  
  // V143.0 Refactor: Consolidated Bulk Logic
  function collectBulkSelection() {
    const checked = Array.from(document.querySelectorAll('.bulk-check:checked'));
    if (checked.length === 0) return [];

    let items = [];
    checked.forEach(cb => {
      const isChild = cb.classList.contains('child-check');
      const card = cb.closest('.news-card');
      const d = isChild ? cb.dataset : card.dataset;
      
      // Add the explicitly selected item
      items.push({
        link: d.link,
        title: d.title,
        source: d.source,
        date: d.date,
        isChild: isChild,
        relatedLinks: !isChild && card.dataset.relatedLinks ? card.dataset.relatedLinks : null
      });
    });
    return items;
  }

  function playAll() {
    const items = collectBulkSelection();
    if (items.length === 0) {
      // Fallback: If nothing checked, try to play all visible (legacy behavior)
      const visibleParents = Array.from(document.querySelectorAll('.news-card:not(.hidden-card) .bulk-check.parent-check'));
      visibleParents.forEach(cb => {
        const card = cb.closest('.news-card');
        items.push({ link: card.dataset.link, relatedLinks: card.dataset.relatedLinks });
      });
    }
    if (items.length === 0) return;

    let playUrls = [], readUrls = [];
    items.forEach(item => {
      playUrls.push(item.link);
      readUrls.push(item.link);
      // Nuke Cluster Logic: If Parent, mark related read too
      if (item.relatedLinks) try { readUrls = readUrls.concat(JSON.parse(decodeURIComponent(item.relatedLinks))); } catch(e) {}
    });

    const playString = encodeURIComponent(playUrls.join(','));
    const readString = encodeURIComponent(JSON.stringify(readUrls));
    window.location.href = '${scriptUrl}?playall=true&urls=' + playString + '&readLinks=' + readString + '&page=${PAGE}';
  }

  function bulkSummarize() {
    const items = collectBulkSelection();
    if (items.length === 0) return;
    
    // For summary, we only take the first 5 items to prevent insane token usage/timeouts
    const targetItems = items.slice(0, 5);
    const urls = targetItems.map(i => i.link).join(',');
    
    let readUrls = [];
    items.forEach(item => {
      readUrls.push(item.link);
      if (item.relatedLinks) try { readUrls = readUrls.concat(JSON.parse(decodeURIComponent(item.relatedLinks))); } catch(e) {}
    });
    
    // Route to Main Script
    const readString = encodeURIComponent(JSON.stringify(readUrls));
    window.location.href = '${scriptUrl}?bulkSummarize=' + encodeURIComponent(urls) + '&readLinks=' + readString + '&page=${PAGE}';
  }

  function bulkRead() { 
    const items = collectBulkSelection();
    let links = [];
    items.forEach(item => {
      links.push(item.link);
      if (item.relatedLinks) try { links = links.concat(JSON.parse(decodeURIComponent(item.relatedLinks))); } catch(e) {}
    });
    const search = encodeURIComponent(document.getElementById('searchInput').value); 
    window.location.href = '${scriptUrl}?bulkRead=' + encodeURIComponent(JSON.stringify(links)) + '&search=' + search + '&page=${PAGE}'; 
  }

  function bulkBookmark() { 
    const items = collectBulkSelection();
    let bookmarkItems = [], readUrls = [];
    
    items.forEach(item => {
      bookmarkItems.push({ title: item.title, link: item.link, source: item.source, date: item.date, desc: '' });
      
      // V143.2 FIX: Do NOT mark main item as read. Keeps it Undimmed in Read Later.
      // readUrls.push(item.link); <--- REMOVED
      
      // If Parent, also mark cluster children as read
      if (item.relatedLinks) try { readUrls = readUrls.concat(JSON.parse(decodeURIComponent(item.relatedLinks))); } catch(e) {}
    });
    
    window.location.href = '${scriptUrl}?bulkBookmark=' + encodeURIComponent(JSON.stringify(bookmarkItems)) + '&readLinks=' + encodeURIComponent(JSON.stringify(readUrls)) + '&page=${PAGE}'; 
  }

  function bulkFav() { 
    const items = collectBulkSelection();
    if (items.length === 0) return;
    
    let favs = items.map(item => ({ title: item.title, link: item.link, source: item.source, date: item.date, desc: '' }));
    window.location.href = '${scriptUrl}?bulkFavorite=' + encodeURIComponent(JSON.stringify(favs)) + '&page=${PAGE}';
  }
  function clearSelection() { document.querySelectorAll('.bulk-check').forEach(cb => cb.checked = false); updateBulkBar(); }
  function clearSearchBar() { document.getElementById('searchInput').value = ''; document.getElementById('clearSearch').classList.add('hidden'); filterNews(); }
  filterNews();
  ${args.queryParameters.reopenTagEditor ? `setTimeout(() => { openTagEditor('${args.queryParameters.mode || 'exclude'}', ${args.queryParameters.page || PAGE}); }, 100);` : ''}
</script></body></html>`
  const wv = new WebView(); await wv.loadHTML(html); await wv.present();
}

async function renderTagEditor() {
  const mode = args.queryParameters.mode || 'exclude'
  const exclusions = getTags(EXCLUSION_FILE)
  const inclusions = getTags(INCLUSION_FILE)

  // Load current tags as comma-separated for display
  const currentTags = mode === 'exclude' ? exclusions.join(', ') : inclusions.join(', ')

  // Receive pulse tags from URL parameter (passed from main reader)
  let pulseTagsList = []
  if (args.queryParameters.pulseTags) {
    try {
      pulseTagsList = JSON.parse(args.queryParameters.pulseTags)
    } catch (e) {
      pulseTagsList = []
    }
  }

  const heatThreshold = (CATEGORY === "ALL SOURCES") ? 8 : 4;

  let html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/><style>body { background-color: #0f172a; color: #f1f5f9; } .pulse-pill { scroll-snap-align: start; flex-shrink: 0; }</style></head>
  <body class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-xl font-black text-green-400 uppercase tracking-tight">Tag Editor</h1>
      <a href="${scriptUrl}?state=READER&page=${PAGE}" class="material-icons-round text-slate-400">close</a>
    </div>

    <div class="flex justify-center bg-slate-900 p-3 rounded-xl mb-6 border border-slate-800 gap-6">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="mode" value="exclude" ${mode === 'exclude' ? 'checked' : ''} onchange="switchMode()" class="w-4 h-4 text-red-500">
        <span class="text-sm font-bold uppercase ${mode === 'exclude' ? 'text-red-500' : 'text-slate-500'}">Exclude</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="mode" value="include" ${mode === 'include' ? 'checked' : ''} onchange="switchMode()" class="w-4 h-4 text-blue-500">
        <span class="text-sm font-bold uppercase ${mode === 'include' ? 'text-blue-500' : 'text-slate-500'}">Include</span>
      </label>
    </div>

    ${pulseTagsList.length > 0 ? `<div class="mb-4">
      <label class="text-[11px] text-slate-400 uppercase mb-2 block">Trending in your feed (tap to ${mode === 'exclude' ? 'exclude' : 'include'}):</label>
      <div class="flex overflow-x-auto gap-2 pb-2" style="scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;">
        ${pulseTagsList.map(([tag, count]) => {
    const isHot = count >= heatThreshold;
    return `<a href="${scriptUrl}?addPulseTag=true&type=${mode}&tag=${encodeURIComponent(tag)}" class="pulse-pill bg-slate-800/40 border ${isHot ? 'border-blue-500/50' : 'border-slate-700'} px-3 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap"><span class="text-[11px] font-bold text-blue-400">${isHot ? '🔥 ' : ''}${tag}</span><span class="text-[10px] bg-slate-700 text-slate-400 px-1.5 rounded-md font-bold">${count}</span></a>`
  }).join('')}
      </div>
    </div>` : ''}

    <div class="space-y-4">
      <div>
        <label class="text-[11px] text-slate-400 uppercase mb-2 block">Type or paste tags (comma or newline separated)</label>
        <textarea id="tagInput" oninput="updatePreview()" class="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 text-sm outline-none focus:border-green-500 resize-none">${currentTags}</textarea>
      </div>
      
      <div>
        <label class="text-[11px] text-slate-400 uppercase mb-2 block">Quick edit (+ to add, - to delete):</label>
        <div class="flex gap-2">
          <input id="quickEditInput" type="text" placeholder="+Tesla, -Monday, +Apple..." oninput="updateButtonStates()" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-slate-100 text-sm outline-none focus:border-blue-500">
          <button id="applyBtn" onclick="smartEdit()" disabled class="bg-blue-600 px-4 py-2 rounded-lg font-bold uppercase text-xs text-white disabled:opacity-30 disabled:cursor-not-allowed">Apply</button>
        </div>
        <p class="text-[9px] text-slate-500 mt-1">Tip: Use +word to add, -word to delete. No prefix = add</p>
      </div>
      
      <div>
        <div class="flex items-center gap-2 cursor-pointer" onclick="togglePreview()">
          <p id="previewLabel" class="text-[11px] text-slate-400 uppercase">Preview (0 tags):</p>
          <span id="previewToggle" class="material-icons-round text-slate-500 text-sm">expand_more</span>
        </div>
        <div id="previewTags" class="hidden flex-wrap gap-1 mt-2"></div>
      </div>
      
      <button id="saveBtn" onclick="saveTags()" disabled class="w-full bg-green-600 py-3 rounded-lg font-bold uppercase text-sm disabled:opacity-30 disabled:cursor-not-allowed">Save Changes</button>
    </div>

    <script>
      let previewExpanded = false;
      const originalTags = '${currentTags}';
      let bulkModified = false;
      
      function parseTags(text) {
        return text
          .split(/[,\\n]+/)
          .map(t => t.trim())
          .filter(t => t.length > 0)
          .filter((t, i, arr) => arr.indexOf(t) === i);
      }
      
      function updateButtonStates() {
        const quickEditInput = document.getElementById('quickEditInput').value.trim();
        const bulkInput = document.getElementById('tagInput').value.trim();
        const applyBtn = document.getElementById('applyBtn');
        const saveBtn = document.getElementById('saveBtn');
        
        // Apply button: enabled only if Quick Edit has input
        applyBtn.disabled = !quickEditInput;
        
        // Save button: enabled only if bulk text area is modified
        bulkModified = bulkInput !== originalTags;
        saveBtn.disabled = !bulkModified;
      }
      
      function updatePreview() {
        const text = document.getElementById('tagInput').value;
        const tags = parseTags(text);
        document.getElementById('previewLabel').innerText = 'Preview (' + tags.length + ' tags):';
        if (previewExpanded) {
          document.getElementById('previewTags').innerHTML = tags.map(t => 
            '<span class="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded-full border border-blue-700/50">• ' + t + '</span>'
          ).join(' ');
        }
        updateButtonStates();
      }
      
      function togglePreview() {
        previewExpanded = !previewExpanded;
        const previewDiv = document.getElementById('previewTags');
        const toggleIcon = document.getElementById('previewToggle');
        
        if (previewExpanded) {
          previewDiv.classList.remove('hidden');
          previewDiv.classList.add('flex');
          toggleIcon.innerText = 'expand_less';
          updatePreview();
        } else {
          previewDiv.classList.add('hidden');
          previewDiv.classList.remove('flex');
          toggleIcon.innerText = 'expand_more';
        }
      }
      
      function switchMode() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const pulseData = '${args.queryParameters.pulseTags || ''}';
        const url = '${scriptUrl}?state=TAG_EDITOR&mode=' + mode + (pulseData ? '&pulseTags=' + encodeURIComponent(pulseData) : '') + '&page=${PAGE}';
        window.location.href = url;
      }
      
      function smartEdit() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const input = document.getElementById('quickEditInput').value.trim();
        if (!input) {
          alert('Please enter tags to add (+) or delete (-)');
          return;
        }
        window.location.href = '${scriptUrl}?smartEditTags=true&type=' + mode + '&input=' + encodeURIComponent(input) + '&page=${PAGE}';
      }
      
      function saveTags() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const text = document.getElementById('tagInput').value;
        const tags = parseTags(text);
        if (tags.length === 0) {
          alert('Please enter at least one tag');
          return;
        }
        window.location.href = '${scriptUrl}?saveBulkTags=true&type=' + mode + '&tags=' + encodeURIComponent(tags.join('\\n')) + '&page=${PAGE}';
      }
      
      updatePreview();
      updateButtonStates();
    </script>
  </body></html>`
  const wv = new WebView(); await wv.loadHTML(html); await wv.present();
}

async function renderMenu() {
  const newCutoff = getNewCutoffMs()
  const counts = FEEDS.filter(f => f.enabled).map(f => {
    const path = fm.joinPath(CACHE_DIR, f.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json")
    if (!fm.fileExists(path)) return { name: f.name, count: 0, hasNew: false, favorite: f.favorite || false }
    const items = JSON.parse(fm.readString(path))
    const unread = items.filter(i => !READ_HISTORY.includes(i.link))
    const hasNew = unread.some(i => (Date.now() - new Date(i.date).getTime() < newCutoff))
    return { name: f.name, count: unread.length, hasNew: hasNew, favorite: f.favorite || false }
  })

  // Sort: Favorites first (alpha), then regular (alpha)
  const favorites = counts.filter(c => c.favorite).sort((a, b) => a.name.localeCompare(b.name))
  const regular = counts.filter(c => !c.favorite).sort((a, b) => a.name.localeCompare(b.name))
  const sortedCounts = [...favorites, ...regular]

  const totalSum = counts.reduce((acc, curr) => acc + curr.count, 0)
  const anyGlobalNew = counts.some(c => c.hasNew)
  let html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/><style>body { background-color: #0f172a; color: #f1f5f9; }</style></head>
  <body>
    <header class="fixed top-0 left-0 right-0 z-40 bg-slate-900 border-b border-slate-800 px-5 py-4 flex justify-between items-center"><h1 class="text-sm font-bold tracking-widest uppercase text-slate-400">Select Source</h1><a href="${scriptUrl}?state=MANAGER" class="p-2 bg-slate-800 rounded-full border border-orange-500/50"><span class="material-icons-round text-orange-400">tune</span></a></header>
    <main class="pt-24 px-4 space-y-3 pb-10">
      <div onclick="window.location.href='${scriptUrl}?cat=FAVORITES&prevPage=${PAGE}'" class="p-4 bg-slate-800 shadow-sm rounded-xl flex justify-between font-bold text-yellow-500 border border-yellow-500/20"><span>⭐ FAVORITES</span><span>${FAVORITES.length}</span></div>
      <div onclick="window.location.href='${scriptUrl}?cat=BOOKMARKS&prevPage=${PAGE}'" class="p-4 bg-slate-800 shadow-sm rounded-xl flex justify-between font-bold text-orange-500 border border-orange-500/20"><span>🔖 READ LATER</span><span>${BOOKMARKS.length}</span></div>
      <div onclick="window.location.href='${scriptUrl}?cat=ALL+SOURCES'" class="p-4 bg-slate-800 shadow-sm rounded-xl flex justify-between font-bold"><span>🌟 ALL SOURCES ${anyGlobalNew ? '<span class="ml-2 text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">NEW</span>' : ''}</span><span>${totalSum}</span></div>
      ${sortedCounts.map(res => `<div onclick="window.location.href='${scriptUrl}?cat=${encodeURIComponent(res.name)}'" class="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center"><span class="text-slate-300 flex items-center">${res.favorite ? '⭐ ' : ''}${res.name} ${res.hasNew ? '<span class="ml-2 text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">NEW</span>' : ''}</span><span class="text-slate-400">${res.count}</span></div>`).join('')}
    </main>
  </body></html>`
  const wv = new WebView(); await wv.loadHTML(html); await wv.present();
}

async function renderManager() {
  // Initialize favorite field for existing feeds
  for (let f of FEEDS) {
    if (f.favorite === undefined) f.favorite = false
    if (!f.validated) {
      let result = await validateUrl(f.url)
      f.validation = result.status
      f.format = result.format
      if (result.status === "green") f.validated = true
    }
  }

  // Sort: Favorites first (alpha), then regular (alpha)
  const favorites = FEEDS.filter(f => f.favorite).sort((a, b) => a.name.localeCompare(b.name))
  const regular = FEEDS.filter(f => !f.favorite).sort((a, b) => a.name.localeCompare(b.name))
  const sortedFeeds = [...favorites, ...regular]

  fm.writeString(CONFIG_FILE, JSON.stringify(FEEDS))

  let html = `<!DOCTYPE html><html class="dark"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/><style>body { background-color: #0f172a; color: #f1f5f9; }</style></head><body class="p-4"><div class="flex justify-between items-center mb-6"><h1 class="text-lg font-bold text-orange-400 uppercase">Manage Feeds</h1><a href="${scriptUrl}?clearValidation=true" class="text-slate-400 material-icons-round">close</a></div><div class="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-6 space-y-2"><input id="n" type="text" placeholder="Feed Name" class="w-full bg-slate-800 rounded p-2 text-sm outline-none border border-transparent focus:border-orange-500 text-slate-100"><input id="u" type="text" placeholder="RSS URL" class="w-full bg-slate-800 rounded p-2 text-sm outline-none border border-transparent focus:border-orange-500 text-slate-100"><button onclick="let n=document.getElementById('n').value; let u=document.getElementById('u').value; if(n&&u) window.location.href='${scriptUrl}?addFeed=true&name='+encodeURIComponent(n)+'&url='+encodeURIComponent(u)" class="w-full bg-orange-600 py-2 rounded font-bold text-sm uppercase text-white">Add Source</button></div>`

  // Favorites section
  if (favorites.length > 0) {
    html += `<div class="mb-4"><h2 class="text-xs font-bold text-blue-400 uppercase mb-2 px-2">Favorites ⭐</h2><div class="space-y-2">`
    favorites.forEach(f => {
      const originalIdx = FEEDS.indexOf(f)
      let borderClass = f.validation === "red" ? "border-red-500 border-2" : (f.validation === "green" ? "border-green-500 border-2" : "border-slate-800")
      let formatLabel = f.format ? `<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 mr-2">[${f.format}]</span>` : ""
      html += `<div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border transition-all duration-300 ${borderClass}"><div class="flex-1 truncate pr-4 ${f.enabled ? 'text-slate-100' : 'text-slate-500'}"><span class="text-sm font-medium">⭐ ${f.name}</span> <div class="mt-1">${formatLabel}</div></div><div class="flex items-center space-x-4 shrink-0"><a href="${scriptUrl}?state=MANAGER&idx=${originalIdx}&edit=true" class="material-icons-round text-orange-400 text-xl">edit</a><a href="${scriptUrl}?state=MANAGER&idx=${originalIdx}&delete=true" class="material-icons-round text-red-500 text-xl">delete</a></div></div>`
    })
    html += `</div></div>`
  }

  // Regular sources section
  if (regular.length > 0) {
    html += `<div class="mb-4"><h2 class="text-xs font-bold text-slate-400 uppercase mb-2 px-2">Sources</h2><div class="space-y-2">`
    regular.forEach(f => {
      const originalIdx = FEEDS.indexOf(f)
      let borderClass = f.validation === "red" ? "border-red-500 border-2" : (f.validation === "green" ? "border-green-500 border-2" : "border-slate-800")
      let formatLabel = f.format ? `<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 mr-2">[${f.format}]</span>` : ""
      html += `<div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border transition-all duration-300 ${borderClass}"><div class="flex-1 truncate pr-4 ${f.enabled ? 'text-slate-100' : 'text-slate-500'}"><span class="text-sm font-medium">${f.name}</span> <div class="mt-1">${formatLabel}</div></div><div class="flex items-center space-x-4 shrink-0"><a href="${scriptUrl}?state=MANAGER&idx=${originalIdx}&edit=true" class="material-icons-round text-orange-400 text-xl">edit</a><a href="${scriptUrl}?state=MANAGER&idx=${originalIdx}&delete=true" class="material-icons-round text-red-500 text-xl">delete</a></div></div>`
    })
    html += `</div></div>`
  }

  html += `<button onclick="window.location.href='${scriptUrl}?state=READER'" class="w-full bg-slate-700 py-3 rounded-xl">Back to Reader</button></body></html>`
  const wv = new WebView(); wv.shouldDisplayShareButton = false; await wv.loadHTML(html); await wv.present();
}

async function validateUrl(url) {
  try {
    const req = new Request(url); req.timeoutInterval = 4; const xml = await req.loadString(); const lxml = xml.toLowerCase(); let status = "red"; let format = "";
    if (lxml.includes("<item")) { status = "green"; format = "RSS"; } else if (lxml.includes("<entry") || lxml.includes("<feed")) { status = "green"; format = "ATOM"; }
    return { status, format };
  } catch (e) { return { status: "red", format: "" }; }
}

if (args.queryParameters.addFeed) {
  const newName = sanitizeInput(args.queryParameters.name, 100)
  const newUrl = args.queryParameters.url.trim()

  // Basic URL validation
  if (!newName || !newUrl || !newUrl.match(/^https?:\/\/.+/i)) {
    const alert = new Alert()
    alert.title = "Invalid Input"
    alert.message = "Please provide a valid feed name and URL (must start with http:// or https://)."
    alert.addAction("OK")
    await alert.present()
    Safari.open(`${scriptUrl}?state=MANAGER`)
    return
  }

  let validation = await validateUrl(newUrl);
  if (validation.status === "green") {
    await fetchSingleFeed(newUrl, newName);
    // UPDATE MASTER FILE immediately so it appears without full refresh
    await generateMasterFeed();
  }
  FEEDS.push({ name: newName, url: newUrl, enabled: true, validation: validation.status, validated: (validation.status === "green"), format: validation.format });
  fm.writeString(CONFIG_FILE, JSON.stringify(FEEDS)); Safari.open(`${scriptUrl}?state=MANAGER`); return
}

if (args.queryParameters.clearValidation) {
  const cleanFeeds = FEEDS.map(f => { if (f.validation === "green") delete f.validation; return f; });
  fm.writeString(CONFIG_FILE, JSON.stringify(cleanFeeds)); Safari.open(`${scriptUrl}?state=MENU`); return
}

if (args.queryParameters.cat) {
  // If moving TO Bookmarks, save current page
  if (args.queryParameters.cat === "BOOKMARKS" && args.queryParameters.prevPage) {
    fm.writeString(PREV_PAGE_FILE, args.queryParameters.prevPage);
  }

  // If moving AWAY from Bookmarks, try to restore page
  let targetPage = 1;
  if (CATEGORY === "BOOKMARKS" && args.queryParameters.cat !== "BOOKMARKS") {
    if (fm.fileExists(PREV_PAGE_FILE)) targetPage = parseInt(fm.readString(PREV_PAGE_FILE));
  }

  // Use Centralized Safe Writer
  writePrevCategory(CATEGORY);
  fm.writeString(CAT_FILE, args.queryParameters.cat);
  Safari.open(`${scriptUrl}?page=${targetPage}`);
  return
}

// --- INITIALIZATION ---

if (APP_STATE === "READER") await renderReader()
else if (APP_STATE === "MENU") await renderMenu()
else if (APP_STATE === "MANAGER") await renderManager()
else if (APP_STATE === "TAG_EDITOR") await renderTagEditor()

Script.complete()
