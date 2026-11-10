import { after, NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { drainDraftListingQueue } from "../../../../lib/drafts/listing-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const admin = repricerAdmin();
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: jobs, error } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,attempts,max_attempts,last_error,created_at,started_at,completed_at,updated_at")
    .eq("user_id", user.id).or(`status.in.(queued,processing),created_at.gte.${recentCutoff}`).order("created_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: "Listeleme kuyruğu yüklenemedi." }, { status: 500 });
  const draftIds = [...new Set((jobs || []).map((job) => job.draft_id))];
  const { data: drafts, error: draftsError } = draftIds.length
    ? await admin.from("draft_products").select("id,title,images,status,ebay_item_id,last_error").eq("user_id", user.id).in("id", draftIds)
    : { data: [], error: null };
  if (draftsError) return NextResponse.json({ error: "Kuyruk ürünleri yüklenemedi." }, { status: 500 });
  const draftById = new Map((drafts || []).map((draft) => [draft.id, draft]));
  const queueRows = (jobs || []).filter((job) => job.status === "queued");
  const queuePositions = new Map(queueRows.map((job, index) => [job.id, index + 1]));
  return NextResponse.json({ jobs: (jobs || []).map((job) => ({
    ...job,
    queue_position: job.status === "queued" ? queuePositions.get(job.id) || null : null,
    product: draftById.get(job.draft_id) || null,
  })) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown; draftId?: unknown };
    if (body.action !== "retry" || typeof body.draftId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.draftId)) {
      return NextResponse.json({ error: "Geçerli bir başarısız liste işini seçin." }, { status: 400 });
    }
    const admin = repricerAdmin();
    const { data: previous, error: previousError } = await admin.from("draft_listing_jobs").select("store_id,settings,image_rights_confirmed")
      .eq("user_id", user.id).eq("draft_id", body.draftId).eq("status", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (previousError) throw previousError;
    if (!previous || previous.image_rights_confirmed !== true) return NextResponse.json({ error: "Önceki liste işi bulunamadı veya görsel yayın hakkı onayı eksik." }, { status: 404 });
    const { data: active } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,created_at")
      .eq("user_id", user.id).eq("draft_id", body.draftId).in("status", ["queued", "processing"]).maybeSingle();
    if (active) return NextResponse.json({ success: true, job: active, duplicate: true }, { status: 202 });
    const { data: draft, error: draftError } = await admin.from("draft_products").select("id,status").eq("id", body.draftId).eq("user_id", user.id).maybeSingle();
    if (draftError) throw draftError;
    if (!draft || draft.status === "published") return NextResponse.json({ error: "Taslak bulunamadı veya zaten yayınlanmış." }, { status: 404 });
    const { data: job, error: insertError } = await admin.from("draft_listing_jobs").insert({
      user_id: user.id, draft_id: body.draftId, store_id: previous.store_id, settings: previous.settings,
      image_rights_confirmed: true, status: "queued", progress: 0, current_step: "Sırada bekliyor",
    }).select("id,draft_id,status,progress,current_step,created_at").single();
    if (insertError?.code === "23505") {
      const { data: raced } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,created_at").eq("user_id", user.id).eq("draft_id", body.draftId).in("status", ["queued", "processing"]).maybeSingle();
      if (raced) return NextResponse.json({ success: true, job: raced, duplicate: true }, { status: 202 });
    }
    if (insertError) throw insertError;
    const { error: updateError } = await admin.from("draft_products").update({ status: "publishing", last_error: null, updated_at: new Date().toISOString() }).eq("id", body.draftId).eq("user_id", user.id).neq("status", "published");
    if (updateError) throw updateError;
    after(async () => {
      try { await drainDraftListingQueue(100); }
      catch (error) { console.error("Draft listing retry worker failed:", error); }
    });
    return NextResponse.json({ success: true, job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Listeauftrag konnte nicht erneut eingereiht werden." }, { status: 500 });
  }
}
