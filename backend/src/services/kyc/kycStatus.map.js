'use strict';

function mapDiditStatus(diditStatus) {
  const s = String(diditStatus || '').trim().toLowerCase();
  if (!s) return 'not_started';
  if (s === 'approved') return 'approved';
  if (s === 'declined') return 'declined';
  if (s === 'in review' || s === 'in_review') return 'in_review';
  if (s === 'not started' || s === 'abandoned' || s === 'expired') return 'not_started';
  return 'pending';
}

function isApproved(kycStatus) {
  return String(kycStatus || '').toLowerCase() === 'approved';
}

function canStartSession(kycStatus) {
  const s = String(kycStatus || '').toLowerCase();
  return s !== 'approved' && s !== 'in_review';
}

module.exports = { mapDiditStatus, isApproved, canStartSession };
