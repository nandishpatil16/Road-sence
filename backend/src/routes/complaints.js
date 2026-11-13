const express = require('express');
const Complaint = require('../models/Complaint');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/complaints
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const complaints = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('reportedBy', 'name role')
      .populate('assignedTo', 'name role');
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/complaints
router.post('/', auth, async (req, res) => {
  try {
    const complaint = new Complaint({ ...req.body, reportedBy: req.user.id });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/complaints/:id
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.body.status === 'resolved') req.body.resolvedAt = new Date();
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
