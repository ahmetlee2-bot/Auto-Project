from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app
from app.settings import settings


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    settings.db_path = str(tmp_path / "autonow-test.db")
    init_db()
    with TestClient(app) as test_client:
        yield test_client


def test_healthcheck(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_endpoint(client: TestClient) -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "source": "Kleinanzeigen",
            "city": "Hamburg",
            "brand": "VW",
            "model": "Golf",
            "year": 2006,
            "km": 178000,
            "fuel": "Benzin",
            "asking_price": 1350,
            "raw_text": "VW Golf 5 1.6 2006, TUV yazin bitiyor, klima sogutmuyor.",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"].startswith("VW Golf")
    assert data["brand"] == "VW"
    assert data["offer_price"] > 0
    assert data["recommendation"] in {"buy", "caution", "skip"}
    assert 0 <= data["confidence_score"] <= 100
    assert isinstance(data["verification_required"], bool)
    assert isinstance(data["verification_notes"], list)
    assert isinstance(data["negotiation_points"], list)
    assert data["recommended_message"]
    assert data["next_action"]


def test_watchlist_endpoints(client: TestClient) -> None:
    payload = {
        "source": "Kleinanzeigen",
        "url": "https://example.com/golf",
        "city": "Hamburg",
        "brand": "VW",
        "model": "Golf",
        "title": "VW Golf 2006",
        "year": 2006,
        "km": 178000,
        "fuel": "Benzin",
        "asking_price": 1350,
        "offer_price": 1090,
        "total_cost": 1540,
        "target_sale_price": 2590,
        "net_profit": 640,
        "margin_percent": 25,
        "risk_level": "medium",
        "recommendation": "buy",
        "confidence_score": 66,
        "verification_required": True,
        "verification_notes": ["TUV ve klima masrafi ekspertizle teyit edilmeli."],
        "negotiation_points": ["Klima ve TUV kalemleriyle fiyat indirimi ac."],
        "recommended_message": "Selam, aracta masraf bekledigim icin 1090 EUR seviyesindeyim.",
        "next_action": "Saha kontrol listesiyle ilerle.",
        "operator_note": "",
        "summary": "AL - kontrollu firsat",
        "strengths": ["Risk seviyesini pazarlikla dengeleyebilirsin."],
        "warnings": ["TUV ve klima saha teyidi istiyor."],
    }

    created = client.post("/api/v1/watchlist", json=payload)
    assert created.status_code == 200
    created_body = created.json()
    assert created_body["id"] > 0

    listed = client.get("/api/v1/watchlist")
    assert listed.status_code == 200
    list_body = listed.json()
    assert len(list_body) == 1
    assert list_body[0]["title"] == "VW Golf 2006"
    assert list_body[0]["confidence_score"] == 66
    assert list_body[0]["verification_required"] is True
    assert list_body[0]["recommended_message"]

    noted = client.patch(
        f"/api/v1/watchlist/{created_body['id']}/note",
        json={"operator_note": "Arac cuma gunu gorulecek. Satici telefonda 100 EUR daha iner dedi."},
    )
    assert noted.status_code == 200
    assert "cuma gunu" in noted.json()["operator_note"]

    deleted = client.delete(f"/api/v1/watchlist/{created_body['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/watchlist").json() == []


def test_portfolio_endpoints(client: TestClient) -> None:
    payload = {
        "source": "Kleinanzeigen",
        "url": "https://example.com/corsa",
        "city": "Hamburg",
        "brand": "Opel",
        "model": "Corsa",
        "title": "Opel Corsa 2009",
        "year": 2009,
        "km": 149000,
        "fuel": "Benzin",
        "asking_price": 1450,
        "offer_price": 1180,
        "total_cost": 1570,
        "target_sale_price": 2490,
        "net_profit": 771,
        "margin_percent": 31,
        "risk_level": "medium",
        "recommendation": "buy",
        "confidence_score": 71,
        "verification_required": True,
        "verification_notes": ["Motor ikaz nedeni usta tarafindan okunmali."],
        "negotiation_points": ["Motor ikaz uzerinden fiyat baskisi kur."],
        "recommended_message": "Motor ikaz nedeniyle 1180 EUR seviyesinde bakiyorum.",
        "next_action": "OBD kontrolu ve test surusu olmadan baglama.",
        "operator_note": "",
        "summary": "AL - kontrollu firsat",
        "strengths": ["Referans piyasa var."],
        "warnings": ["Motorleuchte sahada teyit edilmeli."],
    }

    created = client.post("/api/v1/portfolio", json=payload)
    assert created.status_code == 200
    created_body = created.json()
    assert created_body["status"] == "sourcing"

    updated = client.patch(f"/api/v1/portfolio/{created_body['id']}", json={"status": "prep"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "prep"
    assert updated.json()["confidence_score"] == 71

    noted = client.patch(
        f"/api/v1/portfolio/{created_body['id']}/note",
        json={"operator_note": "Arac alindi. Ilk is OBD, yag ve temizlik yapilacak."},
    )
    assert noted.status_code == 200
    assert "OBD" in noted.json()["operator_note"]

    listed = client.get("/api/v1/portfolio")
    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Opel Corsa 2009"

    deleted = client.delete(f"/api/v1/portfolio/{created_body['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/v1/portfolio").json() == []
