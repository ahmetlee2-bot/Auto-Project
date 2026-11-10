import { after, NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { drainDraftListingQueue } from "../../../../lib/drafts/listing-jobs";
import type { EbayListingSetup } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";
export const maxDuration = 300;

type PublishSettings = Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">;

function validSettings(settings: PublishSettings) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(settings.merchantLocationKey)
    && /^[A-Za-z0-9_-]{1,64}$/.test(settings.fulfillmentPolicyId)
    && /^[A-Za-z0-9_-]{1,64}$/.test(settings.paymentPolicyId)
    && /^[A-Za-z0-9_-]{1,64}$/.test(settings.returnPolicyId);
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json() as { ids?: unknown; id?: unknown; storeId?: unknown; imageRightsConfirmed?: unknown; settings?: Partial<PublishSettings> };
    if (body.imageRightsConfirmed !== true) return NextResponse.json({ error: "Ürün görsellerini yayınlama haklarını onaylamanız gerekiyor." }, { status: 400 });
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map(String) : body.id ? [String(body.id)] : [])];
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      return NextResponse.json({ error: "1 ile 100 arasında geçerli taslak seçin." }, { status: 400 });
    }
    const settings: PublishSettings = {
      merchantLocationKey: String(body.settings?.merchantLocationKey || ""),
      fulfillmentPolicyId: String(body.settings?.fulfillmentPolicyId || ""),
      paymentPolicyId: String(body.settings?.paymentPolicyId || ""),
      returnPolicyId: String(body.settings?.returnPolicyId || ""),
    };
    const admin = repricerAdmin();
    const requestedStoreId = String(body.storeId || "").trim() || undefined;
    let storeId = requestedStoreId || null;
    if (requestedStoreId) {
      const { data: store, error: storeError } = await admin.from("ebay_stores").select("id,marketplace_id")
        .eq("id", requestedStoreId).eq("user_id", user.id).eq("status", "active").maybeSingle();
      if (storeError) throw storeError;
      if (!store || store.marketplace_id !== "EBAY_DE") return NextResponse.json({ error: "Der ausgewählte eBay-Shop ist nicht aktiv oder gehört nicht zu diesem Konto." }, { status: 400 });
      storeId = store.id;
    } else {
      const { data: stores, error: storesError } = await admin.from("ebay_stores").select("id,marketplace_id")
        .eq("user_id", user.id).eq("marketplace_id", "EBAY_DE").eq("status", "active").limit(2);
      if (storesError) throw storesError;
      if ((stores || []).length > 1) return NextResponse.json({ error: "Bitte wähle im Shop-Umschalter einen eBay-DE-Shop aus." }, { status: 400 });
      storeId = stores?.[0]?.id || null;
    }
    if (!validSettings(settings)) return NextResponse.json({ error: "eBay Standort oder Richtlinien fehlen oder sind ungültig." }, { status: 400 });

    const { data: drafts, error: readError } = await admin.from("draft_products").select("id,status,ebay_item_id,title,source_price,manual_sale_price,images")
      .eq("user_id", user.id).in("id", ids);
    if (readError) throw readError;
    if (!drafts || drafts.length !== ids.length) return NextResponse.json({ error: "Mindestens ein ausgewählter Entwurf wurde nicht gefunden." }, { status: 404 });
    for (const draft of drafts) {
      if (draft.status === "published") return NextResponse.json({ error: "Ein ausgewählter Entwurf ist bereits veröffentlicht." }, { status: 409 });
      if (!String(draft.title || "").trim() || String(draft.title).length > 80) return NextResponse.json({ error: "Jeder Entwurf benötigt einen Titel mit höchstens 80 Zeichen." }, { status: 400 });
      if (!Array.isArray(draft.images) || !draft.images.length) return NextResponse.json({ error: "Jeder Entwurf benötigt mindestens ein Produktbild." }, { status: 400 });
      if ((draft.source_price == null || Number(draft.source_price) <= 0) && (draft.manual_sale_price == null || Number(draft.manual_sale_price) <= 0)) return NextResponse.json({ error: "Für jeden Entwurf ist ein gültiger Einkaufs- oder eBay-Verkaufspreis erforderlich." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,created_at")
      .eq("user_id", user.id).in("draft_id", ids).in("status", ["queued", "processing"]);
    if (existingError) throw existingError;
    const activeByDraft = new Map((existing || []).map((job) => [job.draft_id, job]));
    const insertQueuedJobs = async (draftIds: string[]) => {
      if (!draftIds.length) return { data: [], error: null };
      return admin.from("draft_listing_jobs").insert(draftIds.map((draftId) => ({
        user_id: user.id, draft_id: draftId, store_id: storeId, settings,
        status: "queued", progress: 0, current_step: "Sırada bekliyor", image_rights_confirmed: true,
      }))).select("id,draft_id,status,progress,current_step,created_at");
    };
    let newIds = ids.filter((id) => !activeByDraft.has(id));
    let insertResult = await insertQueuedJobs(newIds);
    if (insertResult.error?.code === "23505") {
      // Resolve a concurrent double-submit in one lookup, then insert only the
      // still-missing jobs as one batch instead of serial per-product writes.
      const { data: raced, error: racedError } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,created_at")
        .eq("user_id", user.id).in("draft_id", ids).in("status", ["queued", "processing"]);
      if (racedError) throw racedError;
      for (const job of raced || []) activeByDraft.set(job.draft_id, job);
      newIds = ids.filter((id) => !activeByDraft.has(id));
      insertResult = await insertQueuedJobs(newIds);
    }
    if (insertResult.error) throw insertResult.error;
    const inserted = (insertResult.data || []) as Array<{ id: string; draft_id: string; status: string; progress: number; current_step: string; created_at: string }>;
    if (inserted.length) {
      const insertedIds = inserted.map((job) => job.draft_id);
      const { data: updatedDrafts, error: draftError } = await admin.from("draft_products").update({ status: "publishing", last_error: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id).in("id", insertedIds).in("status", ["draft", "error", "publishing"]).select("id");
      if (draftError || (updatedDrafts || []).length !== insertedIds.length) {
        const message = draftError?.message || "Mindestens ein Entwurf ist nicht mehr verfügbar.";
        await admin.from("draft_listing_jobs").update({ status: "failed", last_error: message.slice(0, 500), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .in("id", inserted.map((job) => job.id)).eq("status", "queued");
        if (draftError) throw draftError;
        return NextResponse.json({ error: "Ein ausgewählter Entwurf hat sich geändert. Bitte aktualisiere die Seite und versuche es erneut." }, { status: 409 });
      }
    }
    for (const job of inserted) activeByDraft.set(job.draft_id, job);

    const { data: queueRows } = await admin.from("draft_listing_jobs").select("id,draft_id,status,progress,current_step,created_at")
      .eq("user_id", user.id).eq("status", "queued").order("created_at", { ascending: true });
    const queuePositionById = new Map((queueRows || []).map((job, index) => [job.id, index + 1]));
    const jobs = ids.map((id) => {
      const job = activeByDraft.get(id);
      return job ? { ...job, queuePosition: job.status === "queued" ? queuePositionById.get(job.id) ?? null : null } : null;
    }).filter(Boolean);

    after(async () => {
      try { await drainDraftListingQueue(100); }
      catch (error) { console.error("Draft listing queue worker failed:", error); }
    });
    const singleJob = jobs.length === 1 ? jobs[0] : null;
    return NextResponse.json({
      success: true, jobs, queued: inserted.length,
      ...(singleJob ? { jobId: singleJob.id, productId: singleJob.draft_id, status: singleJob.status.toUpperCase(), queuePosition: singleJob.queuePosition } : {}),
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Listeauftrag konnte nicht eingereiht werden." }, { status: 500 });
  }
}
