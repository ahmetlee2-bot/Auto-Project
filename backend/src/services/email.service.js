async function sendVerificationCode({ to, code, name }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM_EMAIL || 'AutoLister <noreply@autolister-app.de>').trim();
  if (!apiKey) throw Object.assign(new Error('E-Mail-Versand ist nicht konfiguriert.'), { status: 503 });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject: 'Dein AutoLister Bestätigungscode',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h1>AutoLister</h1><p>Hallo ${escapeHtml(name || 'dort')},</p><p>Dein Bestätigungscode lautet:</p><p style="font-size:34px;font-weight:700;letter-spacing:8px">${code}</p><p>Der Code ist 10 Minuten gültig. Wenn du diese Registrierung nicht gestartet hast, kannst du diese E-Mail ignorieren.</p></div>`,
    }),
  });
  if (!response.ok) throw Object.assign(new Error('Bestätigungsmail konnte nicht gesendet werden.'), { status: 502 });
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

module.exports = { sendVerificationCode };
