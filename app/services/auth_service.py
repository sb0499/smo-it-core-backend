from sqlalchemy.orm import Session
from app.core.security import verify_password
from app.models.usuario import Usuario

class AuthService:
    @staticmethod
    def authenticate(db: Session, email: str, password: str) -> Usuario | None:
        user = db.query(Usuario).filter(Usuario.email == email).first()
        if not user or not verify_password(password, user.hashed_password):
            return None
        return user

auth_service = AuthService()
