from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .db import (
    create_portfolio_deal,
    create_watchlist_deal,
    delete_portfolio_deal,
    delete_watchlist_deal,
    init_db,
    list_portfolio_deals,
    list_watchlist_deals,
    update_portfolio_note,
    update_portfolio_status,
    update_watchlist_note,
)
from .deal_engine import analyze_listing
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    OperatorNoteUpdate,
    PortfolioDeal,
    PortfolioStatusUpdate,
    SavedDealCreate,
    WatchlistDeal,
)
from .settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="AUTONOW API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    return analyze_listing(payload)


@app.get("/api/v1/watchlist", response_model=list[WatchlistDeal])
def get_watchlist() -> list[WatchlistDeal]:
    return list_watchlist_deals()


@app.post("/api/v1/watchlist", response_model=WatchlistDeal)
def save_watchlist(payload: SavedDealCreate) -> WatchlistDeal:
    return create_watchlist_deal(payload)


@app.delete("/api/v1/watchlist/{deal_id}", status_code=204)
def remove_watchlist(deal_id: int) -> None:
    delete_watchlist_deal(deal_id)


@app.patch("/api/v1/watchlist/{deal_id}/note", response_model=WatchlistDeal)
def patch_watchlist_note(deal_id: int, payload: OperatorNoteUpdate) -> WatchlistDeal:
    updated = update_watchlist_note(deal_id, payload.operator_note)
    if not updated:
        raise HTTPException(status_code=404, detail="Watchlist deal not found.")
    return updated


@app.get("/api/v1/portfolio", response_model=list[PortfolioDeal])
def get_portfolio() -> list[PortfolioDeal]:
    return list_portfolio_deals()


@app.post("/api/v1/portfolio", response_model=PortfolioDeal)
def save_portfolio(payload: SavedDealCreate) -> PortfolioDeal:
    return create_portfolio_deal(payload)


@app.patch("/api/v1/portfolio/{deal_id}", response_model=PortfolioDeal)
def patch_portfolio_status(deal_id: int, payload: PortfolioStatusUpdate) -> PortfolioDeal:
    updated = update_portfolio_status(deal_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Portfolio deal not found.")
    return updated


@app.delete("/api/v1/portfolio/{deal_id}", status_code=204)
def remove_portfolio(deal_id: int) -> None:
    delete_portfolio_deal(deal_id)


@app.patch("/api/v1/portfolio/{deal_id}/note", response_model=PortfolioDeal)
def patch_portfolio_note(deal_id: int, payload: OperatorNoteUpdate) -> PortfolioDeal:
    updated = update_portfolio_note(deal_id, payload.operator_note)
    if not updated:
        raise HTTPException(status_code=404, detail="Portfolio deal not found.")
    return updated
