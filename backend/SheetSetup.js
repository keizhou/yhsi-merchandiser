/**
 * One-time setup: creates all tabs with headers, and seeds the Products
 * sheet from the pack-type/planogram data already established for this
 * project (Can, Tetra, PET; brand-blocked into Asian Drink / Tea Series / Soy).
 *
 * Run this once manually from the Apps Script editor (select
 * `initializeSheets` in the function dropdown, click Run), then never again
 * unless you want to reset the sheet from scratch.
 */

// One row per real SKU, no duplicates. The planogram sheet this was sourced
// from showed some products (e.g. Chrysanthemum) twice per pack type, but
// that reflected shelf facing count, not a second product, that count now
// lives in `expectedFacing` below instead of as a fake duplicate SKU.
const PRODUCT_SEED = [
  // packtype, category, name
  ['Can', 'Asian Drink', 'Chrysanthemum'],
  ['Can', 'Asian Drink', 'Wintermelon'],
  ['Can', 'Asian Drink', 'Lychee'],
  ['Can', 'Tea Series', 'Grassjelly'],
  ['Can', 'Tea Series', 'Birdnest'],
  ['Can', 'Tea Series', 'Green Tea'],
  ['Can', 'Soy', 'Soya'],

  ['Tetra', 'Asian Drink', 'Chrysanthemum'],
  ['Tetra', 'Asian Drink', 'Wintermelon'],
  ['Tetra', 'Asian Drink', 'Lychee'],
  ['Tetra', 'Asian Drink', 'Lemon Barley'],
  ['Tetra', 'Tea Series', 'First Harvest'],
  ['Tetra', 'Tea Series', 'First Harvest No Sugar'],
  ['Tetra', 'Tea Series', 'Lemon Tea'],
  ['Tetra', 'Tea Series', 'Passion Fruit Tea'],
  ['Tetra', 'Soy', 'Soya'],
  ['Tetra', 'Soy', 'Soy Immuno Ori'],
  ['Tetra', 'Soy', 'Soy Immuno Cho'],
  ['Tetra', 'Soy', 'Soy Supersprout Ori'],
  ['Tetra', 'Soy', 'Soy Supersprout Cho'],

  ['PET', 'Asian Drink', 'Chrysanthemum'],
  ['PET', 'Asian Drink', 'Wintermelon'],
  ['PET', 'Asian Drink', 'Lychee'],
  ['PET', 'Soy', 'Soya'],
];

// NOTE: MSL and facing targets are actually per-store in real life (a big
// store can require more facings than a small kiosk), not a fixed property
// of the product itself. Modeling that properly means a future
// StoreProductTargets sheet keyed by (storeId, sku) -> { msl, expectedFacing },
// checked at submission time instead of read off the Products row. Punting
// on that for now: every product below is flat msl=false, expectedFacing=1,
// so Phase 1 testing isn't blocked on that schema work.
const MSL_NAMES = [];
const REGULAR_EXPECTED_FACING = 1;
const MSL_EXPECTED_FACING = 1;

