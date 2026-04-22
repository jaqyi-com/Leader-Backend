const mongoose = require("mongoose");

/**
 * Member — join table between Users and Organizations.
 * Inspired by the ai-assistant-backend org architecture.
 *
 * role:   admin   — full access, can invite, remove, change roles
 *         member  — standard access to all pipeline features
 *         viewer  — read-only access
 * status: active  — fully onboarded member
 *         invited — invite sent, user hasn't accepted yet
 *         suspended — access revoked but record kept
 */
const memberSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // null for invited users who haven't signed up yet
      default: null,
    },
    role: {
      type: String,
      enum: ["admin", "member", "viewer"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "invited", "suspended"],
      default: "active",
    },
    // Who sent this invite
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Email used for invite (before user signs up)
    inviteEmail: {
      type: String,
      default: null,
      lowercase: true,
    },
    // Invite token for accepting via email link
    inviteToken: {
      type: String,
      default: null,
    },
    inviteTokenExpires: {
      type: Date,
      default: null,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: one active record per user per org (sparse = skip null userId rows)
memberSchema.index({ orgId: 1, userId: 1 }, { unique: true, sparse: true });
// One pending invite per email per org
memberSchema.index({ orgId: 1, inviteEmail: 1 }, { unique: true, sparse: true });
memberSchema.index({ orgId: 1 });
memberSchema.index({ userId: 1 });
memberSchema.index({ inviteToken: 1 }, { sparse: true });

const Member =
  mongoose.models.Member || mongoose.model("Member", memberSchema);
module.exports = Member;
