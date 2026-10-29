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
  // [NEW] Automatic apply is on for everyone when applyLive is not false. While applyLive is false,
  // only people who add ?autoapply=1 to the web address (your team, for testing) see it.
  const autoApply = !!cfg.applyUrl && (cfg.applyLive !== false || /[?&]autoapply=1/.test(location.search));

  // [NEW] When automatic apply is on, the "How it works" step describes it.
  if (autoApply) {
    const stepText = document.querySelector("#how .steps li:nth-child(2) span");
    if (stepText) stepText.textContent = "Click Apply, fill in a short form and attach your resume. We send it to the business for you.";
  }

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
        else { window.open("https://outlook.cloud.microsoft/mail/deeplink/compose?" + q, "_blank", "noopener"); }
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
                   "Apply","Posted","Active","Description","ID","Expires","Experience","Website","Perks","Logo","Shifts","HowToApply"];       // [NEW] Description, ID
  const CANON = Object.fromEntries(COLUMNS.map(c => [c.toLowerCase(), c]));
  // [CHANGED] Alternate header names that also work. Your sheet uses "Job Description".
  Object.assign(CANON, {
    "job description": "Description",
    "job desc": "Description",
    "about": "Description",
    "details": "Description",
    "how to apply": "HowToApply",
    "apply method": "HowToApply",
    "application method": "HowToApply",
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

  // [NEW] Finds a phone number in the Apply cell ("Text 201-210-9535", "(201) 210-9535", "+1 201...").
  // Returns it ready for a text link (+12012109535), or "" if there isn't one.
  function textNumber(value) {
    if (/@|https?:\/\//i.test(value || "")) return "";
    const m = (value || "").match(/\+?\d[\d\s().\-]{8,}\d/);
    if (!m) return "";
    let d = m[0].replace(/[^\d]/g, "");
    if (d.length === 10) d = "1" + d;
    return d.length >= 11 ? "+" + d : "";
  }
  const prettyNumber = n => { const d = n.replace(/\D/g, "").slice(-10); return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : n; };

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
        // "3:00 or 4:00 PM – 7:30 PM" is ONE shift (start at 3 or 4), so don't split on that "or"
        const keep = rest.replace(/(\b\d{1,2}(?::\d{2})?)\s+(?:or|and)\s+(?=\d{1,2}(?::\d{2})?\s*[AP]M)/gi, "$1\u0001");
        const times = keep.split(/\s*(?:,|;|\band or\b|\band\b|\bor\b)\s*/i).map(t => t.replace(/\u0001/g, " or ").trim()).filter(Boolean);
        items.push(times.length ? { days: mk.days, times } : { text: mk.days });
      });
    });
    return { header, lines, items };
  }
  const isLongHours = h => !!h && (h.length > 70 || /\n/.test(h) || shiftLines(h).items.filter(i => i.days).length > 1);
  // [NEW] Short card summary for long shift lists: "Weekdays & weekends, evenings"
  function hoursSummary(h) {
    const t = h.toLowerCase(), p = dayParts(tidyTimes(h));
    const days = [/\b(mon|tue|wed|thu|fri|weekday)/.test(t) ? "Weekdays" : "", /\b(sat|sun)|weekend/.test(t) ? "Weekends" : ""].filter(Boolean).join(" & ");
    const times = ["morning", "afternoon", "evening"].filter(k => p[k]);
    const timeText = times.length && times.length < 3 ? times.map(k => k + "s").join(" & ") : "";
    const out = [days, timeText].filter(Boolean).join(", ");
    return out || tidyTimes(h.split(/\n/)[0]).slice(0, 70);
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
    [["Hours", ""],
     ].forEach(([k, v]) => {
      if (!v) return;
      const box = el("div"); box.appendChild(el("dt", "", k)); box.appendChild(el("dd", "", v));
      facts.appendChild(box);
    });
    if (facts.childNodes.length) dlgBody.appendChild(facts);
    if (postedTime(j)) dlgBody.appendChild(el("p", "meta posted-line", "Posted " + fmtDate(j.Posted)));

    // [NEW] Shifts: from the optional Shifts column, or from a long Hours cell. One shift per line.
    const shiftSrc = j.Shifts || j.Hours || "";
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

    // [CHANGED] Apply area. For email listings, the button opens a short form (see renderApplyForm).
    // - Email in the sheet -> "Apply by email" opens the student's email app with a ready-made message
    // - Web link in sheet  -> button that opens the employer's application page
    // - Phone in sheet     -> [CHANGED] "Apply" opens the form, then a ready-made text message (iMessage on iPhone/Mac)
    // - Anything else      -> shown as plain text instructions
    const apply = el("section", "d-apply");
    const raw = (j.Apply || "").trim();
    const email = (raw.match(/[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]+/) || [])[0];
    // [NEW] Optional "How to apply" column: Online / In store / Call / Text. Blank = online (email) or text (phone only).
    const how = (j.HowToApply || "").toLowerCase();
    const phoneInRaw = (raw.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0];
    const inPerson = /store|person|walk|visit|stop by|call|phone/.test(how) ||
                     (!how && !email && !/^https?:\/\//i.test(raw) && !/\btext\b/i.test(raw) && /\b(in store|in person|walk[- ]in|stop by|call)\b/i.test(raw));
    if (inPerson) {
      apply.appendChild(el("h3", "", /call|phone/.test(how) && !/store|person|walk|visit/.test(how) ? "Call to apply" : "Apply in person"));
      apply.appendChild(el("p", "apply-note first", raw || "Stop by the business to apply. Bring your resume."));
      if (phoneInRaw) {
        const c = el("a", "btn", "Call " + phoneInRaw.trim()); c.href = "tel:+1" + phoneInRaw.replace(/\D/g, "").slice(-10);
        apply.appendChild(c);
      }
      apply.appendChild(el("p", "apply-note", "Say you found the job on Around the Block."));
    } else if (/^https?:\/\//i.test(raw)) {
      const a = el("a", "btn", "Apply on employer site"); a.href = raw; a.target = "_blank"; a.rel = "noopener";
      apply.appendChild(a);
    } else if (email) {
      apply.appendChild(el("h3", "", "Stevens students only"));
      if (autoApply) {
        // [NEW] Automatic apply: short form + resume upload, sent for the student (see buildApplyForm).
        apply.appendChild(buildApplyForm(j, apply, email));
        const alt = el("details", "alt-mail"); alt.appendChild(el("summary", "", "Prefer to email it yourself?"));
        alt.appendChild(el("p", "apply-note first", "Use the same short form, then we open the email in Stevens Outlook (or Mail or Gmail) for you to send."));
        const mb = el("button", "btn ghost small", "Write the email instead"); mb.type = "button";
        mb.addEventListener("click", () => renderApplyForm(j, email));
        alt.appendChild(mb); apply.appendChild(alt);
      } else {
        // Original flow: short form, then a ready-made email (kept as is)
        const go = el("button", "btn", "Apply"); go.type = "button";
        go.setAttribute("aria-label", "Apply for " + (j.Role || "this job") + " at " + (j.Business || "this business"));
        go.addEventListener("click", () => renderApplyForm(j, email));
        apply.appendChild(go);
        apply.appendChild(el("p", "apply-note",
          "Takes 30 seconds. We write the email for you, then you attach your resume and hit send."));
      }
    } else if (textNumber(raw)) {
      // [NEW] Phone number in the sheet -> same short form, then a ready-made iMessage/text to the employer
      const num = textNumber(raw);
      apply.appendChild(el("h3", "", "Stevens students only"));
      const go = el("button", "btn", "Apply"); go.type = "button";
      go.setAttribute("aria-label", "Apply for " + (j.Role || "this job") + " at " + (j.Business || "this business"));
      go.addEventListener("click", () => renderApplyForm(j, num, "text"));
      apply.appendChild(go);
      apply.appendChild(el("p", "apply-note",
        "Takes 30 seconds. We write the text message for you, then you just hit send."));
    } else if (applyLink(raw)) {
      const l = applyLink(raw), a = el("a", "btn", l.label); a.href = l.href; apply.appendChild(a);
    } else if (raw) {
      apply.appendChild(el("p", "meta", "To apply: " + raw));
    }
    dlgBody.insertBefore(apply, desc);   // [CHANGED] Apply sits above the description
    const act = el("div", "d-actions"); act.appendChild(saveButton(j, true)); dlgBody.appendChild(act);   // [NEW] Save Job
  }

  // =====================================================================
  // [NEW] Apply form
  // Step 1: the student fills in a short form (inside the same job window).
  // Step 2: on "Continue", we (a) add a row to your Applications Google Sheet and
  //         (b) open Stevens Outlook with the email already filled in with their details.
  // Their details are remembered on their own device, so the next application is quicker.
  // =====================================================================
  const ME_KEY = "atb-applicant";
  const loadMe = () => { try { return JSON.parse(localStorage.getItem(ME_KEY)) || {}; } catch (e) { return {}; } };
  const saveMe = me => { try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch (e) {} };
  const YEARS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate student"];
  const stevensOnly = cfg.requireStevensEmail !== false;   // add requireStevensEmail: false in index.html to allow any email

  function field(label, input, optional) {
    const l = el("label", "");
    const t = el("span", "", label);
    if (optional) t.appendChild(el("span", "opt", " (optional)"));
    l.appendChild(t); l.appendChild(input);
    return l;
  }
  function input(name, type, value, attrs) {
    const i = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") i.type = type;
    i.name = name; i.value = value || "";
    Object.keys(attrs || {}).forEach(k => i.setAttribute(k, attrs[k]));
    return i;
  }

  function renderApplyForm(j, to, mode) {
    const me = loadMe(), phoneDevice = isPhone(), byText = mode === "text";   // [NEW] byText = apply by text message
    setChildren(dlgBody, []);
    const back = el("button", "linklike back", "← Back to job"); back.type = "button";
    back.addEventListener("click", () => renderDetail(j));
    dlgBody.appendChild(back);

    const head = el("header", "d-head");
    const title = el("h2", "", "Apply: " + (j.Role || "Open role")); title.id = "dialog-title";
    head.appendChild(title);
    const where = [j.Business, shortAddr(j.Location)].filter(Boolean).join(", ");
    if (where) head.appendChild(el("p", "where", where));
    dlgBody.appendChild(head);

    const f = el("form", "apply-form");
    const name = input("name", "text", me.name, { required: "", autocomplete: "name", maxlength: "80" });
    const mail = input("email", "email", me.email, { required: "", autocomplete: "email", maxlength: "120", placeholder: "you@stevens.edu" });
    if (stevensOnly) { mail.setAttribute("pattern", "[^@\\s]+@stevens\\.edu"); mail.title = "Use your @stevens.edu email"; }
    const year = el("select"); year.name = "year"; year.required = true;
    year.appendChild(Object.assign(el("option", "", "Choose one"), { value: "" }));
    YEARS.forEach(y => year.appendChild(Object.assign(el("option", "", y), { value: y, selected: me.year === y })));
    const major = input("major", "text", me.major, { required: "", maxlength: "80", placeholder: "e.g. Finance" });
    const phone = input("phone", "tel", me.phone, { autocomplete: "tel", maxlength: "30" });
    const avail = input("avail", "textarea", me.avail, { rows: "2", maxlength: "300", placeholder: "e.g. Tue/Thu after 2 PM, weekends" });
    const about = input("about", "textarea", "", { rows: "3", maxlength: "600",
      placeholder: "A sentence or two about your experience, or why this job interests you" });
    const trap = input("company", "text", "", { tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    const trapBox = el("div", "hp"); trapBox.appendChild(trap);   // hidden from people; spam bots fill it in

    const two = el("div", "two");
    two.appendChild(field("Class year", year)); two.appendChild(field("Major", major));
    [field("Full name", name), field("Stevens email", mail), two, field("Phone", phone, true),
     field("When can you work?", avail, true), field("About you", about, true), trapBox].forEach(n => f.appendChild(n));

    // [CHANGED] Main button: the Outlook app on phones, Stevens Outlook on the web on laptops.
    // Uses Outlook's new web address (outlook.cloud.microsoft); the old one lost the email after sign-in.
    // Both always send from the student's @stevens.edu account. (A laptop's default mail app might be
    // signed in to a personal address, so it's only offered as a small backup link.)
    const mainVia = byText ? "Text" : phoneDevice ? "Outlook" : "Outlook web";
    let via = mainVia;
    const go = el("button", "btn", byText ? (canText() ? "Continue in Messages" : "Continue") : phoneDevice ? "Apply" : "Apply"); go.type = "submit";
    go.addEventListener("click", () => { via = mainVia; });
    f.appendChild(go);
    const alt = el("p", "apply-note other-mail", "Or continue with ");
    if (byText) alt.style.display = "none";                    // [NEW] no email options for text listings
    const opts = phoneDevice ? [["Outlook in browser", "Outlook web"], ["Mail app", "Mail app"], ["Gmail", "Gmail"]]
                             : [["Outlook desktop app", "Mail app"], ["Gmail", "Gmail"]];   // [CHANGED]
    opts.forEach(([label, v], i) => {
      const b = el("button", "linklike", label); b.type = "submit";
      b.addEventListener("click", () => { via = v; });
      if (i) alt.appendChild(document.createTextNode(i === opts.length - 1 ? " or " : ", "));
      alt.appendChild(b);
    });
    alt.appendChild(document.createTextNode("."));
    f.appendChild(alt);
    f.appendChild(el("p", "apply-note small-print",
      "Your details and the job you applied to are shared with the Around the Block team so we can follow up with you and the business. Your email will CC the Around the Block team."));

    f.addEventListener("submit", e => {
      e.preventDefault();
      if (trap.value) return;
      const info = { name: name.value.trim(), email: mail.value.trim(), year: year.value, major: major.value.trim(),
        phone: phone.value.trim(), avail: avail.value.trim(), about: about.value.trim() };
      saveMe({ name: info.name, email: info.email, year: info.year, major: info.major, phone: info.phone, avail: info.avail });
      logApplication(j, to, info, via);
      if (byText) {                                              // [NEW] text-message listings
        const T = textLinks(j, to, info);
        copyText(T.text);
        if (canText()) location.href = T.sms;
        renderTextDone(j, to, T);
        return;
      }
      const L = emailLinks(j, to, info);
      copyText(L.text);                                          // backup: if the email opens blank, they can paste
      if (via === "Gmail") window.open(L.gmail, "_blank", "noopener");
      else if (via === "Mail app") location.href = L.mail;
      else if (via === "Outlook web" || !phoneDevice) window.open(L.outlook, "_blank", "noopener");
      else location.href = L.app;
      renderApplyDone(j, L, phoneDevice);
    });
    dlgBody.appendChild(f);
    dlgBody.scrollTop = 0; dlg.scrollTop = 0;
  }

  // Shown after the form: reminder to attach the resume + every way to open the email again
  function renderApplyDone(j, L, phoneDevice) {
    setChildren(dlgBody, []);
    const head = el("header", "d-head");
    const title = el("h2", "", "Almost done!"); title.id = "dialog-title";
    head.appendChild(title);
    head.appendChild(el("p", "where", "Your email to " + (j.Business || "the business") + " is ready."));
    dlgBody.appendChild(head);
    const box = el("section", "d-apply");
    box.appendChild(el("p", "", "1. Check it's sending from your @stevens.edu address.  2. Attach your resume.  3. Hit send."));
    if (!phoneDevice) {                                          // [NEW] fixes the blank email after signing in
      box.appendChild(el("p", "apply-note", "Had to sign in to Outlook and the email came up blank? Now that you're signed in, click below to open it again."));
      const re = el("a", "btn", "Reopen my email in Stevens Outlook"); re.href = L.outlook; re.target = "_blank"; re.rel = "noopener";
      box.appendChild(re);
    }
    box.appendChild(el("p", "apply-note", "Still not working? Use one of these. The message is also copied, so you can paste it. Employers expect a @stevens.edu address, so please send from your Stevens email."));
    const links = el("p", "apply-note other-mail");
    const opts = phoneDevice ? [["Outlook app", L.app, false], ["Outlook", L.outlook, true], ["Mail app", L.mail, false], ["Gmail", L.gmail, true]]
                             : [["Stevens Outlook (web)", L.outlook, true], ["Outlook desktop app", L.mail, false], ["Gmail", L.gmail, true]];   // [CHANGED]
    opts.forEach(([label, href, tab], i) => {
      const a = el("a", "linklike", label); a.href = href;
      if (tab) { a.target = "_blank"; a.rel = "noopener"; }
      if (i) links.appendChild(document.createTextNode("  ·  "));
      links.appendChild(a);
    });
    box.appendChild(links);
    const det = el("details", "msg-preview");
    det.appendChild(el("summary", "", "See the message"));
    det.appendChild(el("pre", "", L.text));
    const cp = el("button", "btn ghost small", "Copy message"); cp.type = "button";
    cp.addEventListener("click", () => { copyText(L.text).then(ok => { cp.textContent = ok ? "Copied" : "Press and hold the text to copy"; }); });
    det.appendChild(cp);
    box.appendChild(det);
    dlgBody.appendChild(box);
    const back = el("button", "btn ghost", "Back to job"); back.type = "button";
    back.addEventListener("click", () => renderDetail(j));
    dlgBody.appendChild(back);
  }

  // [NEW] Shown after the form for text-message listings
  function renderTextDone(j, to, T) {
    setChildren(dlgBody, []);
    const head = el("header", "d-head");
    const title = el("h2", "", canText() ? "Almost done!" : "Your message is ready"); title.id = "dialog-title";
    head.appendChild(title);
    head.appendChild(el("p", "where", canText()
      ? "Your text to " + (j.Business || "the business") + " is ready. Just hit send."
      : "Text it from your phone to " + prettyNumber(to) + ". The message is copied, so you can paste it."));
    dlgBody.appendChild(head);
    const box = el("section", "d-apply");
    if (canText()) {
      box.appendChild(el("p", "apply-note", "Messages didn't open? Tap below. The message is also copied, so you can paste it."));
      const a = el("a", "btn", "Open Messages"); a.href = T.sms; box.appendChild(a);
    }
    const num = el("p", "meta", "Number: " + prettyNumber(to)); box.appendChild(num);
    const det = el("details", "msg-preview"); det.open = !canText();
    det.appendChild(el("summary", "", "See the message"));
    det.appendChild(el("pre", "", T.text));
    const cp = el("button", "btn ghost small", "Copy message"); cp.type = "button";
    cp.addEventListener("click", () => { copyText(T.text).then(ok => { cp.textContent = ok ? "Copied" : "Press and hold the text to copy"; }); });
    det.appendChild(cp);
    box.appendChild(det);
    dlgBody.appendChild(box);
    const back = el("button", "btn ghost", "Back to job"); back.type = "button";
    back.addEventListener("click", () => renderDetail(j));
    dlgBody.appendChild(back);
  }

  // Sends one row to the Applications Google Sheet (the Apps Script link in index.html: applyLogUrl).
  // sendBeacon keeps sending even while the phone switches over to Outlook.
  function logApplication(j, to, info, via) {
    if (!cfg.applyLogUrl) return;
    const data = new URLSearchParams({
      name: info.name, email: info.email, year: info.year, major: info.major, phone: info.phone,
      avail: info.avail, about: info.about, role: j.Role || "", business: j.Business || "",
      jobId: j._id || "", employerEmail: to, via: via
    });
    try { if (navigator.sendBeacon && navigator.sendBeacon(cfg.applyLogUrl, data)) return; } catch (e) {}
    try { fetch(cfg.applyLogUrl, { method: "POST", mode: "no-cors", body: data, keepalive: true }).catch(() => {}); } catch (e) {}
  }

  // Styles for the form (kept here so you don't have to edit the CSS file)
  (function () {
    const css = `
.apply-form{display:grid;gap:14px;margin-top:4px}
.apply-form label{display:grid;gap:6px;font-weight:600;font-size:.95rem}
.apply-form .opt{font-weight:400;opacity:.65}
.apply-form input,.apply-form select,.apply-form textarea{font:inherit;font-size:16px;font-weight:400;width:100%;box-sizing:border-box;
  padding:10px 12px;border:1px solid rgba(127,127,127,.45);border-radius:10px;background:transparent;color:inherit}
.apply-form select option{color:#111;background:#fff}
.apply-form input:focus,.apply-form select:focus,.apply-form textarea:focus{outline:2px solid currentColor;outline-offset:1px}
.apply-form textarea{resize:vertical}
.apply-form .two{display:grid;gap:14px;grid-template-columns:1fr 1fr}
@media (max-width:420px){.apply-form .two{grid-template-columns:1fr}}
.apply-form .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.apply-form .btn{width:100%;justify-content:center;text-align:center}
.apply-form .small-print{font-size:.8rem;opacity:.7}
button.linklike{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
button.linklike.back{display:inline-block;margin-bottom:10px;text-decoration:none;opacity:.8}`;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  })();

  // ---------- [NEW] Automatic apply: the form, the Stevens code, and the upload ----------
  // Talks to your Google script (config.js > applyUrl). The script emails the business, so the
  // student has nothing to send. If anything fails, the student can still use the Outlook email.
  let formCount = 0;
  function buildApplyForm(j, apply, employerEmail) {
    const KEY = "atb-profile", MAX = 10 * 1024 * 1024, uid = "af" + (++formCount) + "-";
    let prof = {};
    try { prof = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { prof = {}; }
    const old = loadMe();                                    // details saved by the email form: use them here too
    ["name", "year", "email", "major", "phone", "avail"].forEach(k => { if (!prof[k] && old[k]) prof[k] = old[k]; });
    const saveProf = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} };
    const isStevensEmail = v => /^[^\s@]+@stevens\.edu$/i.test(v);

    const wrap = el("div", "apply-flow");
    const intro = el("p", "apply-note first", "Takes about a minute. Fill in your details, attach your resume, and we send it to the business for you. Replies go to your Stevens email.");
    const open = el("button", "btn", "Apply now"); open.type = "button";
    open.setAttribute("aria-label", "Apply now for " + (j.Role || "this job") + " at " + (j.Business || "this business"));
    const form = el("form", "auto-form"); form.noValidate = true; form.hidden = true;
    const done = el("div", "apply-done"); done.hidden = true;

    // fields
    const fields = el("div", "af-fields");
    const field = (label, input, optional, cls) => {
      const d = el("div", "af-field" + (cls ? " " + cls : "")), l = el("label", "", label);
      input.id = uid + (input.name || "x"); l.setAttribute("for", input.id);
      if (optional) l.appendChild(el("span", "opt", " (optional)"));
      d.appendChild(l); d.appendChild(input); return d;
    };
    const inp = (name, type, auto, val, ph) => {
      const i = el("input"); i.type = type; i.name = name; if (auto) i.autocomplete = auto; if (val) i.value = val; if (ph) i.placeholder = ph;
      return i;
    };
    const iName = inp("name", "text", "name", prof.name);
    const iYear = el("select"); iYear.name = "year";
    [["", "Choose one"], ["Freshman", "Freshman"], ["Sophomore", "Sophomore"], ["Junior", "Junior"], ["Senior", "Senior"], ["Graduate student", "Graduate student"]]
      .forEach(o => { const op = el("option", "", o[1]); op.value = o[0]; if (o[0] === prof.year) op.selected = true; iYear.appendChild(op); });
    const iEmail = inp("email", "email", "email", prof.email, "you@stevens.edu"); iEmail.setAttribute("inputmode", "email"); iEmail.autocapitalize = "none";
    const iMajor = inp("major", "text", "", prof.major);
    const iPhone = inp("phone", "tel", "tel", prof.phone);
    const iAvail = inp("availability", "text", "", prof.avail, "e.g. Weekends, Tue/Thu after 3 PM");
    const iResume = el("input"); iResume.type = "file"; iResume.name = "resume"; iResume.accept = ".pdf,.doc,.docx,application/pdf";
    const iAbout = el("textarea"); iAbout.name = "about"; iAbout.rows = 3; iAbout.maxLength = 1200;
    const trap = el("div", "af-trap"); trap.setAttribute("aria-hidden", "true");
    const iTrap = inp("website", "text", "off"); iTrap.tabIndex = -1; trap.appendChild(iTrap);

    const row2 = (a, b) => { const r = el("div", "af-two"); r.appendChild(a); r.appendChild(b); return r; };
    fields.appendChild(row2(field("Full name", iName), field("Class year", iYear)));
    fields.appendChild(field("Stevens email", iEmail));
    fields.appendChild(row2(field("Major", iMajor), field("Phone", iPhone, true)));
    fields.appendChild(field("When can you work?", iAvail, true));
    const resumeField = field("Resume", iResume, false, "af-resume");
    resumeField.firstChild.appendChild(el("span", "opt", " (PDF or Word, up to 10 MB)"));
    fields.appendChild(resumeField);
    fields.appendChild(field("About you", iAbout, true));
    fields.appendChild(trap);

    // code step
    const codeBox = el("div", "af-code"); codeBox.hidden = true;
    const codeHead = el("h4", "", "Check your Stevens email");
    const codeNote = el("p", "apply-note first", "");
    const iCode = inp("code", "text", "one-time-code"); iCode.setAttribute("inputmode", "numeric"); iCode.maxLength = 6; iCode.pattern = "[0-9]*";
    iCode.className = "code-input"; iCode.setAttribute("aria-label", "6-digit code");
    iCode.id = uid + "code";
    const codeLinks = el("p", "apply-note");
    const resend = el("button", "linklike", "Send a new code"); resend.type = "button";
    const change = el("button", "linklike", "Change email"); change.type = "button";
    codeLinks.appendChild(resend); codeLinks.appendChild(document.createTextNode(" · ")); codeLinks.appendChild(change);
    [codeHead, codeNote, iCode, codeLinks].forEach(n => codeBox.appendChild(n));

    const msg = el("p", "apply-msg"); msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
    const go = el("button", "btn full", "Send my application"); go.type = "submit";
    const cancel = el("button", "linklike cancel", "Cancel"); cancel.type = "button";
    const actions = el("div", "af-actions"); actions.appendChild(go); actions.appendChild(cancel);
    const privacy = el("p", "apply-note", "We email your application and resume to the business and keep a copy so we can follow up with you.");
    [fields, codeBox, msg, actions, privacy].forEach(n => form.appendChild(n));

    // done
    const check = el("div", "check-badge", "✓"); check.setAttribute("aria-hidden", "true");
    const doneTitle = el("h4", "", "Application sent!");
    const doneSub = el("p", "apply-note first", "");
    const doneList = el("ul", "next-steps");
    ["A confirmation is on its way to your Stevens email", "The business replies to your Stevens email, usually within a few days", "Check your inbox and junk folder"]
      .forEach(t => doneList.appendChild(el("li", "", t)));
    const back = el("button", "btn ghost", "Back to jobs"); back.type = "button";
    back.addEventListener("click", () => dlg.close());
    [check, doneTitle, doneSub, doneList, back].forEach(n => done.appendChild(n));

    wrap.appendChild(intro); wrap.appendChild(open); wrap.appendChild(form); wrap.appendChild(done);

    // behavior
    let step = "form", sentTo = "", busy = false;
    const say = (t, bad) => { msg.textContent = t || ""; msg.classList.toggle("err", !!bad); };
    const showStep = s => {
      step = s; fields.hidden = s !== "form"; codeBox.hidden = s !== "code";
      go.textContent = s === "code" ? "Confirm and send" : "Send my application";
      say("");
      if (s === "code") { iCode.value = ""; iCode.focus(); }
    };
    const setBusy = (b, label) => { busy = b; go.disabled = b; if (b) go.textContent = label; else go.textContent = step === "code" ? "Confirm and send" : "Send my application"; };
    open.addEventListener("click", () => { intro.hidden = true; open.hidden = true; form.hidden = false; iName.focus(); });
    cancel.addEventListener("click", () => { form.hidden = true; intro.hidden = false; open.hidden = false; showStep("form"); open.focus(); });
    change.addEventListener("click", () => { showStep("form"); iEmail.focus(); });

    function post(payload) {
      const call = fetch(cfg.applyUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(r => r.json());
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 90000));
      return Promise.race([call, timeout]);
    }
    const netFail = () => say("We couldn't reach the server. Check your connection and try again, or use \"Prefer to email it yourself?\" below.", true);
    function readResume() {
      return new Promise((res, rej) => {
        const f = iResume.files && iResume.files[0]; if (!f) return rej(new Error("none"));
        const r = new FileReader();
        r.onload = () => res({ name: f.name, data: String(r.result).split(",")[1] || "" });
        r.onerror = () => rej(new Error("read"));
        r.readAsDataURL(f);
      });
    }
    function validate() {
      const f = iResume.files && iResume.files[0], email = iEmail.value.trim();
      if (iName.value.trim().length < 2) return [iName, "Please enter your full name."];
      if (!iYear.value) return [iYear, "Please choose your class year."];
      if (!isStevensEmail(email)) return [iEmail, "Please use your Stevens email (it ends in @stevens.edu)."];
      if (iMajor.value.trim().length < 2) return [iMajor, "Please enter your major."];
      if (!f) return [iResume, "Please attach your resume (PDF or Word)."];
      if (!/\.(pdf|docx?)$/i.test(f.name)) return [iResume, "Your resume needs to be a PDF or Word file."];
      if (f.size > MAX) return [iResume, "That file is over 10 MB. Please attach a smaller one."];
      return null;
    }
    function payload(extra) {
      return readResume().then(resume => Object.assign({
        action: "apply", role: j.Role || "", business: j.Business || "", employer: (employerEmail || "").toLowerCase(),
        name: iName.value.trim(), year: iYear.value, email: iEmail.value.trim().toLowerCase(), major: iMajor.value.trim(),
        phone: iPhone.value.trim(), availability: iAvail.value.trim(), about: iAbout.value.trim(), website: iTrap.value, resume: resume
      }, extra));
    }
    function sendCode() {
      const email = iEmail.value.trim().toLowerCase();
      setBusy(true, "Sending code…");
      return post({ action: "sendCode", email: email }).then(r => {
        setBusy(false);
        if (!r.ok) { say(r.error || "We couldn't send the code. Please try again.", true); return; }
        sentTo = email;
        codeNote.textContent = "We sent a 6-digit code to " + email + ". It can take a minute. Check your junk folder too.";
        showStep("code");
      }).catch(() => { setBusy(false); netFail(); });
    }
    function succeed(r) {
      const mine = { name: iName.value.trim(), year: iYear.value, email: iEmail.value.trim().toLowerCase(), major: iMajor.value.trim(), phone: iPhone.value.trim(), avail: iAvail.value.trim() };
      saveProf(Object.assign({}, mine, { token: r.token || "" }));
      saveMe(Object.assign(loadMe(), mine));                 // so the email form is pre-filled too
      // also add it to the team's existing Applications log, marked "Automatic" (only after it was really sent)
      logApplication(j, employerEmail || "", { name: mine.name, email: mine.email, year: mine.year, major: mine.major, phone: mine.phone,
        avail: mine.avail, about: iAbout.value.trim() }, "Automatic (sent)");
      doneSub.textContent = (j.Business || "The business") + " got your application and resume.";
      form.hidden = true; done.hidden = false;
      const alt = apply.querySelector(".alt-mail"); if (alt) alt.hidden = true;
      done.scrollIntoView && done.scrollIntoView({ block: "nearest" });
    }
    function submitApplication(code) {
      const email = iEmail.value.trim().toLowerCase();
      const token = prof.email === email ? (prof.token || "") : "";
      setBusy(true, "Sending…");
      return payload(code ? { code: code } : { token: token }).then(p => post(p)).then(r => {
        setBusy(false);
        if (r.ok) { succeed(r); return; }
        if (r.needCode) { prof.token = ""; return sendCode(); }
        if (r.token) prof.token = r.token;
        say(r.error || "Something went wrong. Please try again.", true);
        if (step === "code" && /code/i.test(r.error || "")) iCode.focus();
      }).catch(e => { setBusy(false); if (e && e.message === "read") say("We couldn't read that file. Please choose it again.", true); else netFail(); });
    }
    form.addEventListener("submit", ev => {
      ev.preventDefault(); if (busy) return;
      if (step === "code") {
        const c = iCode.value.replace(/\D/g, "");
        if (c.length !== 6) { say("Please type the 6-digit code from your email.", true); iCode.focus(); return; }
        submitApplication(c); return;
      }
      const bad = validate();
      if (bad) { say(bad[1], true); bad[0].focus(); return; }
      submitApplication("");
    });
    resend.addEventListener("click", () => { if (!busy) sendCode(); });
    ["input", "change"].forEach(ev => form.addEventListener(ev, () => { if (msg.classList.contains("err")) say(""); }));
    return wrap;
  }

  // ---------- [NEW] The email the student sends ----------
  // EDIT THE WORDING HERE. Each line below becomes a line in the email.
  const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));   // iPads pretend to be Macs

  // [CHANGED] Fills in the student's answers from the apply form. Anything left blank stays as [brackets].
  function emailLinks(j, to, info) {
    info = info || {};
    const role = j.Role || "the open role", biz = j.Business || "your business";
    const name = info.name || "[Your Name]";
    const subject = "Stevens Student Application: " + role + " at " + biz + (info.name ? " (" + info.name + ")" : "");
    const who = !info.year ? "a [class year] [major] student"
      : info.year === "Graduate student" ? "a graduate student in " + (info.major || "[major]")
      : "a " + info.year.toLowerCase() + " " + (info.major || "[major]") + " student";
    const contact = [info.email && "Email: " + info.email, info.phone && "Phone: " + info.phone].filter(Boolean);
    const lines = [
      "Hello " + biz + " Team,",
      "",
      "My name is " + name + ", and I'm " + who + " at Stevens Institute of Technology. I'm applying for the " + role + " position that I found on Around the Block.",
      "",
      info.about || "A little about me: [one or two sentences about your experience, or why this job interests you]",
      "",
      "Availability for work: " + (info.avail || "[days and hours around your classes]"),
      "Availability for an interview: [days and times]"
    ].concat(contact.length ? contact : ["Phone: [your phone number]"]).concat([
      "",
      "My resume is attached. Thank you for your time and consideration.",
      "",
      "Best,",
      name,
      "Stevens Institute of Technology"
    ]);
    const q = "subject=" + encodeURIComponent(subject);
    const body = encodeURIComponent(lines.join("\n"));
    // [NEW] CC the Around the Block inbox, so we get a copy of every application a student actually sends.
    // Set applyCc in config.js to change the address (or applyCc: "" to turn it off). Defaults to contactEmail.
    const ccAddr = (typeof cfg.applyCc === "string" ? cfg.applyCc : (cfg.contactEmail || "aroundtheblockhoboken@gmail.com")).trim();
    const cc = ccAddr && ccAddr.toLowerCase() !== String(to).toLowerCase() ? "&cc=" + encodeURIComponent(ccAddr) : "";
    return {
      // [NEW] login_hint tells Microsoft which account to use (the student's @stevens.edu address), so people
      // signed in to several Microsoft accounts don't get the "Pick an account" screen that drops the email.
      // [CHANGED] Outlook on the web ignores cc=, so the Around the Block address goes in the To line instead.
      outlook: "https://outlook.cloud.microsoft/mail/deeplink/compose?to=" + encodeURIComponent(to) + (cc ? "," + encodeURIComponent(ccAddr) : "") + "&" + q + "&body=" + body +
        (info.email ? "&login_hint=" + encodeURIComponent(info.email) : ""),
      app: "ms-outlook://compose?to=" + encodeURIComponent(to) + cc + "&" + q + "&body=" + body,   // Outlook phone app
      gmail: "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + cc + "&su=" + encodeURIComponent(subject) + "&body=" + body,
      mail: "mailto:" + to + "?" + q + cc + "&body=" + body,                                       // the device's own mail app
      text: "To: " + to + (ccAddr && cc ? "\nCc: " + ccAddr : "") + "\nSubject: " + subject + "\n\n" + lines.join("\n")   // shown and copied
    };
  }

  // ---------- [NEW] The text message the student sends ----------
  // EDIT THE WORDING HERE. Kept short because it's a text, not an email.
  // Phones and Macs open Messages (iMessage if the employer has an iPhone, a normal text if not).
  const canText = () => isPhone() || /Macintosh/.test(navigator.userAgent);
  function textLinks(j, to, info) {
    const role = j.Role || "the open role", biz = j.Business || "your business";
    const who = info.year === "Graduate student" ? "a graduate student in " + info.major
      : "a " + (info.year || "").toLowerCase() + " " + info.major + " student";
    const parts = [
      "Hi, my name is " + info.name + ", " + who + " at Stevens. I found your " + role + " listing" +
        (biz && !/^private/i.test(biz) ? " at " + biz : "") + " on Around the Block and I'd love to apply.",
      info.about || "",
      info.avail ? "I'm available " + info.avail.replace(/^i'?m available\s*/i, "") + "." : "",
      "Would you be open to a quick call or meeting? I'm happy to send my resume, and you can also reach me at " + info.email + ". Thank you!"
    ].filter(Boolean);
    const text = parts.join("\n\n");
    return { sms: "sms:" + to + "?&body=" + encodeURIComponent(text), text: text };   // "?&body=" works on iPhone and Android
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
    const byNewest = (a, b) => (postedTime(b) - postedTime(a)) || (jobs.indexOf(b) - jobs.indexOf(a));   // newest date first; same day: the row added last goes on top
    const endsAt = j => expiryTime(j) || Infinity;                                                      // jobs with no end date go last
    shown.sort(s === "close" ? (a, b) => walkMinutes(a.Walk) - walkMinutes(b.Walk)
      : s === "new" ? byNewest
      : (a, b) => (endsAt(a) === endsAt(b) ? 0 : endsAt(a) < endsAt(b) ? -1 : 1) || byNewest(a, b));      // soonest end date first (default)

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
    add("Site files version: 33 (if this is not 33, some files on GitHub are old)");
    add("Automatic apply: " + (!cfg.applyUrl ? "OFF (no applyUrl in config.js)" : autoApply ? (cfg.applyLive === false ? "TEST MODE (only you see it, because of ?autoapply=1)" : "ON for everyone") : "READY but hidden from students. Add ?autoapply=1 to the address to test it, or set applyLive: true to turn it on for everyone."));
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