from __future__ import annotations

import re
from typing import Any

from .reference_data import ISSUE_LIBRARY, VEHICLE_REFERENCES
from .schemas import AnalyzeRequest, AnalyzeResponse


def analyze_listing(payload: AnalyzeRequest) -> AnalyzeResponse:
    raw_text = (payload.raw_text or "").strip()
    blob = " ".join(
        str(value)
        for value in [payload.brand, payload.model, payload.year, payload.km, payload.fuel, raw_text]
        if value
    )
    ref = _find_reference(blob, payload.brand, payload.model)
    year = payload.year or _extract_year(blob) or (ref["baseline_year"] if ref else 2007)
    km = payload.km or _extract_km(blob) or (ref["baseline_km"] if ref else 160000)
    fuel = payload.fuel or _extract_fuel(blob) or "Benzin"
    asking_price = payload.asking_price or 0
    brand = payload.brand or (ref["brand"] if ref else "Bilinmiyor")
    model = payload.model or (ref["model"] if ref else "Model")
    detected_issues = _detect_issues(blob)

    repair_cost = sum(_midpoint(issue["repair_range"]) for issue in detected_issues)
    prep_cost = 180 if detected_issues else 110
    transfer_cost = 120

    market_price = ref["market_price"] if ref else 2400
    market_price += (year - (ref["baseline_year"] if ref else 2007)) * 90
    market_price -= round((km - (ref["baseline_km"] if ref else 160000)) / 10000) * 70
    if fuel == "Diesel" and km > 180000:
        market_price -= 180
    market_price = _clamp(round(market_price / 50) * 50, 900, 6500)

    risk_raw = sum(issue["risk_score"] for issue in detected_issues)
    risk_raw += max(0, 2026 - year) * 1.35
    risk_raw += max(0, (km - 120000) / 12000)
    risk_raw += 0 if asking_price else 12
    risk_score = _clamp(round(risk_raw), 8, 94)

    if risk_score >= 58:
        risk_level: str = "high"
    elif risk_score >= 34:
        risk_level = "medium"
    else:
        risk_level = "low"

    discount = 0.22 if risk_level == "high" else 0.15 if risk_level == "medium" else 0.08
    suggested_offer = round((market_price - repair_cost - prep_cost - transfer_cost) * (1 - discount))
    offer_price = _clamp(min(suggested_offer, round((asking_price or market_price) * 0.94)), 500, max(700, asking_price or market_price))
    total_cost = offer_price + repair_cost + prep_cost + transfer_cost
    target_sale_price = _clamp(round(market_price * 0.96), total_cost + 150, 8000)
    sales_cost = round(target_sale_price * 0.06)
    net_profit = target_sale_price - total_cost - sales_cost
    margin_percent = round((net_profit / target_sale_price) * 100) if target_sale_price else 0

    recommendation = "buy"
    if net_profit < 250 or risk_level == "high":
        recommendation = "caution"
    if net_profit < 0 or (risk_level == "high" and repair_cost > 900):
        recommendation = "skip"

    summary = {
        "buy": "AL - kontrollu firsat",
        "caution": "DIKKAT - saha teyidi lazim",
        "skip": "ATLA - marj zayif",
    }[recommendation]

    strengths = [
        "Belirgin mekanik sorun sinyali yok" if not detected_issues else "Sorunlar metinden yakalandi",
        "Risk seviyesi dusuk" if risk_level == "low" else "Pazarlikta sorun kalemleri kullanilabilir",
        "Marj flip icin makul" if margin_percent >= 14 else "Kar alani sinirli ama optimize edilebilir",
        f"{ref['model']} icin referans var" if ref else "Referans piyasa manuel teyit ister",
    ]

    warnings = [
        f"Baslica sorunlar: {', '.join(issue['label'] for issue in detected_issues)}" if detected_issues else "Servis gecmisi ve TUV tarihi teyit edilmeli",
        "Masraf kalemleri ekspertizle netlesmeli" if repair_cost > 500 else "Masraf kalemleri gorece kontrollu",
        "Yuksek km cikis suresini uzatabilir" if km > 180000 else "KM seviyesi tolere edilebilir",
        f"Beklenen satis suresi: {ref['sell_days'] if ref else '12-24 gun'}",
    ]

    confidence_score = 88
    verification_notes: list[str] = []

    if not ref:
        confidence_score -= 12
        verification_notes.append("Referans piyasa eslesmesi yok; benzer ilanlari manual karsilastir.")
    if not payload.asking_price:
        confidence_score -= 18
        verification_notes.append("Istenen fiyat eksik; pazarlik seviyesi sahada teyit edilmeli.")
    if not payload.brand or not payload.model:
        confidence_score -= 8
        verification_notes.append("Marka veya model tam girilmedi; cikarim ilan metnine dayaniyor.")
    if not payload.year:
        confidence_score -= 6
        verification_notes.append("Model yili metinden cikarildi; ruhsat veya VIN ile kontrol et.")
    if not payload.km:
        confidence_score -= 8
        verification_notes.append("KM bilgisi metinden cikarildi; gosterge ve servis kaydiyla dogrula.")
    if not payload.fuel:
        confidence_score -= 4
        verification_notes.append("Yakit tipi default veya metin tahminiyle geldi; ilani tekrar kontrol et.")
    if not raw_text:
        confidence_score -= 10
        verification_notes.append("Ilan metni yok; fotograf ve satici gorusmesi daha kritik.")
    elif len(raw_text) < 50:
        confidence_score -= 7
        verification_notes.append("Ilan metni kisa; sorun listesi ekspertizle desteklenmeli.")
    if detected_issues:
        confidence_score -= 4
        verification_notes.append("Sorun kalemleri bulundu; usta veya parca fiyatiyla netlestir.")
    if risk_level == "high":
        confidence_score -= 10
        verification_notes.append("Risk yuksek; lift gormeden baglanma ve kapora verme.")
    if km > 220000:
        confidence_score -= 6
        verification_notes.append("KM cok yuksek; motor, sanziman ve yuruyen kontrolu derin olmalı.")

    confidence_score = _clamp(confidence_score, 24, 96)
    verification_notes = _dedupe_notes(verification_notes)
    verification_required = (
        confidence_score < 72
        or risk_level != "low"
        or not payload.asking_price
        or not ref
        or bool(detected_issues)
    )
    negotiation_points = _build_negotiation_points(
        asking_price=asking_price,
        offer_price=offer_price,
        km=km,
        risk_level=risk_level,
        detected_issues=detected_issues,
    )
    recommended_message = _build_recommended_message(
        title=f"{brand} {model} {year}".strip(),
        offer_price=offer_price,
        detected_issues=detected_issues,
        verification_required=verification_required,
    )
    next_action = _build_next_action(
        recommendation=recommendation,
        risk_level=risk_level,
        verification_required=verification_required,
    )

    return AnalyzeResponse(
        url=payload.url,
        brand=brand,
        model=model,
        title=f"{brand} {model} {year}".strip(),
        source=payload.source,
        city=payload.city,
        year=year,
        km=km,
        fuel=fuel,
        asking_price=asking_price,
        offer_price=offer_price,
        total_cost=total_cost,
        target_sale_price=target_sale_price,
        net_profit=net_profit,
        margin_percent=margin_percent,
        risk_level=risk_level,
        recommendation=recommendation,
        confidence_score=confidence_score,
        verification_required=verification_required,
        verification_notes=verification_notes,
        negotiation_points=negotiation_points,
        recommended_message=recommended_message,
        next_action=next_action,
        operator_note="",
        summary=summary,
        strengths=strengths,
        warnings=warnings,
    )


