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
