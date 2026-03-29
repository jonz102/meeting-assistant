from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import logging
import time

logger = logging.getLogger(__name__)

def setup_cors(app):
    """Setup CORS middleware"""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, specify actual origins
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

async def logging_middleware(request: Request, call_next):
    """Log request/response details"""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    logger.info(
        f"{request.method} {request.url.path} "
        f"- Status: {response.status_code} "
        f"- Duration: {process_time:.2f}s"
    )

    response.headers["X-Process-Time"] = str(process_time)
    return response

async def api_key_middleware(request: Request, call_next):
    """Validate API key for protected endpoints"""
    # Skip validation for auth endpoints and health check
    if request.url.path.startswith("/auth") or request.url.path == "/health":
        return await call_next(request)

    api_key = request.headers.get("X-API-Key")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key"
        )

    # Note: In production, validate against a list of valid API keys
    # For now, we'll skip this since we're using JWT for most endpoints

    return await call_next(request)
