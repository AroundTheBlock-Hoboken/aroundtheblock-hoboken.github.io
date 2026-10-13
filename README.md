# Around the Block

Part-time jobs at Hoboken businesses, a short walk from Stevens.

## How the site works

- The website shows every **active** row of our Google Sheet as a job card.
- To **add a job**, add a row to the sheet. To **remove a filled job**, set `Active` to `No`.
- No code changes are needed for listings. Changes show up on the site within about 5 minutes.

## Google Sheet setup (one time)

1. Create a Google Sheet with these column headers in row 1, spelled exactly like this:

   | Role | Business | Location | Type | Hours | Pay | Walk | Apply | Posted | Active |
   |---|---|---|---|---|---|---|---|---|---|

   - `Type`: e.g. Coffee shop, Restaurant, Retail (used for the filter)
   - `Walk`: e.g. `4 min walk`
   - `Apply`: an email, a link, a phone number, or a short instruction
   - `Posted`: date as `YYYY-MM-DD`
   - `Active`: `Yes` or `No`
2. **File → Share → Publish to web** → choose the sheet tab → **Comma-separated values (.csv)** → **Publish**. Copy the link.
3. Open `config.js`, paste the link into `sheetCsvUrl`, and set `contactEmail`.

Only put what students should see in this sheet. Keep private notes (owner phone numbers, interview notes) in a separate sheet.

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout and text |
| `style.css` | Colors, fonts, spacing |
| `app.js` | Loads the sheet and builds the job cards |
| `config.js` | Sheet link and contact email: **the only file you normally edit** |
| `logo.png`, `mascot.png` | Brand images |

## Putting it online

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
The site appears at `https://<username>.github.io/around-the-block/` after a minute or two.
