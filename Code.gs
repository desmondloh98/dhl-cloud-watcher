/**
 * DHL Cloud Watcher — Google Apps Script
 *
 * Monitors a shared Google Drive folder for AWB files (PDF/Excel).
 * When a new file is detected, it extracts waybill data and pushes
 * it to Google Sheets automatically.
 *
 * Setup:
 *   1. Set FOLDER_ID and PROCESSED_FOLDER_ID in Config.gs
 *   2. Run setupTrigger() once to create the auto-polling trigger
 *   3. Done — files dropped in the folder will be processed automatically
 */

// ── MAIN: Process new files in the AWB Drop Zone ──────────────────
function processNewFiles() {
  var folder    = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  var processed = DriveApp.getFolderById(CONFIG.PROCESSED_FOLDER_ID);
  var files     = folder.getFiles();
  var totalNv   = 0;
  var totalDhl  = 0;

  while (files.hasNext()) {
    var file     = files.next();
    var name     = file.getName().toLowerCase();
    var mimeType = file.getMimeType();

    // Skip non-AWB files
    if (!isAwbFile(name, mimeType)) continue;

    Logger.log("Processing: " + file.getName());

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
      Logger.log("ERROR processing " + file.getName() + ": " + e.message);
      continue;
    }

    if (results.length === 0) {
      Logger.log("  No waybill data found in " + file.getName());
      // Still move to processed to avoid re-scanning
      file.moveTo(processed);
      continue;
    }

    // Upload to Google Sheets
    var counts = pushToSheets(results);
    totalNv  += counts.ninjavan;
    totalDhl += counts.dhl;

    Logger.log("  Uploaded " + results.length + " waybills (" + counts.ninjavan + " NV, " + counts.dhl + " DHL)");

    // Move to Processed folder
    file.moveTo(processed);
    Logger.log("  Moved to Processed/");
  }

  // Send email notification if anything was processed
  if (totalNv + totalDhl > 0) {
    sendNotification(totalNv, totalDhl);
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

  // Keyword check (same as local watcher)
  var keywords = CONFIG.AWB_KEYWORDS;
  return keywords.some(function(kw) { return name.indexOf(kw) !== -1; });
}


// ── TRIGGER SETUP ─────────────────────────────────────────────────
/**
 * Run this function ONCE to set up the automatic trigger.
 * It creates a time-based trigger that checks for new files every 1 minute.
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

  Logger.log("Trigger created: processNewFiles runs every 1 minute");
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
function sendNotification(nvCount, dhlCount) {
  if (!CONFIG.NOTIFY_EMAIL) return;

  var total = nvCount + dhlCount;
  var subject = "AWB Auto-Upload: " + total + " waybill(s) processed";
  var body = "DHL Cloud Watcher processed new files:\n\n" +
             "  NinjaVan: " + nvCount + " rows → SG_NINJAVAN tab\n" +
             "  DHL:      " + dhlCount + " rows → NH_DHL tab\n\n" +
             "Google Sheet: https://docs.google.com/spreadsheets/d/" + CONFIG.SPREADSHEET_ID;

  MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
  Logger.log("Notification sent to " + CONFIG.NOTIFY_EMAIL);
}
