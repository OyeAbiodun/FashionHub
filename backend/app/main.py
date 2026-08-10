from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.api.routes import (
    auth,
    business,
    customers,
    dashboard,
    finances,
    health,
    measurements,
    orders,
)
from app.core.config import get_settings

settings = get_settings()
UNSAFE_HTTP_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
    if (
        settings.app_env.lower() == "production"
        and request.method in UNSAFE_HTTP_METHODS
        and request.headers.get("origin") != settings.frontend_origin
    ):
        response = JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
    else:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(business.router, prefix=settings.api_prefix)
app.include_router(customers.router, prefix=settings.api_prefix)
app.include_router(measurements.router, prefix=settings.api_prefix)
app.include_router(orders.router, prefix=settings.api_prefix)
app.include_router(finances.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
