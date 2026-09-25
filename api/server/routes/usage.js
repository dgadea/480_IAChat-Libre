const express = require('express');
const {
  createUsageHandler,
  createBillingSources,
  createModelPricesHandlers,
  createProviderBillingHandler,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const sources = createBillingSources(process.env);

router.use(requireJwtAuth, requireCapability(SystemCapabilities.READ_USAGE));
router.get('/', createUsageHandler({ getUsage: db.getUsage }));
router.get('/providers', createProviderBillingHandler({ sources }));

const prices = createModelPricesHandlers({
  listModelPrices: db.listModelPrices,
  upsertModelPrice: db.upsertModelPrice,
  deleteModelPrice: db.deleteModelPrice,
  getValueKey: db.getValueKey,
  tokenValues: db.tokenValues,
  cacheTokenValues: db.cacheTokenValues,
  defaultRate: db.defaultRate,
});
const requireManageConfigs = requireCapability(SystemCapabilities.MANAGE_CONFIGS);

router.get('/prices', prices.listPrices);
router.put('/prices', requireManageConfigs, prices.savePrice);
router.delete('/prices', requireManageConfigs, prices.resetPrice);

module.exports = router;
