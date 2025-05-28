const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  address: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  propertyType: { type: String, required: true }, // House, Flat, etc.
  energyRating: { type: String, default: 'Unknown' }, // A-G rating
  yearBuilt: { type: Number },
  area: { type: Number }, // in square meters
  localAuthority: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Property', propertySchema);
