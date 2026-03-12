from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DRILL_")

    PROJECT_NAME: str = "AI-Powered Cyber Drill System"
    API_V1_PREFIX: str = "/api"
    DATABASE_URL: str = "sqlite:///./drill_system.db"

    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
    TOPOLOGY_DIR: Path = PROJECT_ROOT / "orchestrator"
    MODELS_DIR: Path = PROJECT_ROOT / "results" / "models"
    CSV_DIR: Path = PROJECT_ROOT / "results" / "csv"

    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
