// ============================================================
// Around the Block - settings (edit only the text between quotes)
// ============================================================
window.ATB_CONFIG = {

  // 1. The published Google Sheet (File > Share > Publish to web > CSV).
  //    Replace this link if you ever publish a different sheet.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTljWk3QbahmcQIiYL6KfGSeneKfuciq14dDpaZDrhDbunlt7Sd9RKa3-WwiBv7jj38-vHOcvPMpfd9/pub?gid=0&single=true&output=csv",

  // 2. Where the "Email us" buttons send messages (shared team inbox).
  contactEmail: "aroundtheblockhoboken@gmail.com",

  // 3. Your existing script that logs applications sent through the Outlook email.
  applyLogUrl: "https://script.google.com/macros/s/AKfycbwS54tTzTein9D5G04Gqwb2DhwppSN6taAtyTkSiuQgks1MG1at6dxW3n8R8g2EmpmmgQ/exec",

  // 4. NEW: automatic applications. Paste the "Web app URL" from the new Google script here
  //    (see README). While this is empty, students use the Outlook email as before.
  applyUrl: "https://script.google.com/macros/s/AKfycbwNZL5M8gScKh1vxtVRg_ZEuDJAIDR7JRlJO8eKb5mbYQqtoAfb6bN5XI9Qsv7Vn92j/exec",

  //    Who sees the new form? false = only your team, by adding ?autoapply=1 to the site address
  //    (students still get the Outlook email). Change to true when you are ready to turn it on for everyone.
  applyLive: true,

  // 5. Only shown if sheetCsvUrl is ever left empty.
  exampleJobs: []
};
