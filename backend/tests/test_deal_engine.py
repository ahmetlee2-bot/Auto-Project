from app.deal_engine import analyze_listing
from app.schemas import AnalyzeRequest


def test_analyze_listing_returns_positive_offer_and_title() -> None:
    result = analyze_listing(
        AnalyzeRequest(
            source="Kleinanzeigen",
            city="Hamburg",
            brand="VW",
            model="Golf",
            year=2006,
            km=178000,
            fuel="Benzin",
            asking_price=1350,
            raw_text="VW Golf 5 1.6 2006, 178000 km, TUV yazin bitiyor, klima sogutmuyor.",
        )
    )

    assert result.title.startswith("VW Golf")
    assert result.offer_price > 0
    assert result.total_cost >= result.offer_price
    assert result.risk_level in {"low", "medium", "high"}
    assert result.source_parser == "kleinanzeigen"
    assert result.parser_confidence >= 60
    assert result.buy_box_status in {"fit", "review", "out"}
    assert 0 <= result.confidence_score <= 100
    assert len(result.verification_notes) >= 1
    assert len(result.negotiation_points) >= 2
    assert result.recommended_message
    assert result.next_action


def test_analyze_listing_handles_missing_structured_fields() -> None:
    result = analyze_listing(
        AnalyzeRequest(
            source="Manual Import",
            city="Hamburg",
            raw_text="Opel Corsa 2009 149000 km Benzin, motorleuchte bazen yaniyor, fiyat 1450 euro.",
        )
    )

    assert result.year == 2009
    assert result.km == 149000
    assert result.asking_price == 1450
    assert len(result.warnings) >= 1
    assert result.verification_required is True
    assert result.confidence_score >= 80
    assert result.buy_box_status in {"review", "out"}
    assert "Motor ikaz" in result.negotiation_points[1]


def test_mobile_parser_extracts_structured_fields() -> None:
    result = analyze_listing(
        AnalyzeRequest(
            source="Mobile.de",
            raw_text=(
                "Opel Corsa Preis 2.450 EUR Erstzulassung 2009 "
                "Kilometerstand 149.000 km Kraftstoff Benzin Hamburg"
            ),
        )
    )

    assert result.source_parser == "mobile.de"
    assert result.parser_confidence >= 70
    assert result.asking_price == 2450
    assert result.km == 149000
    assert result.year == 2009
    assert result.city == "Hamburg"


def test_analyze_listing_hydrates_from_kleinanzeigen_url(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.deal_engine.enrich_request_from_url",
        lambda payload: (
            payload.model_copy(
                update={
                    "source": "Kleinanzeigen",
                    "brand": "Skoda",
                    "model": "Octavia",
                    "year": 2006,
                    "km": 150000,
                    "fuel": "Diesel",
                    "asking_price": 1650,
                    "city": "Hamburg",
                    "raw_text": (
                        "Skoda Octavia 2 hand 1.9 TDI 105 PS TUEV. Fahrbereit. "
                        "Motor, Getriebe und Kupplung einwandfrei. Verliert Oel. "
                        "Querlenker vorne links macht leichte Geraeusche. Preis VB."
                    ),
                }
            ),
            ["Listing URL otomatik cekildi."],
        ),
    )

    result = analyze_listing(
        AnalyzeRequest(
            source="Kleinanzeigen",
            url="https://www.kleinanzeigen.de/s-anzeige/skoda-octavia/123",
        )
    )

    assert result.brand == "Skoda"
    assert result.model == "Octavia"
    assert result.asking_price == 1650
    assert result.km == 150000
    assert result.fuel == "Diesel"
    assert result.source_parser == "kleinanzeigen"
    assert "DIY" in " ".join(result.warnings)
    assert any("Querlenker" in item or "Yag" in item for item in result.warnings)
