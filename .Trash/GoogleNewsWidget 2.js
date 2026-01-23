// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// ========================================================
// Google News Multi-Profile + Heuristic AI Summary + Widget
// ========================================================

// ---------- CONFIG ----------
const MAX_ITEMS = 10;
const SPEAK_NEWS = true; // spoken briefing of headlines
const SUMMARY_SENTENCES = 5; // medium-length AI summary (~4-6 sentences)

// ---------- PROFILES ----------
const PROFILES = [
  { name: "Tech", keywords: ["technology","ai","software","gadgets","innovation"] },
  { name: "Economy", keywords: ["economy","inflation","market","interest rates","policy"] },
  { name: "Politics", keywords: ["government","policy","election","law","security"] },
  { name: "Faith", keywords: ["faith","religion","church","catholic","ethics"] },
  { name: "General", keywords: [] } // no filter
];

// ---------- WIDGET MODE ----------
const isWidget = config.runsInWidget;

// ---------- NEWS CATEGORIES ----------
const CATEGORIES = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS" }
];

// ---------- SELECT PROFILE ----------
let selectedProfile = PROFILES[0]; // default
if (!isWidget) {
  const profileMenu = new Alert();
  profileMenu.title = "Select Profile";
  profileMenu.message = "Choose news filter";
  PROFILES.forEach(p => profileMenu.addAction(p.name));
  profileMenu.addCancelAction("Cancel");

  const profileChoice = await profileMenu.presentSheet();
  if (profileChoice === -1) Script.complete();
  selectedProfile = PROFILES[profileChoice];
}

// ---------- DEFAULT CATEGORY FOR WIDGET ----------
const defaultCategory = CATEGORIES[0];

// ---------- FETCH RSS ----------
async function fetchRSS(url) {
  const req = new Request(url);
  const rss = await req.loadString();
  return rss;
}

// ---------- PARSE RSS ----------
function parseRSS(rss) {
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
  const linkRegex = /<link>(.*?)<\/link>/g;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/g;

  let titles = [], links = [], descriptions = [], match;

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

  return { titles, links, descriptions };
}

// ---------- FILTER + LIMIT ----------
function filterResults(titles, links, descriptions, keywords) {
  let results = [];
  for (let i=0; i<titles.length; i++) {
    const text = titles[i].toLowerCase();
    const matches = keywords.length === 0 || keywords.some(k => text.includes(k.toLowerCase()));
    if (matches) {
      results.push({
        title: titles[i],
        link: links[i],
        summary: descriptions[i]
      });
    }
    if (results.length >= MAX_ITEMS) break;
  }
  if (results.length === 0) results.push({ title: "No matching headlines", link: "https://news.google.com", summary: "Try changing profile." });
  return results;
}

// ---------- HEURISTIC AI SUMMARY FUNCTION ----------
function aiSummary(text) {
  if (!text) return "No summary available.";
  // Split into sentences
  let sentences = text.split(/\. |\n/);
  // Pick first N sentences
  let summary = sentences.slice(0, SUMMARY_SENTENCES);
  // Enhance: Add numbers / percentages if any
  const numberRegex = /\b\d+(\.\d+)?%?\b/g;
  let numbers = text.match(numberRegex) || [];
  if (numbers.length > 0) summary.push("Key numbers mentioned: " + numbers.join(", ") + ".");
  // Combine
  return summary.join(". ") + ".";
}

// ========================================================
// WIDGET OUTPUT
// ========================================================
if (isWidget) {
  const rssText = await fetchRSS(defaultCategory.url);
  const parsed = parseRSS(rssText);
  const results = filterResults(parsed.titles, parsed.links, parsed.descriptions, PROFILES[0].keywords);

  const widget = new ListWidget();
  widget.backgroundColor = new Color("#111111");

  const header = widget.addText("📰 Google News");
  header.font = Font.boldSystemFont(16);
  header.textColor = Color.white();
  widget.addSpacer(8);

  results.slice(0,4).forEach(r => {
    const t = widget.addText("• " + r.title);
    t.font = Font.systemFont(12);
    t.textColor = Color.lightGray();
    widget.addSpacer(4);
  });

  widget.url = "scriptable:///run/GoogleNewsWidget";
  Script.setWidget(widget);
  Script.complete();
}

// ========================================================
// FULL-SCREEN INTERACTIVE MODE
// ========================================================

// ---------- SELECT CATEGORY ----------
const categoryMenu = new Alert();
categoryMenu.title = "Select News Category";
CATEGORIES.forEach(c => categoryMenu.addAction(c.name));
categoryMenu.addCancelAction("Cancel");

const categoryChoice = await categoryMenu.presentSheet();
if (categoryChoice === -1) Script.complete();
const category = CATEGORIES[categoryChoice];

// ---------- FETCH & PARSE CATEGORY ----------
const rssCategory = await fetchRSS(category.url);
const parsedCategory = parseRSS(rssCategory);

// ---------- FILTER FOR SELECTED PROFILE ----------
const results = filterResults(parsedCategory.titles, parsedCategory.links, parsedCategory.descriptions, selectedProfile.keywords);

// ---------- SPOKEN HEADLINE BRIEFING ----------
if (SPEAK_NEWS) {
  let speech = `Here are the latest ${category.name} headlines. `;
  results.forEach((r,i) => { speech += `Headline ${i+1}. ${r.title}. ` });
  Speech.speak(speech);
}

// ---------- HEADLINE MENU WITH AI SUMMARY OPTION ----------
const newsMenu = new Alert();
newsMenu.title = `${selectedProfile.name} | ${category.name}`;
newsMenu.message = "Select an article";

results.forEach(r => newsMenu.addAction(r.title));
newsMenu.addCancelAction("Close");

const pick = await newsMenu.presentSheet();
if (pick === -1) Script.complete();

// ---------- ARTICLE DETAIL / OPTIONS ----------
const detail = new Alert();
detail.title = results[pick].title;
detail.message = summarize(results[pick].summary);
detail.addAction("Open Article");
detail.addAction("AI Summary"); // enhanced heuristic AI summary
detail.addCancelAction("Back");

const action = await detail.present();
if (action === 0) {
  Safari.open(results[pick].link);
} else if (action === 1) {
  const summaryText = aiSummary(results[pick].summary);
  Speech.speak(summaryText);
}

Script.complete();