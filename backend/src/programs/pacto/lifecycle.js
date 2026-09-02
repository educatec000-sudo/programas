export const CollectionLinkState = Object.freeze({
  ACTIVE: 'ACTIVE',
  INVALID: 'INVALID',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
});

export function collectionLinkState(link, now = new Date()) {
  if (!link) return CollectionLinkState.INVALID;
  if (link.revokedAt) return CollectionLinkState.REVOKED;
  if (!(link.expiresAt instanceof Date) || link.expiresAt <= now) return CollectionLinkState.EXPIRED;
  return CollectionLinkState.ACTIVE;
}

export function classIdentificationLocked(assessments = []) {
  return assessments.some((assessment) => assessment.status === 'ENVIADO');
}

export function assessmentCanBeReopened(status) {
  return status === 'ENVIADO';
}

export function publicAssessmentLocked(status) {
  return status === 'ENVIADO';
}

export function draftAssessmentStatus(existingStatus) {
  return existingStatus === 'REABERTO' ? 'REABERTO' : 'RASCUNHO';
}
