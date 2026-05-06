from sqlalchemy.orm import Session
from app.models.usuario import Usuario
from app.models.empresa import Empresa
from app.schemas.usuario_schema import UsuarioCreate, UsuarioUpdate
from app.core.security import get_password_hash

class UsuarioService:
    @staticmethod
    def get_usuario_by_email(db: Session, email: str) -> Usuario | None:
        return db.query(Usuario).filter(Usuario.email == email).first()

    @staticmethod
    def get_usuarios(db: Session, skip: int = 0, limit: int = 100) -> list[Usuario]:
        return db.query(Usuario).offset(skip).limit(limit).all()

    @staticmethod
    def create_usuario(db: Session, user_in: UsuarioCreate) -> Usuario:
        hashed_password = get_password_hash(user_in.password)
        db_user = Usuario(
            email=user_in.email,
            hashed_password=hashed_password,
            nombre_completo=user_in.nombre_completo,
            is_active=user_in.is_active,
            rol_id=user_in.rol_id
        )
        
        if user_in.empresa_ids:
            empresas = db.query(Empresa).filter(Empresa.id.in_(user_in.empresa_ids)).all()
            db_user.empresas = empresas

        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def update_usuario(db: Session, user_id: int, user_in: UsuarioUpdate) -> Usuario | None:
        db_user = db.query(Usuario).filter(Usuario.id == user_id).first()
        if not db_user:
            return None

        update_data = user_in.model_dump(exclude_unset=True)
        
        if "password" in update_data:
            db_user.hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            
        if "empresa_ids" in update_data:
            empresas = db.query(Empresa).filter(Empresa.id.in_(update_data["empresa_ids"])).all()
            db_user.empresas = empresas
            del update_data["empresa_ids"]

        for field, value in update_data.items():
            setattr(db_user, field, value)

        db.commit()
        db.refresh(db_user)
        return db_user

usuario_service = UsuarioService()