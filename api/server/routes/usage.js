const express = require('express');
const { createUsageHandler } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

router.use(requireJwtAuth, requireCapability(SystemCapabilities.READ_USAGE));
router.get('/', createUsageHandler({ getUsage: db.getUsage }));

module.exports = router;
