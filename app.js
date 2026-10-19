// =====================================================================
// app.js  |  Around the Block
// Loads job listings from a published Google Sheet (CSV), shows them as
// cards, and opens a detail window when a listing is clicked.
//
// Legend:  [NEW] = added in this version   [CHANGED] = edited from your old version
// =====================================================================
(function () {
  "use strict";
  const cfg = window.ATB_CONFIG || {};

  // ---------- Page elements ----------
  const $ = id => document.getElementById(id);
  const listEl = $("list"), statusEl = $("status");
  const qEl = $("q"), typeEl = $("type");
  const sortEl = $("sort");                                  // [NEW] sort dropdown
  const dlg = $("job-dialog"), dlgBody = $("dialog-body");   // [NEW] detail window
  let jobs = [];

  // [NEW] Works on older Safari (iPhone/iPad): a safe way to clear and fill a box, and a basic
  // pop-up window for iOS versions before 15.4, which don't support <dialog>.
  function setChildren(node, kids) {
    while (node.firstChild) node.removeChild(node.firstChild);
    kids.forEach(k => node.appendChild(k));
  }
  const dialogFallback = typeof dlg.showModal !== "function";
  if (dialogFallback) {
    dlg.classList.add("dlg-fallback");
    dlg.showModal = () => dlg.setAttribute("open", "");
    dlg.close = () => { if (dlg.hasAttribute("open")) { dlg.removeAttribute("open"); dlg.dispatchEvent(new Event("close")); } };
    document.addEventListener("keydown", e => { if (e.key === "Escape") dlg.close(); });
  }
  const isOpen = () => dlg.hasAttribute("open");

  // [FIXED] "Email us" buttons. They open Outlook (web on computers, the app on phones),
  // and the address is always shown on the page so nobody gets stuck.
  (function () {
    const to = cfg.contactEmail || "";
    const subject = "Job Listing Request for Around the Block";
    const body = [
      "Hello Around the Block Team,",
      "",
      "We would like to post a part-time job for Stevens students. Our details are below.",
      "",
      "Business name:",
      "Business type (coffee shop, restaurant, retail, etc.):",
      "Address:",
      "",
      "Job title:",
      "Hours / shifts (days and times, e.g. Weekends 8am-2pm):",
      "Experience needed (or \"None\"):",
      "Short description of the job (2 to 3 sentences):",
      "",
      "Email address students should send applications to:",
      "Last day to apply (optional):",
      "",
      "Your name and role at the business:",
      "Phone number (optional):",
      "",
      "Thank you,"
    ].join("\n");
    const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    const q = "to=" + encodeURIComponent(to) + "&subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    const plain = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    ["contact-btn", "footer-contact"].forEach(id => {
      const a = $(id); if (!a || !to) return;
      a.href = plain;                       // works with any mail app, and if scripts are slow
      a.addEventListener("click", e => {
        e.preventDefault();
        if (phone) { location.href = "ms-outlook://compose?" + q; }
        else { window.open("https://outlook.office.com/mail/deeplink/compose?" + q, "_blank", "noopener"); }
      });
    });
    document.querySelectorAll(".contact-addr").forEach(n => { n.textContent = to; if (n.tagName === "A") n.href = "mailto:" + to; });
    document.querySelectorAll(".copy-addr").forEach(btn => btn.addEventListener("click", () => {
      const done = () => { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy Address"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(to).then(done, () => {});
      else { const t = document.createElement("textarea"); t.value = to; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (x) {} document.body.removeChild(t); }
    }));
  })();

  // ---------- [CHANGED] Column names ----------
  // Sheet headers are now matched ignoring capitals, so "pay" or "PAY" still works.
  const COLUMNS = ["Role","Business","Location","Type","Hours","Pay","Walk",
                   "Apply","Posted","Active","Description","ID","Expires","Experience","Website","Perks","Logo","Shifts"];       // [NEW] Description, ID
  const CANON = Object.fromEntries(COLUMNS.map(c => [c.toLowerCase(), c]));
  // [CHANGED] Alternate header names that also work. Your sheet uses "Job Description".
  Object.assign(CANON, {
    "job description": "Description",
    "job desc": "Description",
    "about": "Description",
    "details": "Description",
    "closes": "Expires",
    "expiry": "Expires"
  });
  let hasActiveColumn = false, hasRoleColumn = false, lastHead = [];
  const checkMode = /[?&]check(=|&|$)/.test(location.search);   // add ?check=1 to the web address

  // ---------- CSV parser (same logic as before, plus header cleanup) ----------
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map(h => CANON[h.trim().toLowerCase()] || h.trim()); // [CHANGED]
    lastHead = head;
    hasActiveColumn = head.includes("Active");
    hasRoleColumn = head.includes("Role");
    return rows
      .filter(r => r.some(v => v.trim()))
      .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }

  // ---------- [CHANGED] Which rows show ----------
  // A row shows when it has a Role and a Business, is not marked Active = No, and has not passed its Expires date.
  // A blank Active cell now means "show" (type your row and it appears). To hide a job, type No.
  // [NEW] Last day a job shows: the Expires date, or (if Expires is blank) 30 days after Posted.
  // A job with neither stays up until you type No in Active.
  const DAY = 864e5, AUTO_DAYS = 30;
  function expiryTime(j) {
    const e = parseDate(j.Expires);
    if (e) return e;
    const p = parseDate(j.Posted);
    return p && p <= Date.now() + DAY ? p + AUTO_DAYS * DAY : 0;
  }
  const isExpired = j => { const t = expiryTime(j); return !!t && t + DAY <= Date.now(); };
  function hideReason(j) {
    if (!j.Role || !j.Business) return "Role or Business is empty";
    if (hasActiveColumn && j.Active && !/^(y|yes|true|1)$/i.test(j.Active)) return 'Active says "' + j.Active + '" (type Yes to show it)';
    if (isExpired(j)) return j.Expires ? "Expired on " + j.Expires : "More than " + AUTO_DAYS + " days since Posted (add an Expires date to change this)";
    return "";
  }
  const isActive = j => !hideReason(j);

  // ---------- [NEW] Helpers ----------
  // Reads 2026-10-14 or 10/14/2026 (Google Sheets can publish either). Returns a number.
  function parseDate(s) {
    if (!s) return 0;
    s = s.trim();
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);          // 2026-10-14
    if (m) return new Date(+m[1], m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);          // 10/14/2026 or 12-1-2026 (month first)
    if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], m[1] - 1, +m[2]).getTime();
    return 0;   // [CHANGED] no Date.parse fallback: Safari and Chrome disagree on odd formats
  }
  // [NEW] "Today", "Yesterday", "3 Days Ago", otherwise "Oct 13, 2026".
  function fmtDate(s) {
    const t = parseDate(s);
    if (!t) return s;
    const days = Math.floor((Date.now() - t) / 864e5);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days > 1 && days < 14) return days + " Days Ago";
    return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  // [NEW] A "Posted" date in the future is ignored (no date shown, not used for sorting).
  const postedTime = j => { const t = parseDate(j.Posted); return t && t <= Date.now() + 864e5 ? t : 0; };
  const walkMinutes = s => { const m = (s || "").match(/\d+/); return m ? +m[0] : 999; };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // [NEW] Turns the Description cell into clean text: short lines like "Responsibilities" become
  // small headings, lines that start with a bullet (• - *) become a list, everything else is a paragraph.
  function renderDescription(box, text) {
    const lines = text.split(/\n/).map(l => l.replace(/\t/g, " ").trim());
    const isBullet = l => /^[•·\-*–]\s*\S/.test(l);
    let ul = null;
    lines.forEach((l, i) => {
      if (!l) { ul = null; return; }
      if (isBullet(l)) {
        if (!ul) { ul = el("ul", "d-list"); box.appendChild(ul); }
        ul.appendChild(el("li", "", l.replace(/^[•·\-*–]\s*/, "")));
        return;
      }
      ul = null;
      const next = lines.slice(i + 1).find(x => x) || "";
      const heading = l.length <= 36 && !/[.!?,;:]$/.test(l) && l.split(" ").length <= 5 && next;
      box.appendChild(heading ? el("h4", "d-sub", l) : el("p", "", l));
    });
  }
  const paragraphs = text => text.split(/\n+/).map(p => p.trim()).filter(Boolean);

  function applyLink(value) {
    if (/^https?:\/\//i.test(value)) return { href: value, label: "Apply" };
    if (/@/.test(value)) return { href: "mailto:" + value, label: "Email to apply" };
    const digits = value.replace(/[^\d+]/g, "");
    if (digits.length >= 10) return { href: "tel:" + digits, label: "Call to apply" };
    return null;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // [NEW] Small line icons (drawn in code, so they look the same on every phone and computer)
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coin:  '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.4-.8-1.3-1.2-2.5-1.2-1.5 0-2.5.7-2.5 1.8s1 1.5 2.5 1.8 2.5.8 2.5 1.9-1 1.8-2.5 1.8c-1.2 0-2.2-.4-2.6-1.3M12 6.5V8m0 8v1.5"/>',
    pin:   '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    cal:   '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
  };
  function row(iconName, text, cls) {
    const p = el("p", "meta row" + (cls ? " " + cls : ""));
    const i = el("span", "ico"); i.setAttribute("aria-hidden", "true");
    i.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + ICONS[iconName] + "</svg>";
    p.appendChild(i); p.appendChild(el("span", "", text));
    return p;
  }

  // [NEW] Copies text on any device (new browsers first, older Safari as a backup). Returns a Promise of true/false.
  function legacyCopy(t) {
    const ta = el("textarea"); ta.value = t; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ta.setSelectionRange(0, t.length); } catch (e) {}
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta); return ok;
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(t).then(() => true, () => legacyCopy(t));
    return Promise.resolve(legacyCopy(t));
  }

  // [NEW] Saved jobs (stored on the student's own phone or computer) and quick-filter chips
  const SAVE_KEY = "atb-saved";
  const HEART = '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10z"/></svg>';
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]") || []; } catch (e) { saved = []; }
  const chipsEl = $("chips"), chipOn = { weekend: false, morning: false, afternoon: false, evening: false, close: false, saved: false }, chipEls = {};
  function updateChips() { if (chipEls.saved) chipEls.saved.textContent = "Saved" + (saved.length ? " (" + saved.length + ")" : ""); }
  function toggleSave(id) {
    const i = saved.indexOf(id);
    if (i < 0) saved.push(id); else saved.splice(i, 1);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) {}
    updateChips();
  }
  function saveButton(j, withText) {
    const b = el("button", withText ? "save save-text btn ghost small" : "save"); b.type = "button";
    const paint = () => {
      const on = saved.indexOf(j._id) >= 0;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("on", on);
      b.setAttribute("aria-label", (on ? "Remove saved job: " : "Save job: ") + (j.Role || "") + " at " + (j.Business || ""));
      if (withText) b.textContent = on ? "Saved" : "Save Job";
    };
    if (!withText) b.innerHTML = HEART;
    paint();
    b.addEventListener("click", e => { e.stopPropagation(); toggleSave(j._id); paint(); });
    return b;
  }
  function buildChips() {
    if (!chipsEl || chipsEl.firstChild) return;
    [["weekend", "Weekends"], ["morning", "Mornings"], ["afternoon", "Afternoons"], ["evening", "Evenings"], ["close", "Under 6 Min Walk"], ["saved", "Saved"]].forEach(([k, label]) => {
      const b = el("button", "chip", label); b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        chipOn[k] = !chipOn[k];
        b.setAttribute("aria-pressed", chipOn[k] ? "true" : "false"); b.classList.toggle("on", chipOn[k]);
        render();
      });
      chipEls[k] = b; chipsEl.appendChild(b);
    });
    updateChips();
  }
  function safeUrl(v) {   // only real web addresses are linked
    v = (v || "").trim();
    if (/^https?:\/\/\S+$/i.test(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) return "https://" + v;
    return "";
  }

  // [NEW] "411 Washington St, Hoboken, NJ, 07030" -> "411 Washington St" (Hoboken is implied)
  const shortAddr = a => (a || "").replace(/,?\s*Hoboken,?\s*(NJ|New Jersey)?,?\s*\d{5}(-\d{4})?\s*$/i, "").replace(/,?\s*Hoboken,?\s*(NJ)?\s*$/i, "").trim();
  // [NEW] Tidies shift text: "5 PM -10:30 PM" -> "5 PM – 10:30 PM", "10:30PM" -> "10:30 PM", "Mon-Thursday" -> "Mon – Thursday"
  function tidyTimes(s) {
    return (s || "")
      .replace(/(\d)\s*([AaPp])\.?[Mm]\b\.?/g, (m, d, ap) => d + " " + ap.toUpperCase() + "M")
      .replace(/\b(6|7|8|9|10|11)(:\d{2})?\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*PM)/g, (m, h, mm, e) => h + (mm || "") + " AM – " + e)   // "11 – 4 PM" -> "11 AM – 4 PM"
      .replace(/([AP]M|\d)\s*[-–]\s*(?=\d|clos)/gi, "$1 – ")
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)([a-z]*)\s*-\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/g, "$1$2 – $3")
      .replace(/[ \t]+/g, " ").trim();
  }
  // [NEW] Splits an Hours/Shifts cell into a small heading and a list of lines for the job window.
  function shiftLines(text) {
    let lines = (text || "").split(/\n+/).map(x => tidyTimes(x)).filter(Boolean), header = "";
    if (lines.length) {
      const m = lines[0].match(/^(.*?shifts?\s*(?:\([^)]*\))?)\s*[-–:]\s+(.+)$/i);
      if (m) { header = m[1].trim(); lines[0] = m[2]; }
    }
    // [NEW] Split every line into "days" + "times", even when a whole week is typed on one line:
    // "Monday – Friday: 6:30 AM – 12 PM, 1 PM – 6 PM Saturday – Sunday 9 AM – 3 PM"
    //   -> Monday – Friday | 6:30 AM – 12 PM · 1 PM – 6 PM
    //   -> Saturday – Sunday | 9 AM – 3 PM
    const D = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*";
    const groupRe = new RegExp(D + "(?:\\s*(?:[-–,&]|to|and)\\s*" + D + ")*\\s*:?", "g");
    const items = [];
    lines.forEach(line => {
      const marks = []; let m;
      groupRe.lastIndex = 0;
      while ((m = groupRe.exec(line))) marks.push({ i: m.index, end: groupRe.lastIndex, days: m[0].replace(/\s*:$/, "").trim() });
      if (!marks.length) { items.push({ text: line }); return; }
      if (marks[0].i > 0) items.push({ text: line.slice(0, marks[0].i).trim() });
      marks.forEach((mk, k) => {
        const rest = line.slice(mk.end, k + 1 < marks.length ? marks[k + 1].i : line.length).trim().replace(/^[-–:]\s*/, "");
        const times = rest.split(/\s*(?:,|;|\band or\b|\band\b|\bor\b)\s*/i).map(t => t.trim()).filter(Boolean);
        items.push(times.length ? { days: mk.days, times } : { text: mk.days });
      });
    });
    return { header, lines, items };
  }
  const isLongHours = h => !!h && (h.length > 70 || /\n/.test(h) || shiftLines(h).items.filter(i => i.days).length > 1);
  // [NEW] Short card summary for long shift lists: "Weekdays & weekends, evenings"
  function hoursSummary(h) {
    if (!isLongHours(h)) return tidyTimes(h);
    const t = h.toLowerCase(), p = dayParts(tidyTimes(h));
    const days = [/\b(mon|tue|wed|thu|fri)/.test(t) ? "Weekdays" : "", /\b(sat|sun)|weekend/.test(t) ? "Weekends" : ""].filter(Boolean).join(" & ");
    const times = ["morning", "afternoon", "evening"].filter(k => p[k]);
    const timeText = times.length && times.length < 3 ? times.map(k => k + "s").join(" & ") : "";
    const out = [days, timeText].filter(Boolean).join(", ");
    return out ? out + " · see details" : tidyTimes(h.split(/\n/)[0]).slice(0, 70) + "…";
  }
  // [RESTORED] Pay is shown as typed in the sheet, with ranges tidied: "$20-27/hr" -> "$20–27/hr"
  const hasPay = p => /\d/.test(p || "");
  const tidyPay = p => (p || "").replace(/(\d)\s*[-–]\s*(?=\$?\d)/g, "$1–").replace(/\s+/g, " ").trim();
  // [NEW] Reads the Hours text and says which parts of the day it covers.
  // "8am to 2pm" -> morning + afternoon.  "Fri & Sat evenings" -> evening.
  function dayParts(text) {
    const out = { morning: false, afternoon: false, evening: false }, t = (text || "").toLowerCase();
    if (/morning/.test(t)) out.morning = true;
    if (/afternoon/.test(t)) out.afternoon = true;
    if (/evening|night|dinner|closing/.test(t)) out.evening = true;
    const times = [], re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g;
    let m;
    while ((m = re.exec(t))) { let h = +m[1] % 12; if (m[3] === "pm") h += 12; times.push(h + (m[2] ? +m[2] / 60 : 0)); }
    for (let i = 0; i < times.length; i += 2) {              // each "start to end" pair
      const a = times[i];
      if (i + 1 < times.length) {
        const b = times[i + 1] > a ? times[i + 1] : times[i + 1] + 24;
        if (a < 12) out.morning = true;
        if (a < 17 && b > 12) out.afternoon = true;
        if (b > 17) out.evening = true;
      } else if (a < 12) out.morning = true; else if (a < 17) out.afternoon = true; else out.evening = true;
    }
    return out;
  }
  // [NEW] "Closing soon": the Expires date is within the next 7 days
  const closingSoon = j => { const t = expiryTime(j); return !!t && t + DAY > Date.now() && t - Date.now() < 7 * DAY; };
  const fmtLong = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  // "Open until Nov 15, 2026 · 30 days left"
  function closeLine(j) {
    const t = expiryTime(j); if (!t) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const left = Math.round((t - today.getTime()) / DAY);
    return "Open until " + fmtLong(t) + " · " + (left <= 0 ? "last day" : left === 1 ? "1 day left" : left + " days left");
  }

  // ---------- Job card (the clickable summary) ----------
  function card(j) {
    const c = el("article", "card");
    const top = el("div", "card-top");                       // [CHANGED] badge + title side by side
    const titles = el("div", "titles");
    const h = el("h3");
    const a = el("a", "card-link", j.Role || "Open role");
    a.href = "#job=" + j._id;
    h.appendChild(a);
    titles.appendChild(h);
    const where = [j.Business, shortAddr(j.Location)].filter(Boolean).join(", ");
    if (where) titles.appendChild(el("p", "where", where));
    const logoUrl = /^https?:\/\/\S+$/i.test((j.Logo || "").trim()) ? j.Logo.trim() : "";   // [NEW] optional Logo column
    if (logoUrl) {
      const li = el("img", "card-logo"); li.src = logoUrl; li.alt = ""; li.loading = "lazy";
      li.addEventListener("error", () => { li.style.display = "none"; });
      top.appendChild(li);
    }
    top.appendChild(titles);
    top.appendChild(saveButton(j));                          // [NEW] heart to save a job
    c.appendChild(top);

    const tags = el("div", "tags");                          // [NEW] tag row
    if (j.Type) tags.appendChild(el("span", "tag", j.Type));
    if (closingSoon(j)) tags.appendChild(el("span", "tag soon", "Closing Soon"));
    if (tags.childNodes.length) c.appendChild(tags);

    if (hasPay(j.Pay)) c.appendChild(row("coin", tidyPay(j.Pay), "pay"));                 // [RESTORED] pay
    if (j.Hours) c.appendChild(row("clock", hoursSummary(j.Hours)));
    if (j.Walk) c.appendChild(row("pin", j.Walk + " from campus"));
    if (expiryTime(j)) c.appendChild(row("cal", "Apply by " + fmtLong(expiryTime(j))));       // [CHANGED] Expires date, or 30 days after Posted
    c.appendChild(el("div", "spacer"));
    const more = el("a", "btn", "View details");             // [CHANGED] main button opens details
    more.href = "#job=" + j._id;
    more.setAttribute("aria-label", "View details: " + (j.Role || "") + " at " + (j.Business || ""));
    c.appendChild(more);

    // [NEW] Clicking anywhere on the card opens it (links inside still work normally)
    c.addEventListener("click", e => { if (!e.target.closest("a, button")) location.hash = "job=" + j._id; });
    return c;
  }

  // ---------- [NEW] Detail window ----------
  function renderDetail(j) {
    setChildren(dlgBody, []);
    const head = el("header", "d-head");
    const title = el("h2", "", j.Role || "Open role"); title.id = "dialog-title";
    head.appendChild(title);
    const where = [j.Business, shortAddr(j.Location)].filter(Boolean).join(", ");
    if (where) head.appendChild(el("p", "where", where));
    const tags = el("div", "tags");
    if (j.Type) tags.appendChild(el("span", "tag", j.Type));
    if (closingSoon(j)) tags.appendChild(el("span", "tag soon", "Closing Soon"));
    if (tags.childNodes.length) head.appendChild(tags);
    dlgBody.appendChild(head);

    // [NEW] When the listing comes off the site
    const cl = closeLine(j);
    if (cl) { const r = row("cal", cl, "closes"); r.classList.toggle("soon", closingSoon(j)); dlgBody.appendChild(r); }

    if (hasPay(j.Pay)) dlgBody.appendChild(row("coin", tidyPay(j.Pay), "pay"));          // [RESTORED] pay
    // [MOVED UP] Directions: opens Google Maps (or the Maps app) to the business
    const addr = j.Location && /\d/.test(j.Location) ? j.Location : [j.Location, "Hoboken NJ"].filter(Boolean).join(" ");
    const dirQ = [j.Business, addr].filter(Boolean).join(" ");
    const dirP = el("p", "meta row dir"), dirI = el("span", "ico");
    dirI.setAttribute("aria-hidden", "true"); dirI.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + ICONS.pin + "</svg>";
    const dirA = el("a", "", "Get Directions" + (j.Walk ? " (" + j.Walk + " from campus)" : ""));
    dirA.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(dirQ);
    dirA.target = "_blank"; dirA.rel = "noopener noreferrer";
    dirP.appendChild(dirI); dirP.appendChild(dirA); dlgBody.appendChild(dirP);

    // Facts grid: only shows rows that have a value (short hours only; long shift lists get their own block below)
    const facts = el("dl", "facts");
    [["Hours", !isLongHours(j.Hours) && !j.Shifts ? tidyTimes(j.Hours) : ""],
     ].forEach(([k, v]) => {
      if (!v) return;
      const box = el("div"); box.appendChild(el("dt", "", k)); box.appendChild(el("dd", "", v));
      facts.appendChild(box);
    });
    if (facts.childNodes.length) dlgBody.appendChild(facts);
    if (postedTime(j)) dlgBody.appendChild(el("p", "meta posted-line", "Posted " + fmtDate(j.Posted)));

    // [NEW] Shifts: from the optional Shifts column, or from a long Hours cell. One shift per line.
    const shiftSrc = j.Shifts || (isLongHours(j.Hours) ? j.Hours : "");
    if (shiftSrc) {
      const sh = shiftLines(shiftSrc), box = el("section", "d-shifts");
      box.appendChild(el("h3", "", "Shifts"));
      if (sh.header) box.appendChild(el("p", "meta", sh.header.replace(/^./, c => c.toUpperCase()) + ":"));
      const ul = el("ul", "shift-list");
      sh.items.forEach(it => {
        const li = el("li", it.days ? "shift" : "");
        if (it.days) {
          li.appendChild(el("strong", "sd", it.days));
          const st = el("span", "st"); it.times.forEach(t => st.appendChild(el("span", "t", t))); li.appendChild(st);   // one time range per line
        }
        else li.textContent = it.text;
        ul.appendChild(li);
      });
      box.appendChild(ul); dlgBody.appendChild(box);
    }

    // [NEW] Optional sheet columns: Experience and Perks (separate perks with ; )
    const know = [];
    if (j.Experience) know.push(j.Experience);
    if (j.Perks) j.Perks.split(/[;|]/).map(x => x.trim()).filter(Boolean).forEach(x => know.push(x));
    if (know.length) { const k = el("div", "tags know"); know.forEach(t => k.appendChild(el("span", "tag", t))); dlgBody.appendChild(k); }

    // Description: line breaks in the sheet cell become paragraphs
    const desc = el("section", "d-desc");
    desc.appendChild(el("h3", "", "About this job"));
    if (j.Description) renderDescription(desc, j.Description);
    else desc.appendChild(el("p", "meta", "No description yet. Contact the business to ask about the role."));
    dlgBody.appendChild(desc);
    const site = safeUrl(j.Website);                           // [NEW] optional Website column
    if (site) {
      const p = el("p", "meta site"), a = el("a", "", "Visit " + j.Business + " Website");
      a.href = site; a.target = "_blank"; a.rel = "noopener noreferrer"; p.appendChild(a); dlgBody.appendChild(p);
    }

    // [CHANGED] Apply area. One button, no form.
    // - Email in the sheet -> "Apply by email" opens the student's email app with a ready-made message
    // - Web link in sheet  -> button that opens the employer's application page
    // - Phone in sheet     -> "Call to apply" button
    // - Anything else      -> shown as plain text instructions
    const apply = el("section", "d-apply");
    const raw = (j.Apply || "").trim();
    const email = (raw.match(/[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]+/) || [])[0];
    if (/^https?:\/\//i.test(raw)) {
      const a = el("a", "btn", "Apply on employer site"); a.href = raw; a.target = "_blank"; a.rel = "noopener";
      apply.appendChild(a);
    } else if (email) {
      // [CHANGED] STEVENS ONLY, built to work on every device.
      // - Computers: opens a new email in Outlook on the web (Stevens/Okta sign-in).
      // - Phones: opens the Outlook app (it fills in the message); a browser link sits right under it.
      // - On any device the message is also copied automatically and shown below, so if an
      //   email opens blank the student can just paste it. This makes the template foolproof.
      const L = emailLinks(j, email), phone = isPhone();
      apply.appendChild(el("h3", "", "Stevens students only"));
      const go = el("a", "btn", phone ? "Apply in Outlook app" : "Apply with Stevens Outlook");
      go.href = phone ? L.app : L.outlook;
      if (!phone) { go.target = "_blank"; go.rel = "noopener"; }
      go.setAttribute("aria-label", "Apply for " + (j.Role || "this job") + " at " + (j.Business || "this business") + " with Stevens Outlook");
      apply.appendChild(go);
      const note = el("p", "apply-note",
        "Sign in with your Stevens account. Add your details, attach your resume, then send. Replies come to your Stevens inbox, so check it after you apply.");
      note.setAttribute("aria-live", "polite");
      apply.appendChild(note);
      go.addEventListener("click", () => {
        copyText(L.text).then(ok => { if (ok) note.textContent = "Message copied. If your email opens blank, just paste it in."; });
      });
      if (phone) {
        const alt = el("p", "apply-note", "No Outlook app? ");
        const x = el("a", "linklike", "Open Outlook in your browser"); x.href = L.outlook; x.target = "_blank"; x.rel = "noopener";
        alt.appendChild(x); alt.appendChild(document.createTextNode("."));
        apply.appendChild(alt);
      }
      // [RESTORED] Other ways to send the same message
      const more = el("p", "apply-note other-mail", "Prefer another email? ");
      const mk = (label, href, blank) => { const a = el("a", "linklike", label); a.href = href; if (blank) { a.target = "_blank"; a.rel = "noopener"; } return a; };
      more.appendChild(mk("Mail app", L.mail, false)); more.appendChild(document.createTextNode(" or "));
      more.appendChild(mk("Gmail", L.gmail, true)); more.appendChild(document.createTextNode(". Use your Stevens email if you can."));
      if (!phone) { more.insertBefore(document.createTextNode(""), more.firstChild); }
      apply.appendChild(more);
      const det = el("details", "msg-preview");
      det.appendChild(el("summary", "", "See the message we write for you"));
      det.appendChild(el("pre", "", L.text));
      const cp = el("button", "btn ghost small", "Copy message"); cp.type = "button";
      cp.addEventListener("click", () => {
        copyText(L.text).then(ok => { cp.textContent = ok ? "Copied" : "Press and hold the text to copy"; });
      });
      det.appendChild(cp);
      apply.appendChild(det);
    } else if (applyLink(raw)) {
      const l = applyLink(raw), a = el("a", "btn", l.label); a.href = l.href; apply.appendChild(a);
    } else if (raw) {
      apply.appendChild(el("p", "meta", "To apply: " + raw));
    }
    dlgBody.insertBefore(apply, desc);   // [CHANGED] Apply sits above the description
    const act = el("div", "d-actions"); act.appendChild(saveButton(j, true)); dlgBody.appendChild(act);   // [NEW] Save Job
  }

  // ---------- [NEW] The email the student sends ----------
  // EDIT THE WORDING HERE. Each line below becomes a line in the email.
  const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));   // iPads pretend to be Macs

  function emailLinks(j, to) {
    const role = j.Role || "the open role", biz = j.Business || "your business";
    const subject = "Stevens Student Application: " + role + " at " + biz;
    const lines = [
      "Hello " + biz + " Team,",
      "",
      "My name is [Your Name], and I'm a [class year] [major] student at Stevens Institute of Technology. I'm applying for the " + role + " position that I found on Around the Block.",
      "",
      "A little about me: [one or two sentences about your experience, or why this job interests you]",
      "",
      "Availability for work: [days and hours around your classes]",
      "Availability for an interview: [days and times]",
      "Phone: [your phone number]",
      "",
      "My resume is attached. Thank you for your time and consideration.",
      "",
      "Best,",
      "[Your Name]",
      "Stevens Institute of Technology"
    ];
    const q = "subject=" + encodeURIComponent(subject);
    const body = encodeURIComponent(lines.join("\n"));
    return {
      outlook: "https://outlook.office.com/mail/deeplink/compose?to=" + encodeURIComponent(to) + "&" + q + "&body=" + body,
      app: "ms-outlook://compose?to=" + encodeURIComponent(to) + "&" + q + "&body=" + body,   // Outlook phone app
      gmail: "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(subject) + "&body=" + body,
      mail: "mailto:" + to + "?" + q + "&body=" + body,                                       // the device's own mail app
      text: "To: " + to + "\nSubject: " + subject + "\n\n" + lines.join("\n")               // shown and copied
    };
  }

  // Opens/closes the window based on the URL (#job=...). This makes each job
  // shareable and makes the browser Back button close the window.
  function syncDialogToHash() {
    const m = location.hash.match(/^#job=(.+)$/);
    const j = m && jobs.find(x => x._id === decodeURIComponent(m[1]));
    if (j) { renderDetail(j); document.body.classList.add("modal-open"); if (!isOpen()) dlg.showModal(); }
    else if (isOpen()) dlg.close();
  }
  dlg.addEventListener("close", () => {            // user pressed X, Esc, or clicked outside
    document.body.classList.remove("modal-open");
    if (jobs.length) render();
    if (location.hash.startsWith("#job=")) history.replaceState(null, "", location.pathname + location.search);
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // click backdrop
  $("dialog-close").addEventListener("click", () => dlg.close());
  window.addEventListener("hashchange", syncDialogToHash);

  // ---------- Filtering, sorting, drawing ----------
  function render() {
    const q = qEl.value.trim().toLowerCase();
    const t = typeEl.value, s = sortEl.value;
    // [CHANGED] Search only looks at the useful columns (not links or "Yes")
    const shown = jobs.filter(j =>
      (!t || j.Type === t) &&
      (!chipOn.weekend || /weekend|\bsat|\bsun/i.test(j.Hours || "")) &&
      (!(chipOn.morning || chipOn.afternoon || chipOn.evening) || (function () {
        const p = dayParts(j.Hours);
        return (chipOn.morning && p.morning) || (chipOn.afternoon && p.afternoon) || (chipOn.evening && p.evening);
      })()) &&
      (!chipOn.close || walkMinutes(j.Walk) <= 6) &&
      (!chipOn.saved || saved.indexOf(j._id) >= 0) &&
      (!q || [j.Role, j.Business, j.Location, j.Type, j.Hours, j.Description].join(" ").toLowerCase().includes(q)));
    // [NEW] Sorting
    shown.sort(s === "close"
      ? (a, b) => walkMinutes(a.Walk) - walkMinutes(b.Walk)
      : (a, b) => postedTime(b) - postedTime(a));

    setChildren(listEl, shown.map(card));
    if (!shown.length) {
      const box = el("div", "empty");
      box.appendChild(el("p", "", !jobs.length ? "No open jobs right now. Check back soon." : (chipOn.saved && !saved.length ? "You haven't saved any jobs yet. Tap the heart on a job to save it." : "No jobs match your search.")));
      if (jobs.length) {                                     // [NEW] Clear filters button
        const b = el("button", "btn ghost", "Clear filters"); b.type = "button";
        b.addEventListener("click", () => {
          qEl.value = ""; typeEl.value = "";
          Object.keys(chipOn).forEach(k => { chipOn[k] = false; if (chipEls[k]) { chipEls[k].setAttribute("aria-pressed", "false"); chipEls[k].classList.remove("on"); } });
          render();
        });
        box.appendChild(b);
      }
      listEl.appendChild(box);
    }
    statusEl.textContent = (cfg.sheetCsvUrl ? "" : "Example listings. ") +
      shown.length + (shown.length === 1 ? " job" : " jobs") + " shown" + (updatedAt ? " · Updated " + updatedAt : "");
  }

  // [NEW] Open the site with ?check=1 on the end (example: yoursite.github.io/?check=1) to see every
  // row in the sheet and why each one is showing or hidden. Handy when a row doesn't appear.
  function showCheck(data, errMsg) {
    if (!checkMode) return;
    const host = listEl.parentNode;
    let box = document.getElementById("check-panel");
    if (!box) { box = el("section", "check"); box.id = "check-panel"; if (host) host.insertBefore(box, listEl); }
    setChildren(box, []);
    box.appendChild(el("h3", "", "Sheet check"));
    const add = t => box.appendChild(el("p", "meta", t));
    add("Site files version: 22 (if this is not 22, some files on GitHub are old)");
    const url = cfg.sheetCsvUrl || "";
    add("Sheet link ends in: ..." + url.replace(/\?.*$/, "").slice(-10) + " (tab " + ((url.match(/gid=(\d+)/) || [])[1] || "unknown") + ")");
    if (errMsg) { add("Could not read the sheet: " + errMsg); return; }
    add("Columns found: " + lastHead.filter(Boolean).join(", "));
    const need = ["Role","Business","Location","Type","Hours","Walk","Apply","Posted"].filter(c => lastHead.indexOf(c) < 0);
    if (need.length) add("Missing columns (add them to row 1): " + need.join(", "));
    add(data.length + " rows read. Showing " + data.filter(isActive).length + ".");
    data.forEach(j => add((j.Business || "(no business)") + " / " + (j.Role || "(no role)") + ": " + (hideReason(j) ? "HIDDEN. " + hideReason(j) : "Showing")));
  }

  function setup(data) {
    showCheck(data);
    const seen = {};
    jobs = data.filter(isActive).map(j => {                  // [NEW] give every job a link ID
      let id = j.ID ? slug(j.ID) : slug((j.Business || "") + "-" + (j.Role || "job"));
      seen[id] = (seen[id] || 0) + 1;
      j._id = seen[id] > 1 ? id + "-" + seen[id] : id;
      return j;
    });
    setChildren(typeEl, [Object.assign(el("option", "", "All types"), { value: "" })]);
    [...new Set(jobs.map(j => j.Type).filter(Boolean))].sort()
      .forEach(t => typeEl.appendChild(Object.assign(el("option", "", t), { value: t })));
    buildChips();
    render();
    syncDialogToHash();                                      // open a job if the link had #job=...
  }

  qEl.addEventListener("input", render);
  typeEl.addEventListener("change", render);
  sortEl.addEventListener("change", render);

  // ---------- Loading ----------
  // [CHANGED] Checks that Google really sent a CSV (not a sign-in page), never reuses an old
  // browser copy, and keeps the last good listings in case Google can't be reached.
  const CACHE_KEY = "atb-last-csv";
  const saveCopy = t => { try { localStorage.setItem(CACHE_KEY, t); } catch (e) {} };
  const savedCopy = () => { try { return localStorage.getItem(CACHE_KEY); } catch (e) { return null; } };

  function readCSV(text) {
    if (/^\s*</.test(text)) throw new Error("Got a web page instead of CSV. Is the sheet still published to the web?");
    const data = parseCSV(text);
    if (!hasRoleColumn) throw new Error("No 'Role' column found in row 1 of the sheet.");
    return data;
  }

  // [NEW] Shows "Updated 4:41 PM" and refreshes by itself every minute (and when you come back to the tab),
  // so a row typed into the sheet appears without anyone reloading the page.
  let lastText = null, updatedAt = null;
  const stamp = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  function load(silent) {
    if (!cfg.sheetCsvUrl) { setup(cfg.exampleJobs || []); return; }
    if (!silent) statusEl.textContent = "Loading jobs…";
    const url = cfg.sheetCsvUrl + (cfg.sheetCsvUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(t => {
        const data = readCSV(t); saveCopy(t); updatedAt = stamp();
        if (silent && (t === lastText || isOpen())) { return; }   // nothing new, or someone is reading a job: don't disturb
        lastText = t; setup(data);
      })
      .catch(err => {
        console.error("Around the Block: could not load the sheet.", err);   // team: see this in the browser console
        showCheck([], err.message);
        if (silent) return;                                                    // quiet refresh: keep what's on screen
        const old = savedCopy();
        if (old) {
          try { setup(readCSV(old)); statusEl.textContent += " (saved copy, couldn't reach the sheet)"; return; } catch (e) {}
        }
        statusEl.textContent = "Couldn't load jobs. Check your connection and try again.";
        const box = el("div", "empty"); box.appendChild(el("p", "", "We couldn't load the job list. This is usually a weak connection. Please try again in a moment.")); const b = el("button", "btn", "Try again"); b.type = "button";
        b.addEventListener("click", () => load()); box.appendChild(b);
        setChildren(listEl, [box]);
      });
  }
  const refreshBtn = $("refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => {
    refreshBtn.textContent = "Refreshing…";
    lastText = null; load(true);
    setTimeout(() => { refreshBtn.textContent = "Refresh listings"; }, 1500);
  });
  setInterval(() => { if (!document.hidden) load(true); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(true); });
  load();
})();
