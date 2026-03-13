from __future__ import annotations

import unicodedata
from typing import Any

from .buy_box import assess_buy_box
from .listing_fetcher import enrich_request_from_url
from .reference_data import ISSUE_LIBRARY, POSITIVE_SIGNAL_LIBRARY, VEHICLE_REFERENCES
from .schemas import AnalyzeRequest, AnalyzeResponse, AppSettings
from .source_parser import parse_listing


def analyze_listing(payload: AnalyzeRequest, app_settings: AppSettings | None = None) -> AnalyzeResponse:
    app_settings = app_settings or AppSettings()
    effective_payload, fetch_notes = enrich_request_from_url(payload)
    raw_text = (effective_payload.raw_text or "").strip()
    parsed = parse_listing(effective_payload)

    if fetch_notes:
        parsed.parser_notes = _dedupe_notes(fetch_notes + parsed.parser_notes)
        parsed.parser_confidence = _clamp(parsed.parser_confidence + 6, 35, 95)

    blob = " ".join(
        str(value)
        for value in [
            effective_payload.brand,
            effective_payload.model,
            effective_payload.year,
            effective_payload.km,
            effective_payload.fuel,
            effective_payload.asking_price,
            raw_text,
        ]
        if value is not None and value != ""
    )

    ref = _find_reference(blob, effective_payload.brand or parsed.brand, effective_payload.model or parsed.model)
    year = effective_payload.year or parsed.year or (ref["baseline_year"] if ref else 2007)
    km = effective_payload.km or parsed.km or (ref["baseline_km"] if ref else 160000)
    fuel = effective_payload.fuel or parsed.fuel or "Benzin"
    asking_price = (
        effective_payload.asking_price if effective_payload.asking_price is not None else (parsed.asking_price or 0)
    )
    brand = effective_payload.brand or parsed.brand or (ref["brand"] if ref else "Bilinmiyor")
    model = effective_payload.model or parsed.model or (ref["model"] if ref else "Model")
    city = effective_payload.city or parsed.city or "Hamburg"

    detected_issues = _detect_issues(blob)
    positive_signals = _detect_positive_signals(blob)

    repair_cost = sum(_estimate_issue_cost(issue) for issue in detected_issues)
    service_reserve = _estimate_service_reserve(km=km, fuel=fuel, text=blob)
    repair_cost += service_reserve
    prep_cost = app_settings.issue_prep_cost if detected_issues else app_settings.clean_prep_cost
    transfer_cost = app_settings.transfer_cost

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
    risk_raw -= sum(signal["risk_reduction"] for signal in positive_signals)
    risk_score = _clamp(round(risk_raw), 8, 94)

    if risk_score >= 58:
        risk_level: str = "high"
    elif risk_score >= 34:
        risk_level = "medium"
    else:
        risk_level = "low"

    discount_percent = (
        app_settings.high_risk_discount_percent
        if risk_level == "high"
        else app_settings.medium_risk_discount_percent
        if risk_level == "medium"
        else app_settings.low_risk_discount_percent
    )
    discount = discount_percent / 100
    suggested_offer = round((market_price - repair_cost - prep_cost - transfer_cost) * (1 - discount))
    offer_ceiling = max(700, asking_price or market_price)
    offer_reference = asking_price or market_price
    offer_price = _clamp(min(suggested_offer, round(offer_reference * 0.94)), 500, offer_ceiling)
    total_cost = offer_price + repair_cost + prep_cost + transfer_cost
    target_sale_price = _clamp(
        round(market_price * (1 - (app_settings.exit_discount_percent / 100))),
        total_cost + 150,
        8000,
    )
    sales_cost = round(target_sale_price * (app_settings.sales_cost_percent / 100))
    net_profit = target_sale_price - total_cost - sales_cost
    margin_percent = round((net_profit / target_sale_price) * 100) if target_sale_price else 0

    buy_box_status, buy_box_notes = assess_buy_box(
        app_settings=app_settings,
        city=city,
        year=year,
        km=km,
        fuel=fuel,
        asking_price=asking_price,
        net_profit=net_profit,
        margin_percent=margin_percent,
        risk_level=risk_level,
    )

    recommendation = "buy"
    if net_profit < 250 or risk_level == "high" or buy_box_status == "review":
        recommendation = "caution"
    if net_profit < 0 or buy_box_status == "out" or (risk_level == "high" and repair_cost > 900):
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
        ref.get("liquidity_note", f"{ref['model']} icin referans var") if ref else "Referans piyasa manuel teyit ister",
        f"Parser: {parsed.source_parser}",
    ]
    strengths.extend(signal["label"] for signal in positive_signals[:2])

    warnings = [
        (
            f"Baslica sorunlar: {', '.join(issue['label'] for issue in detected_issues)}"
            if detected_issues
            else "Servis gecmisi ve TUV tarihi teyit edilmeli"
        ),
        "Masraf kalemleri ekspertizle netlesmeli" if repair_cost > 500 else "Masraf kalemleri gorece kontrollu",
        "Yuksek km cikis suresini uzatabilir" if km > 180000 else "KM seviyesi tolere edilebilir",
        f"Beklenen satis suresi: {ref['sell_days'] if ref else '12-24 gun'}",
    ]
    if service_reserve:
        warnings.append(f"Yag, filtre ve sivi bakimi icin {service_reserve} EUR DIY servis rezervi eklendi.")
    if detected_issues:
        warnings.append(_build_repair_assumption_note(detected_issues))

    confidence_score = parsed.parser_confidence + 18
    verification_notes = list(parsed.parser_notes)

    if not ref:
        confidence_score -= 12
        verification_notes.append("Referans piyasa eslesmesi yok; benzer ilanlari manual karsilastir.")
    if not asking_price:
        confidence_score -= 18
        verification_notes.append("Istenen fiyat eksik; pazarlik seviyesi sahada teyit edilmeli.")
    if not effective_payload.brand and not parsed.brand:
        confidence_score -= 8
        verification_notes.append("Marka bilgisi cikarilamadi; ilan basligini manuel kontrol et.")
    if not effective_payload.model and not parsed.model:
        confidence_score -= 8
        verification_notes.append("Model bilgisi cikarilamadi; yanlis eslesme riski var.")
    if not effective_payload.year and not parsed.year:
        confidence_score -= 6
        verification_notes.append("Model yili net degil; ruhsat veya VIN ile kontrol et.")
    if not effective_payload.km and not parsed.km:
        confidence_score -= 8
        verification_notes.append("KM bilgisi cikarilamadi; gosterge ve servis kaydiyla dogrula.")
    if not effective_payload.fuel and not parsed.fuel:
        confidence_score -= 4
        verification_notes.append("Yakit tipi default veya zayif cikarimla geldi; ilani tekrar kontrol et.")
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
        verification_notes.append("KM cok yuksek; motor, sanziman ve yuruyen kontrolu derin olmali.")
    if buy_box_status == "out":
        confidence_score -= 8
        verification_notes.append("Buy-box disinda kaliyor; kriter disi oldugu icin ekstra temkinli ol.")
    if service_reserve:
        verification_notes.append("Temel bakim rezervi eklendi; yag, filtre ve sogutma sivilarini sahada netlestir.")

    confidence_score = _clamp(confidence_score, 24, 96)
    verification_notes = _dedupe_notes(verification_notes)
    buy_box_notes = _dedupe_notes(buy_box_notes)
    verification_required = (
        confidence_score < 72
        or risk_level != "low"
        or not asking_price
        or not ref
        or bool(detected_issues)
        or buy_box_status != "fit"
    )

    negotiation_points = _build_negotiation_points(
        asking_price=asking_price,
        offer_price=offer_price,
        km=km,
        risk_level=risk_level,
        detected_issues=detected_issues,
        buy_box_status=buy_box_status,
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
        buy_box_status=buy_box_status,
    )

    return AnalyzeResponse(
        url=effective_payload.url,
        brand=brand,
        model=model,
        title=f"{brand} {model} {year}".strip(),
        source=effective_payload.source,
        city=city,
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
        source_parser=parsed.source_parser,
        parser_confidence=parsed.parser_confidence,
        parser_notes=parsed.parser_notes,
        buy_box_status=buy_box_status,
        buy_box_notes=buy_box_notes,
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
    normalized = _normalize_text(f"{brand or ''} {model or ''} {text or ''}")
    for item in VEHICLE_REFERENCES:
        if any(keyword in normalized for keyword in item["keywords"]):
            return item
    return None


def _detect_issues(text: str) -> list[dict[str, Any]]:
    normalized = _normalize_text(text)
    return [issue for issue in ISSUE_LIBRARY if any(keyword in normalized for keyword in issue["keywords"])]


def _detect_positive_signals(text: str) -> list[dict[str, Any]]:
    normalized = _normalize_text(text)
    return [
        signal
        for signal in POSITIVE_SIGNAL_LIBRARY
        if any(keyword in normalized for keyword in signal["keywords"])
    ]


def _midpoint(pair: tuple[int, int]) -> int:
    return round((pair[0] + pair[1]) / 2)


def _estimate_issue_cost(issue: dict[str, Any]) -> int:
    operator_range = issue.get("operator_range")
    if operator_range:
        return _midpoint(operator_range)
    return _midpoint(issue["repair_range"])


def _estimate_service_reserve(*, km: int, fuel: str, text: str) -> int:
    normalized = _normalize_text(text)
    if "serviceheft" in normalized or "lueckenlos" in normalized:
        return 0
    if km < 140000:
        return 0
    return 110 if fuel == "Diesel" else 90


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
    *,
    asking_price: int,
    offer_price: int,
    km: int,
    risk_level: str,
    detected_issues: list[dict[str, Any]],
    buy_box_status: str,
) -> list[str]:
    points: list[str] = []

    if asking_price:
        discount_gap = max(asking_price - offer_price, 0)
        points.append(f"Ilan fiyatindan {discount_gap} EUR asagi inmek icin masraf kalemlerini rakamla ac.")
    else:
        points.append("Net fiyat belirtilmemis; once saticidan son fiyat beklentisini yazili al.")

    if detected_issues:
        for issue in detected_issues[:2]:
            low, high = issue["repair_range"]
            points.append(f"{issue['label']} icin {low}-{high} EUR bant verip indirimi bu kalemden iste.")
    else:
        points.append("Cold start, TUV ve servis gecmisini sorup indirim alanini bunlar uzerinden ac.")

    if km >= 180000:
        points.append("Yuksek km nedeniyle yuruyen, debriyaj ve sanziman riskini fiyata yansit.")
    if risk_level != "low":
        points.append("Kapora veya anlik soz verme; once test surusu ve OBD/usta gorusu al.")
    else:
        points.append("Fiyat uygunsa ayni gun gorup hizli kapatma avantaji kullan.")
    if buy_box_status == "out":
        points.append("Buy-box disi oldugu icin teklifini sert tut ve tavana cikma.")

    return _dedupe_notes(points)


def _build_repair_assumption_note(detected_issues: list[dict[str, Any]]) -> str:
    diy_friendly = [issue["label"] for issue in detected_issues if issue.get("operator_range")]
    if not diy_friendly:
        return "Masraf hesabi agirlikli olarak piyasa usta fiyatlariyla kuruldu."
    joined = ", ".join(diy_friendly[:2])
    return f"{joined} icin DIY / parca agirlikli operator varsayimi kullanildi."


def _build_recommended_message(
    *,
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
    *,
    recommendation: str,
    risk_level: str,
    verification_required: bool,
    buy_box_status: str,
) -> str:
    if recommendation == "skip" or buy_box_status == "out":
        return "Bu ilani pas gec, ancak satici ciddi fiyat dusurse yeniden bak."
    if recommendation == "caution" or verification_required or risk_level != "low":
        return "Sahada kontrol listesiyle ilerle; net teyit olmadan teklif baglama."
    return "Bugun gorusme ayarla, araci soguk calistir ve teklifini ayni ziyaret icinde ver."


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()
