'use strict';

const db = require('../../db/models');

const GROUP_LABELS = {
  flash_sale: 'Flash Sale',
  welcome: 'Welcome',
  featured: 'Featured',
  limited_time: 'Limited Time',
  general: 'General'
};

function groupKeyToLabel(groupKey) {
  if (!groupKey) return 'Package';
  return GROUP_LABELS[groupKey] || String(groupKey).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractEmailCampaignMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const code = raw.emailCampaignCode ?? raw.email_campaign_code ?? null;
  const discountType = raw.emailCampaignDiscountType ?? raw.email_campaign_discount_type ?? null;
  const discountValue = raw.emailCampaignDiscountValue ?? raw.email_campaign_discount_value ?? null;
  const discountAmount =
    raw.emailCampaignDiscountAmount ?? raw.email_campaign_discount_amount ?? null;
  const originalPay =
    raw.emailCampaignOriginalPayAmount ?? raw.email_campaign_original_pay_amount ?? null;
  const sendId = raw.emailCampaignSendId ?? raw.email_campaign_send_id ?? null;
  const bonusCodeId = raw.emailCampaignBonusCodeId ?? raw.email_campaign_bonus_code_id ?? null;

  const hasAny =
    (code && String(code).trim()) ||
    (discountType && String(discountType).trim()) ||
    (discountValue != null && Number.isFinite(Number(discountValue))) ||
    (discountAmount != null && Number.isFinite(Number(discountAmount)));
  if (!hasAny) return null;

  const out = {};
  if (code && String(code).trim()) out.emailCampaignCode = String(code).trim().toUpperCase();
  if (discountType && String(discountType).trim()) {
    out.emailCampaignDiscountType = String(discountType).trim().toLowerCase();
  }
  if (discountValue != null && Number.isFinite(Number(discountValue))) {
    out.emailCampaignDiscountValue = Number(discountValue);
  }
  if (discountAmount != null && Number.isFinite(Number(discountAmount)) && Number(discountAmount) > 0) {
    out.emailCampaignDiscountAmount = Number(discountAmount);
  }
  if (originalPay != null && Number.isFinite(Number(originalPay))) {
    out.emailCampaignOriginalPayAmount = Number(originalPay);
  }
  const sid = sendId != null ? parseInt(sendId, 10) : NaN;
  if (Number.isInteger(sid) && sid > 0) out.emailCampaignSendId = sid;
  const bid = bonusCodeId != null ? parseInt(bonusCodeId, 10) : NaN;
  if (Number.isInteger(bid) && bid > 0) out.emailCampaignBonusCodeId = bid;
  return out;
}

function extractSpinWheelCouponMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const couponId = raw.spinWheelCouponId ?? raw.spin_wheel_coupon_id ?? null;
  const code = raw.spinWheelCouponCode ?? raw.spin_wheel_coupon_code ?? null;
  const percent = raw.spinWheelDiscountPercent ?? raw.spin_wheel_discount_percent ?? null;
  const discountAmount =
    raw.spinWheelDiscountAmount ?? raw.spin_wheel_discount_amount ?? null;
  const originalPay =
    raw.spinWheelOriginalPayAmount ?? raw.spin_wheel_original_pay_amount ?? null;

  const parsedId = couponId != null ? parseInt(couponId, 10) : NaN;
  const hasAny =
    (Number.isInteger(parsedId) && parsedId > 0) ||
    (code && String(code).trim()) ||
    (percent != null && Number.isFinite(Number(percent))) ||
    (discountAmount != null && Number.isFinite(Number(discountAmount)));
  if (!hasAny) return null;

  const out = {};
  if (Number.isInteger(parsedId) && parsedId > 0) out.spinWheelCouponId = parsedId;
  if (code && String(code).trim()) out.spinWheelCouponCode = String(code).trim().toUpperCase();
  if (percent != null && Number.isFinite(Number(percent))) {
    out.spinWheelDiscountPercent = Number(percent);
  }
  if (discountAmount != null && Number.isFinite(Number(discountAmount)) && Number(discountAmount) > 0) {
    out.spinWheelDiscountAmount = Number(discountAmount);
  }
  if (originalPay != null && Number.isFinite(Number(originalPay))) {
    out.spinWheelOriginalPayAmount = Number(originalPay);
  }
  return out;
}

function normalizePackageMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const campaign = extractEmailCampaignMeta(raw);
  const spinCoupon = extractSpinWheelCouponMeta(raw);
  const packageId = parseInt(raw.packageId ?? raw.package_id, 10);
  const hasPackage = Number.isInteger(packageId) && packageId > 0;
  if (!hasPackage && !campaign && !spinCoupon) return null;

  const payAmount = raw.payAmount ?? raw.pay_amount ?? raw.final_price;
  const creditAmount = raw.creditAmount ?? raw.credit_amount ?? raw.credit_sc ?? raw.final_sc;
  const originalPayAmount =
    raw.originalPayAmount ??
    raw.original_pay_amount ??
    raw.dailyBonusOriginalPayAmount ??
    (campaign && campaign.emailCampaignOriginalPayAmount) ??
    (spinCoupon && spinCoupon.spinWheelOriginalPayAmount) ??
    null;
  const percentOff =
    raw.dailyBonusPercentOff ??
    raw.daily_bonus_percent_off ??
    raw.percentOff ??
    raw.percent_off ??
    null;
  const discountAmount =
    raw.dailyBonusDiscountAmount ??
    raw.daily_bonus_discount_amount ??
    raw.discountAmount ??
    raw.discount_amount ??
    null;
  const voucherId =
    raw.dailyBonusVoucherId ??
    raw.daily_bonus_voucher_id ??
    raw.voucherId ??
    raw.voucher_id ??
    null;

  const meta = {
    packageId: hasPackage ? packageId : null,
    packageTitle: raw.packageTitle ?? raw.package_title ?? null,
    groupKey: raw.groupKey ?? raw.group_key ?? null,
    groupTitle: raw.groupTitle ?? raw.group_title ?? null,
    payAmount: payAmount != null ? Number(payAmount) : null,
    creditAmount: creditAmount != null ? Number(creditAmount) : null
  };

  if (originalPayAmount != null && Number.isFinite(Number(originalPayAmount))) {
    meta.originalPayAmount = Number(originalPayAmount);
  }
  if (percentOff != null && Number.isFinite(Number(percentOff)) && Number(percentOff) > 0) {
    meta.dailyBonusPercentOff = Number(percentOff);
  }
  if (discountAmount != null && Number.isFinite(Number(discountAmount)) && Number(discountAmount) > 0) {
    meta.dailyBonusDiscountAmount = Number(discountAmount);
  }
  const parsedVoucherId = voucherId != null ? parseInt(voucherId, 10) : NaN;
  if (Number.isInteger(parsedVoucherId) && parsedVoucherId > 0) {
    meta.dailyBonusVoucherId = parsedVoucherId;
  }
  if (campaign) Object.assign(meta, campaign);
  if (spinCoupon) Object.assign(meta, spinCoupon);

  return meta;
}

async function resolvePackageDepositMeta(packageId, { payAmount, creditAmount } = {}) {
  const id = parseInt(packageId, 10);
  if (!Number.isInteger(id) || id < 1) return null;

  const pkg = await db.DepositPackage.findByPk(id, {
    include: [{ model: db.DepositPackageGroup, as: 'Group', attributes: ['groupKey', 'title'] }]
  });
  if (!pkg) return null;

  return {
    packageId: pkg.id,
    packageTitle: pkg.title || pkg.Group?.title || null,
    groupKey: pkg.Group?.groupKey || null,
    groupTitle: pkg.Group?.title || null,
    payAmount: payAmount != null ? Number(payAmount) : Number(pkg.finalPrice),
    creditAmount: creditAmount != null ? Number(creditAmount) : Number(pkg.finalSc)
  };
}

function formatPackageDepositDescription(meta, currencyCode = 'USD') {
  const label = meta.groupTitle || groupKeyToLabel(meta.groupKey) || 'Deposit';
  const pay = meta.payAmount != null && Number.isFinite(Number(meta.payAmount))
    ? Number(meta.payAmount).toFixed(2).replace(/\.00$/, '')
    : null;
  const sc = meta.creditAmount != null && Number.isFinite(Number(meta.creditAmount))
    ? Number(meta.creditAmount)
    : null;
  const titlePart = meta.packageTitle ? ` — ${meta.packageTitle}` : '';
  const hasDailyBonus =
    meta.dailyBonusPercentOff != null &&
    Number(meta.dailyBonusPercentOff) > 0 &&
    meta.originalPayAmount != null &&
    Number.isFinite(Number(meta.originalPayAmount));
  const hasEmailCampaign =
    meta.emailCampaignDiscountAmount != null &&
    Number(meta.emailCampaignDiscountAmount) > 0 &&
    meta.emailCampaignCode;
  const hasSpinCoupon =
    meta.spinWheelDiscountAmount != null &&
    Number(meta.spinWheelDiscountAmount) > 0 &&
    meta.spinWheelCouponCode;

  if (pay != null && sc != null && meta.packageId) {
    if (hasSpinCoupon) {
      const original =
        meta.spinWheelOriginalPayAmount != null
          ? Number(meta.spinWheelOriginalPayAmount).toFixed(2).replace(/\.00$/, '')
          : meta.originalPayAmount != null
            ? Number(meta.originalPayAmount).toFixed(2).replace(/\.00$/, '')
            : null;
      const code = meta.spinWheelCouponCode;
      const percent = meta.spinWheelDiscountPercent;
      const offerLabel =
        percent != null ? `${percent}% spin coupon ${code}` : `spin coupon ${code}`;
      if (original) {
        return `${label} package${titlePart} (${currencyCode} ${original} → ${pay} with ${offerLabel} → ${sc} SC)`;
      }
      return `${label} package${titlePart} (${currencyCode} ${pay} with ${offerLabel} → ${sc} SC)`;
    }
    if (hasEmailCampaign) {
      const original =
        meta.emailCampaignOriginalPayAmount != null
          ? Number(meta.emailCampaignOriginalPayAmount).toFixed(2).replace(/\.00$/, '')
          : meta.originalPayAmount != null
            ? Number(meta.originalPayAmount).toFixed(2).replace(/\.00$/, '')
            : null;
      const code = meta.emailCampaignCode;
      const type = String(meta.emailCampaignDiscountType || '').toLowerCase();
      const val = meta.emailCampaignDiscountValue;
      const offerLabel =
        type === 'percentage' && val != null
          ? `${val}% email offer ${code}`
          : `email offer ${code}`;
      if (original) {
        return `${label} package${titlePart} (${currencyCode} ${original} → ${pay} with ${offerLabel} → ${sc} SC)`;
      }
      return `${label} package${titlePart} (${currencyCode} ${pay} with ${offerLabel} → ${sc} SC)`;
    }
    if (hasDailyBonus) {
      const original = Number(meta.originalPayAmount).toFixed(2).replace(/\.00$/, '');
      return `${label} package${titlePart} (${currencyCode} ${original} → ${pay} with ${Number(meta.dailyBonusPercentOff)}% daily bonus voucher → ${sc} SC)`;
    }
    return `${label} package${titlePart} (${currencyCode} ${pay} → ${sc} SC)`;
  }
  if (hasSpinCoupon && pay != null) {
    const code = meta.spinWheelCouponCode;
    return `Deposit with spin coupon ${code} (${currencyCode} ${pay})`;
  }
  if (hasEmailCampaign && pay != null) {
    const code = meta.emailCampaignCode;
    return `Deposit with email offer ${code} (${currencyCode} ${pay})`;
  }
  if (meta.packageId) return `${label} package${titlePart}`;
  return `Deposit`;
}

