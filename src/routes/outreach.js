// ============================================================
// OUTREACH ROUTES
// /api/outreach/*
// ============================================================

const express = require("express");
const { auth } = require("../middleware/auth");
const {
  aggregateContacts,
  generatePersonalization,
  sendEmail,
  sendWhatsApp,
  sendSMS,
} = require("../services/outreachEngineService");
const { OutreachCampaign } = require("../db/mongoose");

const router = express.Router();
router.use(auth);

// ─── GET /api/outreach/contacts ─────────────────────────────────────────────
// Aggregate all contacts from all sources that have email or phone
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await aggregateContacts(req.user.orgId);
    res.json({ success: true, contacts, total: contacts.length });
  } catch (err) {
    console.error("[Outreach] aggregateContacts:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/outreach/personalize ─────────────────────────────────────────
// Generate AI icebreaker + personalized email for a single contact
router.post("/personalize", async (req, res) => {
  try {
    const { contact, orgContext } = req.body;
    if (!contact) return res.status(400).json({ error: "contact is required" });
    const personalization = await generatePersonalization(contact, orgContext || {});
    res.json({ success: true, personalization });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/outreach/personalize/batch ──────────────────────────────────
// Generate personalizations for up to 20 contacts at once
router.post("/personalize/batch", async (req, res) => {
  try {
    const { contacts, orgContext } = req.body;
    if (!contacts?.length) return res.status(400).json({ error: "contacts array is required" });
    const limited = contacts.slice(0, 20);

    const results = await Promise.allSettled(
      limited.map(c => generatePersonalization(c, orgContext || {}))
    );

    const personalizations = results.map((r, i) => ({
      contactId: limited[i]._id,
      ...(r.status === "fulfilled" ? r.value : {
        icebreaker: "",
        subject: `Quick question for ${limited[i].companyName || "you"}`,
        emailBody: "",
        whatsappMessage: "",
        error: r.reason?.message,
      }),
    }));

    res.json({ success: true, personalizations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/outreach/campaigns ───────────────────────────────────────────
// Create a new campaign
router.post("/campaigns", async (req, res) => {
  try {
    const { name, channels, sequence, contacts } = req.body;
    if (!name || !contacts?.length) {
      return res.status(400).json({ error: "name and contacts are required" });
    }

    const campaign = await OutreachCampaign.create({
      name,
      channels: channels || ["email"],
      sequence: sequence || [
        { day: 0, channel: "email", label: "Initial Email" },
        { day: 3, channel: "whatsapp", label: "WhatsApp Follow-up" },
        { day: 7, channel: "sms", label: "SMS Nudge" },
      ],
      contacts: contacts.map(c => ({
        contactId: c._id,
        contactSource: c.source,
        name: c.name,
        email: c.email,
        phone: c.phone,
        companyName: c.companyName,
        score: c.score,
        icebreaker: c.icebreaker || "",
        personalizedSubject: c.subject || "",
        personalizedEmail: c.emailBody || "",
        whatsappMessage: c.whatsappMessage || "",
        status: "pending",
        deliveries: [],
      })),
      status: "draft",
      orgId: req.user.orgId,
    });

    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/outreach/campaigns ────────────────────────────────────────────
router.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await OutreachCampaign.find({ orgId: req.user.orgId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/outreach/campaigns/:id ────────────────────────────────────────
router.get("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await OutreachCampaign.findOne({
      _id: req.params.id,
      orgId: req.user.orgId,
    }).lean();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/outreach/campaigns/:id/launch ────────────────────────────────
// Launch step — send Day 0 emails immediately
router.post("/campaigns/:id/launch", async (req, res) => {
  try {
    const campaign = await OutreachCampaign.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "active") return res.status(400).json({ error: "Campaign is already active" });

    campaign.status = "active";
    campaign.launchedAt = new Date();
    await campaign.save();

    // Fire-and-forget — send Day 0 emails in background
    _sendSequenceStep(campaign, 0).catch(e => console.error("[Outreach] launch error:", e.message));

    res.json({ success: true, message: "Campaign launched. Day 0 emails are being sent.", campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/outreach/campaigns/:id/followup ──────────────────────────────
// Manually trigger the next sequence step (Day 3 / Day 7)
router.post("/campaigns/:id/followup", async (req, res) => {
  try {
    const { day } = req.body;
    if (day === undefined) return res.status(400).json({ error: "day is required" });
    const campaign = await OutreachCampaign.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    _sendSequenceStep(campaign, day).catch(e => console.error("[Outreach] followup error:", e.message));
    res.json({ success: true, message: `Day ${day} follow-ups are being sent.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/outreach/campaigns/:id/contact/:contactId/reply ─────────────
// Mark a contact as replied (stops their sequence)
router.patch("/campaigns/:id/contact/:contactId/reply", async (req, res) => {
  try {
    const campaign = await OutreachCampaign.findOne({ _id: req.params.id, orgId: req.user.orgId });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const contact = campaign.contacts.find(c => c.contactId.toString() === req.params.contactId || c._id.toString() === req.params.contactId);
    if (contact) {
      contact.status = "replied";
      campaign.repliedCount = (campaign.repliedCount || 0) + 1;
    }
    await campaign.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/outreach/campaigns/:id/pause ────────────────────────────────
router.patch("/campaigns/:id/pause", async (req, res) => {
  try {
    const campaign = await OutreachCampaign.findOneAndUpdate(
      { _id: req.params.id, orgId: req.user.orgId },
      { status: "paused" },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/outreach/campaigns/:id ─────────────────────────────────────
router.delete("/campaigns/:id", async (req, res) => {
  try {
    await OutreachCampaign.deleteOne({ _id: req.params.id, orgId: req.user.orgId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SEND A SEQUENCE STEP (background) ──────────────────────────────────────
async function _sendSequenceStep(campaign, day) {
  const stepConfig = campaign.sequence.find(s => s.day === day);
  if (!stepConfig) return;

  const channel = stepConfig.channel;

  for (const contact of campaign.contacts) {
    // Skip if replied or already sent this day
    if (contact.status === "replied") continue;
    const alreadySent = contact.deliveries?.some(d => d.day === day && d.status === "sent");
    if (alreadySent) continue;

    let result = { day, channel, sentAt: new Date(), status: "failed", error: null };

    try {
      if (channel === "email" && contact.email) {
        const orgName = process.env.SMTP_FROM_NAME || "Leader";
        const signature = `\n\nBest regards,\n${orgName} Team`;
        const body = (contact.personalizedEmail || contact.icebreaker || `Hi ${contact.name},\n\nI wanted to reach out about ${orgName}.`) + signature;

        await sendEmail({
          to: contact.email,
          subject: contact.personalizedSubject || `Quick question for ${contact.companyName || "you"}`,
          body,
          orgId: campaign.orgId,
        });
        result.status = "sent";
        contact.status = "contacted";

      } else if (channel === "whatsapp" && contact.phone) {
        await sendWhatsApp(contact.phone, contact.whatsappMessage || `Hi ${contact.name}! Reaching out from ${process.env.SMTP_FROM_NAME || "Leader"}.`);
        result.status = "sent";

      } else if (channel === "sms" && contact.phone) {
        await sendSMS(contact.phone, contact.whatsappMessage || `Hi ${contact.name}, following up from ${process.env.SMTP_FROM_NAME || "Leader"}.`);
        result.status = "sent";

      } else {
        result.status = "skipped";
        result.error = `No ${channel} contact info`;
      }
    } catch (err) {
      result.status = "failed";
      result.error = err.message;
      console.error(`[Outreach] Failed to send ${channel} to ${contact.email || contact.phone}: ${err.message}`);
    }

    contact.deliveries = contact.deliveries || [];
    contact.deliveries.push(result);
  }

  // Update aggregate stats
  campaign.sentCount = campaign.contacts.filter(c =>
    c.deliveries?.some(d => d.status === "sent")
  ).length;

  await campaign.save();
}

module.exports = router;
