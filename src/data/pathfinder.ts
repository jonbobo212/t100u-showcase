/**
 * Pathfinder — quiz scoring over the real catalog.
 *
 * Country attributes are curated and deliberately conservative (honesty
 * rules): "post-study work" = countries with a well-known named post-study
 * visa route; "Muslim-majority" is factual; "large Muslim community" limited
 * to destinations with widespread halal infrastructure. No promises are
 * derived from these — they only order the shortlist.
 */

export const FIELDS = [
  "Engineering & Technology",
  "Business & Management",
  "Medicine & Health Sciences",
  "Natural Sciences",
  "Social Sciences & Humanities",
  "Computer Science & IT",
  "Law",
  "Arts & Design",
] as const;
export type Field = (typeof FIELDS)[number];

export type Level = "Undergraduate" | "Postgraduate";

export const BUDGETS = [
  { id: "b10", ceiling: 10_000 },
  { id: "b20", ceiling: 20_000 },
  { id: "b40", ceiling: 40_000 },
  { id: "bmax", ceiling: Number.POSITIVE_INFINITY },
] as const;
export type BudgetId = (typeof BUDGETS)[number]["id"];

export type Priority = "halal" | "pr" | "returnHome" | "nearHome";

const MUSLIM_MAJORITY = new Set(["Malaysia", "Saudi Arabia"]);
const LARGE_MUSLIM_COMMUNITY = new Set([
  "United Kingdom",
  "Singapore",
  "Germany",
  "France",
  "Canada",
  "Australia",
]);
/** Countries with a named post-study work route (PGWP, 485, Graduate Route,
 * 18-month job-seeker, orientation year, stay-back, post-study visa). */
const POST_STUDY_WORK = new Set([
  "Canada",
  "Australia",
  "United Kingdom",
  "Germany",
  "New Zealand",
  "Ireland",
  "Netherlands",
]);
/** Short travel from Central Asia. */
const NEAR_CA = new Set(["China", "Malaysia", "Saudi Arabia", "South Korea"]);

export interface QuizUniversity {
  slug: string;
  name: string;
  country: string;
  countrySlug: string;
  rankDisplay: string | null;
  sortRank: number; // numeric rank for scoring (branch = parent rank + 0.5)
  isBranchCampus: boolean;
  parentName?: string;
  tuition: number | null;
  freeApplication: boolean;
  /** category -> [hasUndergraduate, hasPostgraduate] */
  fields: Record<string, [boolean, boolean]>;
}

export interface QuizInput {
  field: Field;
  level: Level;
  budget: BudgetId;
  priorities: Priority[];
  finishedGrade11?: boolean; // 11-year school certificate (no A-levels/foundation)
}

export interface QuizMatch {
  university: QuizUniversity;
  score: number;
  reasons: string[]; // reason keys, localized by the UI
}

export function scorePathfinder(
  input: QuizInput,
  universities: QuizUniversity[]
): QuizMatch[] {
  const ceiling = BUDGETS.find((b) => b.id === input.budget)!.ceiling;
  const levelIdx = input.level === "Undergraduate" ? 0 : 1;
  const wantsReturnHome = input.priorities.includes("returnHome");

  const matches: QuizMatch[] = [];
  for (const u of universities) {
    const offersField = u.fields[input.field]?.[levelIdx];
    if (!offersField) continue;

    const reasons: string[] = ["field"];
    let score = 3;

    // Budget fit (indicative tuition only).
    if (u.tuition === null) {
      score += 0.5;
    } else if (u.tuition <= ceiling) {
      score += 2.5;
      reasons.push("budget");
    } else if (u.tuition <= ceiling * 1.3) {
      score += 0.5;
      reasons.push("budgetStretch");
    } else {
      score -= 3;
    }

    // Rank quality — weighted up when the plan is to return home (brand value).
    const rankTerm = Math.max(0, 1 - u.sortRank / 160);
    score += rankTerm * (wantsReturnHome ? 3 : 1.5);
    if (wantsReturnHome && u.sortRank <= 60) reasons.push("brand");

    if (input.priorities.includes("halal")) {
      if (MUSLIM_MAJORITY.has(u.country)) {
        score += 2;
        reasons.push("muslimMajority");
      } else if (LARGE_MUSLIM_COMMUNITY.has(u.country)) {
        score += 1;
        reasons.push("muslimCommunity");
      }
    }
    if (input.priorities.includes("pr") && POST_STUDY_WORK.has(u.country)) {
      score += 2;
      reasons.push("postStudyWork");
    }
    if (input.priorities.includes("nearHome") && NEAR_CA.has(u.country)) {
      score += 1.5;
      reasons.push("nearHome");
    }

    // Foundation pathway: 11-year certificate holders bridge via Malaysia.
    if (
      input.finishedGrade11 &&
      input.level === "Undergraduate" &&
      u.country === "Malaysia"
    ) {
      score += 1.5;
      reasons.push("foundation");
    }

    if (u.freeApplication) {
      score += 0.5;
      reasons.push("freeApplication");
    }

    matches.push({ university: u, score, reasons });
  }

  matches.sort((a, b) => b.score - a.score);
  const affordable = matches.filter((m) => !m.reasons.includes("budgetStretch") || m.score > 0);
  return (affordable.length >= 5 ? affordable : matches).slice(0, 8);
}
