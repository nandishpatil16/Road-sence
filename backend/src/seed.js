/**
 * CivicConnect Database Seed Script
 * Run: node src/seed.js
 * Creates demo users and sample data for local development
 */
require('dotenv').config();
const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const mongoose = require('mongoose');
const User = require('./models/User');
const Incident = require('./models/Incident');
const Alert = require('./models/Alert');
const Complaint = require('./models/Complaint');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/civicconnect';

const demoUsers = [
  { name: 'Admin User',        email: 'admin@civic.com',        password: 'password123', role: 'admin',        badge: 'ADM-001', department: 'City Authority' },
  { name: 'Officer Ramesh',    email: 'police@civic.com',       password: 'password123', role: 'police',       badge: 'POL-042', department: 'Traffic Police' },
  { name: 'Dr. Priya Sharma',  email: 'ambulance@civic.com',    password: 'password123', role: 'ambulance',    badge: 'AMB-007', department: 'Emergency Services' },
  { name: 'Suresh Kumar',      email: 'construction@civic.com', password: 'password123', role: 'construction', badge: 'CON-015', department: 'PWD Belagavi' },
];

const sampleIncidents = [
  { title: 'Major Accident on NH-4', type: 'accident', status: 'pending', priority: 'high', description: 'Multi-vehicle collision near Nehru Nagar junction', location: { lat: 15.8597, lng: 74.4977, address: 'NH-4, Near Nehru Nagar, Belagavi' } },
  { title: 'Medical Emergency – Chest Pain', type: 'medical', status: 'in_progress', priority: 'critical', description: 'Patient reported severe chest pain', location: { lat: 15.8440, lng: 74.5040, address: 'Bhagya Nagar, Belagavi' } },
  { title: 'Road Excavation – Water Pipeline', type: 'construction', status: 'pending', priority: 'medium', description: 'Water pipeline work causing traffic diversion', location: { lat: 15.8520, lng: 74.4950, address: 'Camp Area, Belagavi' } },
  { title: 'Traffic Jam – MG Road', type: 'traffic', status: 'pending', priority: 'medium', description: 'Heavy traffic congestion reported on MG Road', location: { lat: 15.8510, lng: 74.5000, address: 'MG Road, Belagavi' } },
  { title: 'Tree Fallen – Blocking Road', type: 'other', status: 'resolved', priority: 'low', description: 'Tree uprooted due to rain, blocking one lane', location: { lat: 15.8650, lng: 74.5050, address: 'Vadgaon, Belagavi' } },
];

const sampleAlerts = [
  { title: 'Heavy Rainfall Warning', message: 'IMD has issued heavy rainfall alert for Belagavi district. All units on standby.', type: 'weather', severity: 'high', targetRoles: ['all'], isResolved: false },
  { title: 'VIP Movement – Road Closures', message: 'Chief Minister visit tomorrow. NH-4 partial closure 10AM–2PM.', type: 'traffic', severity: 'medium', targetRoles: ['police', 'construction'], isResolved: false },
  { title: 'Emergency Drill Scheduled', message: 'City-wide emergency response drill scheduled for Saturday 9AM.', type: 'info', severity: 'low', targetRoles: ['all'], isResolved: false },
];

const sampleComplaints = [
  { title: 'Pothole on Station Road', description: 'Large pothole causing accidents near railway station', category: 'road', status: 'pending', priority: 'high', location: { lat: 15.8600, lng: 74.5020, address: 'Station Road, Belagavi' } },
  { title: 'Streetlight Not Working', description: '5 streetlights out in Bhagya Nagar colony for 3 days', category: 'electricity', status: 'pending', priority: 'medium', location: { lat: 15.8440, lng: 74.5000, address: 'Bhagya Nagar, Belagavi' } },
  { title: 'Garbage Not Collected', description: 'Garbage pile near market for 4 days, causing health issues', category: 'sanitation', status: 'in_progress', priority: 'medium', location: { lat: 15.8530, lng: 74.4960, address: 'City Market, Belagavi' } },
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Seed] Connected to MongoDB');

    // Clear existing data
    console.log('[Seed] Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Incident.deleteMany({}),
      Alert.deleteMany({}),
      Complaint.deleteMany({}),
    ]);

    // Create users
    console.log('[Seed] Creating demo users...');
    const users = await User.create(demoUsers);
    const adminUser = users.find(u => u.role === 'admin');
    console.log('[Seed] Demo users created:');
    users.forEach(u => console.log(`  - ${u.role}: ${u.email} / password123`));

    // Create incidents
    console.log('[Seed] Creating sample incidents...');
    await Incident.create(sampleIncidents.map(i => ({ ...i, reportedBy: adminUser._id })));

    // Create alerts
    console.log('[Seed] Creating sample alerts...');
    await Alert.create(sampleAlerts.map(a => ({ ...a, createdBy: adminUser._id })));

    // Create complaints
    console.log('[Seed] Creating sample complaints...');
    await Complaint.create(sampleComplaints.map(c => ({ ...c, reportedBy: adminUser._id })));

    console.log('\n[Seed] ✅ Database seeded successfully!\n');
    console.log('Demo Login Credentials:');
    console.log('═══════════════════════════════════════');
    users.forEach(u => {
      console.log(`  ${u.role.padEnd(15)} ${u.email.padEnd(30)} password123`);
    });
    console.log('═══════════════════════════════════════');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error:', err.message);
    process.exit(1);
  }
}

seed();
