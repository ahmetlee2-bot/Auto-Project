import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Die KI-Titeloptimierung ist noch nicht konfiguriert. OPENAI_API_KEY muss serverseitig gesetzt sein." }, { status: 503 });
  try {
    const body = await request.json() as { title?: unknown };
    const title = String(body.title || "").trim().slice(0, 500);
    if (title.length < 3) return NextResponse.json({ error: "Bitte gib zuerst einen Produkttitel ein." }, { status: 400 });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        instructions: "Du optimierst Produkttitel für eBay.de. Erzeuge genau einen klaren, suchfreundlichen deutschen Produkttitel mit höchstens 80 Zeichen. Bewahre Marke, Modell und tatsächlich genannte Produktmerkmale. Erfinde keine technischen Daten, Kompatibilität, Rabatte oder Zustandsangaben. Keine Anführungszeichen, kein Zusatztext.",
        input: `Amazon-Produkttitel:\n${title}`,
        max_output_tokens: 100,
        store: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const result = await response.json().catch(() => ({})) as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      error?: { message?: string };
    };
    if (!response.ok) return NextResponse.json({ error: result.error?.message || `KI-Anfrage fehlgeschlagen (HTTP ${response.status}).` }, { status: 502 });
    const optimized = (result.output || []).flatMap((item) => item.type === "message" ? item.content || [] : [])
      .filter((part) => part.type === "output_text").map((part) => part.text || "").join(" ").replace(/[\r\n"“”]+/g, " ").replace(/\s+/g, " ").trim();
    if (!optimized) return NextResponse.json({ error: "Die KI hat keinen Titel zurückgegeben." }, { status: 502 });
    return NextResponse.json({ title: optimized.slice(0, 80).trimEnd() });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "KI-Titeloptimierung fehlgeschlagen." }, { status: 502 });
  }
}
