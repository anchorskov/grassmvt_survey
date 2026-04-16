/* src/server/email/resend.js */
const RESEND_API_URL = 'https://api.resend.com/emails';

const shouldStubEmail = (env) => (env.ENVIRONMENT || '').toLowerCase() === 'local';

// Default sender if EMAIL_FROM env var is not set
const DEFAULT_EMAIL_FROM = 'Grassroots Movement <verify@grassrootsmvt.org>';

export const sendEmail = async (env, { to, subject, html, text, replyTo, from }) => {
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

  // Use explicit from param, then env.EMAIL_FROM, then default
  const fromAddress = from || env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
  // Use explicit replyTo param, or env.EMAIL_REPLY_TO, or undefined
  const effectiveReplyTo = replyTo || env.EMAIL_REPLY_TO || undefined;

  const payload = {
    from: fromAddress,
    to,
    subject,
  };
  if (text) {
    payload.text = text;
  }
  if (html) {
    payload.html = html;
  }
  if (effectiveReplyTo) {
    payload.reply_to = effectiveReplyTo;
  }

  console.log('[Email] Sending via Resend:', {
    to,
    subject,
    from: fromAddress,
    replyTo: effectiveReplyTo || '(none)',
    hasHtml: !!html,
    hasText: !!text,
  });

  let response;
  let responseBody;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Always try to read the response body for logging
    responseBody = await response.text();
    console.log('[Email] Resend response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });
  } catch (fetchError) {
    console.error('[Email] Resend fetch error:', fetchError.message || fetchError);
    return { ok: false, code: 'RESEND_FETCH_ERROR', error: fetchError.message };
  }

  if (!response.ok) {
    console.error('[Email] Resend failed:', {
      status: response.status,
      body: responseBody,
    });
    return { ok: false, code: 'RESEND_FAILED', status: response.status, body: responseBody };
  }

  // Parse the response to get the email ID
  let parsedBody;
  try {
    parsedBody = JSON.parse(responseBody);
  } catch (e) {
    parsedBody = { raw: responseBody };
  }

  console.log('[Email] Resend success:', {
    status: response.status,
    emailId: parsedBody.id || 'unknown',
  });

  return { ok: true, status: response.status, emailId: parsedBody.id, response: parsedBody };
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

export const sendFeedbackEmail = async (env, { message, senderEmail, page }) => {
  const to = env.FEEDBACK_EMAIL_TO || 'jimmy@grassrootsmvt.org';
  const safePage = (page || '').trim().slice(0, 200);
  const safeSenderEmail = (senderEmail || '').trim().slice(0, 200);
  const safeMessage = (message || '').trim().slice(0, 2000);

  const subject = safePage
    ? `Platform feedback — ${safePage}`
    : 'Platform feedback';

  const lines = [
    'New feedback submitted via grassrootsmvt.org.',
    '',
    safePage ? `Page: ${safePage}` : null,
    safeSenderEmail ? `Reply to: ${safeSenderEmail}` : 'Reply to: (not provided)',
    '',
    'Message:',
    safeMessage,
  ].filter((l) => l !== null);

  const text = lines.join('\n');

  const escHtml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const html = `
    <p>New feedback submitted via grassrootsmvt.org.</p>
    ${safePage ? `<p><strong>Page:</strong> ${escHtml(safePage)}</p>` : ''}
    <p><strong>Reply to:</strong> ${escHtml(safeSenderEmail || '(not provided)')}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap;">${escHtml(safeMessage)}</p>
  `;

  return sendEmail(env, {
    from: 'Grassroots Feedback <feedbackgrmvt@grassrootsmvt.org>',
    to,
    subject,
    text,
    html,
    replyTo: safeSenderEmail || undefined,
  });
};
