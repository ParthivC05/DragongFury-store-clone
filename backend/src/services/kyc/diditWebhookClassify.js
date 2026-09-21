'use strict';

const IDENTITY_FEATURES = new Set([
  'ID_VERIFICATION',
  'OCR',
  'LIVENESS',
  'FACE_MATCH',
  'FACEMATCH',
  'NFC',
  'PROOF_OF_ADDRESS',
  'POA',
  'AML',
  'IP_ANALYSIS',
  'DATABASE_VALIDATION',
  'AGE_ESTIMATION'
]);

const PHONE_FEATURES = new Set(['PHONE', 'PHONE_VERIFICATION']);

function featureNamesFromPayload(payload) {
  const decision = payload?.decision || {};
  const raw = decision.features || payload?.features || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => (typeof f === 'string' ? f : f?.feature || f?.type || ''))
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean);
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Classify a Didit `status.updated` webhook.
 *
 * Phone OTP uses standalone /v3/phone/* and still emits status.updated with
 * features: ["PHONE"] and phone_verifications[]. Identity KYC sessions use a
 * workflow_id and features like ID_VERIFICATION / LIVENESS / FACE_MATCH.
 *
 * @returns {'identity_kyc'|'phone'|'unknown'}
 * @see https://docs.didit.me/integration/webhooks
 */
function classifyDiditWebhook(payload, { kycWorkflowId } = {}) {
  const decision = payload?.decision || {};
  const features = featureNamesFromPayload(payload);
  const workflowId = String(payload?.workflow_id || decision.workflow_id || '').trim();
  const configuredWorkflow = String(kycWorkflowId || '').trim();

  const hasIdentityFeature = features.some((f) => IDENTITY_FEATURES.has(f));
  const hasPhoneFeature = features.some((f) => PHONE_FEATURES.has(f));
  const hasIdEvidence =
    hasNonEmptyArray(decision.id_verifications) ||
    hasNonEmptyArray(decision.liveness_checks) ||
    hasNonEmptyArray(decision.face_matches) ||
    hasNonEmptyArray(decision.nfc_verifications) ||
    hasNonEmptyArray(decision.poa_verifications) ||
    hasNonEmptyArray(decision.aml_screenings);
  const hasPhoneEvidence = hasNonEmptyArray(decision.phone_verifications);

  if (configuredWorkflow && workflowId && workflowId === configuredWorkflow) {
    return 'identity_kyc';
  }
  if (hasIdentityFeature || hasIdEvidence) {
    return 'identity_kyc';
  }
  if (hasPhoneFeature || hasPhoneEvidence) {
    return 'phone';
  }
  // Standalone phone sessions often have workflow_id null and no decision yet
  // (e.g. status "Not Started"). Do not treat those as KYC.
  if (!workflowId) {
    return 'phone';
  }
  return 'unknown';
}

module.exports = {
  classifyDiditWebhook,
  featureNamesFromPayload,
  IDENTITY_FEATURES,
  PHONE_FEATURES
};
