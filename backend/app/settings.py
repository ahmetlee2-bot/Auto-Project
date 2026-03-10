from __future__ import annotations

import os


class Settings:
    def __init__(self) -> None:
        self.frontend_origin = os.getenv("AUTONOW_FRONTEND_ORIGIN", "http://localhost:3000")
        self.db_path = os.getenv("AUTONOW_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "autonow.db"))


settings = Settings()
