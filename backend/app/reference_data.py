VEHICLE_REFERENCES = [
    {"brand": "VW", "model": "Golf", "keywords": ["golf"], "baseline_year": 2007, "baseline_km": 155000, "market_price": 3150, "sell_days": "10-18 gun"},
    {"brand": "Opel", "model": "Corsa", "keywords": ["corsa"], "baseline_year": 2008, "baseline_km": 140000, "market_price": 2550, "sell_days": "8-16 gun"},
    {"brand": "Ford", "model": "Focus", "keywords": ["focus"], "baseline_year": 2007, "baseline_km": 165000, "market_price": 2800, "sell_days": "11-20 gun"},
    {"brand": "Skoda", "model": "Fabia", "keywords": ["fabia"], "baseline_year": 2009, "baseline_km": 130000, "market_price": 2950, "sell_days": "9-15 gun"},
    {"brand": "Seat", "model": "Ibiza", "keywords": ["ibiza"], "baseline_year": 2008, "baseline_km": 140000, "market_price": 2700, "sell_days": "9-16 gun"},
    {"brand": "Toyota", "model": "Yaris", "keywords": ["yaris"], "baseline_year": 2007, "baseline_km": 135000, "market_price": 3200, "sell_days": "8-14 gun"},
]

ISSUE_LIBRARY = [
    {"keywords": ["tuv", "tüv"], "label": "TUV / muayene", "repair_range": (80, 250), "risk_score": 16},
    {"keywords": ["motorleuchte", "motor lambasi", "check engine"], "label": "Motor ikaz", "repair_range": (180, 650), "risk_score": 24},
    {"keywords": ["klima"], "label": "Klima", "repair_range": (120, 380), "risk_score": 10},
    {"keywords": ["kupplung", "debriyaj"], "label": "Kupplung", "repair_range": (350, 900), "risk_score": 24},
    {"keywords": ["springt nicht", "calismiyor"], "label": "Calismama", "repair_range": (180, 700), "risk_score": 28},
    {"keywords": ["aku", "batterie"], "label": "Aku", "repair_range": (60, 150), "risk_score": 8},
    {"keywords": ["rost", "pas"], "label": "Rost / pas", "repair_range": (250, 900), "risk_score": 22},
    {"keywords": ["unfall", "hasar"], "label": "Hasar", "repair_range": (350, 1400), "risk_score": 30},
    {"keywords": ["fren", "bremse"], "label": "Fren", "repair_range": (120, 320), "risk_score": 12},
    {"keywords": ["lastik", "reifen"], "label": "Lastik", "repair_range": (180, 420), "risk_score": 10},
]

