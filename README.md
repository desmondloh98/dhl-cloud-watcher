# DHL Cloud Watcher

Automated AWB (Air Waybill) file processor that runs entirely on Google's infrastructure. No server, no PC required.

## How It Works

```
Fulfillment team uploads PDF/Excel to shared Google Drive folder
        |
Google Apps Script detects new file (checks every 1 minute)
        |
Extracts: Tracking ID, Recipient Name, Contact, COD Amount
        |
Auto-detects carrier: DHL (numeric tracking) or NinjaVan (NV prefix)
        |
Pushes data to Google Sheets (correct tab automatically)
        |
Moves processed file to "Processed" subfolder
        |
(Optional) Sends email notification
```

## Supported File Types

| Format | Extraction Method |
|--------|------------------|
| PDF    | Google Drive OCR -> text parsing with regex |
| Excel (.xlsx/.xls) | Convert to Google Sheet -> read cell values |
| CSV    | Parse with flexible column mapping |

## Setup Guide

### Step 1: Create Google Drive Folders

1. Go to [Google Drive](https://drive.google.com)
2. Create a folder called **"AWB Drop Zone"**
3. Inside it, create a subfolder called **"Processed"**
4. Right-click "AWB Drop Zone" -> Share -> add the fulfillment team's emails
5. Copy both folder IDs from the URL:
   ```
   https://drive.google.com/drive/folders/XXXXXXXXXXXXXX
                                          ^^^^^^^^^^^^^^ this is the folder ID
   ```

### Step 2: Set Up Google Apps Script

1. Open your [Google Sheet](https://docs.google.com/spreadsheets/d/1iUGtlpamF4S1zUgavDem2S337qaCzFAF0yIn-g-JKks)
2. Go to **Extensions -> Apps Script**
3. Delete any existing code in the editor
4. Create 4 files (use the **+** button next to "Files"):
   - `Code.gs` — paste contents of `Code.gs`
   - `Config.gs` — paste contents of `Config.gs`
   - `Extract.gs` — paste contents of `Extract.gs`
   - `Sheets.gs` — paste contents of `Sheets.gs`
5. In `Config.gs`, update:
   - `FOLDER_ID` — your AWB Drop Zone folder ID
   - `PROCESSED_FOLDER_ID` — your Processed subfolder ID
   - `NOTIFY_EMAIL` — your email (optional)

### Step 3: Enable Drive API

1. In Apps Script, click **Services** (left sidebar, + icon)
2. Search for **Drive API** and click **Add**
3. This is required for PDF OCR and Excel conversion

### Step 4: Activate the Trigger

1. In Apps Script, run the function `setupTrigger` (select it from dropdown, click Run)
2. Grant permissions when prompted (Google will ask to access Drive and Sheets)
3. The script now checks for new files every 1 minute automatically

### Step 5: Test It

1. Drop a test PDF or Excel file into the "AWB Drop Zone" folder
2. Wait up to 1 minute
3. Check your Google Sheet — data should appear in the correct tab
4. The file should move to the "Processed" subfolder

## For the Fulfillment Team

Simple instructions to share with the team:

> **How to upload AWB files:**
> 1. Open WhatsApp -> tap the file (PDF/Excel)
> 2. Tap **Share** -> **Google Drive**
> 3. Select the **"AWB Drop Zone"** folder
> 4. Tap **Save**
> 5. Done! Data will appear in Google Sheets within 1 minute.

## Column Mapping

### NH_DHL Tab
| Col | Field |
|-----|-------|
| A | Shipment ID |
| B | Tracking ID |
| C | COD Amount |
| D | Consignee Name |
| E | Address |
| F | City |
| G | State |
| H | PostalCode |
| I | Mobile |

### SG_NINJAVAN Tab
| Col | Field |
|-----|-------|
| A | Tracking ID |
| B-F | (blank) |
| G | Recipient Name |
| H | Contact |
| I | COD Amount |

## Carrier Detection

| Pattern | Carrier |
|---------|---------|
| Starts with `NV` (e.g. `NVMYTHRTR000002163`) | NinjaVan |
| Numeric 10-16 digits (e.g. `7027096254670335`) | DHL |
| Filename contains "ninjavan" | NinjaVan |
| Filename contains "dhl" | DHL |
| Default fallback | NinjaVan |

## File Keyword Filters

Files are only processed if their name contains one of these keywords:
`awb`, `dhl`, `waybill`, `airway`, `ninjavan`, `ninja van`, `shipment`, `tph`, `b2b`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Files not being detected | Check folder ID in Config.gs matches your Drive folder |
| PDF extraction empty | Some image-heavy PDFs may not OCR well. Try Excel instead |
| Permission denied | Re-run setupTrigger and grant all permissions |
| Trigger stopped working | Go to Apps Script -> Triggers -> check for errors |

## Architecture

- **Phase 1 (Local):** `dhl_watcher.py` — runs on PC, watches Desktop folder + Downloads
- **Phase 2 (Cloud):** Google Apps Script — runs on Google's servers, watches Google Drive folder
- Both can run simultaneously as backup for each other
