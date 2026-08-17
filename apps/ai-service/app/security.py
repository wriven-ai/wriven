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
    # Compare UTF-8 bytes: the str overload raises TypeError on non-ASCII
    # input, which would collapse a bad secret into a generic 502 instead of
    # the contract's 401.
    if not compare_digest(
        x_internal_secret.encode("utf-8"), settings.internal_secret.encode("utf-8")
    ):
        raise InvalidSecretError()
