-- DISPOSABLE integration-test DDL (see README.md in this directory).
-- NEVER a migration: executed only on throwaway Neon branch forks by
-- src/integration/conflict-reference-repo.itest.ts and dropped afterwards.
-- The real forward migration is specified (as intent, not as an applied
-- artifact) in docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md.
--
-- Schema option 3 (provider-neutral benchmark reports + ISW adapter link):
-- one row per report EDITION; the existing isw_reports row remains the
-- citation-registry anchor and is only REFERENCED (nullable FK), never
-- changed. Legal: no prose columns — URLs, keys, dates, enums, versions,
-- instants only. `derived` may hold unit signatures/hashes only (the same
-- rule as isw_reports.derived), never report text.

CREATE TABLE IF NOT EXISTS benchmark_report_editions (
  id serial PRIMARY KEY,
  series text NOT NULL,
  provider text NOT NULL,
  edition_key text NOT NULL,
  edition_label text NOT NULL,
  report_date date NOT NULL,
  canonical_url text,
  norm_version text,
  scope_version text NOT NULL,
  cutoff_at timestamptz,
  published_at timestamptz,
  cutoff_treatment text NOT NULL
    CHECK (cutoff_treatment IN ('present', 'missing', 'malformed_treated_as_missing')),
  published_treatment text NOT NULL
    CHECK (published_treatment IN ('present', 'missing', 'malformed_treated_as_missing')),
  designated_final boolean,
  parse_status text NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending', 'parsed', 'failed')),
  isw_report_id integer REFERENCES isw_reports(id),
  derived jsonb NOT NULL DEFAULT '{}',
  -- the edition key IS series:report_date:label; the check makes a drifted
  -- triple unrepresentable at the DB layer too
  CONSTRAINT benchmark_report_editions_key_shape
    CHECK (edition_key = series || ':' || to_char(report_date, 'YYYY-MM-DD') || ':' || edition_label),
  -- treatment/anchor consistency mirrors the app-layer validator
  CONSTRAINT benchmark_report_editions_cutoff_consistent
    CHECK ((cutoff_treatment = 'present') = (cutoff_at IS NOT NULL)),
  CONSTRAINT benchmark_report_editions_published_consistent
    CHECK ((published_treatment = 'present') = (published_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS benchmark_report_editions_key_idx
  ON benchmark_report_editions (edition_key);
CREATE UNIQUE INDEX IF NOT EXISTS benchmark_report_editions_url_idx
  ON benchmark_report_editions (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS benchmark_report_editions_series_date_idx
  ON benchmark_report_editions (series, report_date);

-- Day-status rows exist ONLY for days with no edition: a CONFIRMED
-- publication gap or a failed discovery probe (the two must never blur —
-- the 2026-08-15 recovery found six "gaps" that were transient probe
-- failures). `published` is always DERIVED from edition existence and is
-- deliberately unrepresentable here; the repository deletes a day row when
-- an edition arrives.
CREATE TABLE IF NOT EXISTS benchmark_series_days (
  series text NOT NULL,
  report_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('publication_gap', 'probe_failed')),
  PRIMARY KEY (series, report_date)
);
