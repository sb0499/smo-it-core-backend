import enum
from datetime import datetime
from typing import Any, TYPE_CHECKING
from sqlalchemy import String, Enum, DateTime, ForeignKey, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .usuario import Usuario

class TicketStatus(str, enum.Enum):
    NUEVO = "Nuevo"
    EN_PROCESO = "En Proceso"
    RESUELTO = "Resuelto"

class TicketPriority(str, enum.Enum):
    BAJA = "Baja"
    MEDIA = "Media"
    ALTA = "Alta"
    CRITICA = "Critica"

class Ticket(Base):
    __tablename__ = "ticket"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[str] = mapped_column(String(100), nullable=False)
    prioridad: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority), default=TicketPriority.MEDIA)
    estado: Mapped[TicketStatus] = mapped_column(Enum(TicketStatus), default=TicketStatus.NUEVO)
    
    bitacora_dinamica: Mapped[dict[str, Any]] = mapped_column(JSON, default=list)
    
    creador_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    tecnico_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    creador: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[creador_id], back_populates="tickets_creados")
    tecnico: Mapped["Usuario | None"] = relationship("Usuario", foreign_keys=[tecnico_id], back_populates="tickets_asignados")
