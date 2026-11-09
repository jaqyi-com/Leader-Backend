"use strict";
// OAuth records for the Doott MCP connector (Claude and other MCP clients).
// Secrets (client secrets, authorization codes, refresh tokens) are stored as SHA-256 hashes only.

const mongoose = require("mongoose");

// A client registered through Dynamic Client Registration (RFC 7591), e.g. claude.ai or Claude Code.
const mcpClientSchema = new mongoose.Schema(
  {
    clientId:         { type: String, required: true, unique: true },
    clientSecretHash: { type: String, default: null }, // null = public client (PKCE only)
    clientName:       { type: String, default: "MCP client" },
    redirectUris:     { type: [String], required: true },
    authMethod:       { type: String, enum: ["none", "client_secret_post", "client_secret_basic"], default: "none" },
  },
  { timestamps: true, versionKey: false }
);

// A one-time authorization code, valid for 10 minutes.
const mcpAuthCodeSchema = new mongoose.Schema(
  {
    codeHash:      { type: String, required: true, unique: true },
    clientId:      { type: String, required: true },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    redirectUri:   { type: String, required: true },
    codeChallenge: { type: String, required: true },
    resource:      { type: String, default: null },
    expiresAt:     { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);
mcpAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// One user's consent to one client. Holds the current refresh token; revoking it ends the connection.
const mcpGrantSchema = new mongoose.Schema(
  {
    clientId:         { type: String, required: true, index: true },
    clientName:       { type: String, default: "MCP client" },
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    refreshExpiresAt: { type: Date, required: true },
    revokedAt:        { type: Date, default: null },
    lastUsedAt:       { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

const McpClient   = mongoose.models.McpClient   || mongoose.model("McpClient", mcpClientSchema);
const McpAuthCode = mongoose.models.McpAuthCode || mongoose.model("McpAuthCode", mcpAuthCodeSchema);
const McpGrant    = mongoose.models.McpGrant    || mongoose.model("McpGrant", mcpGrantSchema);

module.exports = { McpClient, McpAuthCode, McpGrant };
