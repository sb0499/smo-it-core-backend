from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Rol(Base):
    __tablename__ = "rol"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False) # Ej: ADMIN, TECNICO, USUARIO
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)