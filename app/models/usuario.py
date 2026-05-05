import enum
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .ticket import Ticket
    from .inventario import Activo

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    TECNICO = "TECNICO"
    USUARIO = "USUARIO"

class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USUARIO)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relaciones
    tickets_creados: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.creador_id", back_populates="creador"
    )
    tickets_asignados: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.tecnico_id", back_populates="tecnico"
    )
    activos_asignados: Mapped[list["Activo"]] = relationship(
        "Activo", back_populates="usuario_asignado"
    )