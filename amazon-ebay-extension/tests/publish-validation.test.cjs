const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({
  require(name) {
    if (name === './promotion') return require('../bridge/promotion');
    if (name === './ebay_api_client') return require('../bridge/ebay_api_client');
    if (name === './listing-quality') return require('../bridge/listing-quality');
    if (name === './supabase') return {authenticateRequest: async () => ({userId:'', tenantId:''}), isConfigured: () => false};
    if (name === './repositories') return {deleteLegacyMapping: async () => ({}), listLegacyMappings: async () => [], recordApiError: async () => null, upsertLegacyMapping: async () => ({})};
    if (name === 'node:http') return {createServer: () => ({listen() {}})};
    if (name === 'node:fs') return {...fs, existsSync: () => false};
    return require(name);
  },
  process: {env: {}}, __dirname: path.join(__dirname, '../bridge'),
  module: {exports: {}}, console, URL, Buffer,
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../bridge/server.js'), 'utf8'), context);
const draft = {categoryId:'123', title:'Test product', imageUrls:['https://i.ebayimg.com/images/g/example/s-l1600.jpg'], imageRightsConfirmed:true, price:'29.99', quantity:1, itemSpecifics:{Marke:['Example']}};
(async () => {
  assert.equal(context.module.exports.categoryOverrideForTitle('Fresh Babyfeuchttücher 1008 Tücher'), '115328');
  assert.equal(context.module.exports.categoryOverrideForTitle('Kaffeemaschinen Entkalker'), '');
  assert.equal(context.module.exports.categoryOverrideForTitle('3DLAC Sprühkleber für perfekte Haftung auf dem 3D Drucker Druckbett 400ml'), '183063');
  const magazineRule = context.module.exports.completeRequiredAspects({...draft, title:'3DLAC Sprühkleber 400ml', itemSpecifics:{}}, {required:['Zeitschriftentitel']});
  assert.equal(magazineRule.stored.itemSpecifics.Zeitschriftentitel, undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.module.exports.configuredSellerTemplate())),
    {merchantLocationKey:'', fulfillmentPolicyId:'', paymentPolicyId:'', returnPolicyId:''},
  );
  context.categoryAspectRules = async () => {throw new Error('Metadata unavailable');};
  let result = await context.module.exports.validateEbayDraft(draft);
  assert.equal(result.ready, false);
  assert.equal(result.metadataAvailable, false);
  assert.ok(result.errors.some(value => value.includes('Metadata unavailable')));
  context.categoryAspectRules = async () => ({metadataAvailable:true, required:['Marke','Formulierung'], recommended:[]});
  result = await context.module.exports.validateEbayDraft(draft);
  assert.equal(result.ready, false);
  result = await context.module.exports.validateEbayDraft({...draft, itemSpecifics:{...draft.itemSpecifics, Formulierung:['Kapsel']}});
  assert.equal(result.ready, true);
  const completed = context.module.exports.completeRequiredAspects({
    ...draft,
    title: 'Maybelline Sky High Mascara',
    description: 'Intensives Schwarz, Very Black',
    itemSpecifics: {'Hersteller :':['Maybelline']},
  }, {required:['Marke', 'Farbton']});
  assert.deepEqual(JSON.parse(JSON.stringify(completed.stored.itemSpecifics.Marke)), ['Maybelline']);
  assert.deepEqual(JSON.parse(JSON.stringify(completed.stored.itemSpecifics.Farbton)), ['Schwarz']);
  const noInventedShade = context.module.exports.completeRequiredAspects({
    ...draft, itemSpecifics: {Hersteller:['Maybelline']}, description: '', title: 'Mascara',
  }, {required:['Marke', 'Farbton']});
  assert.equal(noInventedShade.stored.itemSpecifics.Farbton, undefined);
  result = await context.module.exports.validateEbayDraft({
    ...draft,
    imageUrls: ['https://i.ebayimg.com/00/s/NDcwWDQ3MA==/z/example/$_1.JPG'],
    itemSpecifics: {...draft.itemSpecifics, Formulierung:['Kapsel']},
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((value) => value.includes('IMAGE_REBUILD_REQUIRED')));
  console.log('Publish validation: metadata outage and missing aspects block publication.');
})().catch(error => {console.error(error); process.exitCode = 1;});
