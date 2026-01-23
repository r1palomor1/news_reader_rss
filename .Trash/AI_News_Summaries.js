// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;
// ----------------------------
// AI_News_Summaries
// ----------------------------

/*
Features:
- Category picker (Top, Politics, Tech, Business, Faith, World)
- Scrollable headlines
- Tap headline → action sheet:
    ▶️ Brief / Standard / Deep Dive AI Summary
    📝 Show AI Summary Text
    🌐 Open Full Article
- Audio TTS
- Home screen widget: category picker, top headlines, tap to play AI summary
- Caching for offline/instant display
- Widget auto-refresh every hour
- Robust RSS/Atom parsing with debug logs
*/

const VERCEL_ENDPOINT = "https://ai-news-summary.vercel.app/api/summarize"; // Replace with your API endpoint
const MAX_HEADLINES = 20;
const CACHE_KEY = "AI_NEWS_CACHE";

// Widget refresh interval (minutes)
const WIDGET_REFRESH_INTERVAL = 60;

// ----------------------------
// Categories
// ----------------------------
const categories = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Politics", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?oc=5" },
  { name: "Technology", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB?oc=5" },
  { name: "Business", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?oc=5" },
  { name: "Faith", url: "https://www.ncregister.com/rss/all" },
  { name: "World", url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB?oc=5" }
];

// ----------------------------
// Determine mode: Widget or App
// ----------------------------
if (config.runsInWidget) {
  await createWidget();
} else {
  await runApp();
}

// ----------------------------
// MAIN APP
// ----------------------------
async function runApp() {
  const catNames = categories.map(c => c.name);
  const catIndex = await presentMenu("Select News Category", catNames);
  if (catIndex === null) return;
  const selectedCategory = categories[catIndex];

  const feedData = await fetchHeadlines(selectedCategory.url);
  if (!feedData || feedData.length === 0) {
    await showAlert("No Articles", "No articles found for this category.");
    return;
  }

  const headlineTitles = feedData.map((item, i) => `${i + 1}. ${item.title}`);
  const pickIndex = await presentMenu("Select Article", headlineTitles);
  if (pickIndex === null) return;
  const article = feedData[pickIndex];

  const action = await presentMenu(
    "Article Options",
    [
      "▶️ Listen – Brief AI Summary",
      "▶️ Listen – Standard AI Summary",
      "▶️ Listen – Deep Dive AI Summary",
      "📝 Show AI Summary Text",
      "🌐 Open Full Article",
      "❌ Cancel"
    ]
  );

  if (action === null || action === 5) return;

  switch (action) {
    case 0:
      await handleAISummary(article.link, "brief", true);
      break;
    case 1:
      await handleAISummary(article.link, "standard", true);
      break;
    case 2:
      await handleAISummary(article.link, "deep", true);
      break;
    case 3:
      await handleAISummary(article.link, "standard", false);
      break;
    case 4:
      Safari.open(article.link);
      break;
  }
}

// ----------------------------
// FETCH HEADLINES (ROBUST)
// ----------------------------
async function fetchHeadlines(rssUrl) {
  try {
    const req = new Request(rssUrl);
    const xml = await req.loadString();

    console.log("Fetched XML/HTML:", xml.substring(0, 500) + "…"); // debug first 500 chars

    let items = parseRSS(xml).slice(0, MAX_HEADLINES);

    if (!items || items.length === 0) {
      console.log("parseRSS returned 0 items for URL:", rssUrl);
    } else {
      console.log("parseRSS returned", items.length, "items");
    }

    Keychain.set(CACHE_KEY, JSON.stringify(items));
    return items;
  } catch (err) {
    console.log("fetchHeadlines error:", err);
    try {
      const cached = Keychain.get(CACHE_KEY);
      if (cached) {
        console.log("Using cached items");
        return JSON.parse(cached);
      }
    } catch (e) {
      console.log("Cache fetch failed:", e);
    }
    return [];
  }
}

// ----------------------------
// AI SUMMARY HANDLER
// ----------------------------
async function handleAISummary(url, mode, speak = true) {
  const spinner = new Alert();
  spinner.message = "Generating AI summary...";
  spinner.addAction("Wait");
  spinner.show();

  try {
    const req = new Request(`${VERCEL_ENDPOINT}?url=${encodeURIComponent(url)}&mode=${mode}`);
    const res = await req.loadJSON();
    const text = res.spokenText || res.summary || "No summary available.";

    if (speak) Speech.speak(text);

    const textView = new Alert();
    textView.title = "AI Summary";
    textView.message = res.summary;
    textView.addAction("OK");
    await textView.present();
  } catch (err) {
    await showAlert("Error", "Failed to get AI summary. Try again.");
  }
}

// ----------------------------
// WIDGET
// ----------------------------
async function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#1E1E1E");

  // Auto-refresh every hour
  const widgetDate = new Date();
  widget.refreshAfterDate = new Date(widgetDate.getTime() + WIDGET_REFRESH_INTERVAL * 60 * 1000);

  // Category picker inside widget
  const catIndex = await presentMenu("Widget: Select Category", categories.map(c => c.name));
  if (catIndex === null) return;
  const selectedCategory = categories[catIndex];

  const feedData = await fetchHeadlines(selectedCategory.url);

  if (!feedData || feedData.length === 0) {
    widget.addText("No articles found.");
    Script.setWidget(widget);
    Script.complete();
    return;
  }

  // Show top 3 headlines
  for (let i = 0; i < Math.min(3, feedData.length); i++) {
    const title = feedData[i].title;
    const link = feedData[i].link;

    const t = widget.addText(`• ${title}`);
    t.font = Font.systemFont(14);
    t.textColor = Color.white;

    // Tap headline → run script with standard summary
    t.url = `scriptable://run?scriptName=${encodeURIComponent(
      Script.name()
    )}&url=${encodeURIComponent(link)}&mode=standard`;

    widget.addSpacer(3);
  }

  Script.setWidget(widget);
  Script.complete();
}

// ----------------------------
// UTILITIES
// ----------------------------
function parseRSS(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // Try <item> first, fallback to <entry> (Atom)
  let rawItems = [...doc.getElementsByTagName("item")];
  if (rawItems.length === 0) rawItems = [...doc.getElementsByTagName("entry")];

  const items = rawItems.map(item => {
    const titleEl = item.getElementsByTagName("title")[0];
    const linkEl = item.getElementsByTagName("link")[0];
    return {
      title: titleEl ? titleEl.textContent : "(No title found)",
      link: linkEl
        ? linkEl.textContent || linkEl.getAttribute("href") || ""
        : "",
      description: item.getElementsByTagName("description")[0]?.textContent || ""
    };
  });

  console.log("Parsed items:", items.length);
  return items;
}

async function presentMenu(title, options) {
  const alert = new Alert();
  alert.title = title;
  options.forEach(opt => alert.addAction(opt));
  alert.addCancelAction("Cancel");
  const idx = await alert.presentSheet();
  return idx === -1 ? null : idx;
}

async function showAlert(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("OK");
  await a.present();