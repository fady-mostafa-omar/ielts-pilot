"""Guard for the local API.

Every request must:
  * be addressed to exactly 127.0.0.1:<port> (blocks DNS-rebinding tricks),
  * carry no Origin header (the Electron main process never sends one; browsers do),
  * carry the per-launch token in X-IP-Token.
"""

import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class LocalGuardMiddleware:
    def __init__(self, app: ASGIApp, *, token: str, port: int) -> None:
        self.app = app
        self._token = token.encode()
        self._host = f"127.0.0.1:{port}".encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        if headers.get(b"host") != self._host:
            await _reject(scope, receive, send, 400, "bad_host")
            return
        if b"origin" in headers:
            await _reject(scope, receive, send, 403, "origin_not_allowed")
            return
        if not hmac.compare_digest(headers.get(b"x-ip-token", b""), self._token):
            await _reject(scope, receive, send, 401, "unauthorized")
            return
        await self.app(scope, receive, send)


async def _reject(scope: Scope, receive: Receive, send: Send, status: int, code: str) -> None:
    await JSONResponse({"error": code}, status_code=status)(scope, receive, send)
