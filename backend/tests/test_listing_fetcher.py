from app.listing_fetcher import enrich_request_from_url, parse_kleinanzeigen_html
from app.schemas import AnalyzeRequest


KLEINANZEIGEN_HTML = """
<html>
  <body>
    <div id="viewad-main-info">
      <meta itemprop="price" content="1650.00"/>
      <h1 id="viewad-title">Skoda Octavia 2 HAND 1.9 TDI 105 PS TUEV</h1>
      <span id="viewad-locality">20095 Hamburg-Mitte - Hamburg Altstadt</span>
    </div>
    <div id="viewad-details">
      <li class="addetailslist--detail">Marke<span class="addetailslist--detail--value">Skoda</span></li>
      <li class="addetailslist--detail">Modell<span class="addetailslist--detail--value">Octavia</span></li>
      <li class="addetailslist--detail">Kilometerstand<span class="addetailslist--detail--value">150.000 km</span></li>
      <li class="addetailslist--detail">Erstzulassung<span class="addetailslist--detail--value">November 2006</span></li>
      <li class="addetailslist--detail">Kraftstoffart<span class="addetailslist--detail--value">diesel</span></li>
      <li class="addetailslist--detail">Getriebe<span class="addetailslist--detail--value">manuell</span></li>
      <li class="addetailslist--detail">HU bis<span class="addetailslist--detail--value">August 2026</span></li>
    </div>
    <ul class="checktaglist">
      <li class="checktag">Klimaanlage</li>
      <li class="checktag">Tempomat</li>
    </ul>
    <p id="viewad-description-text">
      Skoda Octavia 2 HAND 1.9 diesel 105 PS mit TUEV bis August 2026. Die Auto ist fahrbereit.
      Motor, Getriebe und Kupplung einwandfrei. Verliert aber Oel. Querlenker vorne links macht leichte Geraeusche.
      Preis VB
    </p>
  </body>
</html>
"""


def test_parse_kleinanzeigen_html_extracts_structured_fields() -> None:
    snapshot = parse_kleinanzeigen_html(KLEINANZEIGEN_HTML)

    assert snapshot.source == "Kleinanzeigen"
    assert snapshot.title == "Skoda Octavia 2 HAND 1.9 TDI 105 PS TUEV"
    assert snapshot.asking_price == 1650
    assert snapshot.brand == "Skoda"
    assert snapshot.model == "Octavia"
    assert snapshot.year == 2006
    assert snapshot.km == 150000
    assert snapshot.fuel == "Diesel"
    assert snapshot.city == "Hamburg"
    assert "Querlenker" in snapshot.raw_text


def test_enrich_request_from_url_uses_listing_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.listing_fetcher.fetch_listing_snapshot",
        lambda _url: parse_kleinanzeigen_html(KLEINANZEIGEN_HTML),
    )

    enriched, notes = enrich_request_from_url(
        AnalyzeRequest(
            source="Kleinanzeigen",
            url="https://www.kleinanzeigen.de/s-anzeige/example/123",
        )
    )

    assert enriched.brand == "Skoda"
    assert enriched.model == "Octavia"
    assert enriched.asking_price == 1650
    assert enriched.km == 150000
    assert enriched.fuel == "Diesel"
    assert "Kleinanzeigen title" in notes[1]
