const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// In-memory location store for fast real-time access
const activeLocations = new Map();

// POST /api/locations  - update own location
router.post('/', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });

    // Update in-memory
    activeLocations.set(req.user.id, {
      userId: req.user.id,
      role: req.user.role,
      lat, lng,
      updatedAt: new Date(),
    });

    // Update in DB (non-blocking)
    User.findByIdAndUpdate(req.user.id, {
      $set: { 'location.lat': lat, 'location.lng': lng, 'location.updatedAt': new Date() }
    }).catch(console.error);

    // Emit to all admins
    const io = req.app.get('io');
    if (io) io.to('admin').emit('location-update', activeLocations.get(req.user.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/locations/active - get all active locations (last 10 min)
router.get('/active', auth, async (req, res) => {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const active = [];
    for (const [, loc] of activeLocations) {
      if (new Date(loc.updatedAt) > tenMinAgo) active.push(loc);
    }
    res.json(active);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