def _find_reference(text: str, brand: str | None, model: str | None) -> dict[str, Any] | None:
    normalized = f"{brand or ''} {model or ''} {text or ''}".lower()
    for item in VEHICLE_REFERENCES:
        if any(keyword in normalized for keyword in item["keywords"]):
            return item
    return None


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


def _detect_issues(text: str) -> list[dict[str, Any]]:
    normalized = text.lower()
    return [issue for issue in ISSUE_LIBRARY if any(keyword in normalized for keyword in issue["keywords"])]


def _midpoint(pair: tuple[int, int]) -> int:
    return round((pair[0] + pair[1]) / 2)


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _dedupe_notes(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _build_negotiation_points(
    asking_price: int,
    offer_price: int,
    km: int,
    risk_level: str,
    detected_issues: list[dict[str, Any]],
) -> list[str]:
    points: list[str] = []

    if asking_price:
        discount_gap = max(asking_price - offer_price, 0)
        points.append(
            f"Ilan fiyatindan {discount_gap} EUR asagi inmek icin masraf kalemlerini rakamla ac."
        )
    else:
        points.append("Net fiyat belirtilmemis; once saticidan son fiyat beklentisini yazili al.")

    if detected_issues:
        for issue in detected_issues[:2]:
            low, high = issue["repair_range"]
            points.append(
                f"{issue['label']} icin {low}-{high} EUR bant verip indirimi bu kalemden iste."
            )
    else:
        points.append("Cold start, TUV ve servis gecmisini sorup indirim alanini bunlar uzerinden ac.")

    if km >= 180000:
        points.append("Yuksek km nedeniyle yuruyen, debriyaj ve sanziman riskini fiyata yansit.")
    if risk_level != "low":
        points.append("Kapora veya anlik soz verme; once test surusu ve OBD/usta gorusu al.")
    else:
        points.append("Fiyat uygunsa ayni gun gorup hizli kapatma avantaji kullan.")

    return _dedupe_notes(points)


def _build_recommended_message(
    title: str,
    offer_price: int,
    detected_issues: list[dict[str, Any]],
    verification_required: bool,
) -> str:
    issue_text = ", ".join(issue["label"] for issue in detected_issues[:2])
    reason = (
        f"ozellikle {issue_text} tarafinda masraf gorunuyor"
        if issue_text
        else "KM, TUV ve genel hazirlik tarafinda masraf cikma ihtimali var"
    )
    close = (
        "Bugun gelip bakabilirim ama ekspertiz ve test surusu sonrasi netlesmek isterim."
        if verification_required
        else "Arac anlatildigi gibiyse hizli hareket edebilirim."
    )
    return (
        f"Selam, {title} icin ciddi alici olarak yaziyorum. {reason}. "
        f"Benim mantikli seviyem {offer_price} EUR civari. {close}"
    )


def _build_next_action(
    recommendation: str,
    risk_level: str,
    verification_required: bool,
) -> str:
    if recommendation == "skip":
        return "Bu ilani pas gec, ancak satici ciddi fiyat dusurse yeniden bak."
    if recommendation == "caution" or verification_required or risk_level != "low":
        return "Sahada kontrol listesiyle ilerle; net teyit olmadan teklif baglama."
    return "Bugun gorusme ayarla, araci soguk calistir ve teklifini ayni ziyaret icinde ver."
