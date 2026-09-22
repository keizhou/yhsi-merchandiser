/**
 * Shared role/area scoping rules for the management screens (Dashboard,
 * Merchandisers, Stores, Verifikasi, Review RSM). Merchandiser-facing
 * endpoints (getJourneyPlan, submitVisit, getProducts) don't use this,
 * they're already scoped to "only your own data" by auth.userId directly.
 */

/**
 * Returns null if this role sees every area (no filter to apply), or an
 * array of area IDs this role is scoped to otherwise. A supervisor is
 * scoped to their one assigned area; a manager (RSM) is scoped to every
 * area within their assigned region.
 */
function getScopedAreaIds_(auth) {
  if (UNSCOPED_ROLES.indexOf(auth.role) !== -1) {
    return null;
  }
  if (auth.role === 'manager') {
    if (!auth.regionId) return [];
    const areas = sheetToObjects_(getSheet_(SHEET_NAMES.AREAS));
    return areas.filter((a) => a.regionId === auth.regionId).map((a) => a.areaId);
  }
  return auth.areaId ? [auth.areaId] : [];
}

/**
 * Throws AuthError_ unless the caller's role is allowed to use the
 * management screens at all (plain merchandisers are rejected here).
 */
function requireManagementRole_(auth) {
  if (MANAGEMENT_ROLES.indexOf(auth.role) === -1) {
    throw new AuthError_('unauthorized');
  }
  return auth;
}

/**
 * Throws AuthError_ unless the caller can use the RSM approval screen
 * (manager/headoffice/admin, not a plain supervisor).
 */
function requireRsmRole_(auth) {
  if (RSM_ROLES.indexOf(auth.role) === -1) {
    throw new AuthError_('unauthorized');
  }
  return auth;
}

/**
 * Throws AuthError_ unless the caller can use the Head Office final-approval
 * screen (headoffice/admin only, not manager/RSM).
 */
function requireHeadOfficeRole_(auth) {
  if (HEAD_OFFICE_ROLES.indexOf(auth.role) === -1) {
    throw new AuthError_('unauthorized');
  }
  return auth;
}

/**
 * Throws AuthError_ unless the caller can manage store product profiles
 * (supervisor/manager/admin, deliberately excludes plain headoffice).
 */
function requireStoreProfileRole_(auth) {
  if (STORE_PROFILE_ROLES.indexOf(auth.role) === -1) {
    throw new AuthError_('unauthorized');
  }
  return auth;
}
