import enum
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Enum, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .ticket import Ticket
    from .usuario import Usuario

class TaskStatus(str, enum.Enum):
    PENDIENTE = "Pendiente"
    EN_PROGRESO = "En Progreso"
    RESUELTO = "Resuelto"

class Proyecto(Base):
    __tablename__ = "proyecto"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_inicio: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    fecha_fin_estimada: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    tareas: Mapped[list["TareaInterna"]] = relationship("TareaInterna", back_populates="proyecto", cascade="all, delete-orphan")

class TareaInterna(Base):
    __tablename__ = "tarea_interna"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.PENDIENTE)
    
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyecto.id"), nullable=False)
    ticket_origen_id: Mapped[int | None] = mapped_column(ForeignKey("ticket.id"), nullable=True)
    responsable_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    proyecto: Mapped["Proyecto"] = relationship("Proyecto", back_populates="tareas")
