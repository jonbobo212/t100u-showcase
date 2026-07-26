import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { fundingPrograms, citizenshipLabel } from "@/data/funding";
import {
  getCountries,
  getPrograms,
  getStats,
  getUniversities,
  getUniversityBySlug,
  getProgramsForUniversity,
} from "@/lib/data";

/* ── System prompt ─────────────────────────────────────────────────────────
 * Rendered deterministically at module load so the prompt-cache prefix is
 * byte-stable across requests (see docs/HANDOFF notes: honesty rules apply). */

function buildCatalog(): string {
  return getUniversities()
    .map((u) => {
      const rank = u.isBranchCampus
        ? `branch of ${u.parentName} (QS ${u.parentRankDisplay})`
        : `QS ${u.rankDisplay ?? "—"}`;
      const tuition = u.tuitionUsdPerYear
        ? `~$${u.tuitionUsdPerYear.toLocaleString("en-US")}/yr`
        : "tuition n/a";
      const route = u.freeApplication ? "free application" : "elite concierge";
      return `${u.slug} | ${u.name} | ${rank} | ${u.city}, ${u.country} | ${tuition} | ${route}`;
    })
    .join("\n");
}

const stats = getStats();
const countryList = getCountries()
  .map((c) => `${c.name} (${c.universityCount})`)
  .join(", ");

export const SYSTEM_PROMPT = `You are the T100U adviser — a knowledgeable, honest study-abroad counselor for t100u.com, a platform that helps students (mainly from Uzbekistan, Kazakhstan, Tajikistan, Kyrgyzstan and the wider CIS) apply exclusively to QS Top 100 universities.

# Facts you may rely on
- Catalog: ${stats.universities} institutions hold QS 2027 Top 100 positions; ${stats.programs.toLocaleString("en-US")} degree programs; ${stats.countries} destination countries: ${countryList}.
- Two service routes: "Free application" universities cost the student $0 for full application support. "Elite Concierge" universities (Oxford, Cambridge, US Ivies, NUS and similar) carry one flat, disclosed fee of USD 500–1,000 — never a percentage of anything.
- Budget route: Monash, Nottingham and Southampton run full branch campuses in Malaysia — the same degree certificate at roughly one third of the cost, and Malaysian foundation programs bridge students who finished 11 years of school (foundation scholarships up to 100% for strong IELTS/SAT results).
- Visa: T100U supports and guides student visa applications (checklists, document review, timelines). It does NOT lodge visas on anyone's behalf and NEVER guarantees outcomes. Processing times are set by universities and embassies.

# University index (slug | name | rank | location | indicative intl tuition | route)
${buildCatalog()}

# Tools
Use the tools to look up programs, requirements and funding before answering specifics — never invent program names, requirements, deadlines or scholarship amounts. Tuition figures and program details are indicative and pending verification; say so when quoting them.

# Hard rules
- If asked how the free route is funded, say: partner universities cover the cost of application support, so it is free for the student.
- NEVER invent statistics (no "500+ students placed", no visa-approval percentages). Only use the derived numbers above.
- NEVER promise admission, scholarships, visa outcomes, or processing times.
- Cite the ranking edition as "QS 2027" when discussing ranks.
- Stay on topic: studying abroad, universities in the catalog, programs, funding, T100U services. For anything else, politely decline and steer back.
- You are not a substitute for the human consultation. For personal case assessment, direct users to the free consultation form (link: /#consult).

# Useful links (relative to t100u.com; prefix the locale for ru/uz, e.g. /ru/services)
- University page: /universities/{slug} · All universities: /universities
- Country pages: /destinations/{country-slug} · Services & pricing: /services
- Scholarships: /scholarships (add ?u={slug} to filter for a university)
- Pathfinder quiz (4-step university matcher — recommend it when someone is unsure where to start): /pathfinder
- Free consultation: /#consult · Apply via Aplify: https://www.aplify.org/apply/{slug}?source=t100u

# Style
- Answer in the language the user writes in (English, Russian or Uzbek). Match their register; be warm but concrete.
- Keep responses short and conversational — this is a chat widget, not an essay. Use at most a few sentences or a compact list, then offer to go deeper.
- When a university or country is discussed, include the relevant link.`;

/* ── Tools ─────────────────────────────────────────────────────────────── */

export const ADVISER_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_university_details",
    description:
      "Get verified details for one university in the catalog: programs summary, entry and English requirements, funding count. Call this whenever the user asks about a specific university. Use the slug from the university index.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "University slug from the index, e.g. 'university-of-oxford'",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "search_programs",
    description:
      "Search the 1,391 degree programs. Call this when the user asks what they can study, or about a field (e.g. 'computer science in the UK'), or about programs at a university. At least one filter must be given.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword matched against program name and category, e.g. 'computer science'",
        },
        university_slug: { type: "string" },
        country: { type: "string", description: "Destination country name" },
        study_level: {
          type: "string",
          enum: ["Undergraduate", "Postgraduate"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_funding_options",
    description:
      "List scholarships and funding routes (government scholarships like El-Yurt Umidi, bank financing, university awards). Call when the user asks about scholarships, funding, or affording their studies. Filter by destination country and/or citizenship.",
    input_schema: {
      type: "object",
      properties: {
        destination_country: {
          type: "string",
          description: "Country the student wants to study in",
        },
        university_slug: { type: "string" },
      },
      required: [],
    },
  },
];

