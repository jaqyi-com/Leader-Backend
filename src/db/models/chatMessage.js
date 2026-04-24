const mongoose = require("mongoose");

/**
 * ChatMessage — a single message within a conversation.
 * role: "user"      — message from the human
 * role: "assistant" — message from the AI
 *
 * expandedPrompt: the enhanced version of user's short prompt (shown collapsibly)
 * sourceChunks: which knowledge chunks were used to answer (for citations)
 */
const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
      index: true,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    // The actual message content displayed to the user
    content: {
      type: String,
      required: true,
    },
    // For user messages: the AI-expanded version of their prompt
    // For assistant messages: null
    expandedPrompt: {
      type: String,
      default: null,
    },
    // Source chunks used to generate assistant message (for citations)
    sourceChunks: [
      {
        chunkId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatKnowledgeChunk" },
        sourceName: String,
        similarity: Number,
        textSnippet: String,
      },
    ],
    // For assistant messages: was this fully streamed?
    isComplete: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

const ChatMessage =
  mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", chatMessageSchema);

module.exports = ChatMessage;