function slugify_(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildProductRows_() {
  return PRODUCT_SEED.map(([packtype, category, name]) => {
    const sku = slugify_(packtype) + '-' + slugify_(name);
    const msl = MSL_NAMES.indexOf(name) !== -1;
    const expectedFacing = msl ? MSL_EXPECTED_FACING : REGULAR_EXPECTED_FACING;
    return [sku, name, packtype, category, msl, expectedFacing];
  });
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function initializeSheets() {
  const ss = getSpreadsheet();

  // Remove the default "Sheet1" if it's still sitting around empty.
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  ensureSheet_(ss, SHEET_NAMES.USERS, SHEET_HEADERS.Users);
  ensureSheet_(ss, SHEET_NAMES.STORES, SHEET_HEADERS.Stores);
  const productsSheet = ensureSheet_(ss, SHEET_NAMES.PRODUCTS, SHEET_HEADERS.Products);
  ensureSheet_(ss, SHEET_NAMES.JOURNEY_PLANS, SHEET_HEADERS.JourneyPlans);
  ensureSheet_(ss, SHEET_NAMES.VISITS, SHEET_HEADERS.Visits);

  const productRows = buildProductRows_();
  productsSheet.getRange(2, 1, productRows.length, productRows[0].length).setValues(productRows);

  // Generate the token-signing secret once, if it isn't already set.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(TOKEN_SECRET_PROPERTY)) {
    props.setProperty(TOKEN_SECRET_PROPERTY, Utilities.getUuid() + Utilities.getUuid());
  }

  Logger.log('Sheets initialized. Seeded %s products.', productRows.length);
}

/**
 * Reseeds only the Products tab (clears it and rewrites from PRODUCT_SEED),
 * leaving Users, Stores, JourneyPlans, and Visits untouched. Use this
 * instead of initializeSheets() whenever only the product list changed.
 */
function reseedProducts() {
  const ss = getSpreadsheet();
  const productsSheet = ensureSheet_(ss, SHEET_NAMES.PRODUCTS, SHEET_HEADERS.Products);
  const productRows = buildProductRows_();
  productsSheet.getRange(2, 1, productRows.length, productRows[0].length).setValues(productRows);
  Logger.log('Reseeded %s products (other sheets untouched).', productRows.length);
}

/**
 * Convenience helper for creating your first login during setup.
 * This file is committed to a public git repo, so this default PIN is
 * fine (it's a throwaway starter value, not a real credential), but
 * change it immediately via updateUserPin() and never replace it here
 * with a real one, see the warning on that function.
 */
function createTestUser() {
  const username = 'admin';
  const pin = '123456';
  const name = 'Admin';
  const role = 'supervisor';

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const userId = Utilities.getUuid();
  const pinHash = hashPin_(pin);
  sheet.appendRow([userId, username, pinHash, name, role, '']);
  Logger.log('Created user "%s" with PIN "%s" (change after first login).', username, pin);
}

/**
 * Updates an existing user's PIN in place (does not create a duplicate row).
 *
 * IMPORTANT: this file is committed to a public git repo. Never put a real
 * PIN here and push it. Instead, open this function directly in the Apps
 * Script browser editor (script.google.com), temporarily change the two
 * values below there, click Run, then change them back to placeholders
 * before the next `clasp push` — an edit made only in the browser editor
 * never touches your local files or git.
 */
function updateUserPin() {
  const username = 'CHANGE_ME';
  const newPin = 'CHANGE_ME';

  if (username === 'CHANGE_ME' || newPin === 'CHANGE_ME') {
    throw new Error('Edit username/newPin above (in the browser editor, not a local file) before running.');
  }

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameIdx = headers.indexOf('username');
  const pinHashIdx = headers.indexOf('pinHash');

  for (let r = 1; r < data.length; r++) {
    if (data[r][usernameIdx] === username) {
      sheet.getRange(r + 1, pinHashIdx + 1).setValue(hashPin_(newPin));
      Logger.log('Updated PIN for "%s".', username);
      return;
    }
  }
  throw new Error('No user found with username "' + username + '"');
}

/**
 * Appends a header column to an existing sheet if it isn't already there,
 * without touching existing rows/data. Safe to run more than once.
 */
function addColumnIfMissing_(sheet, columnName) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
  const headers = headerRange.getValues()[0];
  if (headers.indexOf(columnName) !== -1) return; // already there
  sheet.getRange(1, sheet.getLastColumn() + 1).setValue(columnName);
}

/**
 * Phase 2 foundation migration: creates the Areas and StoreProducts sheets,
 * and adds the areaId column to Stores/Users, all without touching any
 * existing data. Run once in the browser editor.
 */
function migratePhase2Schema() {
  const ss = getSpreadsheet();

  ensureSheet_(ss, SHEET_NAMES.AREAS, SHEET_HEADERS.Areas);
  ensureSheet_(ss, SHEET_NAMES.STORE_PRODUCTS, SHEET_HEADERS.StoreProducts);

  addColumnIfMissing_(getSheet_(SHEET_NAMES.STORES), 'areaId');
  addColumnIfMissing_(getSheet_(SHEET_NAMES.USERS), 'areaId');

  Logger.log('Phase 2 schema migrated: Areas + StoreProducts sheets created, areaId columns added to Stores/Users.');
}

