// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
// =====================================================
// Google News + Widget (Scriptable)
// =====================================================

// ---------- CONFIG ----------
const KEYWORDS = ["apple", "ai", "market", "faith", "technology"]; // [] = no filter
const MAX_ITEMS = 10;
const SPEAK_NEWS = true;

// ---------- WIDGET MODE ----------
const isWidget = config.runsInWidget;

// ---------- NEWS CATEGORIES ----------
const categories = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS" }
];

// ---------- DEFAULT CATEGORY FOR WIDGET ----------
const selected = categories[0];

// ---------- FETCH RSS ----------
const req = new Request(selected.url);
const rss = await req.loadString();

// ---------- PARSE RSS ----------
const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
const linkRegex = /<link>(.*?)<\/link>/g;
const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/g;

let titles = [];
let links = [];
let descriptions = [];
let match;

while ((match = titleRegex.exec(rss)) !== null) {
  const t = match[1] || match[2];
  if (t && t !== "Google News") titles.push(t.trim());
}

while ((match = linkRegex.exec(rss)) !== null) {
  const l = match[1];
  if (l && !l.includes("news.google.com/rss")) links.push(l.trim());
}

while ((match = descRegex.exec(rss)) !== null) {
  descriptions.push(match[1].replace(/<[^>]*>/g, "").trim());
}

// ---------- FILTER + LIMIT ----------
let results = [];

for (let i = 0; i < titles.length; i++) {
  const text = titles[i].toLowerCase();
  const matches =
    KEYWORDS.length === 0 ||
    KEYWORDS.some(k => text.includes(k.toLowerCase()));

  if (matches) {
    results.push({
      title: titles[i],
      link: links[i],
      summary: descriptions[i]
    });
  }

  if (results.length >= MAX_ITEMS) break;
}

// ---------- FALLBACK ----------
if (results.length === 0) {
  results.push({
    title: "No matching headlines",
    link: "https://news.google.com",
    summary: "Try adjusting your keywords."
  });
}

// ---------- SUMMARY FUNCTION ----------
function summarize(text) {
  if (!text) return "No summary available.";
  const sentences = text.split(". ");
  return sentences.slice(0, 2).join(". ") + ".";
}

// =====================================================
// WIDGET OUTPUT (LARGE WIDGET)
// =====================================================
if (isWidget) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#111111");

  const header = widget.addText("📰 Google News");
  header.font = Font.boldSystemFont(16);
  header.textColor = Color.white();

  widget.addSpacer(8);

  results.slice(0, 4).forEach(r => {
    const t = widget.addText("• " + r.title);
    t.font = Font.systemFont(12);
    t.textColor = Color.lightGray();
    widget.addSpacer(4);
  });

  widget.url = "scriptable:///run/GoogleNewsWidget";
  Script.setWidget(widget);
  Script.complete();
}

// =====================================================
// FULL-SCREEN INTERACTIVE MODE
// =====================================================

// ---------- CATEGORY PICKER ----------
const menu = new Alert();
menu.title = "Google News";
menu.message = "Select a category";
categories.forEach(c => menu.addAction(c.name));
menu.addCancelAction("Cancel");

const choice = await menu.presentSheet();
if (choice === -1) Script.complete();

const selectedCategory = categories[choice];

// ---------- FETCH CATEGORY RSS ----------
const catReq = new Request(selectedCategory.url);
const catRss = await catReq.loadString();

// ---------- RE-PARSE FOR CATEGORY ----------
titles = [];
links = [];
descriptions = [];

while ((match = titleRegex.exec(catRss)) !== null) {
  const t = match[1] || match[2];
  if (t && t !== "Google News") titles.push(t.trim());
}

while ((match = linkRegex.exec(catRss)) !== null) {
  const l = match[1];
  if (l && !l.includes("news.google.com/rss")) links.push(l.trim());
}

while ((match = descRegex.exec(catRss)) !== null) {
  descriptions.push(match[1].replace(/<[^>]*>/g, "").trim());
}

// ---------- FILTER AGAIN ----------
results = [];

for (let i = 0; i < titles.length; i++) {
  const text = titles[i].toLowerCase();
  const matches =
    KEYWORDS.length === 0 ||
    KEYWORDS.some(k => text.includes(k.toLowerCase()));

  if (matches) {
    results.push({
      title: titles[i],
      link: links[i],
      summary: descriptions[i]
    });
  }

  if (results.length >= MAX_ITEMS) break;
}

// ---------- SPOKEN BRIEFING ----------
if (SPEAK_NEWS) {
  let speech = `Here are the latest ${selectedCategory.name} headlines. `;
  results.forEach((r, i) => {
    speech += `Headline ${i + 1}. ${r.title}. `;
  });
  Speech.speak(speech);
}

// ---------- HEADLINE MENU ----------
const newsMenu = new Alert();
newsMenu.title = selectedCategory.name;
newsMenu.message = "Top Headlines";
results.forEach(r => newsMenu.addAction(r.title));
newsMenu.addCancelAction("Close");

const pick = await newsMenu.presentSheet();
if (pick === -1) Script.complete();

// ---------- DETAIL VIEW ----------
const detail = new Alert();
detail.title = results[pick].title;
detail.message = summarize(results[pick].summary);
detail.addAction("Open Article");
detail.addCancelAction("Back");

const action = await detail.present();
if (action === 0) Safari.open(results[pick].link);

Script.complete();