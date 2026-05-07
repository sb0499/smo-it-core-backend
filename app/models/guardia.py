from datetime import date
from typing import TYPE_CHECKING
from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .usuario import Usuario

class GuardiaFeriado(Base):
    __tablename__ = "guardia_feriado"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    tecnico: Mapped["Usuario"] = relationship("Usuario")