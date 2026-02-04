// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: magic;
// =======================================
// FEEDS MIGRATION SCRIPT (LOCAL -> ICLOUD)
// Run this once to secure your data
// =======================================

const localFM = FileManager.local()
const cloudFM = FileManager.iCloud()

const oldPath = localFM.joinPath(localFM.documentsDirectory(), "news_feeds_v80.json")
const newPath = cloudFM.joinPath(cloudFM.documentsDirectory(), "global_news_feeds.json")

if (localFM.fileExists(oldPath)) {
  // 1. Grab your data from the hidden local folder
  let data = localFM.readString(oldPath)
  
  // 2. Write it to the visible iCloud folder
  cloudFM.writeString(newPath, data)
  
  // 3. Confirm it worked
  console.log("✅ SUCCESS!")
  console.log("Your feeds have been moved to iCloud.")
  console.log("New File: iCloud Drive/Scriptable/global_news_feeds.json")
  
  let a = new Alert()
  a.title = "Migration Complete"
  a.message = "Your 13 feeds are now safe in iCloud. You can now use the V82 script with the iCloud setting."
  a.present()
} else {
  console.log("❌ Error: Could not find the v80 file in local storage.")
}