function packageMetaToTransactionMetadata(meta) {
  if (!meta) return {};
  const out = {
    package_id: meta.packageId,
    package_title: meta.packageTitle || null,
    group_key: meta.groupKey || null,
    group_title: meta.groupTitle || (meta.groupKey ? groupKeyToLabel(meta.groupKey) : null),
    pay_amount: meta.payAmount != null ? Number(meta.payAmount) : null,
    credit_sc: meta.creditAmount != null ? Number(meta.creditAmount) : null
  };
  if (meta.originalPayAmount != null && Number.isFinite(Number(meta.originalPayAmount))) {
    out.original_pay_amount = Number(meta.originalPayAmount);
  }
  if (meta.dailyBonusPercentOff != null && Number(meta.dailyBonusPercentOff) > 0) {
    out.daily_bonus_percent_off = Number(meta.dailyBonusPercentOff);
  }
  if (meta.dailyBonusDiscountAmount != null && Number(meta.dailyBonusDiscountAmount) > 0) {
    out.daily_bonus_discount_amount = Number(meta.dailyBonusDiscountAmount);
  }
  if (meta.dailyBonusVoucherId != null) {
    out.daily_bonus_voucher_id = meta.dailyBonusVoucherId;
  }
  if (meta.emailCampaignCode) out.email_campaign_code = meta.emailCampaignCode;
  if (meta.emailCampaignDiscountType) {
    out.email_campaign_discount_type = meta.emailCampaignDiscountType;
  }
  if (meta.emailCampaignDiscountValue != null) {
    out.email_campaign_discount_value = Number(meta.emailCampaignDiscountValue);
  }
  if (meta.emailCampaignDiscountAmount != null) {
    out.email_campaign_discount_amount = Number(meta.emailCampaignDiscountAmount);
  }
  if (meta.emailCampaignOriginalPayAmount != null) {
    out.email_campaign_original_pay_amount = Number(meta.emailCampaignOriginalPayAmount);
  }
  if (meta.emailCampaignSendId != null) out.email_campaign_send_id = meta.emailCampaignSendId;
  if (meta.emailCampaignBonusCodeId != null) {
    out.email_campaign_bonus_code_id = meta.emailCampaignBonusCodeId;
  }
  if (meta.spinWheelCouponId != null) out.spin_wheel_coupon_id = meta.spinWheelCouponId;
  if (meta.spinWheelCouponCode) out.spin_wheel_coupon_code = meta.spinWheelCouponCode;
  if (meta.spinWheelDiscountPercent != null) {
    out.spin_wheel_discount_percent = Number(meta.spinWheelDiscountPercent);
  }
  if (meta.spinWheelDiscountAmount != null) {
    out.spin_wheel_discount_amount = Number(meta.spinWheelDiscountAmount);
  }
  if (meta.spinWheelOriginalPayAmount != null) {
    out.spin_wheel_original_pay_amount = Number(meta.spinWheelOriginalPayAmount);
  }
  return out;
}

module.exports = {
  groupKeyToLabel,
  extractEmailCampaignMeta,
  extractSpinWheelCouponMeta,
  normalizePackageMeta,
  resolvePackageDepositMeta,
  formatPackageDepositDescription,
  packageMetaToTransactionMetadata
};
