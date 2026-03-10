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
    assert result.asking_price == 0
    assert len(result.warnings) >= 1
    assert result.verification_required is True
    assert result.confidence_score < 75
    assert "saticidan son fiyat beklentisini" in result.negotiation_points[0]
