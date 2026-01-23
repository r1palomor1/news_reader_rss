// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
let fm = FileManager.local()
let path = fm.joinPath(fm.documentsDirectory(), "news_feeds_v80.json")

if (fm.fileExists(path)) {
  let data = fm.readString(path)
  console.log("--- YOUR FEEDS DATA BELOW ---")
  console.log(data) 
  // This will print your list of feeds in the log at the bottom
} else {
  console.log("File not found at v80. Check v79 or v78.")
}
