"""Authenticates the core-service -> ai-service HTTP hop.

The gateway already validated the end-user's JWT and core-service already
recorded the row under the trusted `userId`; ai-service does not re-auth the
user. It only verifies that the caller is core-service via a shared
`INTERNAL_SECRET` sent in the `X-Internal-Secret` header.
"""

from hmac import compare_digest

from fastapi import Header

from app.config import settings
from app.exceptions import InvalidSecretError


async def verify_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    # `compare_digest` avoids a timing oracle on this internal authentication
    # boundary. Check configuration separately because it may be empty in local
    # development, and comparing an empty configured secret would be unsafe.
    if not settings.internal_secret or not x_internal_secret:
        raise InvalidSecretError()
    if not compare_digest(x_internal_secret, settings.internal_secret):
        raise InvalidSecretError()
