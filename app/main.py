from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db, get_db
from app.routes import auth, users, meetings
from app.routes import ws_transcript
from app.middleware import logging_middleware
import logging
import sys

# Configure logging — stdout only (Railway has no persistent disk)
_handlers = [logging.StreamHandler(sys.stdout)]
try:
    import os
    os.makedirs('/app/logs', exist_ok=True)
    _handlers.append(logging.FileHandler('/app/logs/app.log'))
except Exception:
    pass  # Skip file logging if filesystem is read-only (Railway, etc.)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=_handlers
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Meeting Assistant API",
    description="Containerized meeting assistant with transcription, summarization, and action item extraction",
    version="1.0.0"
)

# Add CORS middleware
import os as _os
_allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://meetingassistant.jonzinc.com",
]
_extra = _os.getenv("FRONTEND_URL", "")
if _extra and _extra not in _allowed_origins:
    _allowed_origins.append(_extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware
app.middleware("http")(logging_middleware)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database tables on startup"""
    try:
        logger.info("Initializing database...")
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {str(e)}")
        raise

# Health check endpoint
@app.get("/health")
async def health_check():
    """Check service health"""
    return {
        "status": "healthy",
        "service": "meeting-assistant-api",
        "version": "1.0.0"
    }

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(ws_transcript.router)

# Root endpoint
@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": "Meeting Assistant API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "auth": "/auth",
            "users": "/users",
            "meetings": "/meetings"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )
