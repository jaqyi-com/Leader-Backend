const mongoose = require("mongoose");

/**
 * ChatKnowledgeSource — an editable unit of organizational memory.
 * Can be a text block typed manually, an uploaded file (PDF/TXT),
 * or auto-seeded from the Organization record.
 * Each source produces one or more ChatKnowledgeChunks.
 */
const chatKnowledgeSourceSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    // Human-readable name shown in the UI
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Source type
    type: {
      type: String,
      enum: ["text", "file", "auto_seeded"],
      default: "text",
    },
    // The raw text content (always populated after processing)
    rawContent: {
      type: String,
      default: "",
    },
    // For file uploads: original filename
    fileName: {
      type: String,
      default: null,
    },
    // For file uploads: MIME type
    mimeType: {
      type: String,
      default: null,
    },
    // Processing status
    status: {
      type: String,
      enum: ["processing", "ready", "error"],
      default: "processing",
    },
    // Error message if processing failed
    errorMessage: {
      type: String,
      default: null,
    },
    // Number of chunks generated from this source
    chunkCount: {
      type: Number,
      default: 0,
    },
    // Who uploaded this source
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatKnowledgeSourceSchema.index({ orgId: 1, createdAt: -1 });

const ChatKnowledgeSource =
  mongoose.models.ChatKnowledgeSource ||
  mongoose.model("ChatKnowledgeSource", chatKnowledgeSourceSchema);

module.exports = ChatKnowledgeSource;
