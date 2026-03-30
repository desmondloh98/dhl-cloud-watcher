/**
 * AWB Cloud Watcher — Google Apps Script
 *
 * Monitors a shared Google Drive folder for AWB files (PDF/Excel).
 * When a new file is detected, it extracts waybill data, matches it
 * to existing orders in the brand tab, and updates the Tracking Number.
 *
 * Setup:
 *   1. Set FOLDER_ID and PROCESSED_FOLDER_ID in Config.gs
 *   2. Set ACTIVE_BRAND in Config.gs (e.g., "heartio")
 *   3. Enable Drive API: Extensions → Apps Script → Services → Drive API v2
 *   4. Run setupTrigger() once to create the auto-polling trigger
 *   5. Done — files dropped in the folder will be processed automatically
 */

// ── MAIN: Process new files in the AWB Drop Zone ──────────────────
function processNewFiles() {
  var folder    = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  var processed = DriveApp.getFolderById(CONFIG.PROCESSED_FOLDER_ID);
  var files     = folder.getFiles();
  var brand     = CONFIG.ACTIVE_BRAND;
  var totalUpdated  = 0;
  var totalNotFound = 0;

  while (files.hasNext()) {
    var file     = files.next();
    var name     = file.getName().toLowerCase();
    var mimeType = file.getMimeType();

    // Skip non-AWB files
    if (!isAwbFile(name, mimeType)) continue;

    Logger.log("📄 Processing: " + file.getName() + " (Brand: " + brand + ")");

    var results = [];
    try {
      if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
        results = extractFromPdf(file);
      } else if (mimeType === MimeType.MICROSOFT_EXCEL ||
                 mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                 name.endsWith(".xlsx") || name.endsWith(".xls")) {
        results = extractFromExcel(file);
      } else if (name.endsWith(".csv")) {
        results = extractFromCsv(file);
      }
    } catch (e) {
      Logger.log("❌ ERROR processing " + file.getName() + ": " + e.message);
      continue;
    }

    if (results.length === 0) {
      Logger.log("  No waybill data found in " + file.getName());
      file.moveTo(processed);
      continue;
    }

    Logger.log("  Extracted " + results.length + " tracking entries");

    // Match and update in the brand's tab
    var counts = updateTrackingInSheet(brand, results);
    totalUpdated  += counts.updated;
    totalNotFound += counts.notFound;

    Logger.log("  Result: " + counts.updated + " updated, " + counts.notFound + " not matched");

    // Move to Processed folder
    file.moveTo(processed);
    Logger.log("  ✅ Moved to Processed/");
  }

  // Send email notification if anything was processed
  if (totalUpdated > 0 || totalNotFound > 0) {
    sendNotification(brand, totalUpdated, totalNotFound);
  }
}


// ── FILE DETECTION ────────────────────────────────────────────────
function isAwbFile(name, mimeType) {
  var validExts = [".pdf", ".xlsx", ".xls", ".csv"];
  var hasValidExt = validExts.some(function(ext) { return name.endsWith(ext); });

  if (!hasValidExt && mimeType !== "application/pdf" &&
      mimeType !== MimeType.MICROSOFT_EXCEL &&
      mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return false;
  }

  // Keyword check
  var keywords = CONFIG.AWB_KEYWORDS;
  return keywords.some(function(kw) { return name.indexOf(kw) !== -1; });
}


// ── TRIGGER SETUP ─────────────────────────────────────────────────
/**
 * Run this function ONCE to set up the automatic trigger.
 * Creates a time-based trigger that checks for new files every 1 minute.
 */
function setupTrigger() {
  // Remove any existing triggers first
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "processNewFiles") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger: every 1 minute
  ScriptApp.newTrigger("processNewFiles")
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log("✅ Trigger created: processNewFiles runs every 1 minute");
}

/**
 * Remove all triggers (for cleanup).
 */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log("All triggers removed");
}


// ── NOTIFICATION ──────────────────────────────────────────────────
function sendNotification(brand, updatedCount, notFoundCount) {
  if (!CONFIG.NOTIFY_EMAIL) return;

  var brandConfig = CONFIG.BRANDS[brand];
  var tabName = brandConfig ? brandConfig.tabName : brand;
  var total = updatedCount + notFoundCount;

  var subject = "AWB Auto-Update: " + updatedCount + "/" + total + " tracking numbers matched (" + tabName + ")";
  var body = "AWB Cloud Watcher processed new files:\n\n" +
             "  Brand:    " + tabName + "\n" +
             "  Updated:  " + updatedCount + " orders\n" +
             "  No match: " + notFoundCount + " entries\n\n" +
             "Google Sheet: https://docs.google.com/spreadsheets/d/" + CONFIG.SPREADSHEET_ID;

  MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
  Logger.log("📧 Notification sent to " + CONFIG.NOTIFY_EMAIL);
}


// ── MANUAL TEST ───────────────────────────────────────────────────
/**
 * Run this to test the setup without waiting for the trigger.
 * Make sure you have a file in the AWB Drop Zone folder first.
 */
function testProcessing() {
  Logger.log("=== MANUAL TEST RUN ===");
  Logger.log("Active brand: " + CONFIG.ACTIVE_BRAND);
  Logger.log("Spreadsheet: " + CONFIG.SPREADSHEET_ID);
  Logger.log("Folder ID: " + CONFIG.FOLDER_ID);
  processNewFiles();
  Logger.log("=== TEST COMPLETE ===");
}
