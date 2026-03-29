from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.models import User
from app.auth import hash_password, verify_password, create_access_token
from app.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SignupResponse(BaseModel):
    success: bool
    user_id: str
    email: str
    token: str

class LoginResponse(BaseModel):
    success: bool
    user_id: str
    token: str

@router.post("/signup", response_model=SignupResponse)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        logger.info(f"Signup attempt for email: {request.email}")

        # Check if user already exists
        existing_user = db.query(User).filter(User.email == request.email).first()
        if existing_user:
            logger.warning(f"Signup failed: email already registered - {request.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Create new user
        new_user = User(
            email=request.email,
            full_name=request.full_name,
            password_hash=hash_password(request.password)
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        logger.info(f"User registered successfully: {new_user.user_id}")

        # Generate token
        token = create_access_token(new_user.user_id)

        return {
            "success": True,
            "user_id": new_user.user_id,
            "email": new_user.email,
            "token": token
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Signup failed"
        )

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token"""
    try:
        logger.info(f"Login attempt for email: {request.email}")

        # Find user by email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            logger.warning(f"Login failed: user not found - {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Verify password
        if not verify_password(request.password, user.password_hash):
            logger.warning(f"Login failed: incorrect password - {request.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        logger.info(f"User logged in successfully: {user.user_id}")

        # Generate token
        token = create_access_token(user.user_id)

        return {
            "success": True,
            "user_id": user.user_id,
            "token": token
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )
