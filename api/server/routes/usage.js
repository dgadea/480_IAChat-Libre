const express = require('express');
const {
  createUsageHandler,
  createBillingSources,
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

module.exports = router;
