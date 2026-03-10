from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .schemas import PortfolioDeal, SavedDealCreate, WatchlistDeal
from .settings import settings

WATCHLIST_SCHEMA_COLUMNS = {
    "source": "TEXT NOT NULL",
    "url": "TEXT",
    "city": "TEXT NOT NULL",
    "brand": "TEXT NOT NULL",
    "model": "TEXT NOT NULL",
    "title": "TEXT NOT NULL",
    "year": "INTEGER NOT NULL",
    "km": "INTEGER NOT NULL",
    "fuel": "TEXT NOT NULL",
    "asking_price": "INTEGER NOT NULL",
    "offer_price": "INTEGER NOT NULL",
    "total_cost": "INTEGER NOT NULL",
    "target_sale_price": "INTEGER NOT NULL",
    "net_profit": "INTEGER NOT NULL",
    "margin_percent": "INTEGER NOT NULL",
    "risk_level": "TEXT NOT NULL",
    "recommendation": "TEXT NOT NULL",
    "source_parser": "TEXT NOT NULL DEFAULT 'generic'",
    "parser_confidence": "INTEGER NOT NULL DEFAULT 0",
    "parser_notes_json": "TEXT NOT NULL DEFAULT '[]'",
    "buy_box_status": "TEXT NOT NULL DEFAULT 'review'",
    "buy_box_notes_json": "TEXT NOT NULL DEFAULT '[]'",
    "confidence_score": "INTEGER NOT NULL DEFAULT 0",
    "verification_required": "INTEGER NOT NULL DEFAULT 1",
    "verification_notes_json": "TEXT NOT NULL DEFAULT '[]'",
    "negotiation_points_json": "TEXT NOT NULL DEFAULT '[]'",
    "recommended_message": "TEXT NOT NULL DEFAULT ''",
    "next_action": "TEXT NOT NULL DEFAULT ''",
    "operator_note": "TEXT NOT NULL DEFAULT ''",
    "summary": "TEXT NOT NULL",
    "strengths_json": "TEXT NOT NULL",
    "warnings_json": "TEXT NOT NULL",
}

PORTFOLIO_SCHEMA_COLUMNS = {
    **WATCHLIST_SCHEMA_COLUMNS,
    "status": "TEXT NOT NULL DEFAULT 'sourcing'",
}


