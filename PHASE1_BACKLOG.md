# Phase 1 Backlog

## Foundation completed

1. Native runtime scripts are working on Windows.
2. Backend and frontend quality gates pass locally.
3. Analyze, watchlist, and portfolio flows are persisted with SQLite.
4. Confidence score and manual verification fields are part of the API contract.
5. Negotiation guidance and operator notes are persisted end-to-end.
6. Source-aware parsing and Hamburg buy-box scoring are live.

## Backend next

1. Split `deal_engine.py` into domain services and tests.
2. Introduce a PostgreSQL-ready repository layer next to SQLite.
3. Add editable cost rules for repair, prep, transfer, and target margin.
4. Add semi-automatic saved-search ingestion with deduping.

## Frontend next

1. Split page into reusable sections and cards.
2. Add watchlist filters and portfolio stage views.
3. Add portfolio filters, search, and stage-specific dashboards.
4. Add settings UI for buy-box and cost assumptions.

## Product next

1. Define the first full operator flow from intake to sold vehicle.
2. Standardize Hamburg-focused buy rules and minimum margin thresholds.
3. Prepare semi-automatic source ingestion for saved search URLs.
4. Decide which sourcing sites and parts workflows enter MVP scope.
