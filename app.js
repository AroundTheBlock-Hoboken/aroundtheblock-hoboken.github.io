// Loads job listings from a published Google Sheet (CSV) and shows them as cards.
(function () {
  const cfg = window.ATB_CONFIG || {};
  const listEl = document.getElementById("list");
  const statusEl = document.getElementById("status");
  const qEl = document.getElementById("q");
  const typeEl = document.getElementById("type");
  let jobs = [];

  if (cfg.contactEmail) {
    document.getElementById("contact-btn").href =
      "mailto:" + cfg.contactEmail + "?subject=" + encodeURIComponent("Post a job on Around the Block");
  }

  // Small CSV parser that handles quoted cells, commas and line breaks.
  function parseCSV(text) {
    const rows = []; let row = []; let cell = ""; let q = false;
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
    const head = (rows.shift() || []).map(h => h.trim());
    return rows
      .filter(r => r.some(v => v.trim()))
      .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }

  const isActive = j => !j.Active || /^(y|yes|true|1)$/i.test(j.Active);

  // Pre-written email so the business knows the student found them on Around the Block.
  function emailBody(j) {
    const role = j.Role || "the open position";
    const biz = j.Business || "your business";
    return [
      "Hi,",
      "",
      "I'm a Stevens Institute of Technology student and I found your " + role + " listing on Around the Block. I'd love to be considered for the role.",
      "",
      "Name: ",
      "Year and major: ",
      "Days and times I'm available: ",
      "Relevant experience (if any): ",
      "",
      "I've attached my resume. I'd be happy to come in for an interview at a time that works for you.",
      "",
      "Thank you,",
      "",
      "",
      "---",
      "Sent via Around the Block, part-time jobs for Stevens students: " + location.href.split("#")[0]
    ].join("\n");
  }

  function applyLink(j) {
    const value = j.Apply || "";
    if (/^https?:\/\//i.test(value)) return { href: value, label: "Apply", note: "Have your resume ready to upload." };
    if (/@/.test(value)) {
      const subject = "Around the Block application: " + (j.Role || "Open position") + (j.Business ? " at " + j.Business : "");
      return {
        href: "mailto:" + value + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(emailBody(j)),
        label: "Email to apply",
        note: "Opens a pre-written email. Fill in your details and attach your resume before sending."
      };
    }
    const digits = value.replace(/[^\d+]/g, "");
    if (digits.length >= 10) return { href: "tel:" + digits, label: "Call to apply", note: "Mention you found the job on Around the Block, and bring a printed resume to the interview." };
    return null;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function card(j) {
    const c = el("article", "card");
    c.appendChild(el("h3", "", j.Role || "Open role"));
    const where = [j.Business, j.Location].filter(Boolean).join(", ");
    if (where) c.appendChild(el("p", "where", where));
    if (j.Type) c.appendChild(el("span", "tag", j.Type));
    if (j.Hours) c.appendChild(el("p", "meta", j.Hours));
    if (j.Pay) c.appendChild(el("p", "meta pay", j.Pay));
    if (j.Walk) c.appendChild(el("p", "meta", j.Walk + " from campus"));
    c.appendChild(el("div", "spacer"));
    const link = j.Apply ? applyLink(j) : null;
    if (link) {
      const a = el("a", "btn", link.label);
      a.href = link.href;
      if (link.href.startsWith("http")) { a.target = "_blank"; a.rel = "noopener"; }
      a.setAttribute("aria-label", link.label + ": " + (j.Role || "") + " at " + (j.Business || ""));
      c.appendChild(a);
      c.appendChild(el("p", "resume-note", link.note));
    }
    if (j.Apply && !link) { c.appendChild(el("p", "meta", "To apply: " + j.Apply)); c.appendChild(el("p", "resume-note", "Mention Around the Block and bring your resume.")); }
    if (j.Posted) c.appendChild(el("p", "posted", "Posted " + j.Posted));
    return c;
  }

  function render() {
    const q = qEl.value.trim().toLowerCase();
    const t = typeEl.value;
    const shown = jobs.filter(j =>
      (!t || j.Type === t) &&
      (!q || Object.values(j).join(" ").toLowerCase().includes(q)));
    listEl.replaceChildren(...shown.map(card));
    if (!shown.length) listEl.appendChild(el("p", "empty", jobs.length ? "No jobs match your search." : "No open jobs right now. Check back soon!"));
    statusEl.textContent = (cfg.sheetCsvUrl ? "" : "Example listings. ") +
      shown.length + (shown.length === 1 ? " job" : " jobs") + " shown";
  }

  function setup(data) {
    jobs = data.filter(isActive).sort((a, b) => (b.Posted || "").localeCompare(a.Posted || ""));
    const types = [...new Set(jobs.map(j => j.Type).filter(Boolean))].sort();
    types.forEach(t => { const o = el("option", "", t); o.value = t; typeEl.appendChild(o); });
    render();
  }

  qEl.addEventListener("input", render);
  typeEl.addEventListener("change", render);

  if (cfg.sheetCsvUrl) {
    fetch(cfg.sheetCsvUrl + (cfg.sheetCsvUrl.includes("?") ? "&" : "?") + "t=" + Date.now())
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(t => setup(parseCSV(t)))
      .catch(() => { statusEl.textContent = "Couldn't load jobs right now. Please try again later."; });
  } else {
    setup(cfg.exampleJobs || []);
  }
})();
