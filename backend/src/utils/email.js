const crypto = require('crypto');
const config = require('../configs/app.config');
const { logger } = require('../libs/logger');

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const OTP_EXPIRY_MINUTES = 10;

const DEFAULT_VERIFICATION_SUBJECT = 'Verify your email - Partner Platform';
const FOOTER_BRAND = 'Partner Platform';

/** Format storeCode to display name (thor -> Thor, ironman -> Ironman) */
function storeCodeToDisplayName(storeCode) {
  if (!storeCode || typeof storeCode !== 'string') return null;
  const s = String(storeCode).trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Primary brand color (matches frontend theme) */
const BRAND_PRIMARY = '#f97316';
const BRAND_PRIMARY_DARK = '#ea580c';
const HEADER_BG = '#1a1a1f';
const BODY_BG = '#0d0d0f';
const TEXT_PRIMARY = '#f4f4f5';
const TEXT_MUTED = '#9ca3af';

/**
 * Build production-ready HTML for verification email. Inline styles for email client compatibility.
 * @param {{ verifyLink: string, siteName: string, logoUrl?: string, footerBrand?: string }} opts
 * @returns {string} HTML
 */
function getVerificationEmailHtml(opts) {
  const { verifyLink, siteName, logoUrl, footerBrand = FOOTER_BRAND } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 1).toUpperCase();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName}</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Thanks for signing up. Please verify your email address by clicking the button below.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${verifyLink}" target="_blank" rel="noopener noreferrer"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(180deg, ${BRAND_PRIMARY} 0%, ${BRAND_PRIMARY_DARK} 100%); color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Verify my email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-size: 13px; color: ${TEXT_MUTED};">
                If the button doesn't work, <a href="${verifyLink}" target="_blank" rel="noopener noreferrer" style="color: ${BRAND_PRIMARY}; text-decoration: underline;">click here</a> to verify. This link expires in 5 days.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0 0 6px; font-size: 12px; color: ${TEXT_MUTED};">
                If you didn't create an account with ${siteName}, you can safely ignore this email.
              </p>
              <p style="margin: 12px 0 0; font-size: 11px; color: ${TEXT_MUTED};">
                &copy; ${year} ${footerBrand}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Build production-ready HTML for password reset email. Same structure and styles as verification.
 * @param {{ resetLink: string, siteName: string, logoUrl?: string, expiryHours: number, footerBrand?: string }} opts
 * @returns {string} HTML
 */
function getPasswordResetEmailHtml(opts) {
  const { resetLink, siteName, logoUrl, expiryHours, footerBrand = FOOTER_BRAND } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 1).toUpperCase();
  const expiryText = expiryHours === 1 ? '1 hour' : `${expiryHours} hours`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName}</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                We received a request to reset your password. Click the button below to set a new password.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${resetLink}" target="_blank" rel="noopener noreferrer"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(180deg, ${BRAND_PRIMARY} 0%, ${BRAND_PRIMARY_DARK} 100%); color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Reset my password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-size: 13px; color: ${TEXT_MUTED};">
                If the button doesn't work, <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="color: ${BRAND_PRIMARY}; text-decoration: underline;">click here</a> to reset. This link expires in ${expiryText}.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0 0 6px; font-size: 12px; color: ${TEXT_MUTED};">
                If you didn't request a password reset, you can safely ignore this email.
              </p>
              <p style="margin: 12px 0 0; font-size: 11px; color: ${TEXT_MUTED};">
                &copy; ${year} ${footerBrand}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function generateVerificationToken() {
  return crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
}

function getVerificationExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + VERIFICATION_EXPIRY_HOURS);
  return d;
}

/**
 * Send email via Mailgun.
 * Requires MAILGUN_API_KEY, MAILGUN_DOMAIN and EMAIL_SENDER_EMAIL in .env.
 */
async function sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart }) {
  const apiKey = (config.get('email.mailgunApiKey') || '').trim();
  const domain = (config.get('email.mailgunDomain') || '').trim();
  const senderEmail = (config.get('email.senderEmail') || config.get('email.from') || '').trim();
  const senderName = config.get('email.senderName') || 'Partner Platform';

  if (!apiKey || !domain || !senderEmail) {
    logger.warn('Mailgun not configured: set MAILGUN_API_KEY, MAILGUN_DOMAIN and EMAIL_SENDER_EMAIL in .env.');
    const err = new Error(
      'Email not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN and EMAIL_SENDER_EMAIL in .env.'
    );
    err.statusCode = 503;
    throw err;
  }

  const from = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
  const mailgunHost = (config.get('email.mailgunHost') || 'api.mailgun.net').trim();
  const url = mailgunHost.startsWith('http') ? mailgunHost : `https://${mailgunHost}`;

  logger.info({ to, from: senderEmail }, 'Sending email via Mailgun');
  try {
    const formData = require('form-data');
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: apiKey,
      url
    });
    await mg.messages.create(domain, {
      from,
      to: [to],
      subject,
      text: textPart,
      html: htmlPart
    });
    logger.info({ to }, 'Email sent successfully via Mailgun');
  } catch (err) {
    const statusCode = err.statusCode || err.status || (err.response && err.response.status);
    const body = err.response && err.response.data;
    const details = err.details || (body && (typeof body === 'string' ? body : body.message || JSON.stringify(body))) || err.message;
    logger.error('Mailgun send failed', {
      statusCode: statusCode || 'none',
      message: err.message,
      details: details,
      domain: domain ? `${domain.slice(0, 4)}***` : ''
    });
    const e = new Error(err.message || 'Failed to send email.');
    e.statusCode = statusCode || 503;
    throw e;
  }
}