/**
 * Seeds two test areas and assigns the 3 test stores to them, so the
 * area-scoping logic has something real to filter against. Run once,
 * after migratePhase2Schema(), and after seedTestJourneyPlan() (from
 * TestData.js) has already created the 3 test stores.
 */
function seedPhase2TestData() {
  const areasSheet = getSheet_(SHEET_NAMES.AREAS);
  const areas = [
    ['AREA-JKT', 'Jakarta'],
    ['AREA-SBY', 'Surabaya'],
  ];
  areasSheet.getRange(2, 1, areas.length, areas[0].length).setValues(areas);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const data = storesSheet.getDataRange().getValues();
  const headers = data[0];
  const storeIdIdx = headers.indexOf('storeId');
  const areaIdIdx = headers.indexOf('areaId');
  // All 3 test stores are actually Jakarta addresses (Jl. Gatot Subroto included),
  // so all 3 belong in AREA-JKT. AREA-SBY (Surabaya) stays seeded above for
  // testing multi-area scoping later, it just has no stores in it yet.
  const storeAreaMap = { 'STORE-001': 'AREA-JKT', 'STORE-002': 'AREA-JKT', 'STORE-003': 'AREA-JKT' };
  for (let r = 1; r < data.length; r++) {
    const storeId = data[r][storeIdIdx];
    if (storeAreaMap[storeId]) {
      storesSheet.getRange(r + 1, areaIdIdx + 1).setValue(storeAreaMap[storeId]);
    }
  }

  Logger.log('Seeded 2 test areas and assigned the 3 test stores to them.');
}

/**
 * Updates an existing user's role and areaId in place. Edit the values
 * below, then run manually from the Apps Script editor. Use this to
 * promote "admin" to an unscoped role, or to scope a supervisor/manager
 * to one area.
 */
function updateUserRoleAndArea() {
  const username = 'admin';
  const role = 'admin'; // merchandiser | supervisor | manager | headoffice | admin
  const areaId = ''; // blank for headoffice/admin (unscoped)

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameIdx = headers.indexOf('username');
  const roleIdx = headers.indexOf('role');
  const areaIdIdx = headers.indexOf('areaId');

  for (let r = 1; r < data.length; r++) {
    if (data[r][usernameIdx] === username) {
      sheet.getRange(r + 1, roleIdx + 1).setValue(role);
      sheet.getRange(r + 1, areaIdIdx + 1).setValue(areaId);
      Logger.log('Updated "%s" to role=%s, areaId=%s', username, role, areaId || '(none)');
      return;
    }
  }
  throw new Error('No user found with username "' + username + '"');
}

/**
 * Repairs a header-row misalignment on Visits: shelfPhotosJson,
 * secondaryDisplayCount, and secondaryDisplayPhotosJson were written by
 * submitVisit_ into the 3 columns immediately after syncedAt (positions
 * 12-14), but migratePhase2bSchema's addColumnIfMissing_ ended up placing
 * their header labels 3 columns further right, leaving a blank gap. This
 * moves the header labels back to where the data actually is, no row data
 * is touched. Safe to run more than once. Run once, now.
 */
function repairVisitsHeaderAlignment() {
  const sheet = getSheet_(SHEET_NAMES.VISITS);
  const lastCol = Math.max(sheet.getLastColumn(), 20);
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  const headers = headerRange.getValues()[0];

  const syncedAtIdx = headers.indexOf('syncedAt');
  if (syncedAtIdx === -1) {
    throw new Error('Could not find "syncedAt" column, aborting to avoid guessing.');
  }

  const correctOrder = ['shelfPhotosJson', 'secondaryDisplayCount', 'secondaryDisplayPhotosJson'];
  const targetStart = syncedAtIdx + 1; // 0-indexed, right after syncedAt

  // Clear any stray copies of these header labels wherever they currently are.
  correctOrder.forEach((name) => {
    const strayIdx = headers.indexOf(name);
    if (strayIdx !== -1) {
      sheet.getRange(1, strayIdx + 1).clearContent();
    }
  });

  // Write them where the data actually lives.
  const targetRange = sheet.getRange(1, targetStart + 1, 1, correctOrder.length);
  targetRange.setValues([correctOrder]);

  Logger.log('Repaired Visits header alignment: %s now at columns %s-%s.', correctOrder.join(', '), targetStart + 1, targetStart + correctOrder.length);
}

