/* src/server/email/resend.js */
const RESEND_API_URL = 'https://api.resend.com/emails';

const shouldStubEmail = (env) => (env.ENVIRONMENT || '').toLowerCase() === 'local';

export const sendEmail = async (env, { to, subject, html, text, replyTo }) => {
  if (!to || !subject || (!html && !text)) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  if (shouldStubEmail(env)) {
    console.log('[Email] Stub send:', to, subject);
    return { ok: true, stubbed: true };
  }
  if (!env.RESEND_API_KEY) {
    return { ok: false, code: 'MISSING_RESEND_API_KEY' };
  }
  if (!env.EMAIL_FROM) {
    return { ok: false, code: 'MISSING_EMAIL_FROM' };
  }

  const payload = {
    from: env.EMAIL_FROM,
    to,
    subject,
  };
  if (text) {
    payload.text = text;
  }
  if (html) {
    payload.html = html;
  }
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { ok: false, code: 'RESEND_FAILED', status: response.status };
  }

  return { ok: true, status: response.status };
};

export const sendSupportEmail = async (env, { subject, html, text }) => {
  if (!env.SUPPORT_EMAIL_TO) {
    return { ok: false, code: 'MISSING_SUPPORT_EMAIL' };
  }
  return sendEmail(env, {
    to: env.SUPPORT_EMAIL_TO,
    subject,
    html,
    text,
  });
};