/**
 * Send verification email using the provided link (e.g. check-email?emailToken=JWT).
 * @param {string} email - Recipient email
 * @param {string} verifyLink - Full verification URL
 * @param {string} [subject] - Email subject (ignored when opts.storeCode provided)
 * @param {{ storeCode?: string, logoUrl?: string, siteName?: string }} [opts] - Optional overrides
 */
async function sendVerificationEmailWithLink(email, verifyLink, subject = DEFAULT_VERIFICATION_SUBJECT, opts = {}) {
  const storeName = opts.storeCode ? storeCodeToDisplayName(opts.storeCode) : null;
  const siteName = storeName || opts.siteName || config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = opts.logoUrl || config.get('email.logoUrl') || '';
  const effectiveSubject = storeName ? `Verify your email - ${storeName}` : (subject || `Verify your email – ${siteName}`);

  const textPart = `${siteName} – Verify your email\n\nClick here to verify your email (this link expires in 5 days):\n${verifyLink}\n\nIf you didn't create an account with ${siteName}, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${FOOTER_BRAND}`;
  const htmlPart = getVerificationEmailHtml({ verifyLink, siteName, logoUrl: logoUrl || undefined });

  await sendEmailViaConfiguredTransport({
    to: email,
    subject: effectiveSubject,
    textPart,
    htmlPart
  });
  return true;
}

/** Legacy: send verification email with hex token (verify-email?token=). Kept for backward compatibility. */
async function sendVerificationEmail(email, token, opts = {}) {
  const frontendUrl = String(opts.baseUrl || config.get('email.frontendUrl') || '').replace(/\/$/, '');
  const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return sendVerificationEmailWithLink(email, verifyUrl, DEFAULT_VERIFICATION_SUBJECT, { storeCode: opts.storeCode, logoUrl: opts.logoUrl, siteName: opts.siteName });
}

function generatePasswordResetToken() {
  return crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
}

function getPasswordResetExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + PASSWORD_RESET_EXPIRY_HOURS);
  return d;
}

/**
 * Send password reset email. Same template style as verification; uses sendEmailViaConfiguredTransport.
 * @param {string} email - Recipient email
 * @param {string} token - Reset token
 * @param {{ baseUrl?: string, storeCode?: string, logoUrl?: string, siteName?: string }} [opts]
 */
async function sendPasswordResetEmail(email, token, opts = {}) {
  const frontendUrl = String(opts.baseUrl || config.get('email.frontendUrl') || '').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const storeName = opts.storeCode ? storeCodeToDisplayName(opts.storeCode) : null;
  const siteName = storeName || opts.siteName || config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = opts.logoUrl || config.get('email.logoUrl') || '';
  const expiryText = PASSWORD_RESET_EXPIRY_HOURS === 1 ? '1 hour' : `${PASSWORD_RESET_EXPIRY_HOURS} hours`;

  const subject = `Reset your password - ${siteName}`;
  const textPart = `${siteName} – Reset your password\n\nWe received a request to reset your password. Click here to set a new password (this link expires in ${expiryText}):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${FOOTER_BRAND}`;
  const htmlPart = getPasswordResetEmailHtml({
    resetLink: resetUrl,
    siteName,
    logoUrl: logoUrl || undefined,
    expiryHours: PASSWORD_RESET_EXPIRY_HOURS
  });

  await sendEmailViaConfiguredTransport({
    to: email,
    subject,
    textPart,
    htmlPart
  });
}

/**
 * Build HTML for admin email OTP verification (6-digit code).
 */
function getOtpVerificationEmailHtml(opts) {
  const { otp, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email - Admin</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Admin</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Use this code to verify your email and sign in to the admin panel:
              </p>
              <div style="padding: 20px; background: rgba(255,255,255,0.06); border-radius: 8px; text-align: center;">
                <span style="font-size: 28px; font-weight: 700; letter-spacing: 8px; color: ${TEXT_PRIMARY};">${otp}</span>
              </div>
              <p style="margin: 16px 0 0; font-size: 13px; color: ${TEXT_MUTED};">
                This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send OTP verification email for admin panel. Uses same transport as other emails.
 * Development: always logs OTP to console; Mailgun failure does not block login.
 * Set ADMIN_OTP_LOG_ONLY=true to skip Mailgun entirely (e.g. staging).
 */
async function sendOtpVerificationEmail(email, otp) {
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Your verification code – ${siteName} Admin`;
  const textPart = `${siteName} – Admin email verification\n\nYour verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${siteName}`;
  const htmlPart = getOtpVerificationEmailHtml({ otp, siteName, logoUrl: logoUrl || undefined });

  const logOnly = config.get('email.adminOtpLogOnly') === true;
  const isDev = config.get('env') === 'development';

  if (logOnly || isDev) {
    // Plain console.log so the code is visible (winston object-first calls show as [object Object]).
    console.log('');
    console.log('========== ADMIN LOGIN OTP ==========');
    console.log(`  Email: ${email}`);
    console.log(`  Code:  ${otp}`);
    console.log(`  Expires in ${OTP_EXPIRY_MINUTES} minutes`);
    console.log('=====================================');
    console.log('');
  }
  if (logOnly) return;

  try {
    await sendEmailViaConfiguredTransport({
      to: email,
      subject,
      textPart,
      htmlPart,
    });
  } catch (err) {
    if (isDev) {
      console.warn(`[ADMIN OTP] Mailgun failed for ${email} — use the code printed above. (${err.message})`);
      return;
    }
    throw err;
  }
}

function getOtpExpiry() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OTP_EXPIRY_MINUTES);
  return d;
}

/**
 * Build HTML for "Account verified" confirmation email (sent after user clicks verification link).
 */
function getAccountVerifiedEmailHtml(opts) {
  const { siteName, logoUrl, footerBrand = FOOTER_BRAND } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 1).toUpperCase();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account verified</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName}</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Your email has been verified successfully. Your account is now active and you can sign in, complete your profile, and use all features including deposits and withdrawals.
              </p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                If you did not verify your email, please contact support immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${footerBrand}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send "Account verified" confirmation email after user clicks verification link.
 */
async function sendAccountVerifiedEmail(email, opts = {}) {
  const storeName = opts.storeCode ? storeCodeToDisplayName(opts.storeCode) : null;
  const siteName = storeName || opts.siteName || config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = opts.logoUrl || config.get('email.logoUrl') || '';
  const subject = storeName ? `Account verified – ${storeName}` : `Account verified – ${siteName}`;
  const textPart = `${siteName} – Account verified\n\nYour email has been verified successfully. Your account is now active and you can sign in, complete your profile, and use all features including deposits and withdrawals.\n\n© ${new Date().getFullYear()} ${FOOTER_BRAND}`;
  const htmlPart = getAccountVerifiedEmailHtml({ siteName, logoUrl: logoUrl || undefined });
  await sendEmailViaConfiguredTransport({ to: email, subject, textPart, htmlPart });
}

/**
 * Build HTML for "Payment account created/linked" confirmation email.
 */
function getPaymentAccountCreatedEmailHtml(opts) {
  const { siteName, logoUrl, isLinked, footerBrand = FOOTER_BRAND } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 1).toUpperCase();
  const mainText = isLinked
    ? 'Your Orionstar payment account has been linked successfully. You can now deposit funds and complete withdrawals.'
    : 'Your Orionstar payment account has been created successfully. You can now deposit funds and complete withdrawals. Save your password securely; you can view it anytime in your Profile settings.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment account ready</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName}</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                ${mainText}
              </p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                If you did not take this action, please contact support immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${footerBrand}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send "Payment account created" or "Payment account linked" confirmation email.
 * @param {string} email - Recipient email
 * @param {{ storeCode?: string, isLinked?: boolean }} [opts]
 */
async function sendPaymentAccountCreatedEmail(email, opts = {}) {
  const storeName = opts.storeCode ? storeCodeToDisplayName(opts.storeCode) : null;
  const siteName = storeName || opts.siteName || config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = opts.logoUrl || config.get('email.logoUrl') || '';
  const isLinked = opts.isLinked === true;
  const subject = storeName
    ? `Payment account ${isLinked ? 'linked' : 'created'} – ${storeName}`
    : `Payment account ${isLinked ? 'linked' : 'created'} – ${siteName}`;
  const action = isLinked ? 'linked' : 'created';
  const textPart = `${siteName} – Payment account ${action}\n\nYour Orionstar payment account has been ${action} successfully. You can now deposit funds and complete withdrawals.\n\n© ${new Date().getFullYear()} ${FOOTER_BRAND}`;
  const htmlPart = getPaymentAccountCreatedEmailHtml({ siteName, logoUrl: logoUrl || undefined, isLinked });
  await sendEmailViaConfiguredTransport({ to: email, subject, textPart, htmlPart });
}

/**
 * Send password reset email for admin panel. Uses admin panel URL for reset link if configured.
 * @param {string} email
 * @param {string} token
 * @param {string|null} [adminPanelBaseUrlOverride] - when set (e.g. from request host), used for reset link
 */
async function sendAdminPasswordResetEmail(email, token, adminPanelBaseUrlOverride = null) {
  const configured = (config.get('email.adminPanelUrl') || config.get('email.frontendUrl') || '')
    .toString()
    .replace(/\/$/, '');
  const override =
    adminPanelBaseUrlOverride != null ? String(adminPanelBaseUrlOverride).replace(/\/$/, '') : '';
  const adminPanelUrl = override || configured;
  const resetUrl = `${adminPanelUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const expiryText = PASSWORD_RESET_EXPIRY_HOURS === 1 ? '1 hour' : `${PASSWORD_RESET_EXPIRY_HOURS} hours`;

  const subject = `Reset your admin password – ${siteName}`;
  const textPart = `${siteName} – Reset your admin password\n\nWe received a request to reset your admin password. Click here to set a new password (this link expires in ${expiryText}):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${siteName}`;
  const htmlPart = getPasswordResetEmailHtml({
    resetLink: resetUrl,
    siteName,
    logoUrl: logoUrl || undefined,
    expiryHours: PASSWORD_RESET_EXPIRY_HOURS
  });

  await sendEmailViaConfiguredTransport({
    to: email,
    subject,
    textPart,
    htmlPart,
  });
}

/**
 * Build HTML for subscription expiring soon (1 week before end).
 */
function getSubscriptionExpiringSoonHtml(opts) {
  const { planName, endsAt, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const endDateStr = endsAt ? new Date(endsAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription expiring soon</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />` : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`}
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Admin</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Your subscription plan <strong>${planName || 'Current'}</strong> is expiring soon.
              </p>
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                End date: <strong>${endDateStr}</strong>
              </p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                Please request a renewal or a new plan from the admin panel if you want to continue.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Build HTML for new subscription activated (on approval).
 */
function getSubscriptionActivatedHtml(opts) {
  const { planName, endsAt, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const endDateStr = endsAt ? new Date(endsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your new plan is active</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />` : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`}
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Admin</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Your subscription request has been approved. Your new plan is now active.
              </p>
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                Plan: <strong>${planName || 'Subscription'}</strong><br>
                Valid until: <strong>${endDateStr}</strong>
              </p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                You can view your subscription in the admin panel under My subscription.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send subscription expiring soon email (e.g. 1 week before end).
 */
async function sendSubscriptionExpiringSoonEmail(to, { planName, endsAt }) {
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Your subscription expires soon – ${siteName}`;
  const endDateStr = endsAt ? new Date(endsAt).toLocaleDateString() : '';
  const textPart = `${siteName} – Subscription expiring soon\n\nYour plan "${planName || 'Current'}" is expiring soon (${endDateStr}). Please request a renewal from the admin panel if you want to continue.\n\n© ${new Date().getFullYear()} ${siteName}`;
  const htmlPart = getSubscriptionExpiringSoonHtml({ planName, endsAt, siteName, logoUrl: logoUrl || undefined });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

/**
 * Send subscription activated email (when distributor approves request).
 */
async function sendSubscriptionActivatedEmail(to, { planName, endsAt }) {
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Your new plan is active – ${siteName}`;
  const endDateStr = endsAt ? new Date(endsAt).toLocaleDateString() : '';
  const textPart = `${siteName} – New plan active\n\nYour subscription request has been approved. Your new plan "${planName || 'Subscription'}" is now active until ${endDateStr}. View it in the admin panel under My subscription.\n\n© ${new Date().getFullYear()} ${siteName}`;
  const htmlPart = getSubscriptionActivatedHtml({ planName, endsAt, siteName, logoUrl: logoUrl || undefined });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

/**
 * Send "plan expires tomorrow" email.
 */
async function sendSubscriptionExpiresTomorrowEmail(to, { planName, endsAt }) {
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Your subscription expires tomorrow – ${siteName}`;
  const endDateStr = endsAt ? new Date(endsAt).toLocaleDateString() : '';
  const textPart = `${siteName} – Subscription expires tomorrow\n\nYour plan "${planName || 'Current'}" expires tomorrow (${endDateStr}). Request a renewal from the admin panel if you want to continue.\n\n© ${new Date().getFullYear()} ${siteName}`;
  const htmlPart = getSubscriptionExpiringSoonHtml({
    planName,
    endsAt,
    siteName,
    logoUrl: logoUrl || undefined
  });
  await sendEmailViaConfiguredTransport({
    to,
    subject,
    textPart,
    htmlPart,
  });
}

/**
 * Build HTML for game bot balance alert (insufficient/low balance on game).
 * @param {{ gameName: string, operation: string, amount: number, botMessage: string, storeCode?: string, siteName: string, logoUrl?: string }} opts
 * @returns {string} HTML
 */
function getGameBotBalanceAlertHtml(opts) {
  const { gameName, operation, amount, botMessage, storeCode, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const storeCodeTrim = storeCode && String(storeCode).trim();
  const storeDisplayName = storeCodeTrim ? storeCodeToDisplayName(storeCodeTrim) : null;
  const storeBlock =
    storeDisplayName
      ? `<p style="margin:0 0 16px; font-size: 14px; line-height: 1.5; color: ${TEXT_MUTED};">
                <strong style="color: ${TEXT_PRIMARY};">Store:</strong> ${storeDisplayName}
              </p>`
      : '';
  const storePhrase = storeDisplayName
    ? ` in the <strong>${storeDisplayName}</strong> store`
    : ' in your store account';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Game account balance alert</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Balance Alert</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              ${storeBlock}
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                For the game <strong>${gameName || 'Unknown Game'}</strong>${storePhrase}, you do not have sufficient balance. The automation tools returned a balance-related error. Please check and top up the balance for this game so that user deposits and redemptions can be processed.
              </p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                You will receive at most one such alert per game per day to avoid duplicate emails. Please top up the game balance so future deposits and redemptions can succeed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send game bot balance alert to store partner or admin when bot returns insufficient/low balance error.
 * @param {string} to - Recipient email
 * @param {{ gameName: string, operation: 'Deposit'|'Redeem', amount: number, botMessage: string, storeCode?: string }} opts
 */
async function sendGameBotBalanceAlertEmail(to, opts) {
  const { gameName, operation, amount, botMessage, storeCode } = opts;
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const displayGameName = gameName || 'Game';
  const storeCodeTrim = storeCode && String(storeCode).trim();
  const storeDisplayName = storeCodeTrim ? storeCodeToDisplayName(storeCodeTrim) : null;
  const operationLabel = operation ? ` (${operation})` : '';
  const subject = storeDisplayName
    ? `Store "${storeDisplayName}" – Game "${displayGameName}" account balance alert${operationLabel} – ${siteName}`
    : `Game account balance alert – ${displayGameName}${operationLabel} – ${siteName}`;
  const storeTextLine = storeDisplayName
    ? `Store: ${storeDisplayName}`
    : null;
  const storePhrase = storeDisplayName
    ? ` in the "${storeDisplayName}" store`
    : ' in your store account';
  const textPart = [
    `${siteName} – Game account balance alert`,
    '',
    ...(storeTextLine ? [storeTextLine, ''] : []),
    `For the game "${gameName || 'Unknown Game'}"${storePhrase}, you do not have sufficient balance. The automation tools returned a balance-related error. Please check and top up the balance for this game.`,
    'You will receive at most one such alert per game per day. Please top up the game balance so future deposits and redemptions can succeed.',
    '',
    `© ${new Date().getFullYear()} ${siteName}`
  ].join('\n');
  const htmlPart = getGameBotBalanceAlertHtml({
    gameName,
    operation,
    amount,
    botMessage,
    storeCode: storeCodeTrim || undefined,
    siteName,
    logoUrl: logoUrl || undefined
  });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

/**
 * Build HTML for Golden Dragon drawer/moneybox alert.
 * @param {{ gameName: string, operation: string, botMessage: string, storeCode?: string|null, siteName: string, logoUrl?: string }} opts
 * @returns {string} HTML
 */
function getGoldenDragonDrawerAlertHtml(opts) {
  const { gameName, operation, botMessage, storeCode, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const storeCodeTrim = storeCode && String(storeCode).trim();
  const storeDisplayName = storeCodeTrim ? storeCodeToDisplayName(storeCodeTrim) : null;
  const storeBlock =
    storeCodeTrim && storeDisplayName
      ? `<p style="margin: 0 0 12px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong>Store:</strong> ${storeDisplayName} (${storeCodeTrim})</p>`
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Golden Dragon drawer alert</title></head>
<body style="margin: 0; padding: 0; background-color: ${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BODY_BG}; padding: 24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: ${HEADER_BG}; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_PRIMARY} 0%, ${BRAND_PRIMARY_DARK} 100%); padding: 24px; text-align: center;">
              ${logoUrl ? `<img src="${logoUrl}" alt="${siteName}" width="48" height="48" style="border-radius: 8px; margin-bottom: 8px;" />` : `<div style="width: 48px; height: 48px; border-radius: 8px; background: rgba(0,0,0,0.2); color: white; font-weight: bold; font-size: 18px; line-height: 48px; margin: 0 auto 8px;">${initials}</div>`}
              <h1 style="margin: 0; font-size: 20px; color: #ffffff;">Golden Dragon drawer required</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: ${TEXT_PRIMARY}; line-height: 1.5;">
                Golden Dragon returned an error indicating the store drawer (moneybox) is missing or not set with an initial amount.
                Please set the drawer in your store profile so deposits and redemptions can succeed.
              </p>
              ${storeBlock}
              <p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong>Game:</strong> ${gameName || 'Golden Dragon'}</p>
              <p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong>Operation:</strong> ${operation || 'API call'}</p>
              <p style="margin: 0 0 16px; font-size: 14px; color: ${TEXT_MUTED};"><strong>Provider message:</strong> ${botMessage || '—'}</p>
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                You will receive at most one such alert per game per day. Update the Golden Dragon drawer (moneybox) in Profile or store settings.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send Golden Dragon drawer alert to store partner or admin.
 * @param {string} to
 * @param {{ gameName: string, operation: string, botMessage: string, storeCode?: string|null }} opts
 */
async function sendGoldenDragonDrawerAlertEmail(to, opts) {
  const { gameName, operation, botMessage, storeCode } = opts;
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Golden Dragon drawer required – ${gameName || 'Game'} – ${siteName}`;
  const textPart = [
    `${siteName} – Golden Dragon drawer (moneybox) required`,
    '',
    `Golden Dragon returned an error for "${gameName || 'Unknown Game'}" during ${operation || 'an API call'}.`,
    'Set the Golden Dragon drawer (moneybox) with an initial amount in your store profile.',
    '',
    `Provider message: ${botMessage || '—'}`,
    '',
    `© ${new Date().getFullYear()} ${siteName}`
  ].join('\n');
  const htmlPart = getGoldenDragonDrawerAlertHtml({
    gameName,
    operation,
    botMessage,
    storeCode,
    siteName,
    logoUrl: logoUrl || undefined
  });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

/**
 * Build HTML for "game switched to manual mode" alert (automation failing).
 * @param {{ gameName: string, reasonSummary?: string, storeCode?: string, siteName: string, logoUrl?: string }} opts
 * @returns {string} HTML
 */
function getGameSwitchedToManualModeHtml(opts) {
  const { gameName, reasonSummary, storeCode, siteName, logoUrl, gameUsername, externalResponse, operationType, failureDetails } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const reason = reasonSummary || (Array.isArray(failureDetails) && failureDetails[0]?.reasonSummary) || '—';
  const storeCodeTrim = storeCode && String(storeCode).trim();
  const storeDisplayName = storeCodeTrim ? storeCodeToDisplayName(storeCodeTrim) : null;
  const storeBlock =
    storeCodeTrim && storeDisplayName
      ? `<p style="margin:0 0 16px; font-size: 14px; line-height: 1.5; color: ${TEXT_MUTED};">
                <strong style="color: ${TEXT_PRIMARY};">Store:</strong> ${storeDisplayName}
                <span style="color: ${TEXT_MUTED};"> (code: ${storeCodeTrim})</span>
              </p>`
      : '';

  const formatFailureTime = (occurredAt) => {
    if (!occurredAt) return '';
    const d = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };

  const failuresBlock = Array.isArray(failureDetails) && failureDetails.length > 0
    ? `<div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
        <p style="margin: 0 0 12px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong style="color: ${BRAND_PRIMARY};">Bot API errors (${failureDetails.length} users):</strong></p>
        ${failureDetails.map((failure, index) => {
      const time = formatFailureTime(failure.occurredAt);
      const response = failure.externalResponse
        ? (typeof failure.externalResponse === 'object' ? JSON.stringify(failure.externalResponse) : failure.externalResponse)
        : '';
      return `<div style="margin: 0 0 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <p style="margin: 0 0 6px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong>${index + 1}.</strong> Platform user ID: ${failure.platformUserId ?? '—'}</p>
          ${failure.operationType ? `<p style="margin: 0 0 6px; font-size: 13px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">Operation:</strong> ${failure.operationType}</p>` : ''}
          ${failure.gameUsername ? `<p style="margin: 0 0 6px; font-size: 13px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">Game username:</strong> ${failure.gameUsername}</p>` : ''}
          ${failure.reasonSummary ? `<p style="margin: 0 0 6px; font-size: 13px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">Error:</strong> ${failure.reasonSummary}</p>` : ''}
          ${response ? `<p style="margin: 0 0 6px; font-size: 12px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">API response:</strong> <code style="word-break: break-all;">${response}</code></p>` : ''}
          ${time ? `<p style="margin: 0; font-size: 12px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">Time:</strong> ${time} UTC</p>` : ''}
        </div>`;
    }).join('')}
      </div>`
    : '';

  const detailsBlock = (!failuresBlock && (gameUsername || externalResponse || operationType))
    ? `<div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
        ${operationType ? `<p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong style="color: ${BRAND_PRIMARY};">Operation:</strong> ${operationType}</p>` : ''}
        ${gameUsername ? `<p style="margin: 0 0 8px; font-size: 14px; color: ${TEXT_PRIMARY};"><strong style="color: ${BRAND_PRIMARY};">Game Username:</strong> ${gameUsername}</p>` : ''}
        ${externalResponse ? `<p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};"><strong style="color: ${TEXT_PRIMARY};">API Response:</strong> <code style="word-break: break-all;">${typeof externalResponse === 'object' ? JSON.stringify(externalResponse) : externalResponse}</code></p>` : ''}
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Game switched to manual mode</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Manual Mode</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              ${storeBlock}
              <p style="margin:0 0 16px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                The game <strong>${gameName || 'Unknown Game'}</strong> has been switched from <strong>automation</strong> to <strong>manual mode</strong>.
              </p>
              <p style="margin: 0 0 16px; font-size: 14px; color: ${TEXT_PRIMARY};">
                ${reason} To avoid errors for users, we have enabled manual processing for this game. All user requests (deposits, redemptions, registrations, withdrawals) will be queued for manual processing until you re-enable automation for this game in the admin panel.
              </p>
              ${failuresBlock || detailsBlock}
              <p style="margin: 0; font-size: 13px; color: ${TEXT_MUTED};">
                You will receive at most one such alert per game per day. Please process pending manual requests and re-enable automation when the APIs is working again.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send "game switched to manual mode" email to store partner / admin (one per game per day).
 * @param {string} to - Recipient email
 * @param {{ gameName: string, reasonSummary?: string, storeCode?: string }} opts
 */
async function sendGameSwitchedToManualModeEmail(to, opts) {
  const { gameName, reasonSummary, storeCode, gameUsername, externalResponse, operationType, failureDetails } = opts;
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const displayGameName = gameName || 'Game';
  const displayReason = reasonSummary || (Array.isArray(failureDetails) && failureDetails[0]?.reasonSummary) || '—';
  const storeCodeTrim = storeCode && String(storeCode).trim();
  const storeDisplayName = storeCodeTrim ? storeCodeToDisplayName(storeCodeTrim) : null;

  const operation = operationType ? ` (${operationType})` : '';
  const subject = storeCodeTrim
    ? `Store "${storeCodeTrim}" – Game "${displayGameName}" switched to manual mode${operation} – ${siteName}`
    : `Game "${displayGameName}" switched to manual mode${operation} – ${siteName}`;

  const formatFailureTime = (occurredAt) => {
    if (!occurredAt) return '';
    const d = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };

  const failureLines = Array.isArray(failureDetails) && failureDetails.length > 0
    ? failureDetails.flatMap((failure, index) => {
      const time = formatFailureTime(failure.occurredAt);
      const response = failure.externalResponse
        ? (typeof failure.externalResponse === 'object' ? JSON.stringify(failure.externalResponse) : failure.externalResponse)
        : '';
      return [
        `${index + 1}. Platform user ID: ${failure.platformUserId ?? '—'}`,
        failure.operationType ? `   Operation: ${failure.operationType}` : '',
        failure.gameUsername ? `   Game username: ${failure.gameUsername}` : '',
        failure.reasonSummary ? `   Error: ${failure.reasonSummary}` : '',
        response ? `   API response: ${response}` : '',
        time ? `   Time (UTC): ${time}` : ''
      ].filter(Boolean);
    })
    : [];

  const textPart = [
    `${siteName} – Game switched to manual mode`,
    '',
    ...(storeCodeTrim && storeDisplayName
      ? [`Store: ${storeDisplayName} (code: ${storeCodeTrim})`, '']
      : []),
    `The game "${displayGameName}" has been switched from automation to manual mode.`,
    `Reason: ${displayReason}`,
    ...(failureLines.length > 0 ? ['', 'Bot API errors:', ...failureLines, ''] : []),
    ...(failureLines.length === 0
      ? [
        operationType ? `Operation: ${operationType}` : '',
        gameUsername ? `Game Username: ${gameUsername}` : '',
        externalResponse ? `API Response: ${typeof externalResponse === 'object' ? JSON.stringify(externalResponse) : externalResponse}` : ''
      ].filter(Boolean)
      : []),
    'All user requests (deposits, redemptions, registrations, withdrawals) will be queued for manual processing until you re-enable automation for this game in the admin panel.',
    'You will receive at most one such alert per game per day. Please process pending manual requests and re-enable automation when the APIs is working again.',
    '',
    `© ${new Date().getFullYear()} ${siteName}`
  ].filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== '')).join('\n');

  const htmlPart = getGameSwitchedToManualModeHtml({
    gameName,
    reasonSummary,
    storeCode: storeCodeTrim || undefined,
    siteName,
    logoUrl: logoUrl || undefined,
    gameUsername,
    externalResponse,
    operationType,
    failureDetails
  });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

/**
 * Build HTML for technical error notification (admin panel).
 * @param {{ message: string, stack?: string, path?: string, method?: string, siteName: string, logoUrl?: string }} opts
 * @returns {string} HTML
 */
function getTechnicalErrorNotificationHtml(opts) {
  const { message, stack, path, method, siteName, logoUrl } = opts;
  const year = new Date().getFullYear();
  const initials = (siteName || 'PP').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const stackEscaped = (stack || '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const pathMethod = [method, path].filter(Boolean).join(' ') || 'N/A';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Technical Error – Admin Panel</title>
</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BODY_BG};">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <tr>
            <td style="background-color:${HEADER_BG}; padding: 20px 24px; text-align: center;">
              ${logoUrl
      ? `<img src="${logoUrl}" alt="${siteName}" width="120" height="40" style="display:inline-block; max-height: 40px; width: auto;" />`
      : `<div style="display:inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_DARK}); color: #fff; font-size: 18px; font-weight: 700;">${initials}</div>`
    }
              <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: ${TEXT_PRIMARY};">${siteName} – Technical Error</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 20px 24px;">
              <p style="margin:0 0 12px; font-size: 15px; line-height: 1.5; color: ${TEXT_PRIMARY};">
                A technical error occurred in the admin panel and you are receiving this notification because your role has "Technical error email notification" enabled.
              </p>
              <p style="margin:0 0 8px; font-size: 14px; font-weight: 600; color: ${TEXT_PRIMARY};">Request:</p>
              <p style="margin:0 0 16px; font-size: 13px; color: ${TEXT_MUTED}; font-family: monospace;">${pathMethod}</p>
              <p style="margin:0 0 8px; font-size: 14px; font-weight: 600; color: ${TEXT_PRIMARY};">Error:</p>
              <p style="margin:0 0 16px; font-size: 13px; color: ${TEXT_PRIMARY}; word-break: break-word;">${(message || 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              ${stackEscaped ? `<p style="margin:0 0 8px; font-size: 12px; font-weight: 600; color: ${TEXT_MUTED};">Stack trace:</p><p style="margin:0; font-size: 11px; color: ${TEXT_MUTED}; font-family: monospace; white-space: pre-wrap; word-break: break-all;">${stackEscaped}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: ${HEADER_BG}; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: ${TEXT_MUTED};">&copy; ${year} ${siteName}. Admin panel error notification.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send technical error notification email to a single recipient (used for admin panel errors).
 * @param {string} to - Recipient email
 * @param {{ message: string, stack?: string, path?: string, method?: string }} opts
 */
async function sendTechnicalErrorEmail(to, opts) {
  const { message, stack, path, method } = opts;
  const siteName = config.get('email.siteDisplayName') || config.get('email.senderName') || 'Partner Platform';
  const logoUrl = config.get('email.logoUrl') || '';
  const subject = `Technical Error – ${siteName} Admin Panel`;
  const textPart = [
    `${siteName} – Technical Error`,
    '',
    'A technical error occurred in the admin panel. You are receiving this because your role has technical error email notification enabled.',
    '',
    `Request: ${method || ''} ${path || ''}`.trim() || 'N/A',
    `Error: ${message || 'Unknown error'}`,
    stack ? `\nStack:\n${stack}` : '',
    '',
    `© ${new Date().getFullYear()} ${siteName}`
  ].join('\n');
  const htmlPart = getTechnicalErrorNotificationHtml({
    message,
    stack,
    path,
    method,
    siteName,
    logoUrl: logoUrl || undefined
  });
  await sendEmailViaConfiguredTransport({ to, subject, textPart, htmlPart });
}

module.exports = {
  generateVerificationToken,
  getVerificationExpiry,
  sendVerificationEmail,
  sendVerificationEmailWithLink,
  sendAccountVerifiedEmail,
  sendPaymentAccountCreatedEmail,
  generatePasswordResetToken,
  getPasswordResetExpiry,
  sendPasswordResetEmail,
  sendOtpVerificationEmail,
  getOtpExpiry,
  sendAdminPasswordResetEmail,
  sendSubscriptionExpiringSoonEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionExpiresTomorrowEmail,
  sendGameBotBalanceAlertEmail,
  sendGoldenDragonDrawerAlertEmail,
  sendGameSwitchedToManualModeEmail,
  sendTechnicalErrorEmail
};
