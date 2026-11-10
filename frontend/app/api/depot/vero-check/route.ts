import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { analyzeProductVero } from "../../../../lib/depot/veroChecker";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      asin?: unknown;
      title?: unknown;
      brand?: unknown;
      description?: unknown;
      supplier?: unknown;
      sourceMarketplace?: unknown;
    };
    const asin = String(body.asin || "").trim();
    const title = String(body.title || "").trim();
    const brand = body.brand ? String(body.brand).trim() : null;
    const description = body.description ? String(body.description).trim() : null;
    const supplier = body.supplier ? String(body.supplier).trim() : null;
    const sourceMarketplace = body.sourceMarketplace ? String(body.sourceMarketplace).trim() : null;

    if (!asin || !title) {
      return NextResponse.json({ error: "ASIN ve ürün başlığı gereklidir." }, { status: 400 });
    }

    const result = await analyzeProductVero({
      asin,
      title,
      brand,
      description,
      supplier,
      sourceMarketplace,
    });
    return NextResponse.json({ result, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "VERO analizi yapılamadı." },
      { status: 500 },
    );
  }
}
