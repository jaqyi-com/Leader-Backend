-- ============================================================
-- EMAIL VERIFICATION ENGINE TABLES
-- Schema: final
-- ============================================================

CREATE SCHEMA IF NOT EXISTS final;

-- 1. Main Email Verifications Table (Keeps 97M people rows isolated)
CREATE TABLE IF NOT EXISTS final.email_verifications (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  state VARCHAR(50) NOT NULL,          -- 'deliverable', 'undeliverable', 'risky', 'unknown'
  reason TEXT,
  score NUMERIC(4,3) NOT NULL,        -- 0.000 to 1.000
  syntax_valid BOOLEAN NOT NULL DEFAULT true,
  domain_valid BOOLEAN NOT NULL DEFAULT true,
  mx_valid BOOLEAN NOT NULL DEFAULT true,
  disposable BOOLEAN NOT NULL DEFAULT false,
  role_address BOOLEAN NOT NULL DEFAULT false,
  catch_all BOOLEAN DEFAULT NULL,
  smtp_result VARCHAR(50) DEFAULT 'unknown', -- 'accepted', 'rejected', 'unknown'
  raw_details JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_recheck_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verif_unique_email ON final.email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verif_domain ON final.email_verifications(domain);
CREATE INDEX IF NOT EXISTS idx_email_verif_state ON final.email_verifications(state);
CREATE INDEX IF NOT EXISTS idx_email_verif_checked ON final.email_verifications(checked_at);
CREATE INDEX IF NOT EXISTS idx_email_verif_recheck ON final.email_verifications(next_recheck_at);

-- 2. Disposable Email Domains Table (Populated from open-source GitHub blocklist + manual appends)
CREATE TABLE IF NOT EXISTS final.disposable_domains (
  domain VARCHAR(255) PRIMARY KEY,
  source VARCHAR(50) DEFAULT 'github_blocklist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disposable_domains_created ON final.disposable_domains(created_at);

-- 3. Domain Level Cache (Shared domain intelligence across contacts)
CREATE TABLE IF NOT EXISTS final.domain_cache (
  domain VARCHAR(255) PRIMARY KEY,
  mx_records JSONB,
  has_mx BOOLEAN NOT NULL DEFAULT false,
  is_catch_all BOOLEAN DEFAULT NULL,
  is_disposable BOOLEAN NOT NULL DEFAULT false,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_domain_cache_expires ON final.domain_cache(expires_at);
