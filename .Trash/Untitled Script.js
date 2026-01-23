// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
// ----------------------------
// AI News Summary Scriptable
// ----------------------------

const VERCEL_ENDPOINT = "https://ai-news-summary.vercel.app/api/summarize"; // Replace with your project URL
const MAX_HEADLINES = 20; // How many headlines to show per category

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
// STEP 1: Pick Category
// ----------------------------
const catNames = categories.map(c => c.name);
const catIndex = await presentMenu("Select News Category", catNames);
if (catIndex === null) return;
const selectedCategory = categories[catIndex];

// ----------------------------
// STEP 2: Fetch Headlines
// ----------------------------
let feedData;
try {
  const feedReq = new Request(selectedCategory.url);
  const feedText = await feedReq.loadString();
  feedData = parseRSS(feedText).slice(0, MAX_HEADLINES);
} catch (e) {
  await showAlert("Error", "Failed to load headlines.");
  return;
}

if (!feedData || feedData.length === 0) {
  await showAlert("No Articles", "No articles found for this category.");
  return;
}

// ----------------------------
// STEP 3: Show Headlines Menu
// ----------------------------
const headlineTitles = feedData.map((item, i) => `${i + 1}. ${item.title}`);
const pickIndex = await presentMenu("Select Article", headlineTitles);
if (pickIndex === null) return;
const article = feedData[pickIndex];

// ----------------------------
// STEP 4: Action Sheet for Article
// ----------------------------
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

// ----------------------------
// FUNCTIONS
// ----------------------------

async function handleAISummary(url, mode, speak = true) {
  const spinner = new Alert();
  spinner.message = "Generating AI summary...";
  spinner.addAction("Wait");
  spinner.show();

  try {
    const endpointReq = new Request(`${VERCEL_ENDPOINT}?url=${encodeURIComponent(url)}&mode=${mode}`);
    const response = await endpointReq.loadJSON();
    const text = response.spokenText || response.summary || "No summary available.";

    if (speak) Speech.speak(text);

    // Show text on screen
    const textView = new Alert();
    textView.title = "AI Summary";
    textView.message = response.summary;
    textView.addAction("OK");
    await textView.present();
  } catch (err) {
    await showAlert("Error", "Failed to get AI summary. Try again.");
  }
}

function parseRSS(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const items = [...doc.getElementsByTagName("item")].map(item => ({
    title: item.getElementsByTagName("title")[0]?.textContent || "",
    link: item.getElementsByTagName("link")[0]?.textContent || "",
    description: item.getElementsByTagName("description")[0]?.textContent || ""
  }));
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
}