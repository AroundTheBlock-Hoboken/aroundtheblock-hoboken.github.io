# Around the Block

Part-time jobs at Hoboken businesses, a short walk from Stevens.

## How the site works
- Every row of the Google Sheet with `Active` = `Yes` becomes a job card.
- Click a card to see the full job description and the Stevens-only **Apply** button.
- Apply opens Outlook with a message to the employer already written. The message is also copied automatically and shown in the window, so if an email ever opens blank the student can paste it.
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
| Pay | (not shown on the site for now) |
| Walk | `4 min walk` (the number is used for "Closest to campus") |
| Apply | The employer's email (best), a web link, or a phone number |
| Posted | `2026-10-14` (or `10/14/2026`, or `10-14-2026`) |
| Active | Type `No` to hide a job. Blank or `Yes` = shown |
| Expires (optional) | Last day to show the job, e.g. `2026-11-30` or `12-1-2026`. It hides itself after that day |
| Job Description | 2 to 5 sentences. Alt+Enter (Windows) / Cmd+Enter (Mac) in a cell starts a new paragraph |
| Experience (optional) | e.g. `No experience needed`. Shows as a tag in the job window |
| Perks (optional) | e.g. `Free meals; Tips; Flexible schedule` (separate with `;`) |
| Website (optional) | The business website. Adds a link in the job window |
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
Open `app.js` and find `emailLinks`. Edit the lines of text there.

## Putting it online
Settings -> Pages -> Source: **Deploy from a branch** -> Branch `main`, folder `/ (root)` -> Save.

## If new rows stop showing up on the site
1. In the Google Sheet: **File -> Share -> Publish to web**. It should say "Published", with the jobs tab and **Comma-separated values (.csv)** selected, and **Automatically republish when changes are made** checked. If you stopped publishing, click **Publish** again.
2. Open the CSV link from `config.js` in a browser. It should show or download plain text rows, not a web page.
3. Wait up to 5 minutes (Google caches), then hard refresh the site.
4. Row 1 must still have a `Role` column. The site now says "Couldn't load jobs" if it doesn't, and the browser Console (F12) names the reason.

## Stevens-only applying (how it works today)
The Apply button opens a new email in **Outlook on the web**, which sends students through the Stevens (Okta) sign-in. The employer sees the @stevens.edu sender address. Gmail and other email options were removed on purpose.
Limit: this is not a hard lock. The employer emails are in the public sheet, so anyone could email them directly. A true lock needs Stevens IT to register an Okta app and a small server that sends the emails.

## Live demo for a business interview
1. Open the Google Sheet and add a row (Role, Business, Location, Type, Hours, Pay, Walk, Apply, Posted, Active = `Yes`, Job Description).
2. Google takes up to about 5 minutes to publish sheet changes. The site checks again every minute by itself, and the **Refresh listings** link checks right away.
3. The line above the cards shows "Updated" with the time of the last check.
4. Tip: add the row a few minutes before you show it. To remove a job, set `Active` to `No`.

## After you upload new files
In `index.html`, change the number in `?v=3` (three places) to `?v=4`, `?v=5`, and so on. This forces phones and computers to download the new files instead of using an old copy.

## If a row you typed doesn't show: use the Sheet check
Add `?check=1` to the end of the site address (example: `https://aroundtheblock-hoboken.github.io/?check=1`). A green box lists every row in the sheet and says "Showing" or "HIDDEN" with the reason (empty Role or Business, Active set to No, or past its Expires date). It also shows the end of the sheet link and which tab it reads.

## If you made a new copy of the sheet
The site reads ONE published sheet, set by `sheetCsvUrl` in `config.js`. A new or copied Google Sheet has a new link. Publish the new sheet (File -> Share -> Publish to web -> the jobs tab -> CSV), copy its link, and paste it into `config.js` in place of the old one.

## Connecting the Google Sheet to the website (the key step)
The website reads ONE published copy of the sheet, using the link in `config.js` (`sheetCsvUrl`).
1. Open the Google Sheet with the jobs.
2. **File -> Share -> Publish to web**.
3. Under "Link", choose the **jobs tab** (not "Entire document") and **Comma-separated values (.csv)**, then click **Publish**.
4. Check **Automatically republish when changes are made**.
5. Copy the link that appears. It starts with `https://docs.google.com/spreadsheets/d/e/2PACX-...`.
   (The normal "edit" link you use in the browser will NOT work here.)
6. On GitHub, open `config.js`, click the pencil icon, replace the text between the quotes after `sheetCsvUrl:` with the new link, and click **Commit changes**.
After this, any row typed in the sheet shows up on the site within a few minutes.
