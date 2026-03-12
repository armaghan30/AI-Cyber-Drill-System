import hashlib
import hmac
import json
import base64
import time
from sqlalchemy.orm import Session
from backend.models.user import User

SECRET = "cyberdrill-secret-key-change-in-production"


def _make_token(user_id, username):
    # simple token: base64 payload + HMAC signature
    payload = {"user_id": user_id, "username": username, "exp": int(time.time()) + 86400}
    b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(SECRET.encode(), b64.encode(), hashlib.sha256).hexdigest()
    return f"{b64}.{sig}"


def verify_token(token):
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        b64, sig = parts
        expected = hmac.new(SECRET.encode(), b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.b64decode(b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def register_user(db: Session, username, email, password):
    exists = db.query(User).filter(
        (User.username == username) | (User.email == email)
    ).first()
    if exists:
        if exists.username == username:
            raise ValueError("Username already exists")
        raise ValueError("Email already exists")

    user = User(username=username, email=email)
    user.set_password(password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(db: Session, username, password):
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.check_password(password):
        raise ValueError("Invalid username or password")
    token = _make_token(user.id, user.username)
    return user, token


def get_current_user(db: Session, token):
    payload = verify_token(token)
    if not payload:
        return None
    return db.query(User).filter(User.id == payload["user_id"]).first()
