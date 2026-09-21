const db = require('../../db/models');

const VIP_SETTINGS_KEY = 'vip_settings';

function mapFaqRow(r) {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    sort_order: r.sortOrder ?? r.sort_order ?? 0
  };
}

/** Default FAQ when no vip_settings row exists. */
const DEFAULT_FAQ = [
  { id: 1, question: 'Why should I become a VIP Club member?', answer: 'Once you join, your gaming experience will soar to new heights. You will benefit from weekly Coins Back, rewards for each level-up, and special privileges that unlock as you progress in VIP Club.', sort_order: 1 },
  { id: 2, question: 'How do I join VIP Club?', answer: 'You automatically join when you start playing. Earn XP from deposits, gameplay, and referrals to level up through Iron, Bronze, Silver, Gold, Platinum, and Diamond.', sort_order: 2 },
  { id: 3, question: 'What is the Coins Back reward?', answer: 'Coins Back is a weekly bonus based on your VIP level. Higher tiers earn a higher percentage of their eligible activity as bonus credits.', sort_order: 3 },
  { id: 4, question: 'How to get Coins Back?', answer: 'Coins Back is calculated and credited automatically each week. No action needed—just play and level up to increase your percentage.', sort_order: 4 },
  { id: 5, question: 'How is my Coins Back reward calculated?', answer: 'Your VIP level determines your platform bonus percentage. Each week we apply this percentage to your eligible activity (e.g. deposits or play) and credit the amount to your wallet.', sort_order: 5 },
  { id: 6, question: 'What are Exclusive Offers?', answer: 'As you reach higher VIP levels, you unlock exclusive offers, higher withdrawal limits, and access to premium wheels and rewards.', sort_order: 6 }
];

/**
 * Get VIP FAQ for a scope. Reads only from settings (key vip_settings). scope = null → global; scope = { distributorCode, storeCode } → store override or global. Falls back to DEFAULT_FAQ when no row exists.
 */
async function getVipFaq(scope = null) {
  const readFromSetting = async (distributorCode, storeCode) => {
    const row = await db.Setting.findOne({
      where: { key: VIP_SETTINGS_KEY, distributorCode: distributorCode ?? null, storeCode: storeCode ?? null }
    });
    if (!row?.value) return null;
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed.faq)) {
        return parsed.faq.map((r, i) => mapFaqRow({ ...r, sort_order: r.sort_order ?? r.sortOrder ?? i }));
      }
    } catch (_) {}
    return null;
  };

  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeFaq = await readFromSetting(scope.distributorCode, scope.storeCode);
    if (storeFaq) return storeFaq;
  }

  const globalFaq = await readFromSetting(null, null);
  if (globalFaq) return globalFaq;

  return DEFAULT_FAQ.map((r, i) => mapFaqRow({ ...r, sort_order: r.sort_order ?? i }));
}

module.exports = { getVipFaq, DEFAULT_FAQ };
