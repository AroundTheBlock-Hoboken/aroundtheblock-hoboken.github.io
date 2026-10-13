// ===== The only file your team needs to edit =====

window.ATB_CONFIG = {
  // Paste the "Publish to web" CSV link of your Google Sheet here (see README).
  // Leave it empty to show the example listings below.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTljWk3QbahmcQIiYL6KfGSeneKfuciq14dDpaZDrhDbunlt7Sd9RKa3-WwiBv7jj38-vHOcvPMpfd9/pub?gid=0&single=true&output=csv",

  // Where businesses email you to post or remove a job.
  contactEmail: "jhaase@stevens.edu",

  // Shown only while sheetCsvUrl is empty.
  exampleJobs: [
    { Role: "Barista", Business: "Example café", Location: "Washington St", Type: "Coffee shop",
      Hours: "Mon & Wed, 7 to 11am", Pay: "$17/hr + tips", Walk: "4 min walk",
      Apply: "Ask for Maria, (201) 555-0100", Posted: "2026-10-13" },
    { Role: "Host / server", Business: "Example Italian restaurant", Location: "1st St", Type: "Restaurant",
      Hours: "Fri & Sat evenings", Pay: "$15/hr + tips", Walk: "6 min walk",
      Apply: "jobs@example.com", Posted: "2026-10-12" },
    { Role: "Sales associate", Business: "Example bookstore", Location: "Bloomfield St", Type: "Retail",
      Hours: "Weekends, 10am to 4pm", Pay: "$16/hr", Walk: "8 min walk",
      Apply: "https://example.com/apply", Posted: "2026-10-10" }
  ]
};
