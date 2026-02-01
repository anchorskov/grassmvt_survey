# Database Schema Snapshot

**Generated:** 2026-02-01  
**Database:** D1 SQLite (Cloudflare Workers)  
**Environment:** Local (wy_local) and Production (wy)  

## Overview

This database supports:
- **Authentication**: User accounts, sessions, email verification, passkeys, OAuth
- **Surveys**: SurveyJS-based survey storage with versioning and response tracking
- **Scope Routing**: Geographic/district-based survey routing
- **Audit Trail**: Event logging for auth and system actions

---

## Table Directory

### Authentication Tables
- [user](#user)
- [session](#session)
- [user_profile](#user_profile)
- [user_verification](#user_verification)
- [user_address_verification](#user_address_verification)

### Email Verification
- [email_verification_tokens](#email_verification_tokens)

### Password & Security
- [password_reset_tokens](#password_reset_tokens)
- [passkey_credentials](#passkey_credentials)
- [webauthn_challenges](#webauthn_challenges)

### OAuth
- [oauth_states](#oauth_states)
- [oauth_accounts](#oauth_accounts)

### Survey Management
- [surveys](#surveys)
- [survey_versions](#survey_versions)
- [survey_questions](#survey_questions)
- [survey_flags](#survey_flags)

### Survey Responses & Tokens
- [responses](#responses)
- [response_answers](#response_answers)
- [survey_submissions](#survey_submissions)
- [survey_answers](#survey_answers)
- [survey_tokens](#survey_tokens)
- [survey_token_submissions](#survey_token_submissions)

### Scope & Geolocation
- [scope_sessions](#scope_sessions)
- [scope_events](#scope_events)

### Audit & Reporting
- [audit_events](#audit_events)
- [bias_reports](#bias_reports)

---

## Authentication Tables

### user

**Purpose:** Core user identity and password storage  
**Migration:** 0006_auth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID from Lucia) |
| email | TEXT | No | — | **Unique**, case-insensitive normalized via idx_user_email_normalized |
| password_hash | TEXT | No | — | Scrypt hash from @noble/hashes |
| email_verified_at | TEXT | Yes | NULL | **[VERIFICATION]** Timestamp when email confirmed |
| account_status | TEXT | No | 'pending' | **[VERIFICATION]** Enum: 'pending' \| 'active' |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Account creation timestamp |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: email
- idx_user_email_normalized: lower(email) — enforces case-insensitive uniqueness
- idx_user_account_status: account_status

**Relationships:**
- ← session.user_id (1:N)
- ← user_profile.user_id (1:1)
- ← user_verification.user_id (1:1)
- ← password_reset_tokens.user_id (1:N)
- ← email_verification_tokens.user_id (1:N)
- ← passkey_credentials.user_id (1:N)
- ← webauthn_challenges.user_id (1:N)
- ← oauth_accounts.user_id (1:N)
- ← audit_events.user_id (1:N)
- ← responses.user_id (1:N)

---

### session

**Purpose:** Lucia auth session storage  
**Migration:** 0006_auth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (Lucia session ID) |
| expires_at | INTEGER | No | — | Unix timestamp (seconds) |
| user_id | TEXT | No | — | Foreign key to user |
| created_at | TEXT | Yes | NULL | Session creation time |
| last_seen_at | TEXT | Yes | NULL | Last activity timestamp for idle timeout |

**Indexes:**
- PRIMARY KEY: id
- idx_session_user_id: user_id
- idx_session_expires_at: expires_at (for cleanup)
- idx_session_last_seen_at: last_seen_at (for idle timeout)

**Relationships:**
- → user.id (N:1)

---

### user_profile

**Purpose:** Extended user information and geographic context  
**Migration:** 0006_auth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| user_id | TEXT | No | — | Primary key + Foreign key to user |
| email | TEXT | Yes | NULL | Denormalized email copy |
| state | TEXT | Yes | NULL | **[ADDRESS]** U.S. state abbreviation (e.g., 'WY') |
| wy_house_district | TEXT | Yes | NULL | **[ADDRESS]** Wyoming House District for scope routing (deprecated, use state_house_dist) |
| state_senate_dist | TEXT | Yes | NULL | **[ADDRESS]** State Senate District abbreviation (added 0015) |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Profile creation time |
| updated_at | TEXT | No | CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- PRIMARY KEY: user_id
- idx_user_profile_state: state (for geographic queries)
- idx_user_profile_senate_dist: state_senate_dist (for senate district queries)

**Relationships:**
- → user.id (N:1)

---

### user_verification

**Purpose:** Voter registration match results and confidence tracking  
**Migration:** 0006_auth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| user_id | TEXT | No | — | Primary key + Foreign key to user |
| voter_match_status | TEXT | Yes | NULL | Enum: 'matched' \| 'no_match' \| 'ambiguous' |
| residence_confidence | TEXT | Yes | NULL | Confidence level from voter match algorithm |
| last_check_at | TEXT | Yes | NULL | Last time voter registration was checked |
| distance_bucket | TEXT | Yes | NULL | **[ADDRESS]** Address match distance category |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Verification record creation |
| updated_at | TEXT | No | CURRENT_TIMESTAMP | Last verification update |

**Indexes:**
- PRIMARY KEY: user_id
- idx_user_verification_last_check: last_check_at (for re-verification queries)

**Relationships:**
- → user.id (N:1)

---

### user_address_verification

**Purpose:** Persistent geolocation-based address verification results  
**Migration:** 0014_user_address_verification.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| user_id | TEXT | No | — | **[ADDRESS]** Primary key + Foreign key to user (ON DELETE CASCADE) |
| state_fips | TEXT | Yes | NULL | **[ADDRESS]** State FIPS code from verification |
| state_house_dist | TEXT | Yes | NULL | **[ADDRESS]** State House District from verification (renamed from district in 0015) |
| state_senate_dist | TEXT | Yes | NULL | **[ADDRESS]** State Senate District abbreviation (added 0015) |
| addr_lat | REAL | Yes | NULL | **[ADDRESS]** Address latitude from geolocation lookup |
| addr_lng | REAL | Yes | NULL | **[ADDRESS]** Address longitude from geolocation lookup |
| device_lat | REAL | Yes | NULL | **[ADDRESS]** Device latitude from browser geolocation API |
| device_lng | REAL | Yes | NULL | **[ADDRESS]** Device longitude from browser geolocation API |
| distance_m | INTEGER | Yes | NULL | **[ADDRESS]** Haversine distance in meters between address and device |
| accuracy_m | INTEGER | Yes | NULL | **[ADDRESS]** Browser geolocation accuracy in meters |
| verified_at | TEXT | No | — | **[ADDRESS]** Timestamp of successful verification |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | TEXT | No | CURRENT_TIMESTAMP | Record last update timestamp |

**Indexes:**
- PRIMARY KEY: user_id
- idx_user_addr_verify_verified_at: verified_at (for time-based queries)
- idx_user_addr_verify_updated_at: updated_at (for stale data detection)
- idx_user_addr_verify_state_fips: state_fips (for state-level reporting)
- idx_user_addr_verify_house_dist: state_house_dist (for house district queries)
- idx_user_addr_verify_senate_dist: state_senate_dist (for senate district queries)

**Relationships:**
- → user.id (N:1)

---

## Email Verification Tables

### email_verification_tokens

**Purpose:** Secure email verification link tokens  
**Migration:** 0013_email_verification.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| user_id | TEXT | No | — | **[VERIFICATION]** Foreign key to user |
| token_hash | TEXT | No | — | **[VERIFICATION]** SHA-256 hash of token (one-way) |
| expires_at | TEXT | No | — | **[VERIFICATION]** ISO 8601 timestamp (30 min TTL) |
| used_at | TEXT | Yes | NULL | **[VERIFICATION]** Timestamp when token was consumed |
| created_at | TEXT | No | — | ISO 8601 creation timestamp |
| request_ip_hash | TEXT | Yes | NULL | Hashed IP for token issuance tracking |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: token_hash (prevent duplicate usage)
- idx_email_verification_tokens_user_id: user_id
- idx_email_verification_tokens_expires_at: expires_at (for cleanup)
- idx_email_verification_tokens_token_hash: token_hash (for lookup)

**Relationships:**
- → user.id (N:1) [ON DELETE CASCADE]

**Key Features:**
- Token consumed via POST only (not GET) to prevent scanner pre-fetch attacks
- Raw token sent in email, hash stored in DB
- 30-minute expiration
- One-time use (used_at prevents replay)

---

## Password Reset Tables

### password_reset_tokens

**Purpose:** Secure password reset link tokens  
**Migration:** 0007_password_reset_tokens.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| user_id | TEXT | No | — | Foreign key to user |
| token_hash | TEXT | No | — | SHA-256 hash of token (one-way) |
| expires_at | TEXT | No | — | ISO 8601 timestamp (30 min TTL) |
| used_at | TEXT | Yes | NULL | Timestamp when token was consumed |
| created_at | TEXT | No | — | ISO 8601 creation timestamp |
| request_ip_hash | TEXT | Yes | NULL | Hashed IP for token issuance tracking |

**Indexes:**
- PRIMARY KEY: id
- idx_password_reset_tokens_user_id: user_id
- idx_password_reset_tokens_expires_at: expires_at

**Relationships:**
- → user.id (N:1)

---

## Passkey & WebAuthn Tables

### passkey_credentials

**Purpose:** Store user passkey (WebAuthn) credentials  
**Migration:** 0008_passkey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| user_id | TEXT | No | — | Foreign key to user |
| credential_id | TEXT | No | — | **Unique**, WebAuthn credential ID (base64url) |
| public_key | TEXT | No | — | Public key for signature verification |
| counter | INTEGER | No | 0 | WebAuthn signature counter (anti-cloning) |
| transports_json | TEXT | Yes | NULL | JSON array of transports (e.g., ["usb", "nfc"]) |
| created_at | TEXT | No | — | ISO 8601 timestamp |
| last_used_at | TEXT | Yes | NULL | Last successful authentication |
| nickname | TEXT | Yes | NULL | User-friendly name (e.g., "MacBook Pro") |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: credential_id
- idx_passkey_user_id: user_id (for listing user's keys)

**Relationships:**
- → user.id (N:1)

---

### webauthn_challenges

**Purpose:** Store ephemeral WebAuthn registration/assertion challenges  
**Migration:** 0008_passkey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| kind | TEXT | No | — | Enum: 'registration' \| 'assertion' |
| user_id | TEXT | Yes | NULL | Foreign key to user (NULL for registration flow) |
| challenge | TEXT | No | — | Base64url-encoded challenge bytes |
| created_at | TEXT | No | — | ISO 8601 timestamp |
| expires_at | TEXT | No | — | ISO 8601 timestamp (5 min TTL) |
| used_at | TEXT | Yes | NULL | Timestamp when challenge was consumed |
| request_ip_hash | TEXT | Yes | NULL | Hashed IP for challenge issuance |
| request_ua_hash | TEXT | Yes | NULL | Hashed user agent for device tracking |

**Indexes:**
- PRIMARY KEY: id
- idx_webauthn_challenges_expires_at: expires_at
- idx_webauthn_challenges_user_kind: (user_id, kind)

**Relationships:**
- → user.id (N:1, optional)

---

## OAuth Tables

### oauth_states

**Purpose:** PKCE state tracking for OAuth flows  
**Migration:** 0012_oauth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| state | TEXT | No | — | Primary key (random state parameter) |
| provider | TEXT | No | — | OAuth provider name (e.g., 'google') |
| code_verifier | TEXT | No | — | PKCE code verifier (for code exchange) |
| created_at | INTEGER | No | — | Unix timestamp |

**Indexes:**
- PRIMARY KEY: state

**Relationships:** None (temporary state storage)

---

### oauth_accounts

**Purpose:** Link OAuth provider accounts to users  
**Migration:** 0012_oauth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| provider | TEXT | No | — | OAuth provider (e.g., 'google') |
| provider_sub | TEXT | No | — | Provider's subject/user ID |
| user_id | TEXT | No | — | Foreign key to user |
| email | TEXT | Yes | NULL | Email from OAuth provider |
| created_at | INTEGER | No | — | Unix timestamp |

**Indexes:**
- PRIMARY KEY: (provider, provider_sub)
- idx_oauth_accounts_user_id: user_id

**Relationships:**
- → user.id (N:1)

---

## Survey Management Tables

### surveys

**Purpose:** Top-level survey container  
**Migration:** 0001_survey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| slug | TEXT | No | — | **Unique**, URL-friendly identifier (e.g., 'abortion') |
| scope | TEXT | No | — | Enum: 'wy' \| 'public' — determines visibility |
| title | TEXT | No | — | Display name (e.g., 'Abortion Survey (v2)') |
| status | TEXT | No | — | Enum: 'active' \| 'coming_soon' |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Creation timestamp |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: slug
- idx_surveys_slug: slug (for fast lookups)

**Relationships:**
- ← survey_versions.survey_id (1:N)
- ← survey_questions.survey_id (1:N)
- ← survey_submissions.survey_id (1:N)
- ← responses.survey_id (1:N)
- ← bias_reports.survey_id (1:N)
- ← survey_tokens.submission.survey_id (1:N)
- ← survey_flags.survey_id (1:N)

---

### survey_versions

**Purpose:** SurveyJS survey schema with versioning  
**Migration:** 0005_survey_versions.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| version | INTEGER | No | — | Version number (e.g., 1, 2, 3) |
| json_text | TEXT | No | — | Full SurveyJS JSON schema (questions, pages, logic) |
| json_hash | TEXT | No | — | SHA-256 of json_text for deduplication |
| changelog | TEXT | Yes | NULL | Human-readable change notes |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Creation timestamp |
| published_at | TEXT | Yes | NULL | When version was made public |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: (survey_id, version)
- idx_survey_versions_survey_id: survey_id
- idx_survey_versions_published_at: (survey_id, published_at)

**Relationships:**
- → surveys.id (N:1)
- ← responses.survey_version_id (1:N)

**Key Feature:** Immutable schema versions allow responses to reference exact survey definition they answered.

---

### survey_questions

**Purpose:** Legacy question storage (currently unused in v2)  
**Migration:** 0001_survey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| question_key | TEXT | No | — | Identifier (e.g., 'main_question_01') |
| question_json | TEXT | No | — | JSON: {prompt, policy_1..policy_5} |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Creation timestamp |

**Indexes:**
- PRIMARY KEY: id

**Relationships:**
- → surveys.id (N:1)
- ← survey_answers.question_id (1:N)
- ← bias_reports.question_id (1:N)

**Status:** Replaced by survey_versions.json_text in current implementation.

---

### survey_flags

**Purpose:** Flags for survey warnings/status  
**Migration:** 0005_survey_versions.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| survey_version_id | INTEGER | Yes | NULL | Foreign key to survey_versions (optional) |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Flag creation time |
| flag_type | TEXT | No | — | Enum: 'maintenance' \| 'warning' \| 'error' |
| message | TEXT | Yes | NULL | Human-readable flag message |
| contact_optional | TEXT | Yes | NULL | Optional contact info for issue |

**Indexes:**
- PRIMARY KEY: id
- idx_survey_flags_survey_id: survey_id
- idx_survey_flags_created_at: created_at

**Relationships:**
- → surveys.id (N:1)
- → survey_versions.id (N:1, optional)

---

## Survey Response Tables

### responses

**Purpose:** Individual survey response with metadata  
**Migration:** 0005_survey_versions.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| survey_version_id | INTEGER | No | — | Foreign key to survey_versions (tracks which schema) |
| user_id | TEXT | Yes | NULL | **[OPTIONAL]** Foreign key to user (if logged in) |
| version_hash | TEXT | No | — | SHA-256 hash of survey_versions.json_text at time of response |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Response submission time |
| submitted_at | TEXT | Yes | NULL | User submission timestamp (may differ from created_at) |
| updated_at | TEXT | Yes | NULL | Last update timestamp (for response editing) |
| verified_flag | INTEGER | No | 0 | Boolean: 1 if response verified against voter roll |
| district | TEXT | Yes | NULL | **[ADDRESS]** House District associated with response |
| senate_district | TEXT | Yes | NULL | **[ADDRESS]** State Senate District of response origin (added 0015) |
| ip_hash | TEXT | Yes | NULL | Hashed IP for geographic/fraud detection |
| user_hash | TEXT | Yes | NULL | Hash of user fingerprint (browser/device) |
| edit_count | INTEGER | Yes | NULL | Number of times response was edited |

**Indexes:**
- PRIMARY KEY: id
- idx_responses_survey_id: survey_id
- idx_responses_created_at: created_at
- idx_responses_user_id: user_id
- idx_responses_senate_dist: senate_district (for senate district reporting, added 0015)
- UNIQUE: idx_responses_user_surveyver_unique (user_id, survey_version_id) — one response per user per version

**Relationships:**
- → surveys.id (N:1)
- → survey_versions.id (N:1)
- → user.id (N:1, optional)
- ← response_answers.response_id (1:N)

---

### response_answers

**Purpose:** Individual question responses within a survey response  
**Migration:** 0005_survey_versions.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| response_id | TEXT | No | — | Foreign key to responses |
| question_name | TEXT | No | — | Question identifier from SurveyJS (e.g., 'life_protection_start') |
| value_json | TEXT | No | — | JSON value of answer (string, number, array, or object) |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Answer creation time |

**Indexes:**
- PRIMARY KEY: id
- idx_response_answers_response_id: response_id
- idx_response_answers_created_at: created_at

**Relationships:**
- → responses.id (N:1)

---

### survey_submissions

**Purpose:** Legacy submission tracking (currently unused)  
**Migration:** 0001_survey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID receipt) |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| status | TEXT | No | — | Enum: 'unverified' \| 'verified' |
| fn | TEXT | Yes | NULL | **[ADDRESS]** First name |
| ln | TEXT | Yes | NULL | **[ADDRESS]** Last name |
| email | TEXT | Yes | NULL | **[ADDRESS]** Email address |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Submission time |
| verified_at | TEXT | Yes | NULL | Verification timestamp |

**Indexes:**
- PRIMARY KEY: id

**Relationships:**
- → surveys.id (N:1)
- ← survey_answers.submission_id (1:N)
- ← survey_token_submissions.submission_id (1:N)
- ← bias_reports.submission_id (1:N)

**Status:** Replaced by responses table in current implementation.

---

### survey_answers

**Purpose:** Legacy answer storage (currently unused)  
**Migration:** 0001_survey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| submission_id | TEXT | No | — | Foreign key to survey_submissions |
| question_id | INTEGER | No | — | Foreign key to survey_questions |
| selected_key | TEXT | No | — | Policy selection (e.g., 'policy_1'..'policy_5') |
| biased | INTEGER | No | 0 | Boolean: flagged as biased (0/1) |
| bias_note | TEXT | Yes | NULL | Bias flag reason |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Creation time |

**Indexes:**
- PRIMARY KEY: (submission_id, question_id)

**Relationships:**
- → survey_submissions.id (N:1)
- → survey_questions.id (N:1)

**Status:** Replaced by response_answers table in current implementation.

---

## Survey Token Tables

### survey_tokens

**Purpose:** Multi-survey token tracking  
**Migration:** 0004_survey_tokens.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| token | TEXT | No | — | Primary key (token string) |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Token creation |
| updated_at | TEXT | No | CURRENT_TIMESTAMP | Last update |
| status | TEXT | No | — | Enum: 'active' \| 'completed' |

**Indexes:**
- PRIMARY KEY: token

**Relationships:**
- ← survey_token_submissions.token (1:N)

---

### survey_token_submissions

**Purpose:** Track which surveys completed under a token  
**Migration:** 0004_survey_tokens.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| token | TEXT | No | — | Foreign key to survey_tokens |
| submission_id | TEXT | No | — | Foreign key to survey_submissions |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Completion time |

**Indexes:**
- PRIMARY KEY: (token, submission_id)
- idx_survey_token_submissions_token: token

**Relationships:**
- → survey_tokens.token (N:1)
- → survey_submissions.id (N:1)
- → surveys.id (N:1)

---

## Scope & Geolocation Tables

### scope_sessions

**Purpose:** Geographic/scope context for survey routing  
**Migration:** 0003_scope_scaffold.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | TEXT | No | — | Primary key (UUID) |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Session creation |
| updated_at | TEXT | No | CURRENT_TIMESTAMP | Last update |
| status | TEXT | No | — | Enum: 'active' \| 'resolved' |
| match_source | TEXT | No | — | How scope was determined (e.g., 'voter_roll', 'user_input') |
| match_quality | TEXT | No | — | Confidence (e.g., 'high', 'medium', 'low') |
| scope_level | TEXT | No | — | **[ADDRESS]** Geographic level (e.g., 'state', 'house_district') |
| scopes_json | TEXT | No | — | JSON array of matching scopes |
| geo_json | TEXT | No | — | **[ADDRESS]** JSON geographic data |
| districts_json | TEXT | No | — | **[ADDRESS]** JSON array of districts (e.g., WY House Districts) |
| risk_json | TEXT | No | — | JSON risk assessment data |
| survey_slug | TEXT | Yes | NULL | Survey to present (e.g., 'abortion') |

**Indexes:**
- PRIMARY KEY: id
- idx_scope_sessions_created_at: created_at
- idx_scope_sessions_status: status

**Relationships:**
- ← scope_events.session_id (1:N)

---

### scope_events

**Purpose:** Event log for scope session changes  
**Migration:** 0003_scope_scaffold.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| session_id | TEXT | No | — | Foreign key to scope_sessions |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Event timestamp |
| event_type | TEXT | No | — | Event category (e.g., 'matched', 'error') |
| details_json | TEXT | No | — | JSON event details |

**Indexes:**
- PRIMARY KEY: id
- idx_scope_events_session: session_id

**Relationships:**
- → scope_sessions.id (N:1)

---

## Audit & Reporting Tables

### audit_events

**Purpose:** Security and auth event logging  
**Migration:** 0006_auth_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| user_id | TEXT | Yes | NULL | Optional foreign key to user |
| event_type | TEXT | No | — | Event type (e.g., 'signup_success', 'login_failed', 'email_verify_requested') |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Event timestamp |
| ip_hash | TEXT | Yes | NULL | Hashed IP address |
| user_agent_hash | TEXT | Yes | NULL | Hashed user agent |
| metadata_json | TEXT | Yes | NULL | JSON with event-specific data (reason, email_id, etc.) |

**Indexes:**
- PRIMARY KEY: id
- idx_audit_events_user_id: user_id
- idx_audit_events_created_at: created_at

**Relationships:**
- → user.id (N:1, optional)

**Key Events:**
- `signup_success`: User account created, email sent
- `signup_failed`: Validation, duplicate email, or token creation error
- `login_failed`: Invalid credentials or unverified email
- `email_verify_requested`: Resend verification email
- `password_reset_requested`: Password reset email sent
- `password_reset_completed`: Password successfully changed
- `email_verify_confirmed`: User completed email verification (account now active)

---

### bias_reports

**Purpose:** Report suspected survey bias or issues  
**Migration:** 0001_survey_tables.sql

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | INTEGER | No | — | Primary key (autoincrement) |
| survey_id | INTEGER | No | — | Foreign key to surveys |
| submission_id | TEXT | Yes | NULL | Optional foreign key to survey_submissions |
| question_id | INTEGER | Yes | NULL | Optional foreign key to survey_questions |
| note | TEXT | Yes | NULL | Report text |
| created_at | TEXT | No | CURRENT_TIMESTAMP | Report timestamp |

**Indexes:**
- PRIMARY KEY: id

**Relationships:**
- → surveys.id (N:1)
- → survey_submissions.id (N:1, optional)
- → survey_questions.id (N:1, optional)

---

## Schema Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Auth Tables** | 5 | Active (now includes user_address_verification) |
| **Verification Tables** | 1 | Active (Email) |
| **Password/Security** | 3 | Active (Passkeys + WebAuthn) |
| **OAuth** | 2 | Active |
| **Survey Core** | 3 | Active (surveys, versions, questions) |
| **Survey Responses** | 2 | Active (responses, response_answers) |
| **Survey Legacy** | 3 | Deprecated (submissions, answers, flags) |
| **Survey Tokens** | 2 | Active |
| **Scope/Geo** | 2 | Active |
| **Audit** | 2 | Active |
| **TOTAL** | 27 | — |

---

## Key Design Patterns

### 1. **Verification Fields**
Identified fields related to email verification:
- `user.email_verified_at` — when email was confirmed
- `user.account_status` — 'pending' (unverified) or 'active' (verified)
- `email_verification_tokens.*` — entire table for token-based verification
- `user_verification.*` — voter registration matching

### 2. **Address/Geographic Fields**
Identified fields for location tracking and geolocation-based access control:
- `user_profile.state` — user's state abbreviation
- `user_profile.wy_house_district` — Wyoming House District (legacy)
- `user_profile.state_senate_dist` — State Senate District abbreviation (added 0015)
- `user_address_verification.*` — complete geolocation verification record with device/address coords, distance, senate/house districts
- `user_verification.distance_bucket` — address match distance category
- `responses.district` — response origin house district
- `responses.senate_district` — response origin state senate district (added 0015)
- `scope_sessions.*` — all fields contain geographic/district data
- `survey_submissions.fn, ln, email` — legacy name/address
- `user_verification.residence_confidence` — address match confidence

### 3. **Immutable Audit Trail**
- `survey_versions` — immutable snapshots of survey definitions
- `responses.version_hash` — links response to exact survey schema used
- `audit_events` — logs all significant auth/system events

### 4. **Security Hashing**
Sensitive data hashed before storage:
- `password_reset_tokens.token_hash` — SHA-256 of reset tokens
- `email_verification_tokens.token_hash` — SHA-256 of verification tokens
- `responses.ip_hash` — hashed IP addresses
- `responses.user_hash` — hashed browser fingerprint
- `audit_events.ip_hash`, `user_agent_hash` — hashed request metadata

### 5. **One-Time Tokens**
Both password reset and email verification use secure patterns:
- Raw token sent in email
- Hash stored in database
- `used_at` field prevents replay
- Expiration time enforced (`expires_at`)
- IP hash optionally tracked for abuse detection

---

## Uncertainties & Missing Information

1. **responses.user_id Foreign Key**
   - The column exists but foreign key constraint may not be explicitly defined in migrations
   - Status: Assumed but not verified in migration 0009

2. **Legacy Tables Still Present**
   - `survey_submissions`, `survey_answers`, `survey_questions` appear unused in favor of `responses` and `response_answers`
   - Status: Should be archived or removed to reduce complexity

3. **User Profile Denormalization**
   - `user_profile.email` duplicates `user.email`
   - Status: Consider removing or clarifying use case

4. **OAuth Timestamps**
   - `oauth_states.created_at` and `oauth_accounts.created_at` use INTEGER (Unix) instead of TEXT (ISO 8601)
   - Status: Inconsistent with other tables; may need normalization

5. **Session Timestamps**
   - `session.created_at` and `session.last_seen_at` may not be fully populated in all deployments
   - Status: Migration 0011 marked as "idempotent" with commented-out updates

6. **Scope Sessions**
   - Purpose and current usage unclear
   - Status: Design suggests advanced geographic routing not yet fully implemented

7. **Foreign Key Enforcement**
   - D1 SQLite may not enforce FK constraints by default
   - Status: Verify with `PRAGMA foreign_keys;`

8. **Soft Deletes**
   - No `is_deleted` or `deleted_at` fields for data retention
   - Status: Hard deletes likely; consider adding soft delete support if needed

9. **Response Editing**
   - `responses.edit_count` and `updated_at` present but no audit trail for edits
   - Status: Migration 0009 incomplete; no edit history table

10. **Voter Roll Integration**
    - References to voter matching and districts suggest integration with external voter database
    - Status: External data source not documented; check docs/

---

## Recommendations

1. **Cleanup**: Archive or remove legacy survey tables (survey_submissions, survey_answers, survey_questions)
2. **Consistency**: Standardize timestamp formats (all TEXT ISO 8601 or all INTEGER Unix)
3. **Auditing**: Add response_edits table to track changes to survey responses
4. **Documentation**: Add ER diagram showing all relationships
5. **FK Enforcement**: Verify `PRAGMA foreign_keys` is enabled in D1 configuration
6. **Verification Status**: Add index on (user.account_status, created_at) for pending account cleanup

---

**Generated:** 2026-02-01  
**Last Updated By:** Database Schema Scan  
**Migrations Applied:** 15 (0001 through 0015)
