from collections.abc import Generator
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """Resolve the logged-in user from the Authorization header.

    Raises 401 if the header is missing or the token is invalid.
    Used by every endpoint that returns or mutates per-user data
    (scenarios, simulations, training runs).
    """
    # Local import to avoid a circular import at module load
    from backend.services import auth_service
    from backend.models.user import User

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token = authorization.split(" ", 1)[1].strip()
    user: Optional[User] = auth_service.get_current_user(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


def get_optional_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """Same as get_current_user but returns None if no/invalid token,
    rather than raising. Used by endpoints that work either way."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    from backend.services import auth_service
    token = authorization.split(" ", 1)[1].strip()
    return auth_service.get_current_user(db, token)
