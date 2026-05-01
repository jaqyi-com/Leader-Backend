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
      type: String,
      default: null,
    },
    smtpCredentials: {
      host: { type: String, default: null },
      port: { type: Number, default: 465 },
      secure: { type: Boolean, default: true },
      user: { type: String, default: null },
      pass: { type: String, default: null },
      fromName: { type: String, default: null },
      fromEmail: { type: String, default: null },
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
