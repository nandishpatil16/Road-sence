const express = require('express');
const Alert = require('../models/Alert');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts
router.get('/', auth.optional, async (req, res) => {
  try {
    const filter = {};
    if (req.query.isResolved !== undefined) filter.isResolved = req.query.isResolved === 'true';
    if (req.query.severity) filter.severity = req.query.severity;

    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/alerts
router.post('/', auth, async (req, res) => {
  try {
    const alert = new Alert({ ...req.body, createdBy: req.user.id });
    await alert.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('new-alert', alert);
      (alert.targetRoles || []).forEach(role => {
        if (role !== 'all') io.to(role).emit('new-alert', alert);
      });
    }

    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/alerts/:id/resolve
router.put('/:id/resolve', auth, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { $set: { isResolved: true, resolvedAt: new Date(), resolvedBy: req.user.id } },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
