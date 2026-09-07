/**
 * Shared constants for the Merchandiser App backend.
 */

const SHEET_NAMES = {
  USERS: 'Users',
  STORES: 'Stores',
  PRODUCTS: 'Products',
  JOURNEY_PLANS: 'JourneyPlans',
  VISITS: 'Visits',
};

const SHEET_HEADERS = {
  Users: ['userId', 'username', 'pinHash', 'name', 'role', 'storeIds'],
  Stores: ['storeId', 'name', 'address', 'channel', 'packTypes'],
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
    'primaryPhotoUrl',
    'secondaryPhotoUrl',
    'syncedAt',
  ],
};

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
