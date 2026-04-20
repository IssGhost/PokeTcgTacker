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

const CURATED_RELEASE_MONITOR_PACK = [
  { set_name: 'Chaos Rising', release_date: '2026-05-22', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10399-112/pokemon-tcg-mega-evolution-chaos-rising-pokemon-center-elite-trainer-box', bestbuy_sku: '6673725', walmart_item: '19939024731', target_query: 'chaos rising elite trainer box' },
  { set_name: 'Perfect Order', release_date: '2026-03-27', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10372-109/pokemon-tcg-mega-evolution-perfect-order-pokemon-center-elite-trainer-box', bestbuy_sku: '12507190', walmart_item: '19402160990', target_query: 'perfect order elite trainer box' },
  { set_name: 'Ascended Heroes', release_date: '2026-01-30', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10315-108/pokemon-tcg-mega-evolution-ascended-heroes-pokemon-center-elite-trainer-box', bestbuy_sku: '12239347', walmart_item: '18710966734', target_query: 'ascended heroes elite trainer box' },
  { set_name: 'Phantasmal Flames', release_date: '2025-11-14', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10186-109/pokemon-tcg-mega-evolution-phantasmal-flames-pokemon-center-elite-trainer-box', bestbuy_sku: '6645345', walmart_item: '17780209250', target_query: 'phantasmal flames elite trainer box' },
  { set_name: 'Mega Evolution', release_date: '2025-09-26', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10047-108/pokemon-tcg-mega-evolution-pokemon-center-elite-trainer-box-mega-lucario', bestbuy_sku: '11771432', walmart_item: '17328862239', target_query: 'mega evolution elite trainer box pokemon' },
  { set_name: 'White Flare', release_date: '2025-07-18', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10037-117/pokemon-tcg-scarlet-and-violet-white-flare-pokemon-center-elite-trainer-box', bestbuy_sku: '10202245', walmart_item: '16446322202', target_query: 'white flare elite trainer box' },
  { set_name: 'Black Bolt', release_date: '2025-07-18', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/10-10037-118/pokemon-tcg-scarlet-and-violet-black-bolt-pokemon-center-elite-trainer-box', bestbuy_sku: '12498307', walmart_item: '16498668973', target_query: 'black bolt elite trainer box' },
  { set_name: 'Destined Rivals', release_date: '2025-05-30', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/100-10653/pokemon-tcg-scarlet-and-violet-destined-rivals-pokemon-center-elite-trainer-box', bestbuy_sku: '10135936', walmart_item: '16017668684', target_query: 'destined rivals elite trainer box' },
  { set_name: 'Journey Together', release_date: '2025-03-28', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/100-10356/pokemon-tcg-scarlet-and-violet-journey-together-pokemon-center-elite-trainer-box', bestbuy_sku: '10135985', walmart_item: '15156564532', target_query: 'journey together elite trainer box' },
  { set_name: 'Prismatic Evolutions', release_date: '2025-01-17', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/100-10019/pokemon-tcg-scarlet-and-violet-prismatic-evolutions-pokemon-center-elite-trainer-box', bestbuy_sku: '12017855', walmart_item: '14803962651', target_query: 'prismatic evolutions elite trainer box' },
  { set_name: 'Surging Sparks', release_date: '2024-11-08', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/191-85953/pokemon-tcg-scarlet-and-violet-surging-sparks-pokemon-center-elite-trainer-box', bestbuy_sku: '6598557', walmart_item: '11478805541', target_query: 'surging sparks elite trainer box' },
  { set_name: 'Stellar Crown', release_date: '2024-09-13', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/190-85923/pokemon-tcg-scarlet-and-violet-stellar-crown-pokemon-center-elite-trainer-box', bestbuy_sku: '11821355', walmart_item: null, target_query: 'stellar crown elite trainer box' },
  { set_name: 'Shrouded Fable', release_date: '2024-08-02', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/290-85854/pokemon-tcg-scarlet-and-violet-shrouded-fable-pokemon-center-elite-trainer-box', bestbuy_sku: '6584431', walmart_item: null, target_query: 'shrouded fable elite trainer box' },
  { set_name: 'Twilight Masquerade', release_date: '2024-05-24', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/189-85799/pokemon-tcg-scarlet-and-violet-twilight-masquerade-pokemon-center-elite-trainer-box', bestbuy_sku: '10983009', walmart_item: null, target_query: 'twilight masquerade elite trainer box' },
  { set_name: 'Temporal Forces', release_date: '2024-03-22', pokemoncenter_etb_url: 'https://www.pokemoncenter.com/product/188-85717/pokemon-tcg-scarlet-and-violet-temporal-forces-pokemon-center-elite-trainer-box-walking-wake', bestbuy_sku: '6571900', walmart_item: null, target_query: 'temporal forces elite trainer box' }
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
  CURATED_RELEASE_MONITOR_PACK,
  buildCatalogQueries
};
