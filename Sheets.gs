/**
 * Google Sheets upload logic — pushes extracted waybill data
 * to the correct tab (NH_DHL or SG_NINJAVAN).
 */

function pushToSheets(allData) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var counts = { ninjavan: 0, dhl: 0 };

  var nvRows  = allData.filter(function(d) { return d.carrier === "ninjavan"; });
  var dhlRows = allData.filter(function(d) { return d.carrier === "dhl"; });

  // ── SG_NINJAVAN tab ───────────────────────────────────────────
  // Cols: A=Tracking ID, B-F=blank, G=Recipient Name, H=Contact, I=COD
  if (nvRows.length > 0) {
    var nvSheet = getSheetByGid(ss, CONFIG.GID_NINJAVAN);
    if (nvSheet) {
      var rows = nvRows.map(function(d) {
        return [
          d["Tracking ID"], "", "", "", "", "",
          d["Recipient Name"],
          d["Recipient Contact"],
          d["Cash on Delivery"]
        ];
      });
      nvSheet.getRange(nvSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      counts.ninjavan = nvRows.length;
      Logger.log("  [NINJAVAN] " + nvRows.length + " rows added to '" + nvSheet.getName() + "'");
    }
  }

  // ── NH_DHL tab ────────────────────────────────────────────────
  // Cols: A=Shipment ID, B=Tracking ID, C=COD, D=Name, E=Address,
  //       F=City, G=State, H=PostalCode, I=Mobile
  if (dhlRows.length > 0) {
    var dhlSheet = getSheetByGid(ss, CONFIG.GID_DHL);
    if (dhlSheet) {
      var rows = dhlRows.map(function(d) {
        return [
          d["Shipment ID"] || "",
          d["Tracking ID"],
          d["Cash on Delivery"],
          d["Recipient Name"],
          d["Address"] || "",
          d["City"] || "",
          d["State"] || "",
          d["PostalCode"] || "",
          d["Recipient Contact"]
        ];
      });
      dhlSheet.getRange(dhlSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      counts.dhl = dhlRows.length;
      Logger.log("  [DHL] " + dhlRows.length + " rows added to '" + dhlSheet.getName() + "'");
    }
  }

  return counts;
}


/**
 * Get a sheet by its GID (tab ID), since tab names can be renamed.
 */
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
