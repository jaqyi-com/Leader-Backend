const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // URL-friendly unique identifier e.g. "acme-corp"
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    // The user who created this org (admin)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Optional extra metadata
    website: {
      type: String,
      default: null,
    },
    industry: {
    gmailIntegration: {
      email: { type: String, default: null },
      accessToken: { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiryDate: { type: Number, default: null }, // Timestamp
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);


const Organization =
  mongoose.models.Organization ||
  mongoose.model("Organization", organizationSchema);

module.exports = Organization;
