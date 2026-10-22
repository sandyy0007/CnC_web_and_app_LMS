"""Application configuration. Every secret comes from the environment — never from source."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api/.env", "../../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    # ---------- runtime ----------
    ENV: Literal["development", "test", "staging", "production"] = "development"
    APP_NAME: str = "Winners Creek API"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    INSTITUTION_TIMEZONE: str = "Asia/Kolkata"

    # ---------- CORS ----------
    CORS_ORIGINS: str = "http://localhost:3000"

    # ---------- PostgreSQL (Primary Production Database) ----------
    DATABASE_URL: str = "postgresql://postgres@localhost:5432/cnc"
    USE_POSTGRES: bool = True
    PG_POOL_MIN_SIZE: int = 5
    PG_POOL_MAX_SIZE: int = 20

    # ---------- MongoDB ----------
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "eedi_lms"
    # Dev/CI escape hatch: run against an in-process Mongo-compatible store when no server is
    # reachable. Refused in production (see validator below) so it can never mask a misconfig.
    USE_INMEMORY_DB: bool = False

    # ---------- Redis ----------
    REDIS_URL: str = "redis://localhost:6379/0"
    USE_FAKE_REDIS: bool = False

    # ---------- JWT / sessions ----------
    JWT_SECRET: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 7
    REFRESH_COOKIE_NAME: str = "eedi_refresh"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str | None = None

    # ---------- password / lockout ----------
    PASSWORD_MIN_LENGTH: int = 8
    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15
    LOGIN_RATE_LIMIT: str = "10/minute"
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_SENDS_PER_HOUR: int = 5

    # ---------- storage (S3) ----------
    STORAGE_DRIVER: Literal["s3", "local"] = "local"
    S3_BUCKET: str = "eedi-lms-private"
    S3_REGION: str = "ap-south-1"
    S3_ENDPOINT_URL: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    SIGNED_URL_TTL_SECONDS: int = 900
    LOCAL_STORAGE_ROOT: str = "./.storage"

    # ---------- AI ----------
    AI_PROVIDER: Literal["mock", "anthropic", "openai"] = "mock"
    AI_API_KEY: str | None = None
    AI_MODEL: str = "claude-sonnet-4-5"
    AI_BASE_URL: str | None = None
    AI_TIMEOUT_SECONDS: int = 45
    STT_PROVIDER: Literal["mock", "whisper", "deepgram"] = "mock"
    STT_API_KEY: str | None = None
    AI_REQUIRE_EVIDENCE: bool = True

    # ---------- email ----------
    EMAIL_PROVIDER: Literal["console", "smtp"] = "console"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "no-reply@eedilms.app"
    PUBLIC_WEB_URL: str = "http://localhost:3000"

    # ---------- push ----------
    FCM_ENABLED: bool = False
    FCM_SERVER_KEY: str | None = None

    # ---------- workers / queue ----------
    QUEUE_NAME: str = "eedi:jobs"
    QUEUE_EAGER: bool = False  # run jobs inline (tests only)
    JOB_MAX_ATTEMPTS: int = 3
    REPORT_ASYNC_ROW_THRESHOLD: int = 5000

    # ---------- business rules ----------
    ATTENDANCE_DEFAULTER_THRESHOLD: float = 75.0
    CERTIFICATE_MIN_ATTENDANCE: float = 75.0
    CERTIFICATE_MIN_AVG_SCORE: float = 60.0
    WEAK_STUDENT_THRESHOLD: float = 50.0
    EVALUATION_EDIT_WINDOW_HOURS: int = 72
    BULK_IMPORT_MAX_ROWS: int = 5000
    SCORING_VERSION: str = "1.0.0"
    EEDI_TRAINER_WEIGHT: float = 0.6
    EEDI_AI_WEIGHT: float = 0.4

    # ---------- dev ----------
    ALLOW_DEV_ENDPOINTS: bool = True
    PUBLIC_SIGNUP_ENABLED: bool = True
    SELF_SIGNUP_ROLES: str = "STUDENT"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def self_signup_roles(self) -> list[str]:
        return [r.strip().upper() for r in self.SELF_SIGNUP_ROLES.split(",") if r.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @field_validator("JWT_SECRET")
    @classmethod
    def _reject_default_secret_in_prod(cls, v: str, info) -> str:
        if info.data.get("ENV") == "production" and "dev-only" in v:
            raise ValueError("JWT_SECRET must be set to a strong value in production")
        return v

    def assert_production_safe(self) -> None:
        """Fail fast on configurations that are fine in dev but unacceptable in production."""
        if not self.is_production:
            return
        problems: list[str] = []
        if self.USE_INMEMORY_DB:
            problems.append("USE_INMEMORY_DB must be false in production")
        if self.USE_FAKE_REDIS:
            problems.append("USE_FAKE_REDIS must be false in production")
        if self.STORAGE_DRIVER != "s3":
            problems.append("STORAGE_DRIVER must be 's3' in production")
        if self.ALLOW_DEV_ENDPOINTS:
            problems.append("ALLOW_DEV_ENDPOINTS must be false in production")
        if not self.COOKIE_SECURE:
            problems.append("COOKIE_SECURE must be true in production")
        if "dev-only" in self.JWT_SECRET:
            problems.append("JWT_SECRET is still the development default")
        if problems:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
