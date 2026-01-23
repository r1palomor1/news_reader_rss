// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
// =======================================
// Google News Advanced Briefing (Scriptable)
// =======================================

// ---------- USER SETTINGS ----------

// Keywords to FILTER news (case-insensitive)
// Leave array empty [] to disable filtering
const KEYWORDS = ["apple", "ai", "market", "faith", "technology"];

// Max headlines
const MAX_ITEMS = 10;

// Enable spoken briefing
const SPEAK_NEWS = true;

// -----------------------------------

// News categories
const categories = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS" }
];

// ---------- CATEGORY PICKER ----------
const menu = new Alert();
menu.title = "Google News";
menu.message = "Select a category";
categories.forEach(c => menu.addAction(c.name));
menu.addCancelAction("Cancel");

const choice = await menu.presentSheet();
if (choice === -1) Script.complete();

const selected = categories[choice];

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

// Titles
while ((match = titleRegex.exec(rss)) !== null) {
  const t = match[1] || match[2];
  if (t && t !== "Google News") titles.push(t.trim());
}

// Links
while ((match = linkRegex.exec(rss)) !== null) {
  const l = match[1];
  if (l && !l.includes("news.google.com/rss")) links.push(l.trim());
}

// Descriptions
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
  const alert = new Alert();
  alert.title = "No Results";
  alert.message = "No headlines matched your keywords.";
  alert.addAction("OK");
  await alert.present();
  Script.complete();
}

// ---------- AI-STYLE SUMMARY (Heuristic) ----------
function summarize(text) {
  if (!text) return "No summary available.";
  const sentences = text.split(". ");
  return sentences.slice(0, 2).join(". ") + ".";
}

// ---------- SPOKEN BRIEFING ----------
if (SPEAK_NEWS) {
  let speech = `Here are the latest ${selected.name} headlines. `;
  results.forEach((r, i) => {
    speech += `Headline ${i + 1}. ${r.title}. `;
  });
  Speech.speak(speech);
}

// ---------- DISPLAY MENU ----------
const newsMenu = new Alert();
newsMenu.title = selected.name;
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