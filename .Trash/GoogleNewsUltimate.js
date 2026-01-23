// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic;
// ========================================================
// Google News Ultimate One-Tap AI Summary Widget
// Full scrollable list + per-headline AI summaries 😮
// ========================================================

// ---------- CONFIG ----------
const MAX_ITEMS_WIDGET = 6;   // headlines on widget
const MAX_ITEMS_MENU = 25;    // scrollable full list
const SUMMARY_SENTENCES = 5;  // AI summary length
const SPEAK_HEADLINES = true; // spoken briefing in menu
const SHOW_KEYWORD_TRENDS = true;

// ---------- PROFILES ----------
const PROFILES = [
  { name: "Tech", keywords: [], emoji: "🖥" },
  { name: "Economy", keywords: [], emoji: "💰" },
  { name: "Politics", keywords: [], emoji: "🗳" },
  { name: "Faith", keywords: [], emoji: "✝" },
  { name: "General", keywords: [], emoji: "📰" }
];

// ---------- CATEGORIES ----------
const CATEGORIES = [
  { name: "Top Stories", url: "https://news.google.com/rss" },
  { name: "Technology", url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY" },
  { name: "Business", url: "https://news.google.com/rss/headlines/section/topic/BUSINESS" },
  { name: "World", url: "https://news.google.com/rss/headlines/section/topic/WORLD" },
  { name: "Sports", url: "https://news.google.com/rss/headlines/section/topic/SPORTS" }
];

const isWidget = config.runsInWidget;

// ---------- HELPERS ----------
async function fetchRSS(url){ return await new Request(url).loadString(); }

function parseRSS(rss){
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
  const linkRegex = /<link>(.*?)<\/link>/g;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/g;
  let titles=[], links=[], descriptions=[], match;
  while((match=titleRegex.exec(rss))!==null){ const t=match[1]||match[2]; if(t!=="Google News") titles.push(t.trim()); }
  while((match=linkRegex.exec(rss))!==null){ const l=match[1]; if(l && !l.includes("news.google.com/rss")) links.push(l.trim()); }
  while((match=descRegex.exec(rss))!==null){ descriptions.push(match[1].replace(/<[^>]*>/g,"").trim()); }
  return {titles, links, descriptions};
}

function filterResults(titles, links, descriptions, keywords, maxItems){
  let results=[];
  for(let i=0;i<titles.length;i++){
    const summary=descriptions[i] && descriptions[i]!="" ? descriptions[i] : titles[i];
    results.push({title:titles[i], link:links[i], summary});
    if(results.length>=maxItems) break;
  }
  if(results.length===0) results.push({title:"No headlines", link:"https://news.google.com", summary:"Try again later."});
  return results;
}

function aiSummary(text){
  if(!text || text.trim()==="") return "Summary not available.";
  let sentences=text.split(/\. |\n/);
  let summary=sentences.slice(0,SUMMARY_SENTENCES);
  const numbers=text.match(/\b\d+(\.\d+)?%?\b/g)||[];
  if(numbers.length>0) summary.push("Key numbers mentioned: "+numbers.join(",")+".");
  return summary.join(". ") + ".";
}

function extractKeywords(text, limit=3){
  let words=text.toLowerCase().match(/\b[a-z]{4,}\b/g)||[];
  let freq={}; words.forEach(w=>freq[w]=(freq[w]||0)+1);
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(s=>s[0]);
}

// ---------- PARSE QUERY PARAMS ----------
let selectedProfile=PROFILES[4]; // default General
let argsIndex=0; // default
let argsQuery={};
if(args.queryParameters){
  argsQuery=args.queryParameters;
  if(argsQuery.profile) selectedProfile=PROFILES.find(p=>p.name===argsQuery.profile)||selectedProfile;
  if(argsQuery.index) argsIndex=parseInt(argsQuery.index);
}

// ---------- FETCH + PARSE ----------
const rssText = await fetchRSS(CATEGORIES[0].url);
const parsed = parseRSS(rssText);
const resultsWidget = filterResults(parsed.titles, parsed.links, parsed.descriptions, selectedProfile.keywords, MAX_ITEMS_WIDGET);
const resultsFull = filterResults(parsed.titles, parsed.links, parsed.descriptions, selectedProfile.keywords, MAX_ITEMS_MENU);

// ---------- WIDGET ----------
if(isWidget){
  const widget = new ListWidget();
  widget.backgroundColor=new Color("#111111");
  const header = widget.addText(`📰 ${selectedProfile.emoji} ${selectedProfile.name} News`);
  header.font=Font.boldSystemFont(16); header.textColor=Color.white(); widget.addSpacer(6);
  if(SHOW_KEYWORD_TRENDS){
    const trends=extractKeywords(parsed.titles.join(" ").toLowerCase(),3).join(", ");
    const trendText=widget.addText(`Trending: ${trends}`);
    trendText.font=Font.systemFont(10); trendText.textColor=Color.orange(); widget.addSpacer(4);
  }
  resultsWidget.forEach((r,i)=>{
    const t=widget.addText(`• ${r.title}`);
    t.font=Font.systemFont(12); t.textColor=Color.lightGray();
    t.url=`scriptable:///run/GoogleNewsUltimate?index=${i}&profile=${selectedProfile.name}`;
    widget.addSpacer(2);
  });
  Script.setWidget(widget); Script.complete();
}

// ---------- ONE-TAP AI SUMMARY FROM WIDGET ----------
if(argsQuery.index){
  const item = resultsFull[argsIndex];
  if(!item) return;
  Speech.speak(aiSummary(item.summary));
  Script.complete();
}

// ---------- FULL SCREEN MENU ----------
if(!isWidget && !argsQuery.index){
  if(SPEAK_HEADLINES){
    let speech=`Here are the latest ${selectedProfile.name} headlines. `;
    resultsFull.forEach((r,i)=>speech+=`Headline ${i+1}: ${r.title}. `);
    Speech.speak(speech);
  }

  const menu=new Alert();
  menu.title=`${selectedProfile.emoji} ${selectedProfile.name} News`;
  menu.message="Tap article for options";
  resultsFull.forEach(r=>menu.addAction(r.title));
  menu.addCancelAction("Close");
  const pick=await menu.presentSheet();
  if(pick===-1) Script.complete();

  // Dialog for AI summary or open article
  const detail=new Alert();
  detail.title=resultsFull[pick].title;
  detail.message="Choose an action:";
  detail.addAction("Listen AI Summary");
  detail.addAction("Open Article");
  detail.addCancelAction("Close");

  const action=await detail.present();
  if(action===0) Speech.speak(aiSummary(resultsFull[pick].summary));
  else if(action===1) Safari.open(resultsFull[pick].link);
  else Script.complete();
  Script.complete();
}