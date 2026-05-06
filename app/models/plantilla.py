from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class PlantillaRecurrente(Base):
    __tablename__ = "plantilla_recurrente"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[str] = mapped_column(String(100), nullable=False)
    empresa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    area_solicitante: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)