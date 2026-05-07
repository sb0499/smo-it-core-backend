from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .empresa import Empresa
    from .inventario import Activo

class Persona(Base):
    __tablename__ = "persona"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cedula: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    departamento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cargo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresa.id"), nullable=False)
    
    empresa: Mapped["Empresa"] = relationship("Empresa")
    activos: Mapped[list["Activo"]] = relationship("Activo", back_populates="persona")