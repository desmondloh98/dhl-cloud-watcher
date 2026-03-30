/**
 * Extraction logic — ported from Python dhl_watcher.py
 * Handles PDF (via OCR), Excel, and CSV files.
 * Returns arrays of objects with: trackingId, shipmentId, recipientName,
 * recipientPhone, cod, address, city, state, postalCode, carrier, orderRef
 */

// ── CARRIER DETECTION ─────────────────────────────────────────────
function detectCarrier(trackingId, fullText) {
  fullText = fullText || "";
  if (/^NV[A-Z0-9]+$/.test(trackingId))                     return "ninjavan";
  if (/^\d{10,16}$/.test(trackingId))                        return "dhl";
  if (fullText.toLowerCase().indexOf("ninjavan") !== -1)     return "ninjavan";
  if (fullText.toLowerCase().indexOf("dhl") !== -1)          return "dhl";
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

    // Process line by line, building entries as we find tracking IDs
    var entry = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // NinjaVan tracking ID on its own line
      var nvMatch = line.match(/^(NV[A-Z0-9]+)$/);
      if (nvMatch) {
        if (entry && entry.trackingId) results.push(entry);
        entry = makeEmptyEntry();
        entry.trackingId = nvMatch[1];
        entry.carrier = "ninjavan";
        continue;
      }

      // DHL tracking: only as first entry (not inside an active NV entry)
      var dhlMatch = line.match(/^(\d{10,16})$/);
      if (dhlMatch && !entry) {
        entry = makeEmptyEntry();
        entry.trackingId = dhlMatch[1];
        entry.carrier = "dhl";
        continue;
      }

      if (!entry) continue;

      // Recipient: line after SHIP TO / CONSIGNEE / RECIPIENT
      if (/^(SHIP\s*TO|CONSIGNEE|RECIPIENT)$/i.test(line) && i + 1 < lines.length) {
        var nextLine = lines[i + 1];
        var phoneMatch = nextLine.match(/(\*{2,}\d{3,}|\+?\d[\d\s]{7,})$/);
        if (phoneMatch) {
          entry.recipientPhone = phoneMatch[1].trim();
          entry.recipientName = nextLine.substring(0, phoneMatch.index).trim();
        } else {
          entry.recipientName = nextLine.trim();
        }
        i++; // skip the name line
        continue;
      }

      // COD amount
      if (!entry.cod) {
        var codMatch = line.match(/COD[:\s]*(SGD|MYR|USD)?\s*([\d,]+\.?\d*)/i);
        if (codMatch) {
          var currency = codMatch[1] || "SGD";
          entry.cod = currency + " " + codMatch[2].replace(/,/g, "");
        }
      }

      // Order reference from Comments line
      if (!entry.orderRef) {
        var commentMatch = line.match(/Comments?:\s*(\S+)/i);
        if (commentMatch) {
          entry.orderRef = commentMatch[1].trim();
        }
      }
    }

    // Don't forget the last entry
    if (entry && entry.trackingId) results.push(entry);

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
    var ss    = SpreadsheetApp.openById(tempFile.id);
    var sheet = ss.getActiveSheet();
    var data  = sheet.getDataRange().getValues();

    // Skip header row
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (!row.some(function(cell) { return cell !== "" && cell !== null; })) continue;

      var val = function(idx) {
        return (idx < row.length && row[idx] !== null && row[idx] !== undefined) ? String(row[idx]).trim() : "";
      };

      var tracking = val(1);  // Col B - Tracking ID
      if (!tracking) continue;

      var shipmentId = val(0); // Col A - Shipment ID
      var cod = val(2);        // Col C - COD Amount
      if (cod === "None" || cod === "undefined" || cod === "0") cod = "";

      // Extract order reference from shipment ID (e.g., "MYHVHELG1-681130" → "elg1-681130")
      var orderRef = "";
      var refMatch = shipmentId.match(/[Ee][Ll][Gg]\d+-\d+/);
      if (refMatch) orderRef = refMatch[0].toLowerCase();

      var carrier = detectCarrier(tracking);
      results.push({
        trackingId:     tracking,
        shipmentId:     shipmentId,
        recipientName:  val(3),  // Col D
        recipientPhone: val(8),  // Col I
        cod:            cod,
        address:        val(4),  // Col E
        city:           val(5),  // Col F
        state:          val(6),  // Col G
        postalCode:     val(7),  // Col H
        carrier:        carrier,
        orderRef:       orderRef
      });
    }
  } finally {
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
      trackingId:     tracking,
      shipmentId:     "",
      recipientName:  name,
      recipientPhone: contact,
      cod:            cod,
      address:        "",
      city:           "",
      state:          "",
      postalCode:     "",
      carrier:        detectCarrier(tracking),
      orderRef:       ""
    });
  }

  return results;
}


// ── HELPER ────────────────────────────────────────────────────────
function makeEmptyEntry() {
  return {
    trackingId: "",
    shipmentId: "",
    recipientName: "",
    recipientPhone: "",
    cod: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    carrier: "",
    orderRef: ""
  };
}
