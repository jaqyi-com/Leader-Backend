"use strict";

const { verifyEmail, getCachedVerification, saveVerificationResult } = require("./pipeline");
const { validateSyntax, normalizeEmail, suggestDomainCorrection } = require("./syntaxValidator");
const { resolveDomainExistence, resolveMxRecords } = require("./dnsResolver");
const { isDisposableDomain, syncDisposableDomainsFromGitHub, addManualDisposableDomain } = require("./disposableDetector");
const { isRoleAddress, addCustomRolePrefix, getActiveRolePrefixes } = require("./roleDetector");
const { detectCatchAll } = require("./catchAllDetector");
const { probeSmtpMailbox, isSmtpProbingEnabled, isFreemailDomain } = require("./smtpVerifier");
const { computeVerdict } = require("./scoringEngine");
const { createBatchJob, getBatchJob, processBatchJob } = require("./queue");
const { startBulkVerification, generateResultCsv } = require("./batchProcessor");
const constants = require("./constants");

module.exports = {
  verifyEmail,
  getCachedVerification,
  saveVerificationResult,
  validateSyntax,
  normalizeEmail,
  suggestDomainCorrection,
  resolveDomainExistence,
  resolveMxRecords,
  isDisposableDomain,
  syncDisposableDomainsFromGitHub,
  addManualDisposableDomain,
  isRoleAddress,
  addCustomRolePrefix,
  getActiveRolePrefixes,
  detectCatchAll,
  probeSmtpMailbox,
  isSmtpProbingEnabled,
  isFreemailDomain,
  computeVerdict,
  createBatchJob,
  getBatchJob,
  processBatchJob,
  startBulkVerification,
  generateResultCsv,
  constants
};