def init_db() -> None:
    db_path = os.path.abspath(settings.db_path)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL,
                url TEXT,
                city TEXT NOT NULL,
                brand TEXT NOT NULL,
                model TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER NOT NULL,
                km INTEGER NOT NULL,
                fuel TEXT NOT NULL,
                asking_price INTEGER NOT NULL,
                offer_price INTEGER NOT NULL,
                total_cost INTEGER NOT NULL,
                target_sale_price INTEGER NOT NULL,
                net_profit INTEGER NOT NULL,
                margin_percent INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                source_parser TEXT NOT NULL DEFAULT 'generic',
                parser_confidence INTEGER NOT NULL DEFAULT 0,
                parser_notes_json TEXT NOT NULL DEFAULT '[]',
                buy_box_status TEXT NOT NULL DEFAULT 'review',
                buy_box_notes_json TEXT NOT NULL DEFAULT '[]',
                confidence_score INTEGER NOT NULL DEFAULT 0,
                verification_required INTEGER NOT NULL DEFAULT 1,
                verification_notes_json TEXT NOT NULL DEFAULT '[]',
                negotiation_points_json TEXT NOT NULL DEFAULT '[]',
                recommended_message TEXT NOT NULL DEFAULT '',
                next_action TEXT NOT NULL DEFAULT '',
                operator_note TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL,
                strengths_json TEXT NOT NULL,
                warnings_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS portfolio_deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL,
                url TEXT,
                city TEXT NOT NULL,
                brand TEXT NOT NULL,
                model TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER NOT NULL,
                km INTEGER NOT NULL,
                fuel TEXT NOT NULL,
                asking_price INTEGER NOT NULL,
                offer_price INTEGER NOT NULL,
                total_cost INTEGER NOT NULL,
                target_sale_price INTEGER NOT NULL,
                net_profit INTEGER NOT NULL,
                margin_percent INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                source_parser TEXT NOT NULL DEFAULT 'generic',
                parser_confidence INTEGER NOT NULL DEFAULT 0,
                parser_notes_json TEXT NOT NULL DEFAULT '[]',
                buy_box_status TEXT NOT NULL DEFAULT 'review',
                buy_box_notes_json TEXT NOT NULL DEFAULT '[]',
                confidence_score INTEGER NOT NULL DEFAULT 0,
                verification_required INTEGER NOT NULL DEFAULT 1,
                verification_notes_json TEXT NOT NULL DEFAULT '[]',
                negotiation_points_json TEXT NOT NULL DEFAULT '[]',
                recommended_message TEXT NOT NULL DEFAULT '',
                next_action TEXT NOT NULL DEFAULT '',
                operator_note TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL,
                strengths_json TEXT NOT NULL,
                warnings_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'sourcing'
            )
            """
        )
        _ensure_columns(connection, "watchlist_deals", WATCHLIST_SCHEMA_COLUMNS)
        _ensure_columns(connection, "portfolio_deals", PORTFOLIO_SCHEMA_COLUMNS)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_watchlist_created_at ON watchlist_deals(created_at DESC)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_portfolio_created_at ON portfolio_deals(created_at DESC)"
        )
        connection.commit()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(os.path.abspath(settings.db_path))
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def list_watchlist_deals() -> list[WatchlistDeal]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM watchlist_deals ORDER BY datetime(created_at) DESC, id DESC"
        ).fetchall()
    return [_row_to_watchlist_deal(row) for row in rows]


def create_watchlist_deal(payload: SavedDealCreate) -> WatchlistDeal:
    values = _saved_deal_values(payload)
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO watchlist_deals (
                source, url, city, brand, model, title, year, km, fuel,
                asking_price, offer_price, total_cost, target_sale_price,
                net_profit, margin_percent, risk_level, recommendation,
                source_parser, parser_confidence, parser_notes_json, buy_box_status, buy_box_notes_json,
                confidence_score, verification_required, verification_notes_json,
                negotiation_points_json, recommended_message, next_action, operator_note,
                summary, strengths_json, warnings_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM watchlist_deals WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return _row_to_watchlist_deal(row)


def delete_watchlist_deal(deal_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM watchlist_deals WHERE id = ?", (deal_id,))
        connection.commit()


def update_watchlist_note(deal_id: int, operator_note: str) -> WatchlistDeal | None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE watchlist_deals SET operator_note = ? WHERE id = ?",
            (operator_note, deal_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM watchlist_deals WHERE id = ?",
            (deal_id,),
        ).fetchone()
    return _row_to_watchlist_deal(row) if row else None


def list_portfolio_deals() -> list[PortfolioDeal]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM portfolio_deals ORDER BY datetime(created_at) DESC, id DESC"
        ).fetchall()
    return [_row_to_portfolio_deal(row) for row in rows]


def create_portfolio_deal(payload: SavedDealCreate, status: str = "sourcing") -> PortfolioDeal:
    values = _saved_deal_values(payload) + (status,)
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO portfolio_deals (
                source, url, city, brand, model, title, year, km, fuel,
                asking_price, offer_price, total_cost, target_sale_price,
                net_profit, margin_percent, risk_level, recommendation,
                source_parser, parser_confidence, parser_notes_json, buy_box_status, buy_box_notes_json,
                confidence_score, verification_required, verification_notes_json,
                negotiation_points_json, recommended_message, next_action, operator_note,
                summary, strengths_json, warnings_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM portfolio_deals WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return _row_to_portfolio_deal(row)


def update_portfolio_status(deal_id: int, status: str) -> PortfolioDeal | None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE portfolio_deals SET status = ? WHERE id = ?",
            (status, deal_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM portfolio_deals WHERE id = ?",
            (deal_id,),
        ).fetchone()
    return _row_to_portfolio_deal(row) if row else None


def delete_portfolio_deal(deal_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM portfolio_deals WHERE id = ?", (deal_id,))
        connection.commit()


def update_portfolio_note(deal_id: int, operator_note: str) -> PortfolioDeal | None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE portfolio_deals SET operator_note = ? WHERE id = ?",
            (operator_note, deal_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM portfolio_deals WHERE id = ?",
            (deal_id,),
        ).fetchone()
    return _row_to_portfolio_deal(row) if row else None


def _saved_deal_values(payload: SavedDealCreate) -> tuple[object, ...]:
    return (
        payload.source,
        payload.url,
        payload.city,
        payload.brand,
        payload.model,
        payload.title,
        payload.year,
        payload.km,
        payload.fuel,
        payload.asking_price,
        payload.offer_price,
        payload.total_cost,
        payload.target_sale_price,
        payload.net_profit,
        payload.margin_percent,
        payload.risk_level,
        payload.recommendation,
        payload.source_parser,
        payload.parser_confidence,
        json.dumps(payload.parser_notes),
        payload.buy_box_status,
        json.dumps(payload.buy_box_notes),
        payload.confidence_score,
        1 if payload.verification_required else 0,
        json.dumps(payload.verification_notes),
        json.dumps(payload.negotiation_points),
        payload.recommended_message,
        payload.next_action,
        payload.operator_note,
        payload.summary,
        json.dumps(payload.strengths),
        json.dumps(payload.warnings),
    )


def _row_to_watchlist_deal(row: sqlite3.Row) -> WatchlistDeal:
    return WatchlistDeal(
        id=row["id"],
        created_at=row["created_at"],
        source=row["source"],
        url=row["url"],
        city=row["city"],
        brand=row["brand"],
        model=row["model"],
        title=row["title"],
        year=row["year"],
        km=row["km"],
        fuel=row["fuel"],
        asking_price=row["asking_price"],
        offer_price=row["offer_price"],
        total_cost=row["total_cost"],
        target_sale_price=row["target_sale_price"],
        net_profit=row["net_profit"],
        margin_percent=row["margin_percent"],
        risk_level=row["risk_level"],
        recommendation=row["recommendation"],
        source_parser=row["source_parser"],
        parser_confidence=row["parser_confidence"],
        parser_notes=json.loads(row["parser_notes_json"]),
        buy_box_status=row["buy_box_status"],
        buy_box_notes=json.loads(row["buy_box_notes_json"]),
        confidence_score=row["confidence_score"],
        verification_required=bool(row["verification_required"]),
        verification_notes=json.loads(row["verification_notes_json"]),
        negotiation_points=json.loads(row["negotiation_points_json"]),
        recommended_message=row["recommended_message"],
        next_action=row["next_action"],
        operator_note=row["operator_note"],
        summary=row["summary"],
        strengths=json.loads(row["strengths_json"]),
        warnings=json.loads(row["warnings_json"]),
    )


def _row_to_portfolio_deal(row: sqlite3.Row) -> PortfolioDeal:
    return PortfolioDeal(
        id=row["id"],
        created_at=row["created_at"],
        source=row["source"],
        url=row["url"],
        city=row["city"],
        brand=row["brand"],
        model=row["model"],
        title=row["title"],
        year=row["year"],
        km=row["km"],
        fuel=row["fuel"],
        asking_price=row["asking_price"],
        offer_price=row["offer_price"],
        total_cost=row["total_cost"],
        target_sale_price=row["target_sale_price"],
        net_profit=row["net_profit"],
        margin_percent=row["margin_percent"],
        risk_level=row["risk_level"],
        recommendation=row["recommendation"],
        source_parser=row["source_parser"],
        parser_confidence=row["parser_confidence"],
        parser_notes=json.loads(row["parser_notes_json"]),
        buy_box_status=row["buy_box_status"],
        buy_box_notes=json.loads(row["buy_box_notes_json"]),
        confidence_score=row["confidence_score"],
        verification_required=bool(row["verification_required"]),
        verification_notes=json.loads(row["verification_notes_json"]),
        negotiation_points=json.loads(row["negotiation_points_json"]),
        recommended_message=row["recommended_message"],
        next_action=row["next_action"],
        operator_note=row["operator_note"],
        summary=row["summary"],
        strengths=json.loads(row["strengths_json"]),
        warnings=json.loads(row["warnings_json"]),
        status=row["status"],
    )


def _ensure_columns(connection: sqlite3.Connection, table_name: str, columns: dict[str, str]) -> None:
    existing = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    for column_name, column_definition in columns.items():
        if column_name in existing:
            continue
        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )
