'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyVars(template, vars) {
  let out = String(template == null ? '' : template);
  Object.keys(vars || {}).forEach((key) => {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    out = out.replace(re, vars[key] == null ? '' : String(vars[key]));
  });
  return out;
}

function discountLabel(campaign) {
  const type = String(campaign.discountValueType || '').toLowerCase();
  const value = Number(campaign.discountValue);
  if (!Number.isFinite(value)) return campaign.discountCode || '';
  if (type === 'percent' || type === 'percentage') return `${value}% deposit bonus`;
  return `${value} SC bonus`;
}

/**
 * Global DragonFury campaign email. Admin supplies code + optional logo/banner.
 */
function renderCampaignEmail(campaign, vars = {}) {
  const firstName = escapeHtml(vars.firstName || 'Player');
  const discountCode = escapeHtml(vars.discountCode || campaign.discountCode || '');
  const label = escapeHtml(
    discountLabel({ ...campaign, discountCode: vars.discountCode || campaign.discountCode })
  );
  const claimUrl = escapeHtml(vars.claimUrl || '#');
  const siteUrl = escapeHtml(vars.siteUrl || '');
  const siteHost = siteUrl.replace(/^https?:\/\//, '');
  const logoUrl = String(campaign.logoUrl || '').trim();
  const bannerUrl = String(campaign.bannerUrl || '').trim();

  const subject = applyVars(
    campaign.subject || '{{firstName}}, your DragonFury bonus is waiting',
    {
      firstName: vars.firstName || 'Player',
      discountCode: vars.discountCode || campaign.discountCode || ''
    }
  );
  const preheader = escapeHtml(
    applyVars(campaign.preheader || 'Claim your exclusive deposit bonus today.', {
      firstName: vars.firstName || 'Player',
      discountCode: vars.discountCode || campaign.discountCode || ''
    })
  );

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="DragonFury" width="132" style="display:block;margin:0 auto;max-width:132px;height:auto;border:0;" />`
    : `<div style="font-size:26px;line-height:1;font-weight:800;letter-spacing:0.08em;color:#ffffff;">DRAGONFURY</div>`;

  const bannerBlock = bannerUrl
    ? `<tr>
        <td style="padding:0;line-height:0;font-size:0;background:#0b1220;">
          <img src="${escapeHtml(bannerUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
        </td>
      </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070b14;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:separate;">
          <tr>
            <td style="padding:0;border-radius:20px;overflow:hidden;background:#101826;border:1px solid #243044;box-shadow:0 18px 50px rgba(0,0,0,0.45);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:30px 28px 22px;background:radial-gradient(circle at top, #1e293b 0%, #0b1220 70%);">
                    ${logoBlock}
                    <div style="margin-top:18px;display:inline-block;padding:7px 14px;border-radius:999px;background:rgba(249,115,22,0.18);border:1px solid rgba(251,146,60,0.35);color:#fdba74;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
                      Welcome bonus
                    </div>
                  </td>
                </tr>
                ${bannerBlock}
                <tr>
                  <td style="padding:28px 28px 6px;">
                    <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;color:#ffffff;">
                      Hi ${firstName} 👋
                    </h1>
                    <p style="margin:14px 0 0;font-size:16px;line-height:1.65;color:#cbd5e1;">
                      You’re almost ready to play. Claim this exclusive offer and unlock
                      <span style="color:#fb923c;font-weight:700;">${label || 'your deposit bonus'}</span>
                      on your first deposit.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 28px 8px;" align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#1a2333 0%,#0f172a 100%);border:1px solid #334155;border-radius:16px;">
                      <tr>
                        <td style="padding:22px 18px;" align="center">
                          <div style="font-size:12px;font-weight:700;color:#94a3b8;letter-spacing:0.14em;text-transform:uppercase;">
                            Your code
                          </div>
                          <div style="margin-top:10px;font-size:34px;line-height:1.1;font-weight:900;letter-spacing:0.16em;color:#ffffff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
                            ${discountCode || 'CODE'}
                          </div>
                          ${
                            label
                              ? `<div style="margin-top:12px;display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(249,115,22,0.16);color:#fdba74;font-size:13px;font-weight:700;">${label}</div>`
                              : ''
                          }
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 28px 8px;" align="center">
                    <a href="${claimUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;min-width:220px;background:linear-gradient(180deg,#fb923c 0%,#ea580c 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:16px 36px;border-radius:12px;box-shadow:0 10px 28px rgba(234,88,12,0.4);">
                      Claim my offer
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 36px 28px;" align="center">
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
                      1) Tap Claim &nbsp;→&nbsp; 2) Open Deposit &nbsp;→&nbsp; 3) Type your code
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px 24px;border-top:1px solid #1f2937;" align="center">
                    <div style="font-size:12px;color:#64748b;line-height:1.5;">
                      ${siteUrl ? `DragonFury · <a href="${siteUrl}" style="color:#94a3b8;text-decoration:none;">${siteHost}</a>` : 'DragonFury'}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const textParts = [
    `Hi ${vars.firstName || 'Player'},`,
    '',
    subject,
    discountCode ? `Discount code: ${vars.discountCode || campaign.discountCode}` : '',
    label ? `Offer: ${label.replace(/&amp;/g, '&')}` : '',
    vars.claimUrl ? `Claim: ${vars.claimUrl}` : '',
    '',
    'Claim from this email first, then type the code manually on Deposit.'
  ].filter(Boolean);

  return { subject, htmlPart: html, textPart: textParts.join('\n') };
}

module.exports = {
  escapeHtml,
  applyVars,
  discountLabel,
  renderCampaignEmail
};
