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

  // Email button in the "For businesses" section (unchanged)
  if (cfg.contactEmail) {
    $("contact-btn").href = "mailto:" + cfg.contactEmail +
      "?subject=" + encodeURIComponent("Post a job on Around the Block");
  }

  // ---------- [CHANGED] Column names ----------
  // Sheet headers are now matched ignoring capitals, so "pay" or "PAY" still works.
  const COLUMNS = ["Role","Business","Location","Type","Hours","Pay","Walk",
                   "Apply","Posted","Active","Description","ID"];       // [NEW] Description, ID
  const CANON = Object.fromEntries(COLUMNS.map(c => [c.toLowerCase(), c]));
  // [CHANGED] Alternate header names that also work. Your sheet uses "Job Description".
  Object.assign(CANON, {
    "job description": "Description",
    "job desc": "Description",
    "about": "Description",
    "details": "Description"
  });
  let hasActiveColumn = false;

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
    hasActiveColumn = head.includes("Active");
    return rows
      .filter(r => r.some(v => v.trim()))
      .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }

  // ---------- [CHANGED] Active check ----------
  // Before: a blank Active cell meant "show it". Now it must say Yes.
  // (If your sheet has no Active column at all, everything is shown.)
  const isActive = j => !hasActiveColumn || /^(y|yes|true|1)$/i.test(j.Active || "");

  // ---------- [NEW] Helpers ----------
  // Reads 2026-10-14 or 10/14/2026 (Google Sheets can publish either). Returns a number.
  function parseDate(s) {
    if (!s) return 0;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], m[1] - 1, +m[2]).getTime();
    const t = Date.parse(s); return isNaN(t) ? 0 : t;
  }
  const walkMinutes = s => { const m = (s || "").match(/\d+/); return m ? +m[0] : 999; };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

  // ---------- Job card (the clickable summary) ----------
  function card(j) {
    const c = el("article", "card");
    // [CHANGED] The title is now a link that opens the detail window
    const h = el("h3");
    const a = el("a", "card-link", j.Role || "Open role");
    a.href = "#job=" + j._id;
    h.appendChild(a);
    c.appendChild(h);
    const where = [j.Business, j.Location].filter(Boolean).join(", ");
    if (where) c.appendChild(el("p", "where", where));

    const tags = el("div", "tags");                          // [NEW] tag row
    if (j.Type) tags.appendChild(el("span", "tag", j.Type));
    if (tags.childNodes.length) c.appendChild(tags);

    if (j.Hours) c.appendChild(el("p", "meta", j.Hours));
    if (j.Pay) c.appendChild(el("p", "meta pay", j.Pay));
    if (j.Walk) c.appendChild(el("p", "meta", j.Walk + " from campus"));
    if (j.Description) {                                     // [NEW] short preview
      const d = j.Description.replace(/\s+/g, " ");
      c.appendChild(el("p", "preview", d.length > 110 ? d.slice(0, 110).trim() + "…" : d));
    }
    c.appendChild(el("div", "spacer"));
    const more = el("a", "btn", "View details");             // [CHANGED] main button opens details
    more.href = "#job=" + j._id;
    more.setAttribute("aria-label", "View details: " + (j.Role || "") + " at " + (j.Business || ""));
    c.appendChild(more);
    if (j.Posted) c.appendChild(el("p", "posted", "Posted " + j.Posted));

    // [NEW] Clicking anywhere on the card opens it (links inside still work normally)
    c.addEventListener("click", e => { if (!e.target.closest("a")) location.hash = "job=" + j._id; });
    return c;
  }

  // ---------- [NEW] Detail window ----------
  function renderDetail(j) {
    dlgBody.replaceChildren();
    const head = el("header", "d-head");
    const title = el("h2", "", j.Role || "Open role"); title.id = "dialog-title";
    head.appendChild(title);
    const where = [j.Business, j.Location].filter(Boolean).join(", ");
    if (where) head.appendChild(el("p", "where", where));
    const tags = el("div", "tags");
    if (j.Type) tags.appendChild(el("span", "tag", j.Type));
    if (tags.childNodes.length) head.appendChild(tags);
    dlgBody.appendChild(head);

    // Facts grid: only shows rows that have a value
    const facts = el("dl", "facts");
    [["Hours", j.Hours], ["Pay", j.Pay],
     ["Distance", j.Walk && j.Walk + " from campus"], ["Posted", j.Posted]].forEach(([k, v]) => {
      if (!v) return;
      const box = el("div"); box.appendChild(el("dt", "", k)); box.appendChild(el("dd", "", v));
      facts.appendChild(box);
    });
    dlgBody.appendChild(facts);

    // Description: line breaks in the sheet cell become paragraphs
    const desc = el("section", "d-desc");
    desc.appendChild(el("h3", "", "About this job"));
    if (j.Description) paragraphs(j.Description).forEach(p => desc.appendChild(el("p", "", p)));
    else desc.appendChild(el("p", "meta", "No description yet. Contact the business to ask about the role."));
    dlgBody.appendChild(desc);

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
      const a = el("a", "btn", "Apply by email"); a.href = applyMailto(j, email);
      apply.appendChild(a);
      apply.appendChild(el("p", "apply-note",
        "Opens your email app with a message ready to fill in. Add your details, attach your resume, then press send."));
    } else if (applyLink(raw)) {
      const l = applyLink(raw), a = el("a", "btn", l.label); a.href = l.href; apply.appendChild(a);
    } else if (raw) {
      apply.appendChild(el("p", "meta", "To apply: " + raw));
    }
    dlgBody.appendChild(apply);
  }

  // ---------- [NEW] The email the student sends ----------
  // EDIT THE WORDING HERE. Each line below becomes a line in the email.
  function applyMailto(j, to) {
    const role = j.Role || "the open role", biz = j.Business || "your business";
    const body = [
      "Hi,",
      "",
      "I'm a Stevens student and I'm interested in the " + role + " position at " + biz + ".",
      "",
      "Name:",
      "Stevens email:",
      "Phone number:",
      "Class year and major:",
      "Availability (days and hours):",
      "",
      "My resume is attached. Please attach it before sending.",
      "",
      "Thank you,",
      "",
      "",
      "Sent through Around the Block"
    ].join("\r\n");
    return "mailto:" + to + "?subject=" + encodeURIComponent("Application: " + role + " at " + biz) +
      "&body=" + encodeURIComponent(body);
  }

  // Opens/closes the window based on the URL (#job=...). This makes each job
  // shareable and makes the browser Back button close the window.
  function syncDialogToHash() {
    const m = location.hash.match(/^#job=(.+)$/);
    const j = m && jobs.find(x => x._id === decodeURIComponent(m[1]));
    if (j) { renderDetail(j); if (!dlg.open) dlg.showModal(); }
    else if (dlg.open) dlg.close();
  }
  dlg.addEventListener("close", () => {            // user pressed X, Esc, or clicked outside
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
      (!q || [j.Role, j.Business, j.Location, j.Type, j.Hours, j.Description].join(" ").toLowerCase().includes(q)));
    // [NEW] Sorting
    shown.sort(s === "close"
      ? (a, b) => walkMinutes(a.Walk) - walkMinutes(b.Walk)
      : (a, b) => parseDate(b.Posted) - parseDate(a.Posted));

    listEl.replaceChildren(...shown.map(card));
    if (!shown.length) {
      const box = el("div", "empty");
      box.appendChild(el("p", "", jobs.length ? "No jobs match your search." : "No open jobs right now. Check back soon."));
      if (jobs.length) {                                     // [NEW] Clear filters button
        const b = el("button", "btn ghost", "Clear filters"); b.type = "button";
        b.addEventListener("click", () => { qEl.value = ""; typeEl.value = ""; render(); });
        box.appendChild(b);
      }
      listEl.appendChild(box);
    }
    statusEl.textContent = (cfg.sheetCsvUrl ? "" : "Example listings. ") +
      shown.length + (shown.length === 1 ? " job" : " jobs") + " shown";
  }

  function setup(data) {
    const seen = {};
    jobs = data.filter(isActive).map(j => {                  // [NEW] give every job a link ID
      let id = j.ID ? slug(j.ID) : slug((j.Business || "") + "-" + (j.Role || "job"));
      seen[id] = (seen[id] || 0) + 1;
      j._id = seen[id] > 1 ? id + "-" + seen[id] : id;
      return j;
    });
    typeEl.replaceChildren(Object.assign(el("option", "", "All types"), { value: "" }));
    [...new Set(jobs.map(j => j.Type).filter(Boolean))].sort()
      .forEach(t => typeEl.appendChild(Object.assign(el("option", "", t), { value: t })));
    render();
    syncDialogToHash();                                      // open a job if the link had #job=...
  }

  qEl.addEventListener("input", render);
  typeEl.addEventListener("change", render);
  sortEl.addEventListener("change", render);

  // ---------- Loading ----------
  function load() {
    if (!cfg.sheetCsvUrl) { setup(cfg.exampleJobs || []); return; }
    statusEl.textContent = "Loading jobs…";
    fetch(cfg.sheetCsvUrl + (cfg.sheetCsvUrl.includes("?") ? "&" : "?") + "t=" + Date.now())
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(t => setup(parseCSV(t)))
      .catch(() => {                                         // [CHANGED] error now has a Retry button
        statusEl.textContent = "Couldn't load jobs. Check your connection and try again.";
        const box = el("div", "empty"), b = el("button", "btn", "Try again"); b.type = "button";
        b.addEventListener("click", load); box.appendChild(b);
        listEl.replaceChildren(box);
      });
  }
  load();
})();
