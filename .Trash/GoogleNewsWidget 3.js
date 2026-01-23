// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: magic;
// ========================================================
// Google News Ultimate Widget + Multi-Profile + AI Summaries
// Surprise Features 😮
// ========================================================

// ---------- CONFIG ----------
const MAX_ITEMS_WIDGET = 4;           // headlines in widget
const MAX_ITEMS_MENU = 10;            // headlines in full menu
const SUMMARY_SENTENCES = 5;          // heuristic AI summary
const SPEAK_HEADLINES = true;         // spoken briefing on menu
const SHOW_KEYWORD_TRENDS = true;     // top trending keywords in widget

// ---------- PROFILES ----------
const PROFILES = [
  { name: "Tech", keywords: ["technology","ai","software","gadgets","innovation"], emoji: "🖥" },
  { name: "Economy", keywords: ["economy","inflation","market","interest rates","policy"], emoji: "💰" },
  { name: "Politics", keywords: ["government","policy","election","law","security"], emoji: "🗳" },
  { name: "Faith", keywords: ["faith","religion","church","catholic","ethics"], emoji: "✝" },
  { name: "General", keywords: [], emoji: "📰" }
];

// ---------- DEFAULT PROFILE & CATEGORY ----------
let selectedProfile = PROFILES[4]; // General by default
const CATEGORIES = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS" }
];

// ---------- SCRIPTABLE WIDGET CHECK ----------
const isWidget = config.runsInWidget;

// ---------- HELPER FUNCTIONS ----------
async function fetchRSS(url) {
  const req = new Request(url);
  return await req.loadString();
}

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

function filterResults(titles, links, descriptions, keywords, maxItems) {
  let results = [];
  for (let i=0; i<titles.length; i++) {
    const text = titles[i].toLowerCase();
    const matches = keywords.length === 0 || keywords.some(k => text.includes(k.toLowerCase()));
    if (matches) results.push({ title: titles[i], link: links[i], summary: descriptions[i] });
    if (results.length >= maxItems) break;
  }
  if (results.length === 0) results.push({ title: "No matching headlines", link: "https://news.google.com", summary: "Try changing profile." });
  return results;
}

function aiSummary(text) {
  if (!text) return "No summary available.";
  let sentences = text.split(/\. |\n/);
  let summary = sentences.slice(0, SUMMARY_SENTENCES);
  const numberRegex = /\b\d+(\.\d+)?%?\b/g;
  let numbers = text.match(numberRegex) || [];
  if (numbers.length > 0) summary.push("Key numbers mentioned: " + numbers.join(", ") + ".");
  return summary.join(". ") + ".";
}

function extractKeywords(text, limit=3) {
  let words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  let freq = {};
  words.forEach(w => freq[w] = (freq[w]||0)+1);
  let sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,limit);
  return sorted.map(s=>s[0]);
}

// ---------- SELECT PROFILE IF FULL SCREEN ----------
if (!isWidget) {
  const profileMenu = new Alert();
  profileMenu.title = "Select Profile";
  profileMenu.message = "Choose news filter";
  PROFILES.forEach(p => profileMenu.addAction(`${p.emoji} ${p.name}`));
  profileMenu.addCancelAction("Cancel");

  const profileChoice = await profileMenu.presentSheet();
  if (profileChoice !== -1) selectedProfile = PROFILES[profileChoice];
}

// ---------- WIDGET MODE ----------
const rssText = await fetchRSS(CATEGORIES[0].url);
const parsed = parseRSS(rssText);
const resultsWidget = filterResults(parsed.titles, parsed.links, parsed.descriptions, selectedProfile.keywords, MAX_ITEMS_WIDGET);

if (isWidget) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#111111");

  const header = widget.addText(`📰 ${selectedProfile.emoji} ${selectedProfile.name} News`);
  header.font = Font.boldSystemFont(16);
  header.textColor = Color.white();
  widget.addSpacer(6);

  if (SHOW_KEYWORD_TRENDS) {
    let trends = extractKeywords(parsed.titles.join(" ").toLowerCase(),3).join(", ");
    const trendText = widget.addText(`Trending: ${trends}`);
    trendText.font = Font.systemFont(10);
    trendText.textColor = Color.orange();
    widget.addSpacer(4);
  }

  resultsWidget.forEach(r => {
    const t = widget.addText(`• ${r.title}`);
    t.font = Font.systemFont(12);
    t.textColor = Color.lightGray();
    widget.addSpacer(2);
  });

  widget.url = "scriptable:///run/GoogleNewsUltimate"; // tap → full menu
  Script.setWidget(widget);
  Script.complete();
}

// ---------- FULL-SCREEN HEADLINE MENU ----------
const menu = new Alert();
menu.title = `${selectedProfile.emoji} ${selectedProfile.name} News`;
menu.message = "Tap article for AI summary";
resultsWidget.forEach(r => menu.addAction(r.title));
menu.addCancelAction("Close");

const pick = await menu.presentSheet();
if (pick === -1) Script.complete();

const detail = new Alert();
detail.title = resultsWidget[pick].title;
detail.message = aiSummary(resultsWidget[pick].summary);
detail.addAction("Open Article");
detail.addCancelAction("Close");

const action = await detail.present();
if (action === 0) Safari.open(resultsWidget[pick].link);
else Speech.speak(aiSummary(resultsWidget[pick].summary));

Script.complete();