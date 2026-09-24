const express = require('express');
const {
  createUsageHandler,
  createOpenAIBilling,
  createAnthropicBilling,
  createProviderBillingHandler,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const { OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY } = process.env;
const sources = {
  ...(OPENAI_ADMIN_KEY ? { openai: createOpenAIBilling({ apiKey: OPENAI_ADMIN_KEY }) } : {}),
  ...(ANTHROPIC_ADMIN_KEY
    ? { anthropic: createAnthropicBilling({ apiKey: ANTHROPIC_ADMIN_KEY }) }
    : {}),
};

router.use(requireJwtAuth, requireCapability(SystemCapabilities.READ_USAGE));
router.get('/', createUsageHandler({ getUsage: db.getUsage }));
router.get('/providers', createProviderBillingHandler({ sources }));

module.exports = router;
