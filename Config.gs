/**
 * Configuration — update these values before first run.
 */
var CONFIG = {
  // Google Drive folder IDs (get from the folder URL)
  // https://drive.google.com/drive/folders/XXXXXX  ← the XXXXXX part
  FOLDER_ID:           "YOUR_AWB_DROP_ZONE_FOLDER_ID",
  PROCESSED_FOLDER_ID: "YOUR_PROCESSED_SUBFOLDER_ID",

  // Google Sheet (same one used by the local watcher)
  SPREADSHEET_ID: "1iUGtlpamF4S1zUgavDem2S337qaCzFAF0yIn-g-JKks",

  // Tab GIDs
  GID_NINJAVAN: 750236063,
  GID_DHL:      1540347695,

  // Filename keywords — same as local watcher
  AWB_KEYWORDS: ["awb", "dhl", "waybill", "airway", "ninjavan", "ninja van", "shipment", "tph", "b2b"],

  // Email for notifications (leave empty to disable)
  NOTIFY_EMAIL: ""
};
