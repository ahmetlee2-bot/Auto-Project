from __future__ import annotations

import re
from dataclasses import dataclass, field

from .reference_data import HAMBURG_CITY_ALIASES, VEHICLE_REFERENCES
from .schemas import AnalyzeRequest


@dataclass
class ParsedListing:
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    km: int | None = None
    fuel: str | None = None
    asking_price: int | None = None
    city: str | None = None
    source_parser: str = "generic"
    parser_confidence: int = 40
    parser_notes: list[str] = field(default_factory=list)


def parse_listing(payload: AnalyzeRequest) -> ParsedListing:
    raw_text = (payload.raw_text or "").strip()
    normalized_source = _normalize_source(payload.source)

    source_specific = {
        "kleinanzeigen": _parse_kleinanzeigen,
        "mobile.de": _parse_mobile,
        "facebook marketplace": _parse_facebook,
        "manual import": _parse_generic,
    }

    parser = source_specific.get(normalized_source, _parse_generic)
    parsed = parser(raw_text)

    inferred_brand, inferred_model = _infer_vehicle(raw_text)
    parsed.brand = parsed.brand or inferred_brand
    parsed.model = parsed.model or inferred_model
    parsed.year = parsed.year or _extract_year(raw_text)
    parsed.km = parsed.km or _extract_km(raw_text)
    parsed.fuel = parsed.fuel or _extract_fuel(raw_text)
    parsed.asking_price = parsed.asking_price or _extract_price(raw_text)
    parsed.city = parsed.city or _extract_city(raw_text)

    hits = sum(
        1
        for value in [
            parsed.brand,
            parsed.model,
            parsed.year,
            parsed.km,
            parsed.fuel,
            parsed.asking_price,
            parsed.city,
        ]
        if value
    )
    base_confidence = parsed.parser_confidence + hits * 5
    if raw_text:
        base_confidence += 4
    parsed.parser_confidence = _clamp(base_confidence, 35, 95)
    parsed.parser_notes = _dedupe_notes(parsed.parser_notes)
    return parsed


def _parse_kleinanzeigen(text: str) -> ParsedListing:
    notes = ["Kleinanzeigen parser aktif."]
    price = None
    if re.search(r"\bvb\b", text, flags=re.IGNORECASE):
        notes.append("VB sinyali bulundu; pazarlik payi var.")
        price = _extract_price(text)
    elif "€" in text or "eur" in text.lower() or "euro" in text.lower():
        notes.append("Kleinanzeigen fiyat kalibi yakalandi.")
        price = _extract_price(text)

    return ParsedListing(
        asking_price=price,
        city=_extract_city(text),
        source_parser="kleinanzeigen",
        parser_confidence=60,
        parser_notes=notes,
    )


def _parse_mobile(text: str) -> ParsedListing:
    notes = ["Mobile.de parser aktif."]
    year = None
    km = None
    fuel = None
    asking_price = None

    year_match = re.search(
        r"(?:erstzulassung|ez)[:\s]*(?:\d{1,2}/)?((?:19|20)\d{2})",
        text,
        flags=re.IGNORECASE,
    )
    if year_match:
        year = int(year_match.group(1))
        notes.append("Mobile.de Erstzulassung alani okundu.")

    km_match = re.search(
        r"(?:kilometerstand|km-stand|laufleistung)[:\s]*([\d\.\s,]{5,9})\s*km",
        text,
        flags=re.IGNORECASE,
    )
    if km_match:
        km = _parse_compact_number(km_match.group(1))
        notes.append("Mobile.de kilometer alanı okundu.")

    fuel_match = re.search(
        r"(?:kraftstoff|fuel)[:\s]*(benzin|diesel)",
        text,
        flags=re.IGNORECASE,
    )
    if fuel_match:
        fuel = fuel_match.group(1).capitalize()
        notes.append("Mobile.de yakit tipi okundu.")

    price_match = re.search(
        r"(?:preis|vb)[:\s]*([\d\.\s,]{3,7})\s*(?:€|eur|euro)",
        text,
        flags=re.IGNORECASE,
    )
    if price_match:
        asking_price = _parse_compact_number(price_match.group(1))
        notes.append("Mobile.de fiyat alani okundu.")

    return ParsedListing(
        year=year,
        km=km,
        fuel=fuel,
        asking_price=asking_price,
        city=_extract_city(text),
        source_parser="mobile.de",
        parser_confidence=68,
        parser_notes=notes,
    )


def _parse_facebook(text: str) -> ParsedListing:
    notes = ["Facebook Marketplace parser aktif."]
    if "vb" in text.lower():
        notes.append("FB Marketplace ilani pazarlik acik olabilir.")
    return ParsedListing(
        asking_price=_extract_price(text),
        city=_extract_city(text),
        source_parser="facebook_marketplace",
        parser_confidence=56,
        parser_notes=notes,
    )


def _parse_generic(text: str) -> ParsedListing:
    return ParsedListing(
        asking_price=_extract_price(text),
        city=_extract_city(text),
        source_parser="generic",
        parser_confidence=48,
        parser_notes=["Generic parser aktif; yapisal alanlar manuel teyit ister."],
    )


def _normalize_source(source: str | None) -> str:
    return (source or "").strip().lower()


def _extract_year(text: str) -> int | None:
    match = re.search(r"\b(19\d{2}|20[0-2]\d)\b", text)
    return int(match.group(1)) if match else None


def _extract_km(text: str) -> int | None:
    direct = re.search(r"\b(\d{5,6})\s*km\b", text, flags=re.IGNORECASE)
    if direct:
        return int(direct.group(1))

    grouped = re.search(r"\b(\d{2,3})[\s\.,]?(\d{3})\s*km\b", text, flags=re.IGNORECASE)
    if grouped:
        return int(f"{grouped.group(1)}{grouped.group(2)}")

    return None


def _extract_fuel(text: str) -> str | None:
    normalized = text.lower()
    if "diesel" in normalized or "tdi" in normalized or "tdci" in normalized:
        return "Diesel"
    if "benzin" in normalized or "fsi" in normalized:
        return "Benzin"
    return None


def _extract_price(text: str) -> int | None:
    match = re.search(
        r"\b(\d{1,2}(?:[\.\s]\d{3})|\d{3,5})\s*(?:€|eur|euro|vb)\b",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return _parse_compact_number(match.group(1))


def _extract_city(text: str) -> str | None:
    normalized = text.lower()
    if any(alias in normalized for alias in HAMBURG_CITY_ALIASES):
        return "Hamburg"
    return None


def _infer_vehicle(text: str) -> tuple[str | None, str | None]:
    normalized = text.lower()
    for item in VEHICLE_REFERENCES:
        if any(keyword in normalized for keyword in item["keywords"]):
            return item["brand"], item["model"]
    return None, None


def _parse_compact_number(value: str) -> int:
    digits = re.sub(r"[^\d]", "", value)
    return int(digits)


def _dedupe_notes(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))
