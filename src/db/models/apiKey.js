const mongoose = require("mongoose");

// Personal API keys for the Doott data API. Only a SHA-256 hash of the key is stored;
// the full key is shown to the user once, when it is created.
const apiKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    prefix: { type: String, required: true }, // first characters, shown in the UI to tell keys apart
    keyHash: { type: String, required: true, unique: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

const ApiKey = mongoose.models.ApiKey || mongoose.model("ApiKey", apiKeySchema);
module.exports = ApiKey;
