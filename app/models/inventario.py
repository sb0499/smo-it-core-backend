import enum
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Enum, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .usuario import Usuario

class ActivoStatus(str, enum.Enum):
    STOCK = "Stock"
    ASIGNADO = "Asignado"
    MANTENIMIENTO = "Mantenimiento"
    BAJA = "Baja"

class Activo(Base):
    __tablename__ = "activo"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    serial: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    marca: Mapped[str] = mapped_column(String(100), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    estado: Mapped[ActivoStatus] = mapped_column(Enum(ActivoStatus), default=ActivoStatus.STOCK)
    
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"), nullable=True)
    
    fecha_compra: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    responsable: Mapped["Usuario | None"] = relationship("Usuario", back_populates="activos_asignados")