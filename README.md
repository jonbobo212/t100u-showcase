# T100U — The Top 100 Index

**AI-native university placement for Central Asia. Live at [t100u.com](https://t100u.com).**

T100U helps students from Uzbekistan, Tajikistan, Kyrgyzstan and the wider CIS apply exclusively to **QS World Ranking 2027 Top 100 universities** — with verified rankings, 1,391 real degree programs, and full support in **Uzbek, Russian and English**.

This repository contains **curated excerpts of the production codebase**, published for technical review as part of the **President AI Award** application (T100U team — IT Park Uzbekistan resident). It is not the full application and does not build standalone. **All rights reserved.**

## The product ecosystem (all built in-house)

| Product | URL | Role |
|---|---|---|
| **T100U** | [t100u.com](https://t100u.com) | Discovery: QS Top-100 index, program search, AI adviser, Pathfinder quiz — EN/RU/UZ |
| **Aplify** | [aplify.org](https://www.aplify.org) | Application CRM: per-university apply forms, lead inbox with SLA tracking, partner-agency network |
| **Aspira** | [aspira.study](https://www.aspira.study) | Exam-prep app: IELTS/SAT plans driven by the student's target university's real requirements |

Nothing is licensed from third parties — the entire stack is ours.

## Where the AI is

### 1. Grounded AI study adviser — [`src/lib/adviser.ts`](src/lib/adviser.ts)

A Claude-powered counselor embedded on t100u.com that **cannot invent facts**:

- The system prompt is rendered **deterministically at module load** from the verified catalog (byte-stable prefix → full prompt caching on every request).
- Three tools run over local verified JSON — `get_university_details`, `search_programs`, `get_funding_options` — so program names, IELTS requirements and scholarship terms come from data, never from model memory.
- An **honesty policy is enforced in-prompt**: no invented statistics, no admission/visa promises, indicative figures labeled as such. The honesty policy is the product.
- Answers in the user's language — Uzbek, Russian or English.

### 2. Streaming tool-use loop — [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts)

A Next.js route handler implementing a multi-round agentic loop: streamed text deltas, tool execution between rounds, strict input validation, per-IP rate limiting, and graceful refusal handling.

### 3. Transparent matching — [`src/data/pathfinder.ts`](src/data/pathfinder.ts)

The Pathfinder quiz scores the real catalog against the student's field, level, budget and priorities. Country attributes are curated and deliberately conservative — the scoring orders a shortlist; it never promises outcomes.

### 4. Cross-app attribution — [`src/components/ref-forwarder.tsx`](src/components/ref-forwarder.tsx) + [`src/lib/referral.ts`](src/lib/referral.ts)

The partner-agency network runs on first-touch `?ref=` attribution: a 90-day cookie set at the edge, forwarded to sibling apps by **click-time link decoration** — so every page stays statically generated and CDN-cacheable while attribution still travels across domains.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · next-intl (~480 statically generated pages across 3 locales) · Claude API (Anthropic) · Supabase (Postgres + RLS).

## Links

- Live site: **[t100u.com](https://t100u.com)**
- Pitch deck: [t100u.com/pitch.pdf](https://t100u.com/pitch.pdf)
- Application CRM: [aplify.org](https://www.aplify.org) · Prep app: [aspira.study](https://www.aspira.study)

---

© T100U. Excerpts published for award review only — all rights reserved.
