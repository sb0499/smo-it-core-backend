from typing import TYPE_CHECKING
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .ticket import Ticket
    from .proyecto import TareaInterna
    from .rol import Rol
    from .empresa import Empresa
    from .inventario import Activo # <--- NUEVO: Importamos Activo

# --- LA TABLA INTERMEDIA (MUCHOS A MUCHOS) ---
# Conecta a un Usuario con múltiples Empresas
usuario_empresa = Table(
    "usuario_empresa",
    Base.metadata,
    Column("usuario_id", Integer, ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True),
    Column("empresa_id", Integer, ForeignKey("empresa.id", ondelete="CASCADE"), primary_key=True)
)

class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # --- ROL ES UNA LLAVE FORÁNEA ---
    rol_id: Mapped[int] = mapped_column(ForeignKey("rol.id"), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- RELACIONES ---
    # 1. Su Rol
    rol: Mapped["Rol"] = relationship("Rol")
    
    # 2. Sus Empresas (Múltiples)
    empresas: Mapped[list["Empresa"]] = relationship("Empresa", secondary=usuario_empresa, back_populates="usuarios")

    # 3. Sus Tickets y Tareas
    tickets_creados: Mapped[list["Ticket"]] = relationship("Ticket", foreign_keys="[Ticket.creador_id]", back_populates="creador")
    tickets_asignados: Mapped[list["Ticket"]] = relationship("Ticket", foreign_keys="[Ticket.tecnico_id]", back_populates="tecnico")
    tareas_asignadas: Mapped[list["TareaInterna"]] = relationship("TareaInterna", back_populates="responsable")
    
    # 4. Sus Equipos/Inventario asignado <--- ¡ESTA ES LA LÍNEA QUE FALTABA!
    activos_asignados: Mapped[list["Activo"]] = relationship("Activo", back_populates="responsable")