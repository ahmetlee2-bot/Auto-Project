import { calculateDraftTargetPrice, estimateDraftNetProfit } from "../drafts/pricing";
import { premiumDescription } from "../ebay/premium-description";

export type CuratedDepotProduct = {
  id: string;
  asin: string;
  source_marketplace: "AMZ_DE" | "JOYBUY_DE";
  supplier: "amazon_de" | "joybuy_de";
  source_url: string;
  title: string;
  description: string;
  brand: string;
  category_id: string;
  amazon_price: number;
  suggested_ebay_price: number;
  estimated_profit: number;
  estimated_shipping: number;
  images: string[];
  item_specifics: Record<string, string[]>;
  condition: "NEW";
  stock_status: "in_stock";
  is_vero_safe: true;
  is_published: true;
  is_approved: true;
  canPublish: true;
  is_demo: false;
  season_tag: string;
  last_checked_at: string;
  created_at: string;
};

type RawCuratedSeed = {
  id: string;
  asin: string;
  supplier: "amazon_de" | "joybuy_de";
  source_marketplace: "AMZ_DE" | "JOYBUY_DE";
  source_url: string;
  title: string;
  brand: string;
  category_id: string;
  amazon_price: number;
  suggested_ebay_price: number;
  estimated_profit: number;
  image: string;
  season_tag: string;
  summary: string;
  specifics: Record<string, string[]>;
};

