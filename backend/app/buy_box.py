from __future__ import annotations

from .schemas import AppSettings


def assess_buy_box(
    *,
    app_settings: AppSettings,
    city: str,
    year: int,
    km: int,
    fuel: str,
    asking_price: int,
    net_profit: int,
    margin_percent: int,
    risk_level: str,
) -> tuple[str, list[str]]:
    notes: list[str] = []
    hard_fail = False
    soft_miss_count = 0

    if city.lower() == app_settings.preferred_city.lower():
        notes.append("Hamburg operasyonu icin lokal takip uygun.")
    else:
        notes.append("Hamburg disi lojistik maliyeti ve zaman etkisi olabilir.")
        soft_miss_count += 1

    if asking_price and asking_price <= app_settings.max_asking_price:
        notes.append("Alis butcesi buy-box tavaninin icinde.")
    else:
        notes.append("Ilan fiyati buy-box tavanini asiyor.")
        hard_fail = True

    if net_profit >= app_settings.min_net_profit:
        notes.append("Net kar hedef seviyeyi geciyor.")
    else:
        notes.append("Net kar hedefin altinda.")
        hard_fail = True

    if margin_percent >= app_settings.min_margin_percent:
        notes.append("Marj oranı flip hedefinle uyumlu.")
    else:
        notes.append("Marj oranı zayif; pazarlik veya cikis fiyatı iyilesmeli.")
        soft_miss_count += 1

    max_km = (
        app_settings.max_km_diesel
        if fuel.lower() == "diesel"
        else app_settings.max_km_benzin
    )
    if km <= max_km:
        notes.append("KM seviyesi mevcut yakit tipi icin kabul edilebilir.")
    else:
        notes.append("KM seviyesi buy-box limitinin ustunde.")
        hard_fail = True

    if year >= app_settings.min_year:
        notes.append("Model yili hedef alt sinirin ustunde.")
    else:
        notes.append("Model yili cok eski; cikis hizi dusabilir.")
        soft_miss_count += 1

    if risk_level == "high":
        notes.append("Risk seviyesi buy-box icin fazla yuksek.")
        hard_fail = True
    elif risk_level == "medium":
        notes.append("Risk orta seviyede; saha teyidi zorunlu.")
        soft_miss_count += 1
    else:
        notes.append("Risk seviyesi buy-box icin rahat.")

    if hard_fail:
        return "out", notes
    if soft_miss_count >= 2:
        return "review", notes
    return "fit", notes