/**
 * Phase 2b migration: adds the new photo-related columns to Visits, and
 * creates the VisitVerifications sheet. Doesn't touch existing data. Run
 * once in the browser editor.
 */
function migratePhase2bSchema() {
  const ss = getSpreadsheet();

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  addColumnIfMissing_(visitsSheet, 'shelfPhotosJson');
  addColumnIfMissing_(visitsSheet, 'secondaryDisplayCount');
  addColumnIfMissing_(visitsSheet, 'secondaryDisplayPhotosJson');

  ensureSheet_(ss, SHEET_NAMES.VISIT_VERIFICATIONS, SHEET_HEADERS.VisitVerifications);

  Logger.log('Phase 2b schema migrated: Visits photo columns added, VisitVerifications sheet created.');
}

/**
 * Creates a test supervisor account scoped to AREA-JKT, PIN "123456" (a
 * throwaway starter value, same convention as createTestUser, change it
 * via updateUserPin before relying on this account for anything real).
 */
function createScopedSupervisorTestUser() {
  const username = 'supervisor_jkt';
  const pin = '123456';
  const name = 'Supervisor Jakarta';
  const role = 'supervisor';
  const areaId = 'AREA-JKT';

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const userId = Utilities.getUuid();
  const pinHash = hashPin_(pin);
  appendRowByHeaders_(sheet, { userId, username, pinHash, name, role, storeIds: '', areaId });
  Logger.log('Created user "%s" (role=%s, areaId=%s) with PIN "%s".', username, role, areaId, pin);
}

/**
 * Phase 2c migration: creates the Regions sheet, adds regionId to Areas
 * and Users, and adds the 4 RSM decision columns to VisitVerifications.
 * Doesn't touch existing data. Run once in the browser editor.
 */
function migratePhase2cSchema() {
  const ss = getSpreadsheet();

  ensureSheet_(ss, SHEET_NAMES.REGIONS, SHEET_HEADERS.Regions);

  addColumnIfMissing_(getSheet_(SHEET_NAMES.AREAS), 'regionId');
  addColumnIfMissing_(getSheet_(SHEET_NAMES.USERS), 'regionId');

  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  addColumnIfMissing_(verificationsSheet, 'rsmStatus');
  addColumnIfMissing_(verificationsSheet, 'rsmBy');
  addColumnIfMissing_(verificationsSheet, 'rsmAt');
  addColumnIfMissing_(verificationsSheet, 'rsmNotes');

  Logger.log('Phase 2c schema migrated: Regions sheet created, regionId added to Areas/Users, rsm columns added to VisitVerifications.');
}

/**
 * Seeds one test region and assigns AREA-JKT to it. Run once, after
 * migratePhase2cSchema().
 */
function seedPhase2cTestData() {
  const regionsSheet = getSheet_(SHEET_NAMES.REGIONS);
  appendRowByHeaders_(regionsSheet, { regionId: 'REGION-WEST', name: 'Wilayah Barat' });

  const areasSheet = getSheet_(SHEET_NAMES.AREAS);
  const data = areasSheet.getDataRange().getValues();
  const headers = data[0];
  const areaIdIdx = headers.indexOf('areaId');
  const regionIdIdx = headers.indexOf('regionId');
  for (let r = 1; r < data.length; r++) {
    if (data[r][areaIdIdx] === 'AREA-JKT') {
      areasSheet.getRange(r + 1, regionIdIdx + 1).setValue('REGION-WEST');
    }
  }

  Logger.log('Seeded region REGION-WEST and assigned AREA-JKT to it.');
}

/**
 * Creates a test RSM (manager role) account scoped to REGION-WEST, PIN
 * "123456" (throwaway starter value, same convention as the other seed
 * helpers). Run after seedPhase2cTestData().
 */
function createRsmTestUser() {
  const username = 'rsm_west';
  const pin = '123456';
  const name = 'RSM Wilayah Barat';
  const role = 'manager';
  const regionId = 'REGION-WEST';

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const userId = Utilities.getUuid();
  const pinHash = hashPin_(pin);
  appendRowByHeaders_(sheet, { userId, username, pinHash, name, role, storeIds: '', areaId: '', regionId });
  Logger.log('Created user "%s" (role=%s, regionId=%s) with PIN "%s".', username, role, regionId, pin);
}

/**
 * Phase 2d migration: adds the 4 Head Office decision columns to
 * VisitVerifications. Doesn't touch existing data. Run once in the
 * browser editor.
 */
function migratePhase2dSchema() {
  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  addColumnIfMissing_(verificationsSheet, 'headOfficeStatus');
  addColumnIfMissing_(verificationsSheet, 'headOfficeBy');
  addColumnIfMissing_(verificationsSheet, 'headOfficeAt');
  addColumnIfMissing_(verificationsSheet, 'headOfficeNotes');

  Logger.log('Phase 2d schema migrated: headOffice columns added to VisitVerifications.');
}

/**
 * Creates a test Head Office account, unscoped (sees everything), PIN
 * "123456" (throwaway starter value, same convention as the other seed
 * helpers).
 */
function createHeadOfficeTestUser() {
  const username = 'ho_test';
  const pin = '123456';
  const name = 'Head Office Test';
  const role = 'headoffice';

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const userId = Utilities.getUuid();
  const pinHash = hashPin_(pin);
  appendRowByHeaders_(sheet, { userId, username, pinHash, name, role, storeIds: '', areaId: '', regionId: '' });
  Logger.log('Created user "%s" (role=%s) with PIN "%s".', username, role, pin);
}

/**
 * Phase 3 migration: adds the accountStatus column to Users, used to mark
 * merchandiser records that a Supervisor/RSM pre-registered (name + area
 * only) but that an admin hasn't activated with a username/PIN yet. Blank
 * or missing accountStatus is treated as 'active' everywhere in the code,
 * so existing rows don't need to be backfilled. Doesn't touch existing
 * data. Run once in the browser editor.
 */
function migratePhase3Schema() {
  addColumnIfMissing_(getSheet_(SHEET_NAMES.USERS), 'accountStatus');
  Logger.log('Phase 3 schema migrated: accountStatus column added to Users.');
}

/**
 * Activates a merchandiser record that was pre-registered via the web UI
 * (createPendingMerchandiser action): sets username/PIN and flips
 * accountStatus to 'active'. Edit the CHANGE_ME values above in the
 * browser editor (never commit real values here) before running.
 */
function activatePendingMerchandiser() {
  const userId = 'CHANGE_ME'; // copy from the "Menunggu Aktivasi" list in the app
  const username = 'CHANGE_ME';
  const pin = 'CHANGE_ME';

  if (userId === 'CHANGE_ME' || username === 'CHANGE_ME' || pin === 'CHANGE_ME') {
    throw new Error('Edit userId/username/pin above (in the browser editor, not a local file) before running.');
  }

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  for (let r = 1; r < data.length; r++) {
    if (data[r][idx.userId] === userId) {
      sheet.getRange(r + 1, idx.username + 1).setValue(username);
      sheet.getRange(r + 1, idx.pinHash + 1).setValue(hashPin_(pin));
      sheet.getRange(r + 1, idx.accountStatus + 1).setValue('active');
      Logger.log('Activated merchandiser "%s" as username "%s".', data[r][idx.name], username);
      return;
    }
  }
  throw new Error('No user found with userId: ' + userId);
}
