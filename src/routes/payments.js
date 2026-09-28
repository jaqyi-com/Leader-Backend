/**
 * src/routes/payments.js
 * Razorpay payment gateway — ₹179 lifetime subscription
 *
 * IMPORTANT: Razorpay instance is initialised lazily (inside route handlers)
 * because process.env vars are not available at module-load time on Vercel.
 */
const express  = require("express");
const crypto   = require("crypto");
const Razorpay = require("razorpay");
const { connectDB } = require("../db/mongoose");
const authService   = require("../services/authService");
const User          = require("../db/models/user");
const logger        = require("../utils/logger");

const router = express.Router();

const PLAN_AMOUNT_PAISE = 17900; // ₹179
const PLAN_CURRENCY     = "INR";

const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || "rzp_live_ThZtzVX8tHPpj4";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "rAF4uYgj0UIb0Rge9xZtCNx9";

// Lazy getter — Razorpay instance created AFTER env vars or fallbacks are loaded
function getRazorpay() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return new Razorpay({
    key_id:     RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
}

router.use(async (req, res, next) => {
  try { await connectDB(); next(); } catch { next(); }
});

// ── 1. Create Razorpay Order ─────────────────────────────────────────────────
router.post("/create-order", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email and password are required." });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing)
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount:   PLAN_AMOUNT_PAISE,
      currency: PLAN_CURRENCY,
      receipt:  `doott_${Date.now()}`,
      notes:    { name: name.trim(), email: email.toLowerCase().trim(), plan: "lifetime" },
    });

    logger.info(`[Payments] Order created: ${order.id} for ${email}`);
    res.json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    RAZORPAY_KEY_ID,
      prefill:  { name, email },
    });
  } catch (err) {
    logger.error(`[Payments] create-order: ${err.message}`);
    res.status(500).json({ error: err.message || "Failed to create payment order." });
  }
});

// ── 2. Verify Payment + Create Account ──────────────────────────────────────
router.post("/verify-and-register", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, name, email, password } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ error: "Missing payment verification data." });
    if (!name || !email || !password)
      return res.status(400).json({ error: "Missing registration data." });

    // HMAC verification
    const expected = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      logger.warn(`[Payments] Invalid signature for order ${razorpay_order_id}`);
      return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
    }

    // Race condition guard
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing && existing.plan === "lifetime") {
      const result = await authService.loginWithEmail({ email, password }).catch(() => null);
      if (result) return res.json({ success: true, ...result, alreadyExists: true });
    }
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    // Create account
    const result = await authService.registerWithEmail({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      orgName: `${name.trim()}'s Workspace`,
    });

    // Mark as lifetime
    await User.findByIdAndUpdate(result.user._id, {
      plan: "lifetime",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId:   razorpay_order_id,
      paidAt:            new Date(),
      isEmailVerified:   true,
    });

    logger.info(`[Payments] ✅ Lifetime account: ${email} | ${razorpay_payment_id}`);
    res.status(201).json({ success: true, token: result.token, user: { ...result.user, plan: "lifetime" }, org: result.org });
  } catch (err) {
    logger.error(`[Payments] verify-and-register: ${err.message}`);
    res.status(500).json({ error: err.message || "Registration failed after payment." });
  }
});

// ── 3. Razorpay Webhook (backup) ─────────────────────────────────────────────
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sig = req.headers["x-razorpay-signature"];
      const exp = crypto.createHmac("sha256", webhookSecret).update(req.body).digest("hex");
      if (sig !== exp) return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = JSON.parse(req.body.toString());
    logger.info(`[Payments] Webhook: ${event.event}`);

    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const email   = payment.notes?.email;
      if (email) {
        await User.findOneAndUpdate(
          { email: email.toLowerCase() },
          { plan: "lifetime", razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id, paidAt: new Date(), isEmailVerified: true }
        );
        logger.info(`[Payments] Webhook: lifetime plan set for ${email}`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error(`[Payments] Webhook error: ${err.message}`);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
