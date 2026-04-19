const LAST_10_RELEASED_SETS = [
  { name: 'Scarlet & Violet—Temporal Forces', release_date: '2024-03-22' },
  { name: 'Scarlet & Violet—Twilight Masquerade', release_date: '2024-05-24' },
  { name: 'Scarlet & Violet—Shrouded Fable', release_date: '2024-08-02' },
  { name: 'Scarlet & Violet—Stellar Crown', release_date: '2024-09-13' },
  { name: 'Scarlet & Violet—Surging Sparks', release_date: '2024-11-08' },
  { name: 'Scarlet & Violet—Prismatic Evolutions', release_date: '2025-01-17' },
  { name: 'Scarlet & Violet—Journey Together', release_date: '2025-03-28' },
  { name: 'Scarlet & Violet—Destined Rivals', release_date: '2025-05-30' },
  { name: 'Scarlet & Violet—Black Bolt', release_date: '2025-07-18' },
  { name: 'Scarlet & Violet—White Flare', release_date: '2025-07-18' }
];

const PRODUCT_TYPE_TERMS = [
  'Elite Trainer Box',
  'Booster Bundle',
  'Sleeved Booster Pack',
  'Booster Box',
  '3 Pack Blister',
  'Single Blister',
  'Mini Tin',
  'Collection Box'
];

function buildCatalogQueries() {
  const out = [];
  for (const set of LAST_10_RELEASED_SETS) {
    for (const type of PRODUCT_TYPE_TERMS) {
      out.push({
        set_name: set.name,
        release_date: set.release_date,
        product_type: type,
        query: `${set.name} ${type}`
      });
    }
  }
  return out;
}

module.exports = {
  LAST_10_RELEASED_SETS,
  PRODUCT_TYPE_TERMS,
  buildCatalogQueries
};
