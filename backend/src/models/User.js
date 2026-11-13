const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['police', 'ambulance', 'construction', 'admin', 'user'],
    required: true,
  },
  badge: { type: String },
  phone: { type: String },
  department: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  location: {
    lat: { type: Number },
    lng: { type: Number },
    updatedAt: { type: Date },
  },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Don't return password in JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
