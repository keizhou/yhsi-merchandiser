/**
 * Shared constants for the Merchandiser App backend.
 */

const SHEET_NAMES = {
  USERS: 'Users',
  STORES: 'Stores',
  PRODUCTS: 'Products',
  JOURNEY_PLANS: 'JourneyPlans',
  VISITS: 'Visits',
  AREAS: 'Areas',
  STORE_PRODUCTS: 'StoreProducts',
  VISIT_VERIFICATIONS: 'VisitVerifications',
  REGIONS: 'Regions',
};

const SHEET_HEADERS = {
  Users: ['userId', 'username', 'pinHash', 'name', 'role', 'storeIds', 'areaId', 'regionId'],
  Stores: ['storeId', 'name', 'address', 'channel', 'packTypes', 'areaId'],
  Products: ['sku', 'name', 'packtype', 'category', 'msl', 'expectedFacing'],
  JourneyPlans: ['planId', 'merchandiserId', 'week', 'storeId', 'plannedDate'],
  Visits: [
    'visitId',
    'merchandiserId',
    'storeId',
    'journeyPlanId',
    'checkInTime',
    'status',
    'availabilityJson',
    'stockTakeJson',
    'primaryPhotoUrl', // deprecated, left in place, no longer written to (see shelfPhotosJson)
    'secondaryPhotoUrl', // deprecated, left in place, no longer written to (see secondaryDisplayPhotosJson)
    'syncedAt',
    'shelfPhotosJson',
    'secondaryDisplayCount',
    'secondaryDisplayPhotosJson',
  ],
  Areas: ['areaId', 'name', 'regionId'],
  StoreProducts: ['storeId', 'sku', 'listed', 'msl', 'expectedFacing'],
  VisitVerifications: [
    'verificationId',
    'visitId',
    'verifiedBy',
    'verifiedAt',
    'oosStatus',
    'facingRevisionsJson',
    'planogramJson',
    'posmJson',
    'eyeLevelJson',
    'notes',
    'status',
    'rsmStatus',
    'rsmBy',
    'rsmAt',
    'rsmNotes',
    'headOfficeStatus',
    'headOfficeBy',
    'headOfficeAt',
    'headOfficeNotes',
  ],
  Regions: ['regionId', 'name'],
};

// Roles that can see across all areas, no area filter applied.
const UNSCOPED_ROLES = ['headoffice', 'admin'];
// Roles that can use the management screens (Dashboard/Merchandisers/Stores) at all.
const MANAGEMENT_ROLES = ['supervisor', 'manager', 'headoffice', 'admin'];
// Roles that can use the RSM approval screen (narrower than MANAGEMENT_ROLES, excludes plain supervisor).
const RSM_ROLES = ['manager', 'headoffice', 'admin'];
// Roles that can use the Head Office final-approval screen (narrower still, excludes manager/RSM).
const HEAD_OFFICE_ROLES = ['headoffice', 'admin'];
// Roles that can manage a store's product profile (listed SKU/MSL/facing target).
// Deliberately excludes plain headoffice, that's operational, not an HO concern;
// 'admin' stays in as the unrestricted technical/testing account.
const STORE_PROFILE_ROLES = ['supervisor', 'manager', 'admin'];

const TOKEN_SECRET_PROPERTY = 'TOKEN_SECRET';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, a merchandiser's work shift
const PHOTO_FOLDER_NAME = 'MerchandiserPhotos';
const PHOTO_RETENTION_DAYS = 90;

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name + '. Run initializeSheets() first.');
  }
  return sheet;
}

/**
 * Writes valuesObj into a row by matching the sheet's ACTUAL header row
 * (not an assumed fixed column order), so a sheet whose columns were
 * appended out of declaration order (e.g. via addColumnIfMissing_) still
 * gets written correctly. Use this instead of `SHEET_HEADERS.X.map(...)`
 * + a raw appendRow/setValues whenever a sheet has ever had columns added
 * after its initial creation.
 */
function writeRowByHeaders_(sheet, rowNumber, valuesObj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map((h) => (h && Object.prototype.hasOwnProperty.call(valuesObj, h) ? valuesObj[h] : ''));
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function appendRowByHeaders_(sheet, valuesObj) {
  writeRowByHeaders_(sheet, sheet.getLastRow() + 1, valuesObj);
}
