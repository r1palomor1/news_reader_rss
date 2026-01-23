// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// ===============================
// CONFIG
// ===============================
const RSS_FEEDS = {
  "Top Stories": "https://news.google.com/rss",
  "World BBC": "https://feeds.bbci.co.uk/news/world/rss.xml",
  "Politico": "https://www.politico.com/rss/politicopicks.xml",
  "NBC News": "https://feeds.nbcnews.com/nbcnews/public/news",
  "Time": "https://feeds.feedburner.com/time/world"
};
const MAX_HEADLINES = 25;
const SUMMARY_SENTENCES = 10;

// ===============================
// UI
// ===============================
const table = new UITable();
table.showSeparators = true;

// ===============================
// CATEGORY PICKER
// ===============================
const categories = Object.keys(RSS_FEEDS);
const categoryIndex = await showPicker("Select Category", categories);
const category = categories[categoryIndex];
const rssUrl = RSS_FEEDS[category];

// ===============================
// FETCH RSS
// ===============================
const rssText = await fetchText(rssUrl);
const items = parseRSSItems(rssText).slice(0, MAX_HEADLINES);

// ===============================
// BUILD TABLE
// ===============================
for (const item of items) {
  const row = new UITableRow();
  row.height = 70;

  const titleCell = row.addText(item.title);
  titleCell.titleFont = Font.boldSystemFont(15);
  titleCell.subtitle = "Tap to open • Long-press to listen";

  row.onSelect = () => Safari.open(item.link);

  row.onLongPress = async () => {
    const summary = await getArticleSummary(item);
    Speech.speak(summary);
  };

  table.addRow(row);
}

QuickLook.present(table);

// ===============================
// FUNCTIONS
// ===============================

async function fetchText(url) {
  const req = new Request(url);
  req.timeoutInterval = 20;
  return await req.loadString();
}

// -------------------------------
// RSS PARSER (ROBUST)
// -------------------------------
function parseRSSItems(xml) {
  const items = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const block of blocks) {
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      description: extractTag(block, "description"),
      content: extractTag(block, "content:encoded")
    });
  }

  return items;
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? cleanHTML(match[1]) : "";
}

// -------------------------------
// SUMMARY PIPELINE (FIXED)
// -------------------------------
async function getArticleSummary(item) {
  try {
    // 1️⃣ Use embedded content first (fastest & best)
    let sourceText = item.content || item.description || "";

    // 2️⃣ Fallback: fetch article page
    if (sourceText.length < 500) {
      sourceText = await fetchArticleText(item.link);
    }

    if (!sourceText || sourceText.length < 300) {
      return "Unable to retrieve summary for this article.";
    }

    // 3️⃣ Summarize
    return summarizeText(sourceText);

  } catch (err) {
    console.log("SUMMARY ERROR:", err);
    return "Unable to retrieve summary for this article.";
  }
}

// -------------------------------
// ARTICLE FETCH (SAFE)
// -------------------------------
async function fetchArticleText(url) {
  try {
    const html = await fetchText(url);

    // Strip scripts/styles
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");

    return cleanHTML(text);

  } catch {
    return "";
  }
}

// -------------------------------
// PREMIUM-STYLE SUMMARIZER
// -------------------------------
function summarizeText(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/);

  return sentences
    .slice(0, SUMMARY_SENTENCES)
    .join(" ");
}

// -------------------------------
// UTIL
// -------------------------------
function cleanHTML(str) {
  return str
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// -------------------------------
// PICKER
// -------------------------------
async function showPicker(title, items) {
  const alert = new Alert();
  alert.title = title;
  items.forEach(i => alert.addAction(i));
  return await alert.present();
}