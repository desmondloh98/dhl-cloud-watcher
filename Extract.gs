/**
 * Extraction logic — ported from Python dhl_watcher.py
 * Handles PDF (via OCR), Excel, and CSV files.
 */

// ── CARRIER DETECTION ─────────────────────────────────────────────
function detectCarrier(trackingId, fullText) {
  fullText = fullText || "";
  if (/^NV[A-Z0-9]+$/.test(trackingId))        return "ninjavan";
  if (/^\d{10,16}$/.test(trackingId))           return "dhl";
  if (fullText.toLowerCase().indexOf("ninjavan") !== -1) return "ninjavan";
  if (fullText.toLowerCase().indexOf("dhl") !== -1)      return "dhl";
  return "ninjavan";  // default fallback
}


// ── PDF EXTRACTION (OCR via Google Docs) ──────────────────────────
function extractFromPdf(file) {
  var results = [];

  // Convert PDF to Google Doc using Drive's built-in OCR
  var resource = {
    title: "_temp_ocr_" + file.getName(),
    mimeType: "application/vnd.google-apps.document"
  };

  var blob = file.getBlob();
  var docFile;
  try {
    docFile = Drive.Files.insert(resource, blob, { ocr: true, convert: true });
  } catch (e) {
    Logger.log("  OCR failed for " + file.getName() + ": " + e.message);
    return results;
  }

  try {
    var doc  = DocumentApp.openById(docFile.id);
    var text = doc.getBody().getText();
    var lines = text.split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });

    var data = { "Tracking ID": "", "Recipient Name": "", "Recipient Contact": "", "Cash on Delivery": "", "carrier": "" };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // NinjaVan tracking
      if (!data["Tracking ID"]) {
        var nvMatch = line.match(/^(NV[A-Z0-9]+)$/);
        if (nvMatch) {
          data["Tracking ID"] = nvMatch[1];
          data["carrier"]     = "ninjavan";
        }
      }

      // DHL tracking (numeric 10-16 digits)
      if (!data["Tracking ID"]) {
        var dhlMatch = line.match(/^(\d{10,16})$/);
        if (dhlMatch) {
          data["Tracking ID"] = dhlMatch[1];
          data["carrier"]     = "dhl";
        }
      }

      // Recipient (after SHIP TO / CONSIGNEE / RECIPIENT)
      if (/^(SHIP\s*TO|CONSIGNEE|RECIPIENT)$/i.test(line) && i + 1 < lines.length) {
        var nextLine   = lines[i + 1];
        var phoneMatch = nextLine.match(/(\*+\d{3,}|\+?\d[\d\s]{7,})/);
        if (phoneMatch) {
          data["Recipient Contact"] = phoneMatch[1].trim();
          data["Recipient Name"]    = nextLine.substring(0, phoneMatch.index).trim();
        } else {
          data["Recipient Name"] = nextLine.trim();
        }
      }

      // COD amount
      if (!data["Cash on Delivery"]) {
        var codMatch = line.match(/COD[:\s]*(SGD|MYR|USD)?\s*([\d,]+\.?\d*)/i);
        if (codMatch) {
          var currency = codMatch[1] || "SGD";
          var amount   = codMatch[2].replace(/,/g, "");
          data["Cash on Delivery"] = currency + " " + amount;
        }
      }
    }

    // Finalize carrier detection
    if (data["Tracking ID"] && !data["carrier"]) {
      data["carrier"] = detectCarrier(data["Tracking ID"], text);
    }

    if (data["Tracking ID"]) {
      results.push(data);
    }

    // For multi-page PDFs: the OCR produces one big text block.
    // If there are multiple tracking IDs, find them all.
    var allTrackings = text.match(/\b(NV[A-Z0-9]+|\d{10,16})\b/g) || [];
    if (allTrackings.length > 1) {
      // Already got the first one above; extract the rest as minimal records
      for (var t = 1; t < allTrackings.length; t++) {
        var tid = allTrackings[t];
        // Skip if already captured
        if (results.some(function(r) { return r["Tracking ID"] === tid; })) continue;
        results.push({
          "Tracking ID":       tid,
          "Recipient Name":    "",
          "Recipient Contact": "",
          "Cash on Delivery":  "",
          "carrier":           detectCarrier(tid, text)
        });
      }
    }

  } finally {
    // Clean up temporary OCR document
    try { Drive.Files.remove(docFile.id); } catch(e) {}
  }

  return results;
}


