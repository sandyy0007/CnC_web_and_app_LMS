"""Transactional email behind a provider interface.

`console` writes the message to the log and keeps the last delivery in memory so a developer (or
the test suite) can complete verification without an SMTP server. `smtp` is the production driver.
"""
from __future__ import annotations

import asyncio
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.email")


@dataclass
class SentMessage:
    to: str
    subject: str
    body: str
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class EmailProvider(ABC):
    @abstractmethod
    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


class ConsoleEmailProvider(EmailProvider):
    """Development driver — never used in production (`assert_production_safe`)."""

    outbox: list[SentMessage] = []

    @property
    def name(self) -> str:
        return "console"

    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None:
        self.outbox.append(SentMessage(to=to, subject=subject, body=body))
        del self.outbox[:-200]
        log.info("email_console_delivery", extra={"to": to, "subject": subject, "body": body})


class SmtpEmailProvider(EmailProvider):
    @property
    def name(self) -> str:
        return "smtp"

    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None:
        message = EmailMessage()
        message["From"] = settings.EMAIL_FROM
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        if html:
            message.add_alternative(html, subtype="html")

        def _send() -> None:
            with smtplib.SMTP(settings.SMTP_HOST or "", settings.SMTP_PORT, timeout=20) as server:
                server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                server.send_message(message)

        await asyncio.to_thread(_send)
        log.info("email_sent", extra={"to": to, "subject": subject})


_provider: EmailProvider | None = None


def get_email_provider() -> EmailProvider:
    global _provider
    if _provider is None:
        _provider = (
            SmtpEmailProvider() if settings.EMAIL_PROVIDER == "smtp" else ConsoleEmailProvider()
        )
    return _provider


def reset_email_for_tests() -> None:
    global _provider
    _provider = None
    ConsoleEmailProvider.outbox.clear()


# --------------------------------------------------------------------------- templates
BRAND = "Winners Creek"


async def send_verification_email(*, to: str, name: str, otp: str, link_token: str) -> None:
    link = f"{settings.PUBLIC_WEB_URL}/verify-email?token={link_token}&email={to}"
    body = (
        f"Hi {name},\n\n"
        f"Welcome to {BRAND} — learn, practise and build the skills required for your career.\n\n"
        f"Your verification code is: {otp}\n"
        f"It expires in {settings.OTP_TTL_MINUTES} minutes.\n\n"
        f"Or verify in one click: {link}\n\n"
        f"If you did not create this account, you can ignore this email.\n"
    )
    await get_email_provider().send(to=to, subject=f"Verify your {BRAND} account", body=body)


async def send_password_reset_email(*, to: str, name: str, otp: str, link_token: str) -> None:
    link = f"{settings.PUBLIC_WEB_URL}/reset-password?token={link_token}&email={to}"
    body = (
        f"Hi {name},\n\n"
        f"Use this code to reset your {BRAND} password: {otp}\n"
        f"It expires in {settings.OTP_TTL_MINUTES} minutes.\n\n"
        f"Or reset directly: {link}\n\n"
        f"For your security, all other sessions will be signed out once your password changes.\n"
    )
    await get_email_provider().send(to=to, subject=f"Reset your {BRAND} password", body=body)


async def send_security_alert(*, to: str, name: str, detail: str) -> None:
    await get_email_provider().send(
        to=to,
        subject=f"{BRAND} security alert",
        body=f"Hi {name},\n\n{detail}\n\nIf this wasn't you, please reset your password.\n",
    )
