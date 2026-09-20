"""Object storage behind one clean interface.

Production driver is **Amazon S3** with private buckets and expiring signed URLs — recordings,
resumes, assignment attachments, generated reports and certificates are never publicly readable.
A local filesystem driver with HMAC-signed, expiring links implements the same contract so the
application is fully runnable without AWS credentials.
"""
from __future__ import annotations

import asyncio
import hashlib
import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.errors import ServiceUnavailable, ValidationError
from app.core.logging import get_logger
from app.core.security import sign_payload, verify_signed_payload

log = get_logger("app.storage")

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
ALLOWED_PREFIXES = ("students/", "assignments/", "reports/", "certificates/", "imports/")
ALLOWED_PREFIXES = ("students/", "assignments/", "reports/", "certificates/", "imports/", "ebooks/")


# --------------------------------------------------------------------------- key builders
class Keys:
    """Logical, private key layout (master prompt §18)."""

    @staticmethod
    def practice_audio(student_id: str, session_id: str) -> str:
        return f"students/{student_id}/practice/{session_id}/audio"

    @staticmethod
    def practice_video(student_id: str, session_id: str) -> str:
        return f"students/{student_id}/practice/{session_id}/video"

    @staticmethod
    def resume(student_id: str, filename: str) -> str:
        return f"students/{student_id}/documents/resume/{filename}"

    @staticmethod
    def assignment_attachment(assignment_id: str, filename: str) -> str:
        return f"assignments/{assignment_id}/attachments/{filename}"

    @staticmethod
    def submission(assignment_id: str, student_id: str, filename: str) -> str:
        return f"assignments/{assignment_id}/submissions/{student_id}/{filename}"

    @staticmethod
    def report(report_id: str, ext: str) -> str:
        return f"reports/{report_id}.{ext}"

    @staticmethod
    def certificate(certificate_id: str) -> str:
        return f"certificates/{certificate_id}.pdf"

    @staticmethod
    def import_file(job_id: str, filename: str) -> str:
        return f"imports/{job_id}/{filename}"

    @staticmethod
    def ebook_file(ebook_id: str, filename: str) -> str:
        return f"ebooks/{ebook_id}/{filename}"

    @staticmethod
    def ebook_cover(ebook_id: str, filename: str) -> str:
        return f"ebooks/{ebook_id}/covers/{filename}"


@dataclass
class StoredObject:
    key: str
    bytes: int
    checksum: str
    content_type: str


def _validate_key(key: str) -> str:
    if ".." in key or key.startswith("/"):
        raise ValidationError("Invalid storage key")
    if not key.startswith(ALLOWED_PREFIXES):
        raise ValidationError("Storage key is outside the permitted namespace")
    return key


# --------------------------------------------------------------------------- interface
class StorageDriver(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes, content_type: str) -> StoredObject: ...

    @abstractmethod
    async def get(self, key: str) -> bytes: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def signed_download_url(self, key: str, *, ttl: int, filename: str | None = None) -> str: ...

    @abstractmethod
    async def signed_upload(self, key: str, *, ttl: int, content_type: str) -> dict: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


# --------------------------------------------------------------------------- local driver
class LocalStorageDriver(StorageDriver):
    """Development/self-hosted driver. Files stay private; delivery uses signed, expiring links."""

    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "local"

    def _path(self, key: str) -> Path:
        path = (self.root / _validate_key(key)).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValidationError("Invalid storage key")
        return path

    async def put(self, key: str, data: bytes, content_type: str) -> StoredObject:
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValidationError("File exceeds the maximum upload size")
        path = self._path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            (path.parent / f"{path.name}.type").write_text(content_type)

        await asyncio.to_thread(_write)
        return StoredObject(
            key=key,
            bytes=len(data),
            checksum=hashlib.sha256(data).hexdigest(),
            content_type=content_type,
        )

    async def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise ServiceUnavailable("Stored file is no longer available")
        return await asyncio.to_thread(path.read_bytes)

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def signed_download_url(self, key: str, *, ttl: int, filename: str | None = None) -> str:
        token = sign_payload(_validate_key(key), ttl)
        suffix = f"&filename={filename}" if filename else ""
        return f"{settings.API_V1_PREFIX}/files/signed?token={token}{suffix}"

    async def signed_upload(self, key: str, *, ttl: int, content_type: str) -> dict:
        return {
            "strategy": "direct",
            "url": f"{settings.API_V1_PREFIX}/student/practice/upload",
            "fields": {"key": key, "contentType": content_type},
            "expiresIn": ttl,
        }

    @staticmethod
    def resolve_signed_token(token: str) -> str:
        return verify_signed_payload(token)


