from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    source: str = "Manual Import"
    url: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    km: int | None = None
    fuel: str | None = None
    asking_price: int | None = Field(default=None, ge=0)
    city: str = "Hamburg"
    raw_text: str | None = None


class AppSettings(BaseModel):
    preferred_city: str = "Hamburg"
    max_asking_price: int = Field(default=5000, ge=500)
    min_net_profit: int = Field(default=550, ge=0)
    min_margin_percent: int = Field(default=18, ge=0, le=100)
    max_km_benzin: int = Field(default=210000, ge=0)
    max_km_diesel: int = Field(default=190000, ge=0)
    min_year: int = Field(default=2005, ge=1980, le=2030)
    clean_prep_cost: int = Field(default=110, ge=0)
    issue_prep_cost: int = Field(default=180, ge=0)
    transfer_cost: int = Field(default=120, ge=0)
    sales_cost_percent: int = Field(default=6, ge=0, le=40)
    exit_discount_percent: int = Field(default=4, ge=0, le=40)
    low_risk_discount_percent: int = Field(default=8, ge=0, le=40)
    medium_risk_discount_percent: int = Field(default=15, ge=0, le=50)
    high_risk_discount_percent: int = Field(default=22, ge=0, le=60)


class AnalyzeResponse(BaseModel):
    url: str | None = None
    brand: str
    model: str
    title: str
    source: str
    city: str
    year: int
    km: int
    fuel: str
    asking_price: int
    offer_price: int
    total_cost: int
    target_sale_price: int
    net_profit: int
    margin_percent: int
    risk_level: Literal["low", "medium", "high"]
    recommendation: Literal["buy", "caution", "skip"]
    source_parser: str
    parser_confidence: int = Field(ge=0, le=100)
    parser_notes: list[str]
    buy_box_status: Literal["fit", "review", "out"]
    buy_box_notes: list[str]
    confidence_score: int = Field(ge=0, le=100)
    verification_required: bool
    verification_notes: list[str]
    negotiation_points: list[str]
    recommended_message: str
    next_action: str
    operator_note: str = ""
    summary: str
    strengths: list[str]
    warnings: list[str]


class SavedDealCreate(BaseModel):
    source: str
    url: str | None = None
    city: str = "Hamburg"
    brand: str
    model: str
    title: str
    year: int
    km: int
    fuel: str
    asking_price: int = Field(ge=0)
    offer_price: int = Field(ge=0)
    total_cost: int = Field(ge=0)
    target_sale_price: int = Field(ge=0)
    net_profit: int
    margin_percent: int
    risk_level: Literal["low", "medium", "high"]
    recommendation: Literal["buy", "caution", "skip"]
    source_parser: str
    parser_confidence: int = Field(ge=0, le=100)
    parser_notes: list[str]
    buy_box_status: Literal["fit", "review", "out"]
    buy_box_notes: list[str]
    confidence_score: int = Field(ge=0, le=100)
    verification_required: bool
    verification_notes: list[str]
    negotiation_points: list[str]
    recommended_message: str
    next_action: str
    operator_note: str = ""
    summary: str
    strengths: list[str]
    warnings: list[str]


class WatchlistDeal(SavedDealCreate):
    id: int
    created_at: str


class PortfolioDeal(SavedDealCreate):
    id: int
    created_at: str
    status: Literal["sourcing", "prep", "sold"]


class PortfolioStatusUpdate(BaseModel):
    status: Literal["sourcing", "prep", "sold"]


class OperatorNoteUpdate(BaseModel):
    operator_note: str = Field(default="", max_length=2000)


class SearchProfileCreate(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    source: str
    search_url: str = Field(min_length=8, max_length=2000)
    city: str = "Hamburg"
    max_price: int | None = Field(default=None, ge=0)
    min_year: int | None = Field(default=None, ge=1980, le=2030)
    min_profit: int | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=2000)
    active: bool = True


class SearchProfile(SearchProfileCreate):
    id: int
    created_at: str


class SearchProfileStatusUpdate(BaseModel):
    active: bool
