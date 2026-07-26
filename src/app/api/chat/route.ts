import Anthropic from "@anthropic-ai/sdk";
import { ADVISER_TOOLS, SYSTEM_PROMPT, runAdviserTool } from "@/lib/adviser";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.T100U_CHAT_MODEL ?? "claude-opus-5";
const MAX_TURNS = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOOL_ROUNDS = 5;

/* Best-effort per-IP rate limit (per serverless instance). */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

interface ChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
}

function parseBody(raw: unknown): ChatBody | null {
  if (!raw || typeof raw !== "object") return null;
  const messages = (raw as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_TURNS)
    return null;
  const clean: ChatBody["messages"] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.trim().length === 0) return null;
    clean.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  if (clean[clean.length - 1].role !== "user") return null;
  return { messages: clean };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Adviser not configured", { status: 503 });
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return new Response("Too many requests", { status: 429 });
  }

  let body: ChatBody | null = null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) return new Response("Bad request", { status: 400 });

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            output_config: { effort: "low" },
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: ADVISER_TOOLS,
            messages,
          });
          s.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
          const final = await s.finalMessage();

          if (final.stop_reason === "tool_use") {
            const toolUses = final.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
            );
            messages.push({ role: "assistant", content: final.content });
            messages.push({
              role: "user",
              content: toolUses.map(
                (t): Anthropic.ToolResultBlockParam => ({
                  type: "tool_result",
                  tool_use_id: t.id,
                  content: runAdviserTool(t.name, t.input),
                })
              ),
            });
            continue;
          }

          if (final.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: final.content });
            continue;
          }

          if (final.stop_reason === "refusal") {
            controller.enqueue(
              encoder.encode(
                "I can't help with that here — but I'm happy to talk about universities, programs, and funding. For anything personal, book a free consultation at /#consult."
              )
            );
          }
          break;
        }
      } catch (error) {
        console.error("t100u adviser error:", error);
        controller.enqueue(encoder.encode("⚠"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
