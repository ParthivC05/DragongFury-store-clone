'use strict';

/**
 * PRODUCTION-SAFE: Split legacy SC into PSC + BSC for all users.
 *
 * - PSC = existing SC balances (purchased / legacy playable)
 * - BSC = 0 (future promo credits)
 * - RSC unchanged
 *
 * Safety guarantees:
 * 1. Uses the migrator transaction (no partial commit if a step fails)
 * 2. Move SC→PSC and zero SC in ONE statement (retry cannot double-credit)
 * 3. Aborts if duplicate wallet rows exist for the same user+currency
 * 4. Pre/post checksum: total SC+PSC+BSC money must be unchanged; RSC total unchanged
 *
 * Deploy: run `npm run migrate` on backend before/at cutover. Safe for 5k+ users.
 */
module.exports = {
  async up(queryInterface, _Sequelize, opts = {}) {
    const transaction = opts.transaction;
    if (!transaction) {
      throw new Error(
        'split-sc-into-psc-bsc migration requires a transaction. Run via npm run migrate.'
      );
    }
    const q = (sql, options = {}) =>
      queryInterface.sequelize.query(sql, { transaction, ...options });

    // ── Guard: duplicate wallet rows would corrupt the merge ──────────────
    const [dupRows] = await q(`
      SELECT user_id, currency_code, COUNT(*) AS cnt
      FROM wallets
      WHERE currency_code IN ('SC', 'PSC', 'BSC', 'RSC')
      GROUP BY user_id, currency_code
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
    if (dupRows && dupRows.length > 0) {
      const sample = dupRows
        .map((r) => `user=${r.user_id}/${r.currency_code}x${r.cnt}`)
        .join(', ');
      throw new Error(
        `Aborting SC→PSC migration: duplicate wallet rows found (${sample}). ` +
          'Deduplicate wallets first, then re-run migrate.'
      );
    }

    // ── Snapshot totals BEFORE (must match AFTER) ─────────────────────────
    const [beforeRows] = await q(`
      SELECT
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN balance ELSE 0 END), 0) AS playable_balance,
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN play_balance ELSE 0 END), 0) AS playable_play,
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN frozen_balance ELSE 0 END), 0) AS playable_frozen,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN balance ELSE 0 END), 0) AS rsc_balance,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN play_balance ELSE 0 END), 0) AS rsc_play,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN frozen_balance ELSE 0 END), 0) AS rsc_frozen,
        COALESCE(SUM(CASE WHEN currency_code = 'SC' THEN balance ELSE 0 END), 0) AS sc_balance
      FROM wallets
    `);
    const before = beforeRows[0] || {};

    // ── 1) Ensure PSC / BSC / RSC rows exist (empty) ──────────────────────
    await q(`
      INSERT INTO wallets (user_id, currency_code, balance, play_balance, frozen_balance, created_at, updated_at)
      SELECT u.user_id, 'PSC', 0, 0, 0, NOW(), NOW()
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets w WHERE w.user_id = u.user_id AND w.currency_code = 'PSC'
      )
    `);

    await q(`
      INSERT INTO wallets (user_id, currency_code, balance, play_balance, frozen_balance, created_at, updated_at)
      SELECT u.user_id, 'BSC', 0, 0, 0, NOW(), NOW()
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets w WHERE w.user_id = u.user_id AND w.currency_code = 'BSC'
      )
    `);

    await q(`
      INSERT INTO wallets (user_id, currency_code, balance, play_balance, frozen_balance, created_at, updated_at)
      SELECT u.user_id, 'RSC', 0, 0, 0, NOW(), NOW()
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets w WHERE w.user_id = u.user_id AND w.currency_code = 'RSC'
      )
    `);

    // ── 2) Atomic move: read SC → add to PSC → zero SC (single statement) ─
    // If this fails mid-way the whole transaction rolls back.
    // If re-run after success, SC is already 0 so src is empty (no double credit).
    await q(`
      WITH src AS (
        SELECT user_id, balance, play_balance, frozen_balance
        FROM wallets
        WHERE currency_code = 'SC'
          AND (
            COALESCE(balance, 0) <> 0
            OR COALESCE(play_balance, 0) <> 0
            OR COALESCE(frozen_balance, 0) <> 0
          )
        FOR UPDATE
      ),
      upd_psc AS (
        UPDATE wallets psc
        SET
          balance = COALESCE(psc.balance, 0) + COALESCE(src.balance, 0),
          play_balance = COALESCE(psc.play_balance, 0) + COALESCE(src.play_balance, 0),
          frozen_balance = COALESCE(psc.frozen_balance, 0) + COALESCE(src.frozen_balance, 0),
          updated_at = NOW()
        FROM src
        WHERE psc.user_id = src.user_id
          AND psc.currency_code = 'PSC'
        RETURNING psc.user_id
      )
      UPDATE wallets sc
      SET
        balance = 0,
        play_balance = 0,
        frozen_balance = 0,
        updated_at = NOW()
      FROM src
      WHERE sc.user_id = src.user_id
        AND sc.currency_code = 'SC'
    `);

    // ── Snapshot totals AFTER ─────────────────────────────────────────────
    const [afterRows] = await q(`
      SELECT
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN balance ELSE 0 END), 0) AS playable_balance,
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN play_balance ELSE 0 END), 0) AS playable_play,
        COALESCE(SUM(CASE WHEN currency_code IN ('SC','PSC','BSC') THEN frozen_balance ELSE 0 END), 0) AS playable_frozen,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN balance ELSE 0 END), 0) AS rsc_balance,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN play_balance ELSE 0 END), 0) AS rsc_play,
        COALESCE(SUM(CASE WHEN currency_code = 'RSC' THEN frozen_balance ELSE 0 END), 0) AS rsc_frozen,
        COALESCE(SUM(CASE WHEN currency_code = 'SC' THEN balance ELSE 0 END), 0) AS sc_balance,
        COALESCE(SUM(CASE WHEN currency_code = 'PSC' THEN balance ELSE 0 END), 0) AS psc_balance
      FROM wallets
    `);
    const after = afterRows[0] || {};

    const num = (v) => Math.round(Number(v || 0) * 100) / 100;
    const same = (a, b) => Math.abs(num(a) - num(b)) <= 0.01;

    if (!same(before.playable_balance, after.playable_balance)
      || !same(before.playable_play, after.playable_play)
      || !same(before.playable_frozen, after.playable_frozen)) {
      throw new Error(
        `Aborting SC→PSC migration: playable totals changed. ` +
          `before balance=${before.playable_balance} play=${before.playable_play} frozen=${before.playable_frozen}; ` +
          `after balance=${after.playable_balance} play=${after.playable_play} frozen=${after.playable_frozen}`
      );
    }

    if (!same(before.rsc_balance, after.rsc_balance)
      || !same(before.rsc_play, after.rsc_play)
      || !same(before.rsc_frozen, after.rsc_frozen)) {
      throw new Error(
        `Aborting SC→PSC migration: RSC totals changed unexpectedly. ` +
          `before=${before.rsc_balance}/${before.rsc_play}/${before.rsc_frozen} ` +
          `after=${after.rsc_balance}/${after.rsc_play}/${after.rsc_frozen}`
      );
    }

    if (num(after.sc_balance) !== 0) {
      throw new Error(
        `Aborting SC→PSC migration: legacy SC not fully zeroed (remaining=${after.sc_balance}).`
      );
    }

    // Soft assert: PSC should now hold previous SC (+ any PSC that existed).
    // Not a hard fail if PSC already had funds from early deploy — checksum above is the source of truth.
    console.info(
      `[migration] SC→PSC complete. moved_sc≈${before.sc_balance}, psc_now=${after.psc_balance}, rsc=${after.rsc_balance}`
    );
  },

  async down(queryInterface, _Sequelize, opts = {}) {
    const transaction = opts.transaction;
    if (!transaction) {
      throw new Error('split-sc-into-psc-bsc down() requires a transaction.');
    }
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    // Restore SC = PSC + BSC, then drop PSC/BSC rows.
    await q(`
      UPDATE wallets sc
      SET
        balance = COALESCE((
          SELECT p.balance FROM wallets p
          WHERE p.user_id = sc.user_id AND p.currency_code = 'PSC'
          LIMIT 1
        ), 0)
        + COALESCE((
          SELECT b.balance FROM wallets b
          WHERE b.user_id = sc.user_id AND b.currency_code = 'BSC'
          LIMIT 1
        ), 0),
        play_balance = COALESCE((
          SELECT p.play_balance FROM wallets p
          WHERE p.user_id = sc.user_id AND p.currency_code = 'PSC'
          LIMIT 1
        ), 0)
        + COALESCE((
          SELECT b.play_balance FROM wallets b
          WHERE b.user_id = sc.user_id AND b.currency_code = 'BSC'
          LIMIT 1
        ), 0),
        frozen_balance = COALESCE((
          SELECT p.frozen_balance FROM wallets p
          WHERE p.user_id = sc.user_id AND p.currency_code = 'PSC'
          LIMIT 1
        ), 0)
        + COALESCE((
          SELECT b.frozen_balance FROM wallets b
          WHERE b.user_id = sc.user_id AND b.currency_code = 'BSC'
          LIMIT 1
        ), 0),
        updated_at = NOW()
      WHERE sc.currency_code = 'SC'
    `);

    await q(`DELETE FROM wallets WHERE currency_code IN ('PSC', 'BSC')`);
  }
};
