'use strict';

/**
 * Classify Mailgun / SMTP / API send failures for campaign retry policy.
 * retryable → allow one automatic resend (max 2 attempts total)
 * permanent → never resend
 */

function extractSmtpCode(text) {
  const s = String(text || '');
  const m =
    s.match(/\b([45]\.\d+\.\d+)\b/) ||
    s.match(/\b(550|551|552|553|554|421|450|451|452|422|420|429|401|403|502|503|504)\b/);
  return m ? m[1] : null;
}

function classifySendFailure(errorOrMessage, statusCode) {
  const raw = String(errorOrMessage || '').trim();
  const lower = raw.toLowerCase();
  const codeFromStatus =
    statusCode != null && Number.isFinite(Number(statusCode)) ? String(statusCode) : null;
  const code = extractSmtpCode(raw) || codeFromStatus;

  // --- Permanent (hard bounce / invalid recipient / auth that won't self-heal by resend) ---
  const permanentPatterns = [
    /\b5\.1\.1\b/,
    /\b5\.1\.0\b/,
    /\b5\.5\.0\b/,
    /\b5\.7\.\d+\b/,
    /\b550\b/,
    /no such user/,
    /nosuchuser/,
    /user doesn't exist/,
    /user does not exist/,
    /mailbox not found/,
    /mailbox .* unavailable/,
    /mailbox unavailable/,
    /undeliverable address/,
    /recipient address rejected/,
    /requested mail action aborted/,
    /no mx for/,
    /no such host/,
    /does not exist/,
    /invalid.*(recipient|address|mailbox)/,
    /suppressed?/,
    /unsubscribed/,
    /forbidden/,
    /unauthorized/
  ];

  for (const re of permanentPatterns) {
    if (re.test(lower) || (code && re.test(String(code)))) {
      // Forbidden/Unauthorized treated permanent for auto-retry of NEW failures;
      // migration may still requeue historical ones once.
      return {
        errorClass: 'permanent',
        errorCode: code || (/\bforbidden\b/.test(lower) ? '403' : /\bunauthorized\b/.test(lower) ? '401' : null),
        reason: 'hard_bounce_or_invalid'
      };
    }
  }

  if (code && /^5\./.test(code)) {
    return { errorClass: 'permanent', errorCode: code, reason: 'smtp_5xx' };
  }
  if (code === '550' || code === '551' || code === '553' || code === '554') {
    return { errorClass: 'permanent', errorCode: code, reason: 'smtp_55x' };
  }

  // --- Retryable (rate limit, temp deferral, inbox full, timeouts) ---
  const retryablePatterns = [
    /\b420\b/,
    /\b429\b/,
    /\b4\.2\.2\b/,
    /\b4\.2\.1\b/,
    /\b4\.7\.\d+\b/,
    /overquotatemp/,
    /out of storage/,
    /inbox is full/,
    /storage space/,
    /\btimeout\b/,
    /i\/o timeout/,
    /unable to connect to mx/,
    /connection failed/,
    /rate limit/,
    /too many/,
    /enhance your calm/,
    /try again later/,
    /temporarily/,
    /deferred/,
    /greylist/,
    /econnreset/,
    /etimedout/,
    /econnrefused/,
    /\b502\b/,
    /\b503\b/,
    /\b504\b/
  ];

  for (const re of retryablePatterns) {
    if (re.test(lower) || (code && re.test(String(code)))) {
      return {
        errorClass: 'retryable',
        errorCode: code || (/\b420\b/.test(lower) ? '420' : null),
        reason: 'transient'
      };
    }
  }

  if (code && /^4\./.test(code)) {
    return { errorClass: 'retryable', errorCode: code, reason: 'smtp_4xx' };
  }
  if (code === '420' || code === '421' || code === '429' || code === '450' || code === '451' || code === '452') {
    return { errorClass: 'retryable', errorCode: code, reason: 'smtp_temp' };
  }
  if (code === '502' || code === '503' || code === '504') {
    return { errorClass: 'retryable', errorCode: code, reason: 'http_5xx' };
  }

  // Safe default: do not resend unknown failures forever.
  return {
    errorClass: 'permanent',
    errorCode: code,
    reason: 'unknown_default_permanent'
  };
}

/**
 * Mailgun event-data severity / delivery-status → same classifier.
 */
function classifyMailgunEvent(eventData = {}) {
  const severity = String(eventData.severity || '').toLowerCase();
  const reason = String(eventData.reason || '').trim();
  const delivery = eventData['delivery-status'] || eventData.deliveryStatus || {};
  const message =
    delivery.message ||
    delivery.description ||
    eventData['delivery-status.message'] ||
    reason ||
    String(eventData.event || '');
  const code = delivery.code != null ? delivery.code : delivery['smtp-code'];

  if (severity === 'permanent') {
    const classified = classifySendFailure(message, code);
    return { ...classified, errorClass: 'permanent', sourceSeverity: severity };
  }
  if (severity === 'temporary') {
    const classified = classifySendFailure(message, code);
    // Prefer retryable for explicit temporary severity unless hard-bounce text wins.
    if (classified.errorClass === 'permanent' && /no such user|does not exist|no mx|mailbox not found/i.test(message)) {
      return { ...classified, sourceSeverity: severity };
    }
    return {
      errorClass: 'retryable',
      errorCode: classified.errorCode || (code != null ? String(code) : null),
      reason: classified.reason || 'mailgun_temporary',
      sourceSeverity: severity
    };
  }

  return classifySendFailure(message, code);
}

module.exports = {
  extractSmtpCode,
  classifySendFailure,
  classifyMailgunEvent
};
