from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .schemas import (
    AppSettings,
    PortfolioDeal,
    SavedDealCreate,
    SearchProfile,
    SearchProfileCreate,
    WatchlistDeal,
)
from .settings import settings

SETTINGS_SCHEMA_COLUMNS = {
    "preferred_city": "TEXT NOT NULL DEFAULT 'Hamburg'",
    "max_asking_price": "INTEGER NOT NULL DEFAULT 5000",
    "min_net_profit": "INTEGER NOT NULL DEFAULT 550",
    "min_margin_percent": "INTEGER NOT NULL DEFAULT 18",
    "max_km_benzin": "INTEGER NOT NULL DEFAULT 210000",
    "max_km_diesel": "INTEGER NOT NULL DEFAULT 190000",
    "min_year": "INTEGER NOT NULL DEFAULT 2005",
    "clean_prep_cost": "INTEGER NOT NULL DEFAULT 110",
    "issue_prep_cost": "INTEGER NOT NULL DEFAULT 180",
    "transfer_cost": "INTEGER NOT NULL DEFAULT 120",
    "sales_cost_percent": "INTEGER NOT NULL DEFAULT 6",
    "exit_discount_percent": "INTEGER NOT NULL DEFAULT 4",
    "low_risk_discount_percent": "INTEGER NOT NULL DEFAULT 8",
    "medium_risk_discount_percent": "INTEGER NOT NULL DEFAULT 15",
    "high_risk_discount_percent": "INTEGER NOT NULL DEFAULT 22",
}

SEARCH_PROFILE_SCHEMA_COLUMNS = {
    "label": "TEXT NOT NULL",
    "source": "TEXT NOT NULL",
    "search_url": "TEXT NOT NULL",
    "city": "TEXT NOT NULL DEFAULT 'Hamburg'",
    "max_price": "INTEGER",
    "min_year": "INTEGER",
    "min_profit": "INTEGER",
    "notes": "TEXT NOT NULL DEFAULT ''",
    "active": "INTEGER NOT NULL DEFAULT 1",
}

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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                preferred_city TEXT NOT NULL DEFAULT 'Hamburg',
                max_asking_price INTEGER NOT NULL DEFAULT 5000,
                min_net_profit INTEGER NOT NULL DEFAULT 550,
                min_margin_percent INTEGER NOT NULL DEFAULT 18,
                max_km_benzin INTEGER NOT NULL DEFAULT 210000,
                max_km_diesel INTEGER NOT NULL DEFAULT 190000,
                min_year INTEGER NOT NULL DEFAULT 2005,
                clean_prep_cost INTEGER NOT NULL DEFAULT 110,
                issue_prep_cost INTEGER NOT NULL DEFAULT 180,
                transfer_cost INTEGER NOT NULL DEFAULT 120,
                sales_cost_percent INTEGER NOT NULL DEFAULT 6,
                exit_discount_percent INTEGER NOT NULL DEFAULT 4,
                low_risk_discount_percent INTEGER NOT NULL DEFAULT 8,
                medium_risk_discount_percent INTEGER NOT NULL DEFAULT 15,
                high_risk_discount_percent INTEGER NOT NULL DEFAULT 22
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS search_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                label TEXT NOT NULL,
                source TEXT NOT NULL,
                search_url TEXT NOT NULL,
                city TEXT NOT NULL DEFAULT 'Hamburg',
                max_price INTEGER,
                min_year INTEGER,
                min_profit INTEGER,
                notes TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        _ensure_columns(connection, "app_settings", SETTINGS_SCHEMA_COLUMNS)
        _ensure_columns(connection, "search_profiles", SEARCH_PROFILE_SCHEMA_COLUMNS)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_search_profiles_created_at ON search_profiles(created_at DESC)"
        )
        _ensure_app_settings_row(connection)
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


def get_app_settings() -> AppSettings:
    with get_connection() as connection:
        _ensure_app_settings_row(connection)
        row = connection.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return _row_to_app_settings(row)


def update_app_settings(payload: AppSettings) -> AppSettings:
    values = payload.model_dump()
    assignments = ", ".join(f"{key} = ?" for key in values.keys())
    with get_connection() as connection:
        _ensure_app_settings_row(connection)
        connection.execute(
            f"UPDATE app_settings SET {assignments} WHERE id = 1",
            tuple(values.values()),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return _row_to_app_settings(row)


def list_search_profiles() -> list[SearchProfile]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM search_profiles ORDER BY active DESC, datetime(created_at) DESC, id DESC"
        ).fetchall()
    return [_row_to_search_profile(row) for row in rows]


def create_search_profile(payload: SearchProfileCreate) -> SearchProfile:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO search_profiles (
                label, source, search_url, city, max_price, min_year, min_profit, notes, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.label,
                payload.source,
                payload.search_url,
                payload.city,
                payload.max_price,
                payload.min_year,
                payload.min_profit,
                payload.notes,
                1 if payload.active else 0,
            ),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM search_profiles WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return _row_to_search_profile(row)


def update_search_profile_status(profile_id: int, active: bool) -> SearchProfile | None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE search_profiles SET active = ? WHERE id = ?",
            (1 if active else 0, profile_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM search_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
    return _row_to_search_profile(row) if row else None


def delete_search_profile(profile_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM search_profiles WHERE id = ?", (profile_id,))
        connection.commit()


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


def _row_to_app_settings(row: sqlite3.Row) -> AppSettings:
    return AppSettings(
        preferred_city=row["preferred_city"],
        max_asking_price=row["max_asking_price"],
        min_net_profit=row["min_net_profit"],
        min_margin_percent=row["min_margin_percent"],
        max_km_benzin=row["max_km_benzin"],
        max_km_diesel=row["max_km_diesel"],
        min_year=row["min_year"],
        clean_prep_cost=row["clean_prep_cost"],
        issue_prep_cost=row["issue_prep_cost"],
        transfer_cost=row["transfer_cost"],
        sales_cost_percent=row["sales_cost_percent"],
        exit_discount_percent=row["exit_discount_percent"],
        low_risk_discount_percent=row["low_risk_discount_percent"],
        medium_risk_discount_percent=row["medium_risk_discount_percent"],
        high_risk_discount_percent=row["high_risk_discount_percent"],
    )


def _row_to_search_profile(row: sqlite3.Row) -> SearchProfile:
    return SearchProfile(
        id=row["id"],
        created_at=row["created_at"],
        label=row["label"],
        source=row["source"],
        search_url=row["search_url"],
        city=row["city"],
        max_price=row["max_price"],
        min_year=row["min_year"],
        min_profit=row["min_profit"],
        notes=row["notes"],
        active=bool(row["active"]),
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


def _ensure_app_settings_row(connection: sqlite3.Connection) -> None:
    existing = connection.execute("SELECT id FROM app_settings WHERE id = 1").fetchone()
    if existing:
        return
    defaults = AppSettings().model_dump()
    columns = ", ".join(["id", *defaults.keys()])
    placeholders = ", ".join(["?"] * (len(defaults) + 1))
    connection.execute(
        f"INSERT INTO app_settings ({columns}) VALUES ({placeholders})",
        (1, *defaults.values()),
    )
