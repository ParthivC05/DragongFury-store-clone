'use strict';

/**
 * Persist one campaign send attempt (API or delivery webhook) and refresh attempts_log.
 */
async function recordCampaignSendAttempt(db, send, payload = {}, { transaction } = {}) {
  if (!db?.EmailCampaignSendAttempt || !send?.id) return null;

  const attemptNo = Math.max(1, Number(payload.attemptNo) || Number(send.attemptCount) || 1);
  const source = String(payload.source || 'api').slice(0, 32);
  const result = String(payload.result || 'failed').slice(0, 32);
  const error = payload.error != null ? String(payload.error).slice(0, 4000) : null;
  const errorCode = payload.errorCode != null ? String(payload.errorCode).slice(0, 64) : null;
  const errorClass = payload.errorClass != null ? String(payload.errorClass).slice(0, 16) : null;
  const mailgunId = payload.mailgunId != null ? String(payload.mailgunId).slice(0, 128) : null;
  const raw = payload.raw != null ? payload.raw : null;

  const row = await db.EmailCampaignSendAttempt.create(
    {
      sendId: send.id,
      attemptNo,
      source,
      result,
      error,
      errorCode,
      errorClass,
      mailgunId,
      raw
    },
    { transaction }
  );

  const attempts = await db.EmailCampaignSendAttempt.findAll({
    where: { sendId: send.id },
    order: [
      ['attemptNo', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });

  const attemptsLog = attempts.map((a) => ({
    id: a.id,
    attemptNo: a.attemptNo,
    source: a.source,
    result: a.result,
    error: a.error,
    errorCode: a.errorCode,
    errorClass: a.errorClass,
    mailgunId: a.mailgunId,
    at: a.createdAt
  }));

  await send.update({ attemptsLog }, { transaction });
  return row;
}

module.exports = { recordCampaignSendAttempt };
