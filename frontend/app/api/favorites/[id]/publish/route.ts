import { POST as stageFavorite } from "../../../drafts/from-favorite/route";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  return stageFavorite(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ favoriteId: id }),
  }));
}