const RAW_CURATED_SEEDS: RawCuratedSeed[] = [
  {
    "id": "e2000000-0000-4000-8000-000000000001",
    "asin": "B08CZD8D55",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B08CZD8D55",
    "title": "WIN.MAX Frontscheibenabdeckung Auto Scheibenabdeckung Faltbar Sonnenschutz Winter Windschutzscheiben...",
    "brand": "WINMAX",
    "category_id": "131090",
    "amazon_price": 27.99,
    "suggested_ebay_price": 40.84,
    "estimated_profit": 6.72,
    "image": "https://m.media-amazon.com/images/I/71F3Udu8VzL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "WIN.MAX Frontscheibenabdeckung Auto Scheibenabdeckung Faltbar Sonnenschutz Winter Windschutzscheiben... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "WINMAX"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000002",
    "asin": "B0DSKZRM9H",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DSKZRM9H",
    "title": "Frontscheibenabdeckung Winter, Windschutzscheibenabdeckung mit 10 Magneten | Sonnenschutz Auto Front...",
    "brand": "Frontscheibenabdeckung",
    "category_id": "131090",
    "amazon_price": 23.99,
    "suggested_ebay_price": 35,
    "estimated_profit": 5.76,
    "image": "https://m.media-amazon.com/images/I/81U3FbHoAWL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "Frontscheibenabdeckung Winter, Windschutzscheibenabdeckung mit 10 Magneten | Sonnenschutz Auto Front... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Frontscheibenabdeckung"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000003",
    "asin": "B098HXMZ35",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B098HXMZ35",
    "title": "Frontscheibenabdeckung Auto Winter Windschutzscheibenabdeckung Magnet | Scheibenabdeckung Auto Front...",
    "brand": "Frontscheibenabdeckung",
    "category_id": "131090",
    "amazon_price": 24.99,
    "suggested_ebay_price": 36.46,
    "estimated_profit": 6,
    "image": "https://m.media-amazon.com/images/I/71mCwDEvmAL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "Frontscheibenabdeckung Auto Winter Windschutzscheibenabdeckung Magnet | Scheibenabdeckung Auto Front... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Frontscheibenabdeckung"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000004",
    "asin": "B077RQ6WKQ",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B077RQ6WKQ",
    "title": "Tevlaphee Frontscheibenabdeckung, Windschutzscheibenabdeckung, Autoscheibenabdeckung, Scheibenabdeck...",
    "brand": "Tevlaphee",
    "category_id": "131090",
    "amazon_price": 27.99,
    "suggested_ebay_price": 40.84,
    "estimated_profit": 6.72,
    "image": "https://m.media-amazon.com/images/I/71n3D5vEyZL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "Tevlaphee Frontscheibenabdeckung, Windschutzscheibenabdeckung, Autoscheibenabdeckung, Scheibenabdeck... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Tevlaphee"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000005",
    "asin": "B0CD7PRLM6",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0CD7PRLM6",
    "title": "LYVANAS Eiskratzer Auto mit Besen TESTSIEGER 2026* - schnell & stark | Ergonomischer Profi Schneebes...",
    "brand": "LYVANAS",
    "category_id": "131090",
    "amazon_price": 15.99,
    "suggested_ebay_price": 23.33,
    "estimated_profit": 3.84,
    "image": "https://m.media-amazon.com/images/I/71JcBqF4b6L.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "LYVANAS Eiskratzer Auto mit Besen TESTSIEGER 2026* - schnell & stark | Ergonomischer Profi Schneebes... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LYVANAS"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000006",
    "asin": "B0DG31WV98",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DG31WV98",
    "title": "LICARGO Eiskratzer Auto mit Besen 67cm - Teilbares Stecksystem - stabil & wackelfrei - kratzerfrei &...",
    "brand": "LICARGO",
    "category_id": "131090",
    "amazon_price": 14.44,
    "suggested_ebay_price": 21.07,
    "estimated_profit": 3.47,
    "image": "https://m.media-amazon.com/images/I/71Y0vtfBjcL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "LICARGO Eiskratzer Auto mit Besen 67cm - Teilbares Stecksystem - stabil & wackelfrei - kratzerfrei &... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LICARGO"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000007",
    "asin": "B0BCQ8VYCS",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0BCQ8VYCS",
    "title": "LYVANAS Eiskratzer Auto mit Handschuh TESTSIEGER 2026* mit 100% Komfort | “Eismonster” Profi Scheibe...",
    "brand": "LYVANAS",
    "category_id": "131090",
    "amazon_price": 14.99,
    "suggested_ebay_price": 21.87,
    "estimated_profit": 3.6,
    "image": "https://m.media-amazon.com/images/I/71sh2tZ1O-L.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "LYVANAS Eiskratzer Auto mit Handschuh TESTSIEGER 2026* mit 100% Komfort | “Eismonster” Profi Scheibe... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LYVANAS"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000008",
    "asin": "B0DDQ1NPHZ",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DDQ1NPHZ",
    "title": "LICARGO Eiskratzer Auto mit Besen 41cm - Stabil, Lang & lackschonend | Made IN EU | 2in1 Schneebesen...",
    "brand": "LICARGO",
    "category_id": "131090",
    "amazon_price": 12.74,
    "suggested_ebay_price": 18.59,
    "estimated_profit": 3.06,
    "image": "https://m.media-amazon.com/images/I/71Pe3XBi7bL.jpg",
    "season_tag": "Winter & Frostschutz",
    "summary": "LICARGO Eiskratzer Auto mit Besen 41cm - Stabil, Lang & lackschonend | Made IN EU | 2in1 Schneebesen... – Geprüftes Saisonprodukt (Winter & Frostschutz) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LICARGO"
      ],
      "Saison": [
        "Winter & Frostschutz"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000009",
    "asin": "B0H2DP4W29",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0H2DP4W29",
    "title": "Eisregen Lichterkette Außen 15 m Warmweiß mit Timer und IP44 | 8 Leuchtmodi mit Memory und Stecker; ...",
    "brand": "Eisregen",
    "category_id": "20625",
    "amazon_price": 34.99,
    "suggested_ebay_price": 51.05,
    "estimated_profit": 8.4,
    "image": "https://m.media-amazon.com/images/I/815QinFVH6L.jpg",
    "season_tag": "Advent & Weihnachten",
    "summary": "Eisregen Lichterkette Außen 15 m Warmweiß mit Timer und IP44 | 8 Leuchtmodi mit Memory und Stecker; ... – Geprüftes Saisonprodukt (Advent & Weihnachten) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Eisregen"
      ],
      "Saison": [
        "Advent & Weihnachten"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000010",
    "asin": "B09YLC8JTV",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B09YLC8JTV",
    "title": "Ollny Weihnachtsbeleuchtung außen 40M/80M 400 LED, Dimmbar 8 Modi Timer | Lichterkette strom mit Fer...",
    "brand": "Ollny",
    "category_id": "20625",
    "amazon_price": 19.92,
    "suggested_ebay_price": 29.06,
    "estimated_profit": 4.78,
    "image": "https://m.media-amazon.com/images/I/917ljgi6+KL.jpg",
    "season_tag": "Advent & Weihnachten",
    "summary": "Ollny Weihnachtsbeleuchtung außen 40M/80M 400 LED, Dimmbar 8 Modi Timer | Lichterkette strom mit Fer... – Geprüftes Saisonprodukt (Advent & Weihnachten) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Ollny"
      ],
      "Saison": [
        "Advent & Weihnachten"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000011",
    "asin": "B0FK1913VJ",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0FK1913VJ",
    "title": "Lighprenix Lichterkette außen 20M 200LEDs - Warmweiß Lichterkette Weihnachtsbaum mit Fernbedienung 8...",
    "brand": "Lighprenix",
    "category_id": "20625",
    "amazon_price": 15.99,
    "suggested_ebay_price": 23.33,
    "estimated_profit": 3.84,
    "image": "https://m.media-amazon.com/images/I/81FePBHxmJL.jpg",
    "season_tag": "Advent & Weihnachten",
    "summary": "Lighprenix Lichterkette außen 20M 200LEDs - Warmweiß Lichterkette Weihnachtsbaum mit Fernbedienung 8... – Geprüftes Saisonprodukt (Advent & Weihnachten) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Lighprenix"
      ],
      "Saison": [
        "Advent & Weihnachten"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000012",
    "asin": "B0H4BGSZQX",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0H4BGSZQX",
    "title": "LEEDLIT Lichterkette Außen Innen, 30M 300LEDs Weihnachtsbeleuchtung mit 8 Modus und Timer, IP44 Wass...",
    "brand": "LEEDLIT",
    "category_id": "20625",
    "amazon_price": 18.99,
    "suggested_ebay_price": 27.71,
    "estimated_profit": 4.56,
    "image": "https://m.media-amazon.com/images/I/91hLgGs2KNL.jpg",
    "season_tag": "Advent & Weihnachten",
    "summary": "LEEDLIT Lichterkette Außen Innen, 30M 300LEDs Weihnachtsbeleuchtung mit 8 Modus und Timer, IP44 Wass... – Geprüftes Saisonprodukt (Advent & Weihnachten) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LEEDLIT"
      ],
      "Saison": [
        "Advent & Weihnachten"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000013",
    "asin": "B0F5Q987ZP",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0F5Q987ZP",
    "title": "20 cm Rund Backpapier für Heißluftfritteuse für Ninja und mehr | 100 Stück Papier Einsätze Einweg he...",
    "brand": "20",
    "category_id": "20625",
    "amazon_price": 9.49,
    "suggested_ebay_price": 13.85,
    "estimated_profit": 2.28,
    "image": "https://m.media-amazon.com/images/I/71HrnJsZXvL.jpg",
    "season_tag": "Black Friday & Küche",
    "summary": "20 cm Rund Backpapier für Heißluftfritteuse für Ninja und mehr | 100 Stück Papier Einsätze Einweg he... – Geprüftes Saisonprodukt (Black Friday & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "20"
      ],
      "Saison": [
        "Black Friday & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000014",
    "asin": "B0H9M9QH7V",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0H9M9QH7V",
    "title": "Airfryer Zubehör für COSORI Airfryer Iconic Single 6,2L, 22 Stück | Heißluftfritteuse Zubehör für CO...",
    "brand": "Airfryer",
    "category_id": "20625",
    "amazon_price": 32.99,
    "suggested_ebay_price": 48.13,
    "estimated_profit": 7.92,
    "image": "https://m.media-amazon.com/images/I/81l5oFd54WL.jpg",
    "season_tag": "Black Friday & Küche",
    "summary": "Airfryer Zubehör für COSORI Airfryer Iconic Single 6,2L, 22 Stück | Heißluftfritteuse Zubehör für CO... – Geprüftes Saisonprodukt (Black Friday & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Airfryer"
      ],
      "Saison": [
        "Black Friday & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000015",
    "asin": "B0C231VTC1",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0C231VTC1",
    "title": "3 Packungen Silikonform für Heißluftfritteuse Air Fryer Liners Wiederverwendbar anstelle Airfryer Backpapier Pergamentpapi...",
    "brand": "3",
    "category_id": "20625",
    "amazon_price": 10.99,
    "suggested_ebay_price": 16.04,
    "estimated_profit": 2.64,
    "image": "https://m.media-amazon.com/images/I/716EBx8m2FL.jpg",
    "season_tag": "Black Friday & Küche",
    "summary": "3 Packungen Silikonform für Heißluftfritteuse Air Fryer Liners Wiederverwendbar anstelle Airfryer Backpapier Pergamentpapi... – Geprüftes Saisonprodukt (Black Friday & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "3"
      ],
      "Saison": [
        "Black Friday & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000016",
    "asin": "B0F32QWBR7",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0F32QWBR7",
    "title": "3 Stück Airfryer Silikonform Heißluftfritteuse, Airfryer Zubehör für Cosori, Philips, Tefal, Ninja, Russell Hobbs, Heisslu...",
    "brand": "3",
    "category_id": "20625",
    "amazon_price": 16.99,
    "suggested_ebay_price": 24.79,
    "estimated_profit": 4.08,
    "image": "https://m.media-amazon.com/images/I/71WxfGpKKYL.jpg",
    "season_tag": "Black Friday & Küche",
    "summary": "3 Stück Airfryer Silikonform Heißluftfritteuse, Airfryer Zubehör für Cosori, Philips, Tefal, Ninja, Russell Hobbs, Heisslu... – Geprüftes Saisonprodukt (Black Friday & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "3"
      ],
      "Saison": [
        "Black Friday & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000017",
    "asin": "B0HQS1JZSS",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0HQS1JZSS",
    "title": "iPalamila 3D Filament Vakuumbeutel Kit mit Auto Pumpe,20er Filament Aufbewahrung 32 * 32cmVerbessert...",
    "brand": "iPalamila",
    "category_id": "183068",
    "amazon_price": 39.99,
    "suggested_ebay_price": 58.34,
    "estimated_profit": 9.6,
    "image": "https://m.media-amazon.com/images/I/81ZtQjsEkFL.jpg",
    "season_tag": "Black Friday & Maker",
    "summary": "iPalamila 3D Filament Vakuumbeutel Kit mit Auto Pumpe,20er Filament Aufbewahrung 32 * 32cmVerbessert... – Geprüftes Saisonprodukt (Black Friday & Maker) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "iPalamila"
      ],
      "Saison": [
        "Black Friday & Maker"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000018",
    "asin": "B0F9PDW4RV",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0F9PDW4RV",
    "title": "OVV3D Filament Aufbewahrung Kit mit Auto Pumpe, Plus Size 32X34cm 30 3D-Druck Filament Vakuumbeutel,...",
    "brand": "OVV3D",
    "category_id": "183068",
    "amazon_price": 36.99,
    "suggested_ebay_price": 53.97,
    "estimated_profit": 8.88,
    "image": "https://m.media-amazon.com/images/I/81b1Q532P7L.jpg",
    "season_tag": "Black Friday & Maker",
    "summary": "OVV3D Filament Aufbewahrung Kit mit Auto Pumpe, Plus Size 32X34cm 30 3D-Druck Filament Vakuumbeutel,... – Geprüftes Saisonprodukt (Black Friday & Maker) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "OVV3D"
      ],
      "Saison": [
        "Black Friday & Maker"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000019",
    "asin": "B0F5H57TQ6",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0F5H57TQ6",
    "title": "Vakuumbeutelpumpe, Elektrische Vakuumpumpe, USB wiederaufladbare Elektrische Pumpe 3D Drucker Filame...",
    "brand": "Vakuumbeutelpumpe",
    "category_id": "183068",
    "amazon_price": 19.39,
    "suggested_ebay_price": 28.29,
    "estimated_profit": 4.66,
    "image": "https://m.media-amazon.com/images/I/717laW3ak5L.jpg",
    "season_tag": "Black Friday & Maker",
    "summary": "Vakuumbeutelpumpe, Elektrische Vakuumpumpe, USB wiederaufladbare Elektrische Pumpe 3D Drucker Filame... – Geprüftes Saisonprodukt (Black Friday & Maker) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Vakuumbeutelpumpe"
      ],
      "Saison": [
        "Black Friday & Maker"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000020",
    "asin": "B0G2S6X24G",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0G2S6X24G",
    "title": "30 Stück Filament Vakuumbeutel, 3D-Druck Filament Aufbewahrung, 34 x 30 cm Feuchtigkeitsbeständige A...",
    "brand": "30",
    "category_id": "183068",
    "amazon_price": 18.59,
    "suggested_ebay_price": 27.12,
    "estimated_profit": 4.46,
    "image": "https://m.media-amazon.com/images/I/61+QvcWpsjL.jpg",
    "season_tag": "Black Friday & Maker",
    "summary": "30 Stück Filament Vakuumbeutel, 3D-Druck Filament Aufbewahrung, 34 x 30 cm Feuchtigkeitsbeständige A... – Geprüftes Saisonprodukt (Black Friday & Maker) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "30"
      ],
      "Saison": [
        "Black Friday & Maker"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000021",
    "asin": "B0DPQPB9J4",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DPQPB9J4",
    "title": "Pretty Paw Katzenbrunnen Kabellos mit Bewegungsmelder 3L, Schwarz | 45 Tage Akku, Trinkbrunnen für K...",
    "brand": "Pretty",
    "category_id": "1281",
    "amazon_price": 39.99,
    "suggested_ebay_price": 58.34,
    "estimated_profit": 9.6,
    "image": "https://m.media-amazon.com/images/I/61R-A5XQ3HL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "Pretty Paw Katzenbrunnen Kabellos mit Bewegungsmelder 3L, Schwarz | 45 Tage Akku, Trinkbrunnen für K... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Pretty"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000022",
    "asin": "B0FG2LQQLC",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0FG2LQQLC",
    "title": "Apauk Katzenbrunnen, Trinkbrunnen für Katze, Trinkbrunnen Edelstahl, Ultraleiser Trinkbrunnen für Ka...",
    "brand": "Apauk",
    "category_id": "1281",
    "amazon_price": 19.99,
    "suggested_ebay_price": 29.17,
    "estimated_profit": 4.8,
    "image": "https://m.media-amazon.com/images/I/61YgInOFryL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "Apauk Katzenbrunnen, Trinkbrunnen für Katze, Trinkbrunnen Edelstahl, Ultraleiser Trinkbrunnen für Ka... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Apauk"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000023",
    "asin": "B0F8NFVVZD",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0F8NFVVZD",
    "title": "PETLIBRO Katzenbrunnen, Trinkbrunnen für Katze mit kabelloser Pumpe, 2.5L Dockstream Katzenbrunnen E...",
    "brand": "PETLIBRO",
    "category_id": "1281",
    "amazon_price": 44.99,
    "suggested_ebay_price": 65.64,
    "estimated_profit": 10.8,
    "image": "https://m.media-amazon.com/images/I/61dQ9PDNzoL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "PETLIBRO Katzenbrunnen, Trinkbrunnen für Katze mit kabelloser Pumpe, 2.5L Dockstream Katzenbrunnen E... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "PETLIBRO"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000024",
    "asin": "B0BYCTMWB4",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0BYCTMWB4",
    "title": "PETLIBRO Katzenbrunnen Kabellos mit Bewegungsmelder Dockstream Trinkbrunnen für Katze Kabellos, Batt...",
    "brand": "PETLIBRO",
    "category_id": "1281",
    "amazon_price": 56.97,
    "suggested_ebay_price": 83.11,
    "estimated_profit": 13.67,
    "image": "https://m.media-amazon.com/images/I/71NcJ2F-1NL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "PETLIBRO Katzenbrunnen Kabellos mit Bewegungsmelder Dockstream Trinkbrunnen für Katze Kabellos, Batt... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "PETLIBRO"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000025",
    "asin": "B0FPF19QL7",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0FPF19QL7",
    "title": "Kuoser Winter Hundejacke für Mittelgroße Hunde Wasserdicht Winddicht, L | Wasserdichter Winddichter ...",
    "brand": "Kuoser",
    "category_id": "1281",
    "amazon_price": 39.99,
    "suggested_ebay_price": 58.34,
    "estimated_profit": 9.6,
    "image": "https://m.media-amazon.com/images/I/71u5CjeplkL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "Kuoser Winter Hundejacke für Mittelgroße Hunde Wasserdicht Winddicht, L | Wasserdichter Winddichter ... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Kuoser"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000026",
    "asin": "B0H7RZXD1T",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0H7RZXD1T",
    "title": "CITÉTOILE Winter Hundemantel wasserdicht, Winterjacke mit Reflexstreifen | Wasserdicht, weiches Flee...",
    "brand": "CITTOILE",
    "category_id": "1281",
    "amazon_price": 33.99,
    "suggested_ebay_price": 49.59,
    "estimated_profit": 8.16,
    "image": "https://m.media-amazon.com/images/I/71uC8tcpIIL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "CITÉTOILE Winter Hundemantel wasserdicht, Winterjacke mit Reflexstreifen | Wasserdicht, weiches Flee... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "CITTOILE"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000027",
    "asin": "B0DBL9B3QT",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DBL9B3QT",
    "title": "CITÉTOILE Wasserdichter Winter Hundemantel mit Geschirr Fleece Grau XS | Warme Hundejacke mit Reißve...",
    "brand": "CITTOILE",
    "category_id": "1281",
    "amazon_price": 36.99,
    "suggested_ebay_price": 53.97,
    "estimated_profit": 8.88,
    "image": "https://m.media-amazon.com/images/I/71HhgCIg8iL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "CITÉTOILE Wasserdichter Winter Hundemantel mit Geschirr Fleece Grau XS | Warme Hundejacke mit Reißve... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "CITTOILE"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000028",
    "asin": "B0H9Y9SNWJ",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0H9Y9SNWJ",
    "title": "Queenmore Hundemantel mit Geschirr Wasserdicht & winddicht, Reflektierend | Wintermantel Hund Vierbe...",
    "brand": "Queenmore",
    "category_id": "1281",
    "amazon_price": 52.87,
    "suggested_ebay_price": 77.13,
    "estimated_profit": 12.69,
    "image": "https://m.media-amazon.com/images/I/61Wz+WWdJCL.jpg",
    "season_tag": "Haustier Winterpflege",
    "summary": "Queenmore Hundemantel mit Geschirr Wasserdicht & winddicht, Reflektierend | Wintermantel Hund Vierbe... – Geprüftes Saisonprodukt (Haustier Winterpflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Queenmore"
      ],
      "Saison": [
        "Haustier Winterpflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000029",
    "asin": "B0FY3SZHQY",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0FY3SZHQY",
    "title": "Hairich Drehmomentschlüssel Fahrrad 1/4 Zoll 1–25 Nm, ±3% Genauigkeit, 72-Zähne Ratsche, 33-teiliges...",
    "brand": "Hairich",
    "category_id": "631",
    "amazon_price": 39.99,
    "suggested_ebay_price": 58.34,
    "estimated_profit": 9.6,
    "image": "https://m.media-amazon.com/images/I/71RLapswprL.jpg",
    "season_tag": "Werkzeug & Geschenkideen",
    "summary": "Hairich Drehmomentschlüssel Fahrrad 1/4 Zoll 1–25 Nm, ±3% Genauigkeit, 72-Zähne Ratsche, 33-teiliges... – Geprüftes Saisonprodukt (Werkzeug & Geschenkideen) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Hairich"
      ],
      "Saison": [
        "Werkzeug & Geschenkideen"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000030",
    "asin": "B0FZZH57R9",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0FZZH57R9",
    "title": "ETOOLAB Drehmomentschlüssel Fahrrad 1/4\" 1-26 Nm, 25tlg Fahrradwerkzeug Set | Drehmomentschlüssel ±...",
    "brand": "ETOOLAB",
    "category_id": "631",
    "amazon_price": 35.14,
    "suggested_ebay_price": 51.27,
    "estimated_profit": 8.44,
    "image": "https://m.media-amazon.com/images/I/71BE91HimSL.jpg",
    "season_tag": "Werkzeug & Geschenkideen",
    "summary": "ETOOLAB Drehmomentschlüssel Fahrrad 1/4\" 1-26 Nm, 25tlg Fahrradwerkzeug Set | Drehmomentschlüssel ±... – Geprüftes Saisonprodukt (Werkzeug & Geschenkideen) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "ETOOLAB"
      ],
      "Saison": [
        "Werkzeug & Geschenkideen"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000031",
    "asin": "B0DJMNDBSH",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DJMNDBSH",
    "title": "Drehmomentschlüssel Fahrrad Set 1-25 Nm 20-tlg 1/4 Zoll Fahrradwerkzeug | Für Rennrad, MTB, Motorrad...",
    "brand": "Drehmomentschlüssel",
    "category_id": "631",
    "amazon_price": 49.34,
    "suggested_ebay_price": 71.98,
    "estimated_profit": 11.84,
    "image": "https://m.media-amazon.com/images/I/81e4Fk0pLxL.jpg",
    "season_tag": "Werkzeug & Geschenkideen",
    "summary": "Drehmomentschlüssel Fahrrad Set 1-25 Nm 20-tlg 1/4 Zoll Fahrradwerkzeug | Für Rennrad, MTB, Motorrad... – Geprüftes Saisonprodukt (Werkzeug & Geschenkideen) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Drehmomentschlüssel"
      ],
      "Saison": [
        "Werkzeug & Geschenkideen"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000032",
    "asin": "B0HDT24J3V",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0HDT24J3V",
    "title": "Kleiner Drehmomentschlüssel Fahrrad Set 1/4 Zoll, 2-24 Nm, 15-Teiliges | Torque Wrench Bike ±3 % Genauigkeit, 72 Zähne, in...",
    "brand": "Kleiner",
    "category_id": "631",
    "amazon_price": 25.99,
    "suggested_ebay_price": 37.92,
    "estimated_profit": 6.24,
    "image": "https://m.media-amazon.com/images/I/71nThXTLB6L.jpg",
    "season_tag": "Werkzeug & Geschenkideen",
    "summary": "Kleiner Drehmomentschlüssel Fahrrad Set 1/4 Zoll, 2-24 Nm, 15-Teiliges | Torque Wrench Bike ±3 % Genauigkeit, 72 Zähne, in... – Geprüftes Saisonprodukt (Werkzeug & Geschenkideen) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Kleiner"
      ],
      "Saison": [
        "Werkzeug & Geschenkideen"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000033",
    "asin": "B0CT5F3Q3Y",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0CT5F3Q3Y",
    "title": "RUJIXU 30kg Küchenwaage digital groß waage küche 1g lebensmittelwaage | Food scale 304 Edelstahl mit...",
    "brand": "RUJIXU",
    "category_id": "20625",
    "amazon_price": 43.99,
    "suggested_ebay_price": 64.18,
    "estimated_profit": 10.56,
    "image": "https://m.media-amazon.com/images/I/71Q2ll4GbSL.jpg",
    "season_tag": "Weihnachtsbäckerei & Küche",
    "summary": "RUJIXU 30kg Küchenwaage digital groß waage küche 1g lebensmittelwaage | Food scale 304 Edelstahl mit... – Geprüftes Saisonprodukt (Weihnachtsbäckerei & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "RUJIXU"
      ],
      "Saison": [
        "Weihnachtsbäckerei & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000034",
    "asin": "B0D25XWVKR",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0D25XWVKR",
    "title": "BOMATA Wasserdichte IPX6 Küchenwaage mit 0,1g hohe Präzision | 5kg Kapazität, Hintergrundbeleuchtun...",
    "brand": "BOMATA",
    "category_id": "20625",
    "amazon_price": 26.99,
    "suggested_ebay_price": 39.38,
    "estimated_profit": 6.48,
    "image": "https://m.media-amazon.com/images/I/71JBeTMguiL.jpg",
    "season_tag": "Weihnachtsbäckerei & Küche",
    "summary": "BOMATA Wasserdichte IPX6 Küchenwaage mit 0,1g hohe Präzision | 5kg Kapazität, Hintergrundbeleuchtun... – Geprüftes Saisonprodukt (Weihnachtsbäckerei & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "BOMATA"
      ],
      "Saison": [
        "Weihnachtsbäckerei & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000035",
    "asin": "B0CP74BLCZ",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0CP74BLCZ",
    "title": "BOMATA 0.1g/5kg Große Digitale Küchenwaage, Hochpräzise Bäckereiwaage | % Prozentfunktion, USB aufla...",
    "brand": "BOMATA",
    "category_id": "20625",
    "amazon_price": 34.99,
    "suggested_ebay_price": 51.05,
    "estimated_profit": 8.4,
    "image": "https://m.media-amazon.com/images/I/71uCxUMPW5L.jpg",
    "season_tag": "Weihnachtsbäckerei & Küche",
    "summary": "BOMATA 0.1g/5kg Große Digitale Küchenwaage, Hochpräzise Bäckereiwaage | % Prozentfunktion, USB aufla... – Geprüftes Saisonprodukt (Weihnachtsbäckerei & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "BOMATA"
      ],
      "Saison": [
        "Weihnachtsbäckerei & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000036",
    "asin": "B0C1S5LZ4B",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0C1S5LZ4B",
    "title": "Fousenuk 10kg/1g Küchenwaage elektronische, Edelstahl Digitalwaage mit Lcd | mit Tara Funktion, fein...",
    "brand": "Fousenuk",
    "category_id": "20625",
    "amazon_price": 7.99,
    "suggested_ebay_price": 11.66,
    "estimated_profit": 1.92,
    "image": "https://m.media-amazon.com/images/I/61AtpkQAzDL.jpg",
    "season_tag": "Weihnachtsbäckerei & Küche",
    "summary": "Fousenuk 10kg/1g Küchenwaage elektronische, Edelstahl Digitalwaage mit Lcd | mit Tara Funktion, fein... – Geprüftes Saisonprodukt (Weihnachtsbäckerei & Küche) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Fousenuk"
      ],
      "Saison": [
        "Weihnachtsbäckerei & Küche"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000037",
    "asin": "B0BZVPDLX2",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0BZVPDLX2",
    "title": "Ziitty Fusselrasierer Elektrisch, Fusselentferner für 3 Einstellbaren Leistungsstufen, 6-Klingen-Kop...",
    "brand": "Ziitty",
    "category_id": "20625",
    "amazon_price": 23.79,
    "suggested_ebay_price": 34.71,
    "estimated_profit": 5.71,
    "image": "https://m.media-amazon.com/images/I/618uwzgnjcL.jpg",
    "season_tag": "Wintermode Pflege",
    "summary": "Ziitty Fusselrasierer Elektrisch, Fusselentferner für 3 Einstellbaren Leistungsstufen, 6-Klingen-Kop... – Geprüftes Saisonprodukt (Wintermode Pflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Ziitty"
      ],
      "Saison": [
        "Wintermode Pflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000038",
    "asin": "B0D83HF53W",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0D83HF53W",
    "title": "Ziitty Fusselrasierer Elektrisch, Tragbarer Aufladbar Fusselentferner, LCD-Anzeige, Kompletter Fusse...",
    "brand": "Ziitty",
    "category_id": "20625",
    "amazon_price": 19.99,
    "suggested_ebay_price": 29.17,
    "estimated_profit": 4.8,
    "image": "https://m.media-amazon.com/images/I/71XzRA2DpPL.jpg",
    "season_tag": "Wintermode Pflege",
    "summary": "Ziitty Fusselrasierer Elektrisch, Tragbarer Aufladbar Fusselentferner, LCD-Anzeige, Kompletter Fusse... – Geprüftes Saisonprodukt (Wintermode Pflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "Ziitty"
      ],
      "Saison": [
        "Wintermode Pflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000039",
    "asin": "B0GWPYWMM3",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0GWPYWMM3",
    "title": "BEAUTURAL Fusselrasierer Elektrisch für verschiedene Stoffe | Aufladbarer, mit LED-Display, 3 Geschw...",
    "brand": "BEAUTURAL",
    "category_id": "20625",
    "amazon_price": 16.99,
    "suggested_ebay_price": 24.79,
    "estimated_profit": 4.08,
    "image": "https://m.media-amazon.com/images/I/61Om57DS4sL.jpg",
    "season_tag": "Wintermode Pflege",
    "summary": "BEAUTURAL Fusselrasierer Elektrisch für verschiedene Stoffe | Aufladbarer, mit LED-Display, 3 Geschw... – Geprüftes Saisonprodukt (Wintermode Pflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "BEAUTURAL"
      ],
      "Saison": [
        "Wintermode Pflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000040",
    "asin": "B0DK1WZ26C",
    "supplier": "amazon_de",
    "source_marketplace": "AMZ_DE",
    "source_url": "https://www.amazon.de/dp/B0DK1WZ26C",
    "title": "LEBENLANG Fusselrasierer Elektrisch 2000mAh - Inkl. LED Anzeige | Inkl. Reinigungspinsel I Bis zu 2h...",
    "brand": "LEBENLANG",
    "category_id": "20625",
    "amazon_price": 26.99,
    "suggested_ebay_price": 39.38,
    "estimated_profit": 6.48,
    "image": "https://m.media-amazon.com/images/I/71iDX26cAZL.jpg",
    "season_tag": "Wintermode Pflege",
    "summary": "LEBENLANG Fusselrasierer Elektrisch 2000mAh - Inkl. LED Anzeige | Inkl. Reinigungspinsel I Bis zu 2h... – Geprüftes Saisonprodukt (Wintermode Pflege) mit direkter Verfügbarkeit auf Amazon.de.",
    "specifics": {
      "Marke": [
        "LEBENLANG"
      ],
      "Saison": [
        "Wintermode Pflege"
      ],
      "Zustand": [
        "Neu & Originalverpackt"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000101",
    "asin": "JB-100630217",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/iagreea-tragbarer-elektrischer-kocher-16-l/100630217",
    "title": "IAGREEA Tragbarer elektrischer Kocher 1,6 L Ramen-Kocher, Ramen-Nudelkocher – Dual Power Mini Ramen-Maker, multifunktionaler Lazy Pot, antih",
    "brand": "IAGREEA",
    "category_id": "20625",
    "amazon_price": 9.99,
    "suggested_ebay_price": 15.05,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/2359296/61098360154825/1840160/699e9a70Ea582db48/42b10752b5083d5e.png.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "IAGREEA Tragbarer elektrischer Kocher 1,6 L Ramen-Kocher, Ramen-Nudelkocher – Dual Power Mini Ramen-Maker, multifunktionaler Lazy Pot, antih – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "IAGREEA"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000102",
    "asin": "JB-10383689",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/konka-300-ml-kleiner-automatischer-kaffeemaschine/10383689",
    "title": "Konka 300 ml kleiner automatischer Kaffeemaschine für den Heimgebrauch, multifunktionale Drip-Kaffeekanne zum Kaffee- und Kräuterteebrühen",
    "brand": "Konka",
    "category_id": "20625",
    "amazon_price": 13.39,
    "suggested_ebay_price": 20.17,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/786432/61098360144297/809621/6a1ed85fEe6e1116b/42b10752b5083d5e.png.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Konka 300 ml kleiner automatischer Kaffeemaschine für den Heimgebrauch, multifunktionale Drip-Kaffeekanne zum Kaffee- und Kräuterteebrühen – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Konka"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000103",
    "asin": "JB-10111689",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/bear-ddzj25g2-elektrischer-schongarer-41-l/10111689",
    "title": "Bear DDZ-J25G2 elektrischer Schongarer 4,1 L, Multifunktions-Dampfgarer, Suppenbereiter mit Mikrodruck-Technologie",
    "brand": "Bear",
    "category_id": "20625",
    "amazon_price": 38.99,
    "suggested_ebay_price": 58.72,
    "estimated_profit": 10.92,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/4390912/610987106161659/143360/69a13972E6a2b2235/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Bear DDZ-J25G2 elektrischer Schongarer 4,1 L, Multifunktions-Dampfgarer, Suppenbereiter mit Mikrodruck-Technologie – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Bear"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000104",
    "asin": "JB-10285826",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/bear-yzjf01d6-kaltpressentsafter-mit-langsamer-pressung/10285826",
    "title": "Bear YZJ-F01D6 Kaltpress-Entsafter mit langsamer Pressung, 1 L, 80 mm breite Einfüllöffnung, Silber",
    "brand": "Bear",
    "category_id": "20625",
    "amazon_price": 23.99,
    "suggested_ebay_price": 36.13,
    "estimated_profit": 6.72,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/1572864/610987106328518/109536/69142008E81deba54/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Bear YZJ-F01D6 Kaltpress-Entsafter mit langsamer Pressung, 1 L, 80 mm breite Einfüllöffnung, Silber – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Bear"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000105",
    "asin": "JB-10137027",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/bear-multifunktionaler-elektrischer-kochtopf-drgc16z1-16/10137027",
    "title": "Bear multifunktionaler elektrischer Kochtopf DRG-C16Z1 – 1,6 Liter Topf",
    "brand": "Bear",
    "category_id": "20625",
    "amazon_price": 14.99,
    "suggested_ebay_price": 22.58,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/3342336/6109817342720/27034/69199a62Efa86ce3c/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Bear multifunktionaler elektrischer Kochtopf DRG-C16Z1 – 1,6 Liter Topf – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Bear"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000106",
    "asin": "JB-10112381",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/bear-gesundheitskocher-yshc18r6-18-liter-10001200/10112381",
    "title": "Bear Gesundheitskocher YSH-C18R6, 1,8 Liter, 1000–1200 W, 16 intelligente Programme",
    "brand": "Bear",
    "category_id": "183068",
    "amazon_price": 24.99,
    "suggested_ebay_price": 37.64,
    "estimated_profit": 7,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/8323072/61097966160593/69887/69a0ec73E3673193f/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "Bear Gesundheitskocher YSH-C18R6, 1,8 Liter, 1000–1200 W, 16 intelligente Programme – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "Bear"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000107",
    "asin": "JB-10428477",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/bear-intelligenter-teigmixer-hmja50n1-müheloses-kneten/10428477",
    "title": "Bear Intelligenter Teigmixer HMJ-A50N1, müheloses Kneten und Ruhen, 5 L große Fassungsvermögen für die Familie (knetet bis zu 2,5 kg Teig au",
    "brand": "Bear",
    "category_id": "20625",
    "amazon_price": 49.99,
    "suggested_ebay_price": 75.28,
    "estimated_profit": 14,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/7208960/610987106160879/259436/69a10adcEd8bdd432/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Bear Intelligenter Teigmixer HMJ-A50N1, müheloses Kneten und Ruhen, 5 L große Fassungsvermögen für die Familie (knetet bis zu 2,5 kg Teig au – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Bear"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000108",
    "asin": "JB-101873602",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/instant-pot-superior-slow-cooker-7/101873602",
    "title": "Instant Pot, Superior Slow Cooker, 7 L., Grey - 140-6128-01-EU",
    "brand": "Instant",
    "category_id": "20625",
    "amazon_price": 55.94,
    "suggested_ebay_price": 84.24,
    "estimated_profit": 15.66,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/1048576/62072201901621/225348/6a6c5862E9c42da37/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Instant Pot, Superior Slow Cooker, 7 L., Grey - 140-6128-01-EU – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Instant"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000109",
    "asin": "JB-102683779",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/ochama-4-l-reiskocher-930-w/102683779",
    "title": "Ochama 4 L Reiskocher, 930 W, PFOA-freier Keramik-beschichteter Innentopf, Intelligenter Timer, 6 Kochfunktionen, LED-Display, Inkl. Reislöf",
    "brand": "Ochama",
    "category_id": "183068",
    "amazon_price": 31.99,
    "suggested_ebay_price": 48.18,
    "estimated_profit": 8.96,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/6946816/62073711052136/163897/6a7ae1dfE312386ad/42b10752b5083d5e.png.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "Ochama 4 L Reiskocher, 930 W, PFOA-freier Keramik-beschichteter Innentopf, Intelligenter Timer, 6 Kochfunktionen, LED-Display, Inkl. Reislöf – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "Ochama"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000110",
    "asin": "JB-100006340018121",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/ochama-elektrischer-dampfgarer-1500w-elektrohotpot-3in1/100006340018121",
    "title": "ochama elektrischer Dampfgarer, 1500W Elektro-Hotpot, 3-in-1 Dampfen, Schmoren und Kochen, doppelwandiger Garraum aus Edelstahl, 12L Großkap",
    "brand": "ochama",
    "category_id": "20625",
    "amazon_price": 59.99,
    "suggested_ebay_price": 90.34,
    "estimated_profit": 16.8,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/5898240/6207220144890/145665/6ab4d7e1E1cecb5c5/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "ochama elektrischer Dampfgarer, 1500W Elektro-Hotpot, 3-in-1 Dampfen, Schmoren und Kochen, doppelwandiger Garraum aus Edelstahl, 12L Großkap – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "ochama"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000111",
    "asin": "JB-102744200",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/esun-plabasic-3ddruck-filament-175-mm/102744200",
    "title": "eSUN PLA-Basic 3D-Druck Filament 1,75 mm - Weiß 1 kg, Hochgeschwindigkeit & hohe Kostenersparnis Verbessertes PLA 3D-Filament für die meiste",
    "brand": "eSUN",
    "category_id": "183068",
    "amazon_price": 7.99,
    "suggested_ebay_price": 12.04,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/5505024/6207370122248/1195374/6a193f93E6461187a/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "eSUN PLA-Basic 3D-Druck Filament 1,75 mm - Weiß 1 kg, Hochgeschwindigkeit & hohe Kostenersparnis Verbessertes PLA 3D-Filament für die meiste – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "eSUN"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000112",
    "asin": "JB-10322363",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/anycubic-plabasisdruckfilament-spule-mit-1-kg/10322363",
    "title": "ANYCUBIC PLA-Basis-Druckfilament, Spule mit 1 kg, Durchmesser 1,75 mm, Toleranz ± 0,02 mm - Weiß",
    "brand": "ANYCUBIC",
    "category_id": "183068",
    "amazon_price": 8.99,
    "suggested_ebay_price": 13.54,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/196608/610979661239605/1543124/6a880b3eEf9b8a750/42b10752b5083d5e.png.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "ANYCUBIC PLA-Basis-Druckfilament, Spule mit 1 kg, Durchmesser 1,75 mm, Toleranz ± 0,02 mm - Weiß – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "ANYCUBIC"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000113",
    "asin": "JB-100392766",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/joybuyxanycubic-petgfilament-1-kg-weiß/100392766",
    "title": "JOYBUYxANYCUBIC PETG-Filament 1 kg - Weiß",
    "brand": "JOYBUYxANYCUBIC",
    "category_id": "183068",
    "amazon_price": 7.99,
    "suggested_ebay_price": 12.04,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/1703936/620722011239954/1622449/6a8813c0E99c4f11b/42b10752b5083d5e.png.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "JOYBUYxANYCUBIC PETG-Filament 1 kg - Weiß – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "JOYBUYxANYCUBIC"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000114",
    "asin": "JB-102738312",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/esun-petgbasic-schwarz-3dfilament-175-mm/102738312",
    "title": "eSUN PETG-Basic Schwarz 3D-Filament 1,75 mm, Hochgeschwindigkeitsdruck, Kosteneffizientes Einstiegs-3D-Druckmaterial 1 kg (2,2 Lbs) Karton-S",
    "brand": "eSUN",
    "category_id": "183068",
    "amazon_price": 7.99,
    "suggested_ebay_price": 12.04,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/5505024/6207371133345/516535/6a1d2322Ef3966422/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "eSUN PETG-Basic Schwarz 3D-Filament 1,75 mm, Hochgeschwindigkeitsdruck, Kosteneffizientes Einstiegs-3D-Druckmaterial 1 kg (2,2 Lbs) Karton-S – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "eSUN"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000115",
    "asin": "JB-100690082",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/cailab-plafilament-silk-für-3ddrucker-4/100690082",
    "title": "CAILAB PLA-Filament Silk für 3D-Drucker – 4 Farben – Die vier Grundfarben",
    "brand": "CAILAB",
    "category_id": "183068",
    "amazon_price": 10.99,
    "suggested_ebay_price": 16.55,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/4849664/610981790261/1116523/6aab4b99E7f52cd8a/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "CAILAB PLA-Filament Silk für 3D-Drucker – 4 Farben – Die vier Grundfarben – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "CAILAB"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000116",
    "asin": "JB-100027265004164",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/petgfilament-mysterybox-12erset-12-kg-12/100027265004164",
    "title": "PETG-Filament Mystery-Box 12er-Set – 12 kg, 12 Spulen à 1 kg, mind. 7 Farben, 1,75 mm – DoPro 3D",
    "brand": "PETG-Filament",
    "category_id": "183068",
    "amazon_price": 71.88,
    "suggested_ebay_price": 108.25,
    "estimated_profit": 20.13,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/7733248/6207371689019/214147/6ac51220E240df17b/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Black Friday & 3D-Druck",
    "summary": "PETG-Filament Mystery-Box 12er-Set – 12 kg, 12 Spulen à 1 kg, mind. 7 Farben, 1,75 mm – DoPro 3D – Direkt verifiziertes Joybuy.de-Produkt für Black Friday & 3D-Druck.",
    "specifics": {
      "Marke": [
        "PETG-Filament"
      ],
      "Saison": [
        "Black Friday & 3D-Druck"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000117",
    "asin": "JB-10391612",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/oatly-haferdrink-barista-edition-6erpack-6/10391612",
    "title": "OATLY Haferdrink Barista Edition 6er-Pack (6 x 1 L)",
    "brand": "OATLY",
    "category_id": "20625",
    "amazon_price": 9.99,
    "suggested_ebay_price": 15.05,
    "estimated_profit": 5.2,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/1835008/61097966114658/164334/68da4a5dE6f6e7437/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "OATLY Haferdrink Barista Edition 6er-Pack (6 x 1 L) – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "OATLY"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000118",
    "asin": "JB-10113017",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/asahi-calpis-lpack-1-l/10113017",
    "title": "Asahi Calpis L-Pack 1 L",
    "brand": "Asahi",
    "category_id": "20625",
    "amazon_price": 10.99,
    "suggested_ebay_price": 16.55,
    "estimated_profit": 5.2,
    "image": "https://images3.joy-sourcing.com/product/s224x224_jfsintlpro-000-com/t1/4294967296/8257536/61098710662755/579575/68cd136eE35a30129/4c765c6ab87a3a67.png.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Asahi Calpis L-Pack 1 L – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Asahi"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000119",
    "asin": "JB-10148315",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/ochama-akku-staubsauger-4in1-kabelloser-handstaubsauger/10148315",
    "title": "Ochama Akku Staubsauger, 4-in-1 Kabelloser Handstaubsauger, 18kPa, LED-Anzeige, 40 Minuten Laufzeit, Haushaltsstaubsauger für Zuhause, Tierh",
    "brand": "Ochama",
    "category_id": "20625",
    "amazon_price": 43.78,
    "suggested_ebay_price": 65.93,
    "estimated_profit": 12.26,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/6356992/101615961274396/332425/69ccc0feE263c29de/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "Ochama Akku Staubsauger, 4-in-1 Kabelloser Handstaubsauger, 18kPa, LED-Anzeige, 40 Minuten Laufzeit, Haushaltsstaubsauger für Zuhause, Tierh – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "Ochama"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  },
  {
    "id": "e2000000-0000-4000-8000-000000000120",
    "asin": "JB-100016875176674",
    "supplier": "joybuy_de",
    "source_marketplace": "JOYBUY_DE",
    "source_url": "https://www.joybuy.de/dp/vactechpro-akkustaubsauger-58-kpa-60-min/100016875176674",
    "title": "VACTechPro Akku-Staubsauger, 58 kPa, 60 Min. Laufzeit, leichter Handstaubsauger für Tierhaare & Zuhause, 6-in-1, abnehmbarer Akku, Anti-Verw",
    "brand": "VACTechPro",
    "category_id": "20625",
    "amazon_price": 59.98,
    "suggested_ebay_price": 90.33,
    "estimated_profit": 16.8,
    "image": "https://images4.joy-sourcing.com/product/s224x224_jfsintlpro-000-product/t1/4294967296/1310720/610983601222866/167781/6a86c1e4Effe21ff3/42b10752b5083d5e.jpg!q70.webp",
    "season_tag": "Weihnachtsküche & Haushalt",
    "summary": "VACTechPro Akku-Staubsauger, 58 kPa, 60 Min. Laufzeit, leichter Handstaubsauger für Tierhaare & Zuhause, 6-in-1, abnehmbarer Akku, Anti-Verw – Direkt verifiziertes Joybuy.de-Produkt für Weihnachtsküche & Haushalt.",
    "specifics": {
      "Marke": [
        "VACTechPro"
      ],
      "Saison": [
        "Weihnachtsküche & Haushalt"
      ],
      "Lieferant": [
        "Joybuy Deutschland"
      ]
    }
  }
];

const SEED_TIMESTAMP = "2026-11-11T00:00:00.000Z";

export const ALL_CURATED_DEPOT_PRODUCTS: CuratedDepotProduct[] = RAW_CURATED_SEEDS.map((seed) => {
  const base20Price =
    calculateDraftTargetPrice({
      source_price: seed.amazon_price,
      shipping_cost: 0,
      profit_margin_percent: 20,
    }) ?? Number((seed.amazon_price * 1.2).toFixed(2));
  const minProfitFloor = seed.amazon_price >= 55 ? 12.05 : 5.05;
  const floorPrice = Math.ceil((seed.amazon_price + minProfitFloor) * 100 - 1e-8) / 100;
  const effectiveEbayPrice = Math.max(base20Price, floorPrice);
  const effectiveProfit =
    estimateDraftNetProfit(
      {
        source_price: seed.amazon_price,
        shipping_cost: 0,
        profit_margin_percent: 20,
      },
      effectiveEbayPrice,
    ) ?? Number((effectiveEbayPrice - seed.amazon_price).toFixed(2));
  return {
    id: seed.id,
    asin: seed.asin,
    source_marketplace: seed.source_marketplace,
    supplier: seed.supplier,
    source_url: seed.source_url,
    title: seed.title,
    description: premiumDescription({
      title: seed.title,
      asin: seed.asin,
      brand: seed.brand,
      description: seed.summary,
      itemSpecifics: seed.specifics,
    }),
    brand: seed.brand,
    category_id: seed.category_id,
    amazon_price: seed.amazon_price,
    suggested_ebay_price: effectiveEbayPrice,
    estimated_profit: effectiveProfit,
    estimated_shipping: 0,
    images: [seed.image],
    item_specifics: seed.specifics,
    condition: "NEW",
    stock_status: "in_stock",
    is_vero_safe: true,
    is_published: true,
    is_approved: true,
    canPublish: true,
    is_demo: false,
    season_tag: seed.season_tag,
    last_checked_at: SEED_TIMESTAMP,
    created_at: SEED_TIMESTAMP,
  };
});

export function getRotatedCuratedCatalog(cycleIndex = Math.floor(Date.now() / (3 * 24 * 60 * 60 * 1000)), excludedAsins?: Set<string>): CuratedDepotProduct[] {
  const available = ALL_CURATED_DEPOT_PRODUCTS.filter((item) => !excludedAsins || !excludedAsins.has(item.asin.toUpperCase()));
  const amzPool = available.filter((item) => item.source_marketplace === "AMZ_DE");
  const jbPool = available.filter((item) => item.source_marketplace === "JOYBUY_DE");

  const rotateSlice = <T,>(arr: T[], count: number): T[] => {
    if (arr.length <= count) return arr;
    const offset = (cycleIndex * 7) % arr.length;
    const doubled = [...arr, ...arr];
    return doubled.slice(offset, offset + count);
  };

  return [
    ...rotateSlice(amzPool, 20),
    ...rotateSlice(jbPool, 10),
  ];
}

export const CURATED_DEPOT_CATALOG: CuratedDepotProduct[] = getRotatedCuratedCatalog(0);

export function filterCuratedDepotCatalog(filters: {
  marketplace?: string | null;
  category?: string | null;
  maxPrice?: number | null;
  minProfit?: number | null;
  cycleIndex?: number;
  excludedAsins?: Set<string>;
}): CuratedDepotProduct[] {
  const base = getRotatedCuratedCatalog(filters.cycleIndex, filters.excludedAsins);
  return base.filter((item) => {
    if (
      (filters.marketplace === "AMZ_DE" || filters.marketplace === "JOYBUY_DE" || filters.marketplace === "AMZ_US") &&
      item.source_marketplace !== filters.marketplace
    ) {
      return false;
    }
    if (filters.category && filters.category !== "ALL" && item.category_id !== filters.category) {
      return false;
    }
    if (filters.maxPrice !== null && filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice) && filters.maxPrice >= 0) {
      if (item.amazon_price > filters.maxPrice) return false;
    }
    if (filters.minProfit !== null && filters.minProfit !== undefined && Number.isFinite(filters.minProfit) && filters.minProfit >= 0) {
      if (item.estimated_profit < filters.minProfit) return false;
    }
    return true;
  }).sort((a, b) => b.estimated_profit - a.estimated_profit);
}
