const mongoose = require("mongoose");

const pipelineStageSchema = new mongoose.Schema({
  stageId:     { type: String, required: true },
  name:        { type: String, required: true },
  color:       { type: String, default: "#94a3b8" },
  probability: { type: Number, default: 0 },
  order:       { type: Number, required: true },
}, { _id: false });

const pipelineSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  stages:    { type: [pipelineStageSchema], default: [] },
  isDefault: { type: Boolean, default: false },
  orgId:     { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
}, { timestamps: true });

// Ensure one default pipeline per org
pipelineSchema.index({ orgId: 1, isDefault: 1 });

const DEFAULT_STAGES = [
  { stageId: "new_lead",     name: "New Lead",        color: "#94a3b8", probability: 10,  order: 0 },
  { stageId: "contacted",    name: "Contacted",       color: "#3b82f6", probability: 20,  order: 1 },
  { stageId: "qualified",    name: "Qualified",       color: "#8b5cf6", probability: 40,  order: 2 },
  { stageId: "proposal",     name: "Proposal Sent",   color: "#f59e0b", probability: 60,  order: 3 },
  { stageId: "negotiation",  name: "Negotiation",     color: "#f97316", probability: 75,  order: 4 },
  { stageId: "won",          name: "Won",             color: "#22c55e", probability: 100, order: 5 },
  { stageId: "lost",         name: "Lost",            color: "#ef4444", probability: 0,   order: 6 },
];

/**
 * Get or create the default pipeline for an org.
 */
pipelineSchema.statics.getOrCreateDefault = async function (orgId) {
  let pipeline = await this.findOne({ orgId, isDefault: true });
  if (!pipeline) {
    pipeline = await this.create({
      name: "Sales Pipeline",
      stages: DEFAULT_STAGES,
      isDefault: true,
      orgId,
    });
  }
  return pipeline;
};

module.exports = mongoose.models.Pipeline || mongoose.model("Pipeline", pipelineSchema);
