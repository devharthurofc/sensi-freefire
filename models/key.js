const mongoose = require("mongoose");

const keySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },

  status: {
    type: String,
    enum: ["active", "used", "revoked"],
    default: "active"
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  expiresAt: {
    type: Date,
    default: null
  },

  usedBy: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model("Key", keySchema);