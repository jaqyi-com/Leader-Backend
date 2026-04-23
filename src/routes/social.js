/**
 * Social Media Routes — Unified.to MCP Integration
 * Pipeline: Keywords → LLM Trend Analysis → Generated Post → Email Approval → Publish
 */

require("dotenv").config();
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");
const { SocialPost } = require("../db/mongoose");
const logger = require("../utils/logger");

const UNIFIED_BASE_URL = process.env.UNIFIED_BASE_URL || "https://api.unified.to";
const UNIFIED_API_KEY  = process.env.UNIFIED_API_KEY;
const FRONTEND_URL     = process.env.FRONTEND_URL || "http://localhost:5174";
const BACKEND_URL      = process.env.BACKEND_URL  || `http://localhost:${process.env.PORT || 3001}`;

// ── Unified.to HTTP client ──────────────────────────────────────────────────
const unifiedApi = axios.create({
  baseURL: UNIFIED_BASE_URL,
  headers: {
    Authorization: `Bearer ${UNIFIED_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// ── SMTP mailer (reuses existing env vars) ─────────────────────────────────
function createMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST  || "smtp.gmail.com",
    port:   parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── OpenAI helper ──────────────────────────────────────────────────────────
async function generateSocialContent(keywords, platform) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const platformGuide = {
    linkedin:  "professional, insightful, thought-leadership tone. Max 3000 chars. Add 3-5 hashtags.",
    instagram: "engaging, visual storytelling tone with emojis. Max 2200 chars. Add 5-10 hashtags.",
    facebook:  "conversational, community-focused tone. Max 63206 chars. Add 3-5 hashtags.",
    x:         "punchy, witty, concise. Max 280 chars. Add 2-3 hashtags.",
    twitter:   "punchy, witty, concise. Max 280 chars. Add 2-3 hashtags.",
  };

  const systemPrompt = `You are an expert social media strategist and content writer. 
You analyze trends and create highly engaging, platform-optimized content.
Always respond in valid JSON format.`;

  const userPrompt = `Analyze what's currently trending around these keywords: [${keywords.join(", ")}]

Create a compelling social media post for ${platform.toUpperCase()}.
Platform style guide: ${platformGuide[platform] || platformGuide.linkedin}

Respond with this exact JSON:
{
  "trendSummary": "2-3 sentence explanation of why this topic is trending right now and the angle you're taking",
  "content": "The full post content optimized for ${platform}",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    content:      parsed.content      || "",
    trendSummary: parsed.trendSummary || "",
    hashtags:     parsed.hashtags     || [],
  };
}

// ── Send approval email ────────────────────────────────────────────────────
async function sendApprovalEmail(post) {
  const approveUrl = `${BACKEND_URL}/api/social/posts/approve/${post._id}?token=${post.approvalToken}`;
  const rejectUrl  = `${BACKEND_URL}/api/social/posts/reject/${post._id}?token=${post.approvalToken}`;

  const platformEmoji = {
    linkedin: "💼", instagram: "📸", facebook: "👍", x: "𝕏", twitter: "𝕏",
  };

  const mailer = createMailer();
  await mailer.sendMail({
    from:    `"${process.env.SMTP_FROM_NAME || "Leader AI"}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to:      post.approvalEmail,
    subject: `[Action Required] Approve your ${post.platform} post — Leader AI`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #0a0a0f; color: #f0f0f8; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .card { background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 32px; margin: 16px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: rgba(108,99,255,0.15); color: #9b8fff; margin-bottom: 16px; }
    .content-box { background: #16161f; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; margin: 16px 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
    .trend-box { background: rgba(34,211,238,0.05); border: 1px solid rgba(34,211,238,0.15); border-radius: 12px; padding: 16px; margin: 16px 0; font-size: 13px; color: #22d3ee; }
    .btn { display: inline-block; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; text-align: center; margin: 8px; }
    .btn-approve { background: linear-gradient(135deg, #10b981, #059669); color: white; }
    .btn-reject  { background: #1d1d28; border: 1px solid rgba(244,63,94,0.3); color: #f43f5e; }
    .hashtags { color: #6c63ff; font-size: 13px; margin-top: 8px; }
    h2 { margin: 0 0 8px; font-size: 24px; }
    p  { color: #8888a8; font-size: 14px; margin: 0 0 16px; }
    .footer { text-align: center; color: #55556a; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="badge">${platformEmoji[post.platform] || "📱"} ${post.platform.toUpperCase()} POST REVIEW</div>
      <h2>Your AI-generated post is ready for approval</h2>
      <p>Leader AI has analyzed trending topics for your keywords and created the following post. Please review and approve or reject it below.</p>

      <div class="trend-box">
        <strong>📊 Why this is trending:</strong><br/>${post.trendSummary || "Based on your keyword analysis."}
      </div>

      <div class="content-box">${post.generatedContent}</div>

      ${post.hashtags?.length ? `<div class="hashtags">${post.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join("  ")}</div>` : ""}

      <div style="text-align:center; margin-top: 32px;">
        <a href="${approveUrl}" class="btn btn-approve">✅ Approve & Queue for Publishing</a>
        <a href="${rejectUrl}"  class="btn btn-reject">❌ Reject Post</a>
      </div>
    </div>
    <div class="footer">
      Leader AI · Automated Social Media Pipeline<br/>
      This email was sent to ${post.approvalEmail}. Links expire when the post is published.
    </div>
  </div>
</body>
</html>`,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/social/connections — list connected social accounts ─────────────
router.get("/connections", async (req, res) => {
  try {
    const response = await unifiedApi.get("/unified/connection", {
      params: { categories: ["social"] },
    });
    res.json({ success: true, connections: response.data || [] });
  } catch (err) {
    logger.error(`[Social] Failed to fetch connections: ${err.message}`);
    // Return empty list gracefully — Unified.to may not have social connections yet
    res.json({ success: true, connections: [], warning: err.response?.data || err.message });
  }
});

// ── GET /api/social/integrations — list available platforms ─────────────────
router.get("/integrations", async (req, res) => {
  try {
    const response = await unifiedApi.get("/unified/integration", {
      params: { categories: ["social"] },
    });
    res.json({ success: true, integrations: response.data || [] });
  } catch (err) {
    logger.error(`[Social] Failed to fetch integrations: ${err.message}`);
    // Return hard-coded list as fallback so UI still works
    res.json({
      success: true,
      integrations: [
        { type: "linkedin",  name: "LinkedIn",  categories: ["social"] },
        { type: "instagram", name: "Instagram", categories: ["social"] },
        { type: "facebook",  name: "Facebook",  categories: ["social"] },
        { type: "twitter",   name: "X (Twitter)", categories: ["social"] },
      ],
      warning: err.message,
    });
  }
});

// ── POST /api/social/connect/link — create Unified.to OAuth link ─────────────
router.post("/connect/link", async (req, res) => {
  try {
    const { provider, redirectUrl } = req.body;
    if (!provider) return res.status(400).json({ error: "provider is required" });

    const workspaceId = process.env.UNIFIED_WORKSPACE_ID;
    if (!workspaceId) {
      return res.status(500).json({ error: "UNIFIED_WORKSPACE_ID is not configured." });
    }

    const finalRedirect = redirectUrl || `${FRONTEND_URL}/app/social?connected=${provider}`;
    
    // Unified.to uses a static GET endpoint for initiating OAuth flows
    const authUrl = `${UNIFIED_BASE_URL}/unified/integration/auth/${workspaceId}/${provider}?success_redirect=${encodeURIComponent(finalRedirect)}&scopes=${encodeURIComponent("social_post,social_profile")}`;

    res.json({ success: true, url: authUrl });
  } catch (err) {
    logger.error(`[Social] Failed to create OAuth link: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/social/connections/:id — disconnect an account ───────────────
router.delete("/connections/:id", async (req, res) => {
  try {
    await unifiedApi.delete(`/unified/connection/${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Social] Failed to disconnect: ${err.message}`);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── POST /api/social/generate — LLM trend analysis + post generation ─────────
router.post("/generate", async (req, res) => {
  try {
    const { keywords, platform = "linkedin" } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "keywords array is required" });
    }

    logger.info(`[Social] Generating ${platform} post for keywords: ${keywords.join(", ")}`);
    const result = await generateSocialContent(keywords, platform);

    res.json({
      success: true,
      content:      result.content,
      trendSummary: result.trendSummary,
      hashtags:     result.hashtags,
      platform,
      keywords,
    });
  } catch (err) {
    logger.error(`[Social] Generate failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/social/posts — save draft, send approval email ─────────────────
router.post("/posts", async (req, res) => {
  try {
    const { keywords, platform, connectionId, generatedContent, trendSummary, hashtags, approvalEmail } = req.body;

    if (!generatedContent) return res.status(400).json({ error: "generatedContent is required" });
    if (!approvalEmail)    return res.status(400).json({ error: "approvalEmail is required" });

    const approvalToken = uuidv4();

    const post = await SocialPost.create({
      keywords:        keywords || [],
      platform:        platform || "linkedin",
      connectionId:    connectionId || null,
      generatedContent,
      trendSummary,
      hashtags:        hashtags || [],
      status:          "pending_approval",
      approvalToken,
      approvalEmail,
    });

    // Send approval email
    try {
      await sendApprovalEmail(post);
      logger.info(`[Social] Approval email sent to ${approvalEmail} for post ${post._id}`);
    } catch (mailErr) {
      logger.error(`[Social] Failed to send approval email: ${mailErr.message}`);
      // Don't fail the whole request — post is saved, email is optional
    }

    const obj = post.toObject();
    obj.id = obj._id.toString();
    res.json({ success: true, post: obj, approvalEmailSent: true });
  } catch (err) {
    logger.error(`[Social] Failed to create post: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/social/posts — list all posts ──────────────────────────────────
router.get("/posts", async (req, res) => {
  try {
    const posts = await SocialPost.find().sort({ createdAt: -1 }).limit(100).lean();
    const mapped = posts.map(p => ({ ...p, id: p._id.toString() }));
    res.json({ success: true, posts: mapped });
  } catch (err) {
    logger.error(`[Social] Failed to list posts: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/social/posts/approve/:id — email approval link handler ──────────
router.get("/posts/approve/:id", async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).send("<h2>Post not found</h2>");
    if (post.approvalToken !== req.query.token) return res.status(403).send("<h2>Invalid or expired token</h2>");
    if (post.status === "published") {
      return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0f;color:#f0f0f8;"><h2 style="color:#10b981">✅ Already published!</h2><p>This post was already published to ${post.platform}.</p></body></html>`);
    }

    post.status = "approved";
    await post.save();

    res.send(`
<html>
<head><title>Post Approved — Leader AI</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;text-align:center;padding:80px 20px;background:#0a0a0f;color:#f0f0f8;">
  <div style="max-width:480px;margin:0 auto;background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:40px;">
    <div style="font-size:64px;margin-bottom:16px;">✅</div>
    <h2 style="color:#10b981;margin-bottom:8px;">Post Approved!</h2>
    <p style="color:#8888a8;margin-bottom:24px;">Your <strong style="color:#9b8fff">${post.platform}</strong> post has been approved and is queued for publishing.</p>
    <a href="${FRONTEND_URL}/app/social" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:white;text-decoration:none;border-radius:12px;font-weight:600;">Go to Dashboard →</a>
  </div>
</body>
</html>`);
  } catch (err) {
    logger.error(`[Social] Approval failed: ${err.message}`);
    res.status(500).send("<h2>Something went wrong</h2>");
  }
});

// ── GET /api/social/posts/reject/:id — email rejection link handler ──────────
router.get("/posts/reject/:id", async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).send("<h2>Post not found</h2>");
    if (post.approvalToken !== req.query.token) return res.status(403).send("<h2>Invalid or expired token</h2>");

    post.status = "rejected";
    await post.save();

    res.send(`
<html>
<head><title>Post Rejected — Leader AI</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;text-align:center;padding:80px 20px;background:#0a0a0f;color:#f0f0f8;">
  <div style="max-width:480px;margin:0 auto;background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:40px;">
    <div style="font-size:64px;margin-bottom:16px;">❌</div>
    <h2 style="color:#f43f5e;margin-bottom:8px;">Post Rejected</h2>
    <p style="color:#8888a8;margin-bottom:24px;">Your <strong style="color:#9b8fff">${post.platform}</strong> post has been rejected. You can generate a new one from the dashboard.</p>
    <a href="${FRONTEND_URL}/app/social" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:white;text-decoration:none;border-radius:12px;font-weight:600;">Go to Dashboard →</a>
  </div>
</body>
</html>`);
  } catch (err) {
    logger.error(`[Social] Rejection failed: ${err.message}`);
    res.status(500).send("<h2>Something went wrong</h2>");
  }
});

// ── POST /api/social/posts/:id/publish — publish approved post via Unified.to ─
router.post("/posts/:id/publish", async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.status !== "approved") {
      return res.status(400).json({ error: `Post must be approved before publishing. Current status: ${post.status}` });
    }

    logger.info(`[Social] Publishing post ${post._id} to ${post.platform}`);

    // Build the post content (add hashtags if not already inline)
    const fullContent = post.hashtags?.length
      ? `${post.generatedContent}\n\n${post.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}`
      : post.generatedContent;

    // Call Unified.to social posting API
    const unifiedPayload = {
      content:     fullContent,
      raw:         { text: fullContent },
    };

    let unifiedResponse;
    try {
      if (post.connectionId) {
        // Post using the specific connected account
        unifiedResponse = await unifiedApi.post(
          `/social/${post.connectionId}/post`,
          unifiedPayload
        );
      } else {
        // Generic post — let Unified.to route it
        unifiedResponse = await unifiedApi.post("/social/post", {
          ...unifiedPayload,
          type: post.platform,
          workspace_id: process.env.UNIFIED_WORKSPACE_ID,
        });
      }
    } catch (apiErr) {
      logger.warn(`[Social] Unified.to post API error: ${apiErr.message}. Marking as failed.`);
      post.status = "failed";
      post.errorMessage = apiErr.response?.data?.message || apiErr.message;
      await post.save();
      return res.status(502).json({ error: post.errorMessage, detail: "Unified.to API error" });
    }

    post.status       = "published";
    post.publishedAt  = new Date();
    post.unifiedPostId = unifiedResponse?.data?.id || null;
    await post.save();

    const obj = post.toObject();
    obj.id = obj._id.toString();
    res.json({ success: true, post: obj, unifiedData: unifiedResponse?.data });
  } catch (err) {
    logger.error(`[Social] Publish failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/social/posts/:id — delete a post ────────────────────────────
router.delete("/posts/:id", async (req, res) => {
  try {
    await SocialPost.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error(`[Social] Delete post failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
