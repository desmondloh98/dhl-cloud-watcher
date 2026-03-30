/**
 * Google Sheets — Match & Update Logic
 *
 * Instead of appending new rows, this matches extracted tracking data
 * to existing orders by Recipient Name, Phone, or Order Reference,
 * then updates the Tracking Number and Fulfilment Order ID columns.
 */

// ── MAIN: Match and update tracking numbers ──────────────────────
function updateTrackingInSheet(brandKey, entries) {
  if (!entries || entries.length === 0) return { updated: 0, notFound: 0 };

  var brandConfig = CONFIG.BRANDS[brandKey];
  if (!brandConfig) {
    Logger.log("ERROR: Unknown brand: " + brandKey);
    return { updated: 0, notFound: entries.length };
  }

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = getSheetByGid(ss, brandConfig.gid);
  if (!sheet) {
    Logger.log("ERROR: Sheet not found for brand " + brandKey + " (GID: " + brandConfig.gid + ")");
    return { updated: 0, notFound: entries.length };
  }

  // Read all data from the sheet
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log("WARNING: " + brandConfig.tabName + " tab is empty (no data rows)");
    return { updated: 0, notFound: entries.length };
  }

  var allData = sheet.getRange(1, 1, lastRow, brandConfig.trackingCol).getValues();
  var updated = 0;
  var notFound = 0;

  for (var e = 0; e < entries.length; e++) {
    var entry = entries[e];
    var matchedRow = -1;

    var entryName  = normalizeName(entry.recipientName);
    var entryPhone = normalizePhone(entry.recipientPhone);
    var entryRef   = entry.orderRef ? entry.orderRef.toLowerCase() : "";

    // Search rows (skip header at index 0)
    for (var i = 1; i < allData.length; i++) {
      var row = allData[i];
      var trackingColIdx = brandConfig.trackingCol - 1; // 0-indexed

      // Skip rows that already have a tracking number
      if (row[trackingColIdx] && String(row[trackingColIdx]).trim() !== "") continue;

      var rowName  = normalizeName(String(row[brandConfig.recipientNameCol - 1] || ""));
      var rowPhone = normalizePhone(String(row[brandConfig.recipientPhoneCol - 1] || ""));
      var rowOrderId = String(row[brandConfig.orderIdCol - 1] || "").toLowerCase().trim();

      // Match by phone number (most reliable — last 8 digits)
      if (entryPhone && rowPhone && entryPhone === rowPhone) {
        matchedRow = i;
        break;
      }

      // Match by recipient name (fuzzy — token overlap)
      if (entryName && rowName && fuzzyNameMatch(entryName, rowName)) {
        matchedRow = i;
        break;
      }

      // Match by order reference
      if (entryRef && rowOrderId && (rowOrderId.indexOf(entryRef) !== -1 || entryRef.indexOf(rowOrderId) !== -1)) {
        matchedRow = i;
        break;
      }
    }

    if (matchedRow >= 0) {
      var sheetRow = matchedRow + 1; // 1-indexed for Sheets API

      // Write Tracking Number
      sheet.getRange(sheetRow, brandConfig.trackingCol).setValue(entry.trackingId);

      // Write Fulfilment Order ID (if we have a shipment ID)
      if (entry.shipmentId && brandConfig.fulfilmentIdCol) {
        sheet.getRange(sheetRow, brandConfig.fulfilmentIdCol).setValue(entry.shipmentId);
      }

      // Mark row as used in our local copy so we don't double-assign
      allData[matchedRow][brandConfig.trackingCol - 1] = entry.trackingId;

      updated++;
      Logger.log("  ✅ Matched: " + entry.trackingId + " → Row " + sheetRow +
                 " (" + entry.recipientName + ")");
    } else {
      notFound++;
      Logger.log("  ⚠️ No match: " + entry.trackingId +
                 " | Name: " + entry.recipientName +
                 " | Phone: " + entry.recipientPhone);
    }
  }

  // Flush all changes
  SpreadsheetApp.flush();

  return { updated: updated, notFound: notFound };
}


// ── NORMALIZE HELPERS ─────────────────────────────────────────────

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function normalizePhone(phone) {
  // Strip everything except digits, then take last 8 digits
  var digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 6) return "";
  return digits.slice(-8);
}

function fuzzyNameMatch(a, b) {
  if (!a || !b) return false;
  // Simple containment check
  if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;

  // Token overlap: at least 60% of words match
  var tokensA = a.split(/\s+/);
  var tokensB = b.split(/\s+/);
  var matched = 0;
  for (var i = 0; i < tokensA.length; i++) {
    if (tokensB.indexOf(tokensA[i]) !== -1) matched++;
  }
  var maxTokens = Math.max(tokensA.length, tokensB.length);
  return maxTokens > 0 && (matched / maxTokens) >= 0.6;
}


// ── GET SHEET BY GID ──────────────────────────────────────────────
function getSheetByGid(spreadsheet, gid) {
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) {
      return sheets[i];
    }
  }
  Logger.log("  WARNING: No sheet found with GID " + gid);
  return null;
}
