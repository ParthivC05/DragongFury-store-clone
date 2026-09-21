const db = require('../../db/models');
const { Op } = require('sequelize');
const { BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { creditBonusSc } = require('../wallet/walletBuckets.service');
const { getVipLevelsConfig } = require('./getVipLevelsConfig.service');
const { createLogger } = require('../../libs/logger');

const log = createLogger('vip');

/** Read number from level row (raw can be camelCase or snake_case). */
function levelNum(row, ...keys) {
  if (!row) return 0;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}

/** Read tier name from level row. */
function levelName(row) {
  if (!row) return null;
  const v = row.name || row.levelName;
  return v != null ? String(v) : null;
}

/** Idempotent XP grant: ledger + state update; process level-up and credit reward if needed. Uses store-scoped levels from settings. */
async function addVipXp(userId, xpAmount, referenceType, referenceId, transaction) {
  if (!Number.isFinite(xpAmount) || xpAmount <= 0) return;
  const idempotencyKey = `vip_xp:${userId}:${referenceType}:${referenceId}`;

  const run = async (t) => {
    const existing = await db.VipLedger.findOne({
      where: { idempotencyKey },
      transaction: t
    });
    if (existing) return;

    const user = await db.User.findByPk(userId, {
      attributes: ['distributorCode', 'storeCode'],
      raw: true,
      transaction: t
    });
    const scope = user && (user.distributorCode != null || user.storeCode != null)
      ? { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null }
      : null;
    const levels = await getVipLevelsConfig(scope);

    const [state] = await Promise.all([
      db.VipUserState.findOrCreate({
        where: { userId },
        defaults: { userId, vipLevelIndex: 0, vipXp: 0 },
        transaction: t
      }).then(([row]) => row)
    ]);

    const levelIndex = Math.max(0, parseInt(state.vipLevelIndex ?? state.vip_level_index, 10) || 0);
    const currentXp = parseFloat(state.vipXp ?? state.vip_xp) || 0;
    let newXp = currentXp + xpAmount;
    let newLevelIndex = levelIndex;

    await db.VipLedger.create(
      {
        userId,
        entryType: 'xp_grant',
        amount: xpAmount,
        currencyCode: 'SC',
        idempotencyKey,
        referenceType,
        referenceId: String(referenceId),
        metadata: { xp: xpAmount }
      },
      { transaction: t }
    );

    const maxLevelIndex = levels.length > 0 ? levels.length - 1 : 0;
    const maxTierRequirement = levelNum(levels[maxLevelIndex], 'xp_to_next_level', 'xpToNextLevel') || 0;
    const maxTierReward = levelNum(levels[maxLevelIndex], 'level_up_reward_sc', 'levelUpRewardSc') || 0;
    const maxTierName = levelName(levels[maxLevelIndex]) || 'Diamond';

    // Already at max tier: add XP, then ensure last-tier reward is given once (wallet, transaction, notification).
    if (levelIndex === maxLevelIndex) {
      await state.update({ vipXp: newXp }, { transaction: t });
      // When bar is filled (newXp >= requirement), ensure user got the last tier reward (fixes missing Diamond reward / old 50 SC bug).
      if (newXp >= maxTierRequirement && maxTierReward > 0) {
        const levelUpKey = `vip_level_up:${userId}:${maxLevelIndex}`;
        const allRewardRows = await db.VipLedger.findAll({
          where: {
            userId,
            entryType: 'level_up_reward',
            idempotencyKey: { [Op.or]: [levelUpKey, `${levelUpKey}:supplement`] }
          },
          transaction: t,
          raw: true
        });
        const alreadyGiven = (allRewardRows || []).reduce((sum, row) => sum + (Number(row?.amount ?? row?.metadata?.amount ?? 0) || 0), 0);
        let toCredit = Math.max(0, maxTierReward - alreadyGiven);
        // If there was a shortfall (e.g. old bug gave 50), credit the FULL tier reward so user receives 100 SC for Diamond
        if (alreadyGiven > 0 && alreadyGiven < maxTierReward && toCredit > 0) {
          toCredit = maxTierReward;
        }
        if (toCredit > 0) {
          const currencyCode = BONUS_CURRENCY_CODE;
          await creditBonusSc(userId, toCredit, {
            transaction: t,
            ledger: {
              eventType: 'VIP_BONUS',
              bonusType: 'VIP_BONUS',
              sourceType: 'VIP_LEVEL_UP',
              sourceId: `${userId}:${maxLevelIndex}`,
              remarks: 'VIP level reward'
            }
          });
          const isSupplement = alreadyGiven > 0;
          await db.VipLedger.create(
            {
              userId,
              entryType: 'level_up_reward',
              amount: toCredit,
              currencyCode: BONUS_CURRENCY_CODE,
              idempotencyKey: isSupplement ? `${levelUpKey}:supplement` : levelUpKey,
              referenceType: 'level_up',
              referenceId: String(maxLevelIndex),
              metadata: { level_index: maxLevelIndex, tier_name: maxTierName, supplement: isSupplement }
            },
            { transaction: t }
          );
          if (db.UserTransaction) {
            const descFull = `VIP level-up reward (${maxTierName})`;
            const descRemaining = `VIP ${maxTierName} tier reward (remaining)`;
            await db.UserTransaction.create(
              {
                userId,
                type: 'vip_bonus',
                amount: toCredit,
                currencyCode,
                description: isSupplement && toCredit < maxTierReward ? descRemaining : descFull,
                metadata: { vip_level_index: maxLevelIndex, tier_name: maxTierName }
              },
              { transaction: t }
            );
          }
          if (db.Notification) {
            const isLastTierComplete = maxLevelIndex === levels.length - 1 && (toCredit >= maxTierReward || !isSupplement);
            await db.Notification.create(
              {
                userId,
                type: 'vip_reward',
                title: isLastTierComplete ? `${maxTierName} VIP Tier Completed!` : (isSupplement ? 'VIP Tier Reward' : 'VIP Level Up'),
                message: isLastTierComplete
                  ? `You've completed the highest VIP tier and received ${toCredit} SC! Congratulations!`
                  : isSupplement && toCredit < maxTierReward
                    ? `You received the remaining ${toCredit} SC for completing ${maxTierName}!`
                    : `You reached ${maxTierName} and received ${toCredit} SC!`,
                actionUrl: '/account/vip'
              },
              { transaction: t }
            );
          }
          log.info({ userId, level: maxLevelIndex, tier: maxTierName, reward: toCredit, supplement: alreadyGiven > 0 }, 'VIP last-tier reward credited');
        }
      }
      return;
    }

    // When user completes a VIP level (fills the XP bar), give the complete level reward for that tier. Idempotent per user per completed level.
    while (newLevelIndex < levels.length && newXp >= (levelNum(levels[newLevelIndex], 'xp_to_next_level', 'xpToNextLevel') || 0)) {
      newXp -= levelNum(levels[newLevelIndex], 'xp_to_next_level', 'xpToNextLevel') || 0;
      newLevelIndex += 1;
      const completedLevelIndex = newLevelIndex - 1; // tier we just completed (before capping)
      newLevelIndex = Math.min(newLevelIndex, maxLevelIndex);
      const levelUpReward = levelNum(levels[completedLevelIndex], 'level_up_reward_sc', 'levelUpRewardSc');
      const tierName = levelName(levels[completedLevelIndex]) || `Level ${completedLevelIndex}`;
      const isLastTierCompletion = completedLevelIndex === maxLevelIndex;
      // When completing the last tier, save vipXp as the tier requirement so progress shows 100% (getUserVipStatus uses currentXp >= requirement to show "complete").
      const xpToSave = isLastTierCompletion ? maxTierRequirement : newXp;
      await state.update(
        { vipLevelIndex: newLevelIndex, vipXp: xpToSave },
        { transaction: t }
      );
      if (levelUpReward > 0) {
        const levelUpKey = `vip_level_up:${userId}:${completedLevelIndex}`;
        const existingReward = await db.VipLedger.findOne({ where: { idempotencyKey: levelUpKey }, transaction: t });
        if (!existingReward) {
          const currencyCode = BONUS_CURRENCY_CODE;
          await creditBonusSc(userId, levelUpReward, {
            transaction: t,
            ledger: {
              eventType: 'VIP_BONUS',
              bonusType: 'VIP_BONUS',
              sourceType: 'VIP_LEVEL_UP',
              sourceId: levelUpKey,
              remarks: 'VIP level-up reward'
            }
          });
          await db.VipLedger.create(
            {
              userId,
              entryType: 'level_up_reward',
              amount: levelUpReward,
              currencyCode: BONUS_CURRENCY_CODE,
              idempotencyKey: levelUpKey,
              referenceType: 'level_up',
              referenceId: String(completedLevelIndex),
              metadata: { level_index: completedLevelIndex, tier_name: tierName }
            },
            { transaction: t }
          );
          if (db.UserTransaction) {
            await db.UserTransaction.create(
              {
                userId,
                type: 'vip_bonus',
                amount: levelUpReward,
                currencyCode,
                description: `VIP level-up reward (${tierName})`,
                metadata: { vip_level_index: completedLevelIndex, tier_name: tierName }
              },
              { transaction: t }
            );
          }
          if (db.Notification) {
            const notificationTitle = isLastTierCompletion ? `${maxTierName} VIP Tier Completed!` : 'VIP Level Up';
            const notificationMessage = isLastTierCompletion
              ? `You've completed the highest VIP tier and received ${levelUpReward} SC! Congratulations!`
              : `You completed ${tierName} and received ${levelUpReward} SC!`;
            await db.Notification.create(
              {
                userId,
                type: 'vip_reward',
                title: notificationTitle,
                message: notificationMessage,
                actionUrl: '/account/vip'
              },
              { transaction: t }
            );
          }
          log.info({ userId, completedLevel: completedLevelIndex, tier: tierName, reward: levelUpReward }, 'VIP complete level reward credited');
        }
      }
    }

    if (newLevelIndex === levelIndex && newXp !== currentXp) {
      await state.update({ vipXp: newXp }, { transaction: t });
    }
  };

  if (transaction) {
    await run(transaction);
    return;
  }
  await db.sequelize.transaction(run);
}

module.exports = { addVipXp };
