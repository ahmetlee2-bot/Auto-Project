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
