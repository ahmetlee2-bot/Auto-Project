from __future__ import annotations

from dataclasses import dataclass, field
from html import unescape
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .schemas import AnalyzeRequest


@dataclass
class ListingSnapshot:
    source: str
    title: str | None = None
    description: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    km: int | None = None
    fuel: str | None = None
    city: str | None = None
    asking_price: int | None = None
    raw_text: str = ""
    fetch_notes: list[str] = field(default_factory=list)


def enrich_request_from_url(payload: AnalyzeRequest) -> tuple[AnalyzeRequest, list[str]]:
    if not payload.url:
        return payload, []

    try:
        snapshot = fetch_listing_snapshot(payload.url)
    except Exception as exc:
        return payload, [f"Listing URL cekilemedi: {exc}"]

    if snapshot is None:
        return payload, []

    raw_text = payload.raw_text.strip() if payload.raw_text else ""
    merged_text = raw_text if raw_text else snapshot.raw_text
    if raw_text and snapshot.raw_text:
        merged_text = f"{snapshot.raw_text}\n{raw_text}"

    inferred_source = payload.source
    if payload.source == "Manual Import" and snapshot.source:
        inferred_source = snapshot.source

    enriched = payload.model_copy(
        update={
            "source": inferred_source,
            "brand": payload.brand or snapshot.brand,
            "model": payload.model or snapshot.model,
            "year": payload.year or snapshot.year,
            "km": payload.km or snapshot.km,
            "fuel": payload.fuel or snapshot.fuel,
            "asking_price": payload.asking_price if payload.asking_price is not None else snapshot.asking_price,
            "city": payload.city or snapshot.city or "Hamburg",
            "raw_text": merged_text or payload.raw_text,
        }
    )
    return enriched, snapshot.fetch_notes


def fetch_listing_snapshot(url: str) -> ListingSnapshot | None:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()

    if "kleinanzeigen.de" in host:
        html = _download_html(url)
        return parse_kleinanzeigen_html(html)

    return None


def parse_kleinanzeigen_html(html: str) -> ListingSnapshot:
    title = _extract_tag_by_id(html, "viewad-title")
    description = _extract_tag_by_id(html, "viewad-description-text")
    location = _extract_tag_by_id(html, "viewad-locality")
    price = _extract_meta_price(html)
    details = _extract_detail_map(html)
    features = _extract_feature_tags(html)

    brand = details.get("Marke")
    model = details.get("Modell")
    year = _extract_year(details.get("Erstzulassung"))
    km = _extract_number(details.get("Kilometerstand"))
    fuel = _normalize_fuel(details.get("Kraftstoffart"))
    city = "Hamburg" if location and "Hamburg" in location else None

    detail_lines = [f"{label}: {value}" for label, value in details.items()]
    feature_line = f"Ausstattung: {', '.join(features)}" if features else ""
    raw_parts = [title, description, location, feature_line, *detail_lines]
    raw_text = " ".join(part for part in raw_parts if part)

    notes = [
        "Listing URL otomatik cekildi.",
        "Kleinanzeigen title, fiyat, aciklama ve detay alanlari okundu.",
    ]
    if features:
        notes.append("Donanim etiketleri parse edildi.")

    return ListingSnapshot(
        source="Kleinanzeigen",
        title=title,
        description=description,
        brand=brand,
        model=model,
        year=year,
        km=km,
        fuel=fuel,
        city=city,
        asking_price=price,
        raw_text=raw_text,
        fetch_notes=notes,
    )


def _download_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
            )
        },
    )
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def _extract_tag_by_id(html: str, tag_id: str) -> str | None:
    match = re.search(
        rf'id="{re.escape(tag_id)}"[^>]*>(.*?)</[^>]+>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    return _clean_text(match.group(1))


def _extract_meta_price(html: str) -> int | None:
    meta_match = re.search(r'itemprop="price"\s+content="([\d\.]+)"', html, flags=re.IGNORECASE)
    if meta_match:
        return int(float(meta_match.group(1)))

    visible_match = re.search(r'id="viewad-price"[^>]*>(.*?)</h2>', html, flags=re.IGNORECASE | re.DOTALL)
    if not visible_match:
        return None
    return _extract_number(visible_match.group(1))


def _extract_detail_map(html: str) -> dict[str, str]:
    detail_pairs = re.findall(
        r'<li class="addetailslist--detail">\s*(.*?)<span class="addetailslist--detail--value"[^>]*>(.*?)</span>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return {
        _clean_text(label): _clean_text(value)
        for label, value in detail_pairs
        if _clean_text(label) and _clean_text(value)
    }


def _extract_feature_tags(html: str) -> list[str]:
    return [
        _clean_text(value)
        for value in re.findall(r'<li class="checktag">(.*?)</li>', html, flags=re.IGNORECASE | re.DOTALL)
        if _clean_text(value)
    ]


def _extract_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(19\d{2}|20\d{2})", value)
    return int(match.group(1)) if match else None


def _extract_number(value: str | None) -> int | None:
    if not value:
        return None
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


def _normalize_fuel(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized == "diesel":
        return "Diesel"
    if normalized == "benzin":
        return "Benzin"
    if normalized == "hybrid":
        return "Hybrid"
    return value


def _clean_text(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()
