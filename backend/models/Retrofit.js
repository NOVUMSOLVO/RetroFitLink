const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  sensorId: String,
  reading: Number,
  timestamp: { type: Date, default: Date.now }
});

const retrofitSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  type: String, // e.g., "Insulation", "Heat Pump"
  status: {
    type: String,
    enum: ['Planned', 'In Progress', 'Completed', 'Verified', 'Financed'],
    default: 'Planned'
  },
  installer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationData: [verificationSchema],
  blockchainTx: String // Stores blockchain transaction ID
}, { timestamps: true });

module.exports = mongoose.model('Retrofit', retrofitSchema);
