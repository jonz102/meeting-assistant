from fastapi import APIRouter, HTTPException, status, Depends, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.models import User
from app.auth import verify_token
from app.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

class UserProfileResponse(BaseModel):
    user_id: str
    email: str
    full_name: Optional[str]
    profile_image_url: Optional[str]
    created_at: str

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    profile_image_url: Optional[str] = None

class UpdateUserResponse(BaseModel):
    success: bool
    user: UserProfileResponse

def get_current_user(authorization: str = Header(...), db: Session = Depends(get_db)) -> User:
    """Extract and validate JWT token, return current user"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )

    token = authorization.replace("Bearer ", "")
    user_id = verify_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user

@router.get("/me", response_model=UserProfileResponse)
def get_current_user_profile(
    user: User = Depends(get_current_user)
):
    """Get current user's profile"""
    try:
        logger.info(f"Fetching profile for user: {user.user_id}")

        return {
            "user_id": user.user_id,
            "email": user.email,
            "full_name": user.full_name,
            "profile_image_url": user.profile_image_url,
            "created_at": user.created_at.isoformat()
        }

    except Exception as e:
        logger.error(f"Profile fetch error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch profile"
        )

@router.put("/me", response_model=UpdateUserResponse)
def update_user_profile(
    request: UpdateUserRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    try:
        logger.info(f"Updating profile for user: {user.user_id}")

        if request.full_name:
            user.full_name = request.full_name
        if request.profile_image_url:
            user.profile_image_url = request.profile_image_url

        db.commit()
        db.refresh(user)

        logger.info(f"Profile updated successfully: {user.user_id}")

        return {
            "success": True,
            "user": {
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "profile_image_url": user.profile_image_url,
                "created_at": user.created_at.isoformat()
            }
        }

    except Exception as e:
        logger.error(f"Profile update error: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )
