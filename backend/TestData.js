/**
 * Seeds a few sample stores and a journey plan for the "admin" test user,
 * just so the Journey Plan screen has something real to show while we
 * build the rest of the app. Replace with your real store list before
 * going live, this is throwaway test data.
 */
function seedTestJourneyPlan() {
  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = [
    ['STORE-001', 'Toko Sumber Rejeki', 'Jl. Merdeka No. 12, Jakarta', 'General Trade', 'Can,Tetra,PET'],
    ['STORE-002', 'Indomaret Jl. Sudirman', 'Jl. Sudirman No. 45, Jakarta', 'Modern Trade', 'Can,Tetra'],
    ['STORE-003', 'Alfamart Jl. Gatot Subroto', 'Jl. Gatot Subroto No. 8, Jakarta', 'Modern Trade', 'Can,PET'],
  ];
  storesSheet.getRange(2, 1, stores.length, stores[0].length).setValues(stores);

  const usersSheet = getSheet_(SHEET_NAMES.USERS);
  const users = usersSheet.getDataRange().getValues();
  const headers = users[0];
  const usernameIdx = headers.indexOf('username');
  const userIdIdx = headers.indexOf('userId');
  const adminRow = users.find((row, i) => i > 0 && row[usernameIdx] === 'admin');
  if (!adminRow) {
    throw new Error('Run createTestUser() first.');
  }
  const merchandiserId = adminRow[userIdIdx];

  const today = new Date();
  const week = Utilities.formatDate(today, Session.getScriptTimeZone(), 'YYYY-\'W\'ww');

  const plansSheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const plans = stores.map((store, i) => {
    const plannedDate = new Date(today);
    plannedDate.setDate(today.getDate() + i);
    return [
      Utilities.getUuid(),
      merchandiserId,
      week,
      store[0],
      Utilities.formatDate(plannedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    ];
  });
  plansSheet.getRange(2, 1, plans.length, plans[0].length).setValues(plans);

  Logger.log('Seeded %s stores and %s journey plan entries for admin.', stores.length, plans.length);
}

/**
 * Creates a test merchandiser (role=merchandiser, PIN "123456", a
 * throwaway default like the other seed helpers) and several visits with
 * varied, realistic-looking availability/stock-take data spread across
 * the 3 test stores and the last 14 days, so the Dashboard/Merchandisers
 * screens have something meaningful to show. Run after seedTestJourneyPlan.
 */
function seedTestVisits() {
  const usersSheet = getSheet_(SHEET_NAMES.USERS);
  const users = sheetToObjects_(usersSheet);
  let merchandiser = users.find((u) => u.username === 'merchandiser1');
  let merchandiserId;

  if (merchandiser) {
    merchandiserId = merchandiser.userId;
  } else {
    merchandiserId = Utilities.getUuid();
    usersSheet.appendRow([
      merchandiserId,
      'merchandiser1',
      hashPin_('123456'),
      'Budi (Merchandiser)',
      'merchandiser',
      'STORE-001,STORE-002,STORE-003',
      '',
    ]);
  }

  const products = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS));
  const storeIds = ['STORE-001', 'STORE-002', 'STORE-003'];
  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);

  const rows = [];
  storeIds.forEach((storeId) => {
    // 3 visits per store, spread across the last 14 days.
    for (let i = 0; i < 3; i++) {
      const daysAgo = Math.floor(Math.random() * 14);
      const checkIn = new Date();
      checkIn.setDate(checkIn.getDate() - daysAgo);
      checkIn.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);

      const availability = {};
      const stockTake = {};
      products.forEach((p) => {
        const available = Math.random() < 0.82; // ~82% availability, some OOS
        availability[p.sku] = {
          available: available,
          cartonQty: available ? Math.floor(Math.random() * 3) : '',
          pcsQty: available ? Math.floor(Math.random() * 10) : '',
        };
        if (Math.random() < 0.7) {
          // facing count: mostly meets the (currently flat) target of 1, sometimes 0
          stockTake[p.sku] = Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * 2);
        }
      });

      rows.push([
        Utilities.getUuid(),
        merchandiserId,
        storeId,
        '',
        checkIn.toISOString(),
        'submitted',
        JSON.stringify(availability),
        JSON.stringify(stockTake),
        '',
        '',
        new Date().toISOString(),
      ]);
    }
  });

  visitsSheet.getRange(visitsSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Seeded %s test visits for merchandiser1 across %s stores.', rows.length, storeIds.length);
}

/**
 * Journey plan entries were only ever seeded for "admin" (seedTestJourneyPlan).
 * Run this once, after seedTestVisits() has created merchandiser1, so Budi
 * also has stores to visit in the app (otherwise Journey Plan shows empty).
 */
function seedMerchandiser1JourneyPlan() {
  const users = sheetToObjects_(getSheet_(SHEET_NAMES.USERS));
  const merchandiser = users.find((u) => u.username === 'merchandiser1');
  if (!merchandiser) {
    throw new Error('Run seedTestVisits() first.');
  }

  const today = new Date();
  const week = Utilities.formatDate(today, Session.getScriptTimeZone(), 'YYYY-\'W\'ww');
  const storeIds = ['STORE-001', 'STORE-002', 'STORE-003'];

  const plansSheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const plans = storeIds.map((storeId, i) => {
    const plannedDate = new Date(today);
    plannedDate.setDate(today.getDate() + i);
    return [
      Utilities.getUuid(),
      merchandiser.userId,
      week,
      storeId,
      Utilities.formatDate(plannedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    ];
  });
  plansSheet.getRange(plansSheet.getLastRow() + 1, 1, plans.length, plans[0].length).setValues(plans);

  Logger.log('Seeded %s journey plan entries for merchandiser1.', plans.length);
}
