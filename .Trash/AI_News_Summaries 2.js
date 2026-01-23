// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic;
// ==================================================
// STEP 2: RSS + AI Summary Menu (Stable Version)
// ==================================================

const CATEGORIES = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Politics", url: "https://news.google.com/rss/headlines/section/topic/POLITICS" }
];

// ⚠️ CHANGE ONLY IF YOUR DOMAIN IS DIFFERENT
const SUMMARIZE_ENDPOINT = "https://ai-news-summary.vercel.app/api/summarize";

// ---------- CATEGORY PICKER ----------
const catAlert = new Alert();
catAlert.title = "Select Category";
CATEGORIES.forEach(c => catAlert.addAction(c.name));
catAlert.addCancelAction("Cancel");
const catIndex = await catAlert.presentSheet();
if (catIndex === -1) Script.complete();

// ---------- FETCH RSS ----------
let rssText;
try {
  rssText = await new Request(CATEGORIES[catIndex].url).loadString();
} catch (e) {
  console.log("RSS fetch failed:", e);
  throw new Error("Could not fetch RSS");
}

// ---------- PARSE <item> BLOCKS ----------
const itemRegex = /<item>([\s\S]*?)<\/item>/g;
const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
const linkRegex = /<link>(.*?)<\/link>/;

const articles = [];
let match;

while ((match = itemRegex.exec(rssText)) !== null) {
  const item = match[1];
  const titleMatch = titleRegex.exec(item);
  const linkMatch = linkRegex.exec(item);

  if (!titleMatch || !linkMatch) continue;

  const title = (titleMatch[1] || titleMatch[2] || "").trim();
  const link = linkMatch[1].trim();

  if (title && link) articles.push({ title, link });
  if (articles.length >= 30) break;
}

if (articles.length === 0) {
  const a = new Alert();
  a.title = "No Articles";
  a.message = "RSS loaded but no headlines parsed.";
  a.addCancelAction("OK");
  await a.present();
  Script.complete();
}

// ---------- HEADLINE LIST ----------
const list = new Alert();
list.title = CATEGORIES[catIndex].name;
articles.forEach(a => list.addAction(a.title));
list.addCancelAction("Cancel");

const pick = await list.presentSheet();
if (pick === -1) Script.complete();

const article = articles[pick];

// ---------- ACTION MENU ----------
const actionMenu = new Alert();
actionMenu.title = article.title;
actionMenu.message = "Choose an action:";
actionMenu.addAction("🔊 Listen to AI Summary");
actionMenu.addAction("🌐 Open Full Article");
actionMenu.addCancelAction("Cancel");

const action = await actionMenu.present();

// ---------- AI SUMMARY ----------
if (action === 0) {
  const modeMenu = new Alert();
  modeMenu.title = "Summary Type";
  modeMenu.addAction("Brief");
  modeMenu.addAction("Standard");
  modeMenu.addAction("Deep Dive");
  modeMenu.addCancelAction("Cancel");

  const modePick = await modeMenu.present();
  if (modePick === -1) Script.complete();

  const mode = ["brief", "standard", "deep"][modePick];

  const req = new Request(
    `${SUMMARIZE_ENDPOINT}?url=${encodeURIComponent(article.link)}&mode=${mode}`
  );

  let result;
  try {
    result = await req.loadJSON();
  } catch (e) {
    Speech.speak("Sorry. I could not retrieve a summary for this article.");
    Script.complete();
  }

  if (!result.summary || result.summary.length < 20) {
    Speech.speak("Only a partial summary is available. Opening the article.");
    Safari.open(article.link);
  } else {
    Speech.speak(result.summary);
  }
}

// ---------- OPEN ARTICLE ----------
else if (action === 1) {
  Safari.open(article.link);
}

Script.complete();