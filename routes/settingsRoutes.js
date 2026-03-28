const express = require('express');
const router = express.Router();
const PlatformSettings = require('../models/PlatformSettings');

// Public endpoint to fetch platform settings relevant to visitors
// Only exposes non-sensitive flags like maintenanceMode
router.get('/', async (req, res) => {
  try {
    const doc = await PlatformSettings.getSingleton();
    res.json({ success: true, data: { maintenanceMode: !!doc.maintenanceMode } });
  } catch (err) {
    console.error('Error fetching platform settings:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

module.exports = router;