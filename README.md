# Around the Block

Part-time jobs at Hoboken businesses, a short walk from Stevens.

## How the site works
- Every row of the Google Sheet with `Active` = `Yes` becomes a job card.
- Click a card to open its full description. Each job has its own link (`.../#job=<id>`) that can be shared.
- To **add a job**, add a row. To **remove a filled job**, set `Active` to `No`.
- Sheet changes show up on the site within about 5 minutes. No code changes needed.

## Google Sheet columns (row 1, capitalization doesn't matter)

| Column | Required | Example / notes |
|---|---|---|
| Role | yes | Barista |
| Business | yes | Cafe Name |
| Location | yes | Washington St |
| Type | yes | Coffee shop, Restaurant, Retail (powers the filter) |
| Hours | yes | Mon & Wed, 7 to 11am |
| Pay | yes | $17/hr + tips |
| Walk | yes | `4 min walk` (the number is used for "Closest to campus") |
| Apply | yes | email, link, phone number, or short instruction |
| Posted | yes | `2026-10-14` (or `10/14/2026`) |
| Active | yes | `Yes` or `No`. Blank = hidden |
| **Description** (or **Job Description**) | optional | 2 to 5 sentences. Press Alt+Enter (Windows) / Cmd+Enter (Mac) inside the cell for new paragraphs |
| **ID** | optional | Short unique name for the job's link, e.g. `cafe-barista`. Auto-made if blank |

Only put what students should see in this sheet. Keep private notes in a separate sheet.

## Files
| File | What it is |
|---|---|
| `index.html` | Page layout, text, and the job detail window |
| `style.css` | Colors, fonts, spacing |
| `app.js` | Loads the sheet, builds cards, runs search/sort/detail window |
| `config.js` | Sheet link and contact email (unchanged) |
| `logo.png`, `mascot.png` | Brand images |

## Putting it online
Settings → Pages → Source: **Deploy from a branch** → `main`, folder `/ (root)` → Save.
Site appears at `https://<username>.github.io/around-the-block/`.