/* ── Tool execution (local JSON — no network) ──────────────────────────── */

const MAX_RESULTS = 12;

export function runAdviserTool(name: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, string | undefined>;
  switch (name) {
    case "get_university_details":
      return getUniversityDetails(String(args.slug ?? ""));
    case "search_programs":
      return searchPrograms(args);
    case "get_funding_options":
      return getFundingOptions(args);
    default:
      return `Unknown tool: ${name}`;
  }
}

function getUniversityDetails(slug: string): string {
  const u = getUniversityBySlug(slug.trim().toLowerCase());
  if (!u) return `No university with slug "${slug}". Check the index for valid slugs.`;
  const programs = getProgramsForUniversity(u.id);
  const ug = programs.filter((p) => p.studyLevel === "Undergraduate").length;
  const pg = programs.filter((p) => p.studyLevel === "Postgraduate").length;
  const entry = [...new Set(programs.map((p) => p.entryRequirement))].slice(0, 6);
  const english = [...new Set(programs.map((p) => p.englishRequirement))].slice(0, 6);
  return JSON.stringify({
    name: u.name,
    slug: u.slug,
    rank: u.isBranchCampus
      ? `branch campus of ${u.parentName} (QS 2027 ${u.parentRankDisplay})`
      : `QS 2027 ${u.rankDisplay}`,
    location: `${u.city}, ${u.country}`,
    founded: u.founded,
    type: u.type,
    indicative_intl_tuition_usd_per_year: u.tuitionUsdPerYear,
    service_route: u.freeApplication
      ? "Free application (full support at $0 for the student)"
      : "Elite Concierge (flat USD 500-1,000, disclosed upfront)",
    strengths: u.strengths,
    programs: programs.length
      ? { undergraduate: ug, postgraduate: pg, entry_requirements: entry, english_requirements: english }
      : "No program list yet for this university - invite the user to the free consultation (/#consult) for options.",
    links: {
      details: `/universities/${u.slug}`,
      apply: `https://www.aplify.org/apply/${u.slug}?source=t100u`,
      scholarships: `/scholarships?u=${u.slug}`,
    },
    note: "Tuition and program details are indicative, pending verification.",
  });
}

function searchPrograms(args: Record<string, string | undefined>): string {
  const query = args.query?.trim().toLowerCase();
  const slug = args.university_slug?.trim().toLowerCase();
  const country = args.country?.trim().toLowerCase();
  const level = args.study_level;
  if (!query && !slug && !country) {
    return "Provide at least one filter: query, university_slug, or country.";
  }
  const universities = getUniversities();
  const bySlug = slug ? getUniversityBySlug(slug) : undefined;
  if (slug && !bySlug) return `No university with slug "${slug}".`;
  const uniById = new Map(universities.map((u) => [u.id, u]));

  const matches = getPrograms().filter((p) => {
    const u = uniById.get(p.universityId);
    if (!u) return false;
    if (bySlug && p.universityId !== bySlug.id) return false;
    if (country && u.country.toLowerCase() !== country) return false;
    if (level && p.studyLevel !== level) return false;
    if (
      query &&
      !p.name.toLowerCase().includes(query) &&
      !p.category.toLowerCase().includes(query)
    )
      return false;
    return true;
  });

  const shown = matches.slice(0, MAX_RESULTS).map((p) => {
    const u = uniById.get(p.universityId)!;
    return {
      program: p.name,
      level: p.studyLevel,
      university: u.name,
      university_link: `/universities/${u.slug}`,
      country: u.country,
      duration: p.duration,
      entry: p.entryRequirement,
      english: p.englishRequirement,
      indicative_tuition_usd: p.tuitionUsd,
    };
  });
  return JSON.stringify({
    total_matches: matches.length,
    showing: shown.length,
    programs: shown,
    note: "Program details are indicative, pending verification.",
  });
}

function getFundingOptions(args: Record<string, string | undefined>): string {
  const country = args.destination_country?.trim().toLowerCase();
  const slug = args.university_slug?.trim().toLowerCase();
  const u = slug ? getUniversityBySlug(slug) : undefined;
  if (slug && !u) return `No university with slug "${slug}".`;

  const list = fundingPrograms.filter((p) => {
    if (u) {
      if (p.universitySlugs) return p.universitySlugs.includes(u.slug);
      if (p.branchCampusOnly) return u.isBranchCampus;
      if (p.kind === "ca_government" || p.kind === "ca_bank") return true;
      if (p.destinations === "all") return true;
      return p.destinations.includes(u.country);
    }
    if (country) {
      if (p.kind === "ca_government" || p.kind === "ca_bank") return true;
      if (p.branchCampusOnly) return country === "malaysia";
      if (p.destinations === "all") return true;
      return p.destinations.some((d) => d.toLowerCase() === country);
    }
    return true;
  });

  return JSON.stringify({
    total: list.length,
    funding: list.slice(0, MAX_RESULTS).map((p) => ({
      name: p.name,
      kind: p.kind,
      level: p.levels,
      coverage: p.coverage,
      eligible_citizenship: citizenshipLabel(p),
      summary: p.summary,
    })),
    note: "Conditions change every cycle - always verify with the official source; details at /scholarships.",
  });
}