# --------------------------------------------------------------------------- S3 driver
class S3StorageDriver(StorageDriver):
    """Private-bucket S3. Objects are server-side encrypted and only ever served pre-signed."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self._bucket = settings.S3_BUCKET
        self._client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    @property
    def name(self) -> str:
        return "s3"

    async def put(self, key: str, data: bytes, content_type: str) -> StoredObject:
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValidationError("File exceeds the maximum upload size")
        _validate_key(key)
        checksum = hashlib.sha256(data).hexdigest()

        def _put() -> None:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
                Metadata={"sha256": checksum},
            )

        await asyncio.to_thread(_put)
        return StoredObject(key=key, bytes=len(data), checksum=checksum, content_type=content_type)

    async def get(self, key: str) -> bytes:
        def _get() -> bytes:
            return self._client.get_object(Bucket=self._bucket, Key=_validate_key(key))["Body"].read()

        return await asyncio.to_thread(_get)

    async def exists(self, key: str) -> bool:
        def _head() -> bool:
            try:
                self._client.head_object(Bucket=self._bucket, Key=_validate_key(key))
                return True
            except Exception:
                return False

        return await asyncio.to_thread(_head)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(
            lambda: self._client.delete_object(Bucket=self._bucket, Key=_validate_key(key))
        )

    async def signed_download_url(self, key: str, *, ttl: int, filename: str | None = None) -> str:
        params = {"Bucket": self._bucket, "Key": _validate_key(key)}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

        return await asyncio.to_thread(
            lambda: self._client.generate_presigned_url(
                "get_object", Params=params, ExpiresIn=ttl
            )
        )

    async def signed_upload(self, key: str, *, ttl: int, content_type: str) -> dict:
        def _post() -> dict:
            return self._client.generate_presigned_post(
                Bucket=self._bucket,
                Key=_validate_key(key),
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 1, MAX_UPLOAD_BYTES],
                ],
                ExpiresIn=ttl,
            )

        presigned = await asyncio.to_thread(_post)
        return {"strategy": "presigned-post", **presigned, "expiresIn": ttl}


# --------------------------------------------------------------------------- service
_driver: StorageDriver | None = None


def get_storage() -> StorageDriver:
    global _driver
    if _driver is None:
        if settings.STORAGE_DRIVER == "s3":
            try:
                _driver = S3StorageDriver()
                log.info("storage_driver_ready", extra={"driver": "s3", "bucket": settings.S3_BUCKET})
            except Exception as exc:
                if settings.is_production:
                    raise
                log.warning("s3_unavailable_using_local", extra={"error": str(exc)})
                _driver = LocalStorageDriver(settings.LOCAL_STORAGE_ROOT)
        else:
            _driver = LocalStorageDriver(settings.LOCAL_STORAGE_ROOT)
            log.info("storage_driver_ready", extra={"driver": "local"})
    return _driver


def reset_storage_for_tests() -> None:
    global _driver
    _driver = None


async def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> StoredObject:
    return await get_storage().put(key, data, content_type)


async def signed_url(key: str, *, filename: str | None = None, ttl: int | None = None) -> str:
    return await get_storage().signed_download_url(
        key, ttl=ttl or settings.SIGNED_URL_TTL_SECONDS, filename=filename
    )


def purge_local_storage() -> None:  # pragma: no cover - test helper
    root = Path(settings.LOCAL_STORAGE_ROOT)
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
