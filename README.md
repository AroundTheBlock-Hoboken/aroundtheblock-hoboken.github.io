# Around the Block

Part-time jobs at Hoboken businesses, a short walk from Stevens.

## How the site works
- Every row of the Google Sheet with `Active` = `Yes` becomes a job card.
- Click a card to see the full job description and an **Apply by email** button.
- The button opens the student's email app with a message to the employer already written (name, Stevens email, phone, availability). The student adds their details, attaches a resume and sends.
- To **add a job**, add a row. To **remove a filled job**, set `Active` to `No`.
- Sheet changes show up on the site within about 5 minutes. No code changes needed.

## Google Sheet columns (row 1, capitalization doesn't matter)

| Column | Example / notes |
|---|---|
| Role | Barista |
| Business | Cafe Name |
| Location | Washington St |
| Type | Coffee shop, Restaurant, Retail (powers the filter) |
| Hours | Mon & Wed, 7 to 11am |
| Pay | $17/hr + tips |
| Walk | `4 min walk` (the number is used for "Closest to campus") |
| Apply | The employer's email (best), a web link, or a phone number |
| Posted | `2026-10-14` |
| Active | `Yes` or `No`. Blank = hidden |
| Job Description | 2 to 5 sentences. Alt+Enter (Windows) / Cmd+Enter (Mac) in a cell starts a new paragraph |
| ID (optional) | Short unique name for the job's link, e.g. `cafe-barista` |

Only put what students should see in this sheet. Keep private notes elsewhere.

## Files in this repo (keep it to these)
| File | What it is |
|---|---|
| `index.html` | Page layout and text |
| `style.css` | Colors, fonts, spacing |
| `app.js` | Loads the sheet, builds cards, job window, apply email |
| `config.js` | Sheet link and contact email (the file you edit most) |
| `logo.png`, `mascot.png` | Brand images |
| `README.md` | This file |

## Changing the apply email wording
Open `app.js` and find `applyLinks`. Edit the lines of text there.

## Putting it online
Settings -> Pages -> Source: **Deploy from a branch** -> Branch `main`, folder `/ (root)` -> Save.
