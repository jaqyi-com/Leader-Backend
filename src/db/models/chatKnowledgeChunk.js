const mongoose = require("mongoose");

/**
 * ChatKnowledgeChunk — a single text chunk with its embedding vector.
 * Each knowledge source is split into overlapping chunks (e.g., 512 tokens)
 * and each chunk gets an embedding from text-embedding-3-small (1536 dims).
 * Cosine similarity search is done in-app (no Atlas Vector Search needed).
 */
const chatKnowledgeChunkSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatKnowledgeSource",
      required: true,
      index: true,
    },
    // The text content of this chunk
    text: {
      type: String,
      required: true,
    },
    // 1536-dimensional embedding from text-embedding-3-small
    embedding: {
      type: [Number],
      required: true,
    },
    // Chunk position within the source (for ordering/context)
    chunkIndex: {
      type: Number,
      default: 0,
    },
    // Metadata for display in source citations
    metadata: {
      sourceName: { type: String, default: "" },
      sourceType: { type: String, default: "text" },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatKnowledgeChunkSchema.index({ orgId: 1, sourceId: 1 });

const ChatKnowledgeChunk =
  mongoose.models.ChatKnowledgeChunk ||
  mongoose.model("ChatKnowledgeChunk", chatKnowledgeChunkSchema);

module.exports = ChatKnowledgeChunk;
