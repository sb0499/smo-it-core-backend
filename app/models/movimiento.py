from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.persona import Persona

class MovimientoInventario(Base):
    __tablename__ = "movimiento_inventario"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    activo_id: Mapped[int] = mapped_column(ForeignKey("activo.id"), nullable=False)
    
    # De quién viene y a quién va
    desde_persona_id: Mapped[int | None] = mapped_column(ForeignKey("persona.id"), nullable=True)
    hacia_persona_id: Mapped[int | None] = mapped_column(ForeignKey("persona.id"), nullable=True)
    
    # Quién autoriza (Técnico/Admin logueado)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    tipo: Mapped[str] = mapped_column(String(50)) # "Asignación", "Devolución", "Transferencia"
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    observaciones: Mapped[str | None] = mapped_column(String(255))

    # Relaciones para las consultas
    activo: Mapped["Activo"] = relationship("Activo")
    persona_entrega: Mapped["Persona | None"] = relationship("Persona", foreign_keys=[desde_persona_id])
    persona_recibe: Mapped["Persona | None"] = relationship("Persona", foreign_keys=[hacia_persona_id])