// ── EXCEL EXTRACTION ──────────────────────────────────────────────
function extractFromExcel(file) {
  var results = [];

  // Convert Excel to temporary Google Sheet
  var resource = {
    title: "_temp_extract_" + file.getName(),
    mimeType: "application/vnd.google-apps.spreadsheet"
  };
  var blob = file.getBlob();
  var tempFile;
  try {
    tempFile = Drive.Files.insert(resource, blob, { convert: true });
  } catch (e) {
    Logger.log("  Excel conversion failed: " + e.message);
    return results;
  }

  try {
    var ss   = SpreadsheetApp.openById(tempFile.id);
    var sheet = ss.getActiveSheet();
    var data  = sheet.getDataRange().getValues();

    // Skip header row
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (!row.some(function(cell) { return cell !== "" && cell !== null; })) continue;

      var val = function(i) {
        return (i < row.length && row[i] !== null && row[i] !== undefined) ? String(row[i]).trim() : "";
      };

      var tracking = val(1);  // Col B - Tracking ID
      if (!tracking) continue;

      var cod = val(2);       // Col C - COD Amount
      if (cod === "None" || cod === "undefined") cod = "";

      var carrier = detectCarrier(tracking);
      results.push({
        "Tracking ID":       tracking,
        "Shipment ID":       val(0),  // Col A
        "Recipient Name":    val(3),  // Col D
        "Recipient Contact": val(8),  // Col I
        "Cash on Delivery":  cod,
        "Address":           val(4),  // Col E
        "City":              val(5),  // Col F
        "State":             val(6),  // Col G
        "PostalCode":        val(7),  // Col H
        "carrier":           carrier
      });
    }
  } finally {
    // Clean up temporary spreadsheet
    try { Drive.Files.remove(tempFile.id); } catch(e) {}
  }

  return results;
}


// ── CSV EXTRACTION ────────────────────────────────────────────────
function extractFromCsv(file) {
  var results = [];
  var content = file.getBlob().getDataAsString("utf-8");
  var rows    = Utilities.parseCsv(content);

  if (rows.length < 2) return results;

  var headers = rows[0].map(function(h) { return h.trim(); });

  var colMap = {
    tracking: ["Tracking ID", "Tracking Number", "AWB", "Waybill No", "tracking_id", "TrackingNumber"],
    name:     ["Recipient Name", "Consignee Name", "Receiver Name", "recipient_name", "Name"],
    contact:  ["Recipient Contact", "Consignee Mobile", "Phone", "Mobile", "Contact", "recipient_contact"],
    cod:      ["Cash on Delivery", "COD", "COD Amount", "cod_amount"]
  };

  function findColIndex(opts) {
    for (var o = 0; o < opts.length; o++) {
      var idx = headers.indexOf(opts[o]);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var trackIdx   = findColIndex(colMap.tracking);
  var nameIdx    = findColIndex(colMap.name);
  var contactIdx = findColIndex(colMap.contact);
  var codIdx     = findColIndex(colMap.cod);

  if (trackIdx === -1) return results;

  for (var r = 1; r < rows.length; r++) {
    var row      = rows[r];
    var tracking = (trackIdx < row.length) ? row[trackIdx].trim() : "";
    if (!tracking) continue;

    var name    = (nameIdx >= 0 && nameIdx < row.length)    ? row[nameIdx].trim()    : "";
    var contact = (contactIdx >= 0 && contactIdx < row.length) ? row[contactIdx].trim() : "";
    var cod     = (codIdx >= 0 && codIdx < row.length)      ? row[codIdx].trim()      : "";

    if (cod && !/^(SGD|MYR|USD)/i.test(cod)) {
      cod = cod ? "SGD " + cod : "";
    }

    results.push({
      "Tracking ID":       tracking,
      "Recipient Name":    name,
      "Recipient Contact": contact,
      "Cash on Delivery":  cod,
      "carrier":           detectCarrier(tracking)
    });
  }

  return results;
}
