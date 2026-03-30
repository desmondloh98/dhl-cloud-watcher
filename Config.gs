/**
 * Configuration — Atomic Group Fulfilment AWB Cloud Watcher
 *
 * UPDATE FOLDER_ID and PROCESSED_FOLDER_ID after creating the shared Drive folders.
 */
var CONFIG = {
  // Google Drive folder IDs (get from the folder URL)
  // https://drive.google.com/drive/folders/XXXXXX  ← the XXXXXX part
  FOLDER_ID:           "YOUR_AWB_DROP_ZONE_FOLDER_ID",
  PROCESSED_FOLDER_ID: "YOUR_PROCESSED_SUBFOLDER_ID",

  // Target Google Sheet (Atomic Group Fulfilment Form)
  SPREADSHEET_ID: "1ie0hPh9iJO-JT5T4cEmHsioj2_WTUHz8gAiN2M1dzwE",

  // Active brand for processing (set to the brand whose Drive folder this watches)
  // For now: "heartio". Later: deploy separate triggers per brand folder.
  ACTIVE_BRAND: "heartio",

  // Brand tab configurations
  // Each brand has its own tab with specific column positions (1-indexed)
  BRANDS: {
    heartio: {
      tabName: "Heartio",
      gid: 457400525,
      trackingCol: 40,       // Column AN = "Tracking Number"
      fulfilmentIdCol: 39,   // Column AM = "Fulfilment Order ID"
      recipientNameCol: 5,   // Column E  = "Recipient Name"
      recipientPhoneCol: 11, // Column K  = "Recipient Phone"
      orderIdCol: 3,         // Column C  = "Reference No / Order ID"
    },
    nattome: {
      tabName: "Nattome",
      gid: 400630564,
      trackingCol: 36,
      fulfilmentIdCol: 35,
      recipientNameCol: 5,
      recipientPhoneCol: 11,
      orderIdCol: 3,
    },
    tpd: {
      tabName: "TPD",
      gid: 738549696,
      trackingCol: 37,
      fulfilmentIdCol: 36,
      recipientNameCol: 5,
      recipientPhoneCol: 11,
      orderIdCol: 3,
    },
    hoohoo: {
      tabName: "Hoo Hoo",
      gid: 1633025110,
      trackingCol: 36,
      fulfilmentIdCol: 35,
      recipientNameCol: 5,
      recipientPhoneCol: 11,
      orderIdCol: 3,
    },
  },

  // Filename keywords for AWB detection
  AWB_KEYWORDS: ["awb", "dhl", "waybill", "airway", "ninjavan", "ninja van", "shipment", "tph", "b2b"],

  // Email for notifications (leave empty to disable)
  NOTIFY_EMAIL: ""
};
