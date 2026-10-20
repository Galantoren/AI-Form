/**
 * AI Pulse email relay — a Google Apps Script web app.
 *
 * The Worker POSTs {subject, text} here for each new survey response, and
 * this script emails it from your Google account to RECIPIENTS.
 *
 * Setup (see worker/README.md, step 4): paste this into a new project at
 * https://script.google.com, fill in RECIPIENTS and SHARED_KEY there, and
 * deploy it as a web app. Keep the real recipient list and key in Apps
 * Script only — this repo is public, so don't commit them here.
 */

const RECIPIENTS = ['someone@example.com', 'someone.else@example.com'];
const SHARED_KEY = 'replace-with-a-long-random-string';

function doPost(e) {
  if (!e.parameter || e.parameter.key !== SHARED_KEY) {
    return reply({ error: 'forbidden' });
  }
  const data = JSON.parse(e.postData.contents);
  MailApp.sendEmail({
    to: RECIPIENTS.join(','),
    subject: String(data.subject || 'New AI Pulse response').slice(0, 200),
    body: String(data.text || ''),
    name: 'AI Pulse survey',
  });
  return reply({ ok: true });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
