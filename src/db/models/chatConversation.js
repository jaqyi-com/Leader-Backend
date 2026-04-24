const mongoose = require("mongoose");

/**
 * ChatConversation — a thread of messages between a user and the AI chatbot.
 * Scoped to an org so all conversations are org-specific.
 * Users can only see their own conversations.
 */
const chatConversationSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Auto-generated from the first user message
    title: {
      type: String,
      default: "New Conversation",
      trim: true,
    },
    // Track the last activity for sorting
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    // Total message count for display
    messageCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatConversationSchema.index({ orgId: 1, userId: 1, lastMessageAt: -1 });

const ChatConversation =
  mongoose.models.ChatConversation ||
  mongoose.model("ChatConversation", chatConversationSchema);

module.exports = ChatConversation;
