from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.inventario import ActivoStatus

class ActivoBase(BaseModel):
    codigo: str
    serial: str
    marca: str
    modelo: str
    estado: ActivoStatus = ActivoStatus.STOCK

class ActivoCreate(ActivoBase):
    fecha_compra: datetime | None = None
    persona_id: int | None = None
    especificaciones: str | None = None

class ActivoUpdate(BaseModel):
    codigo: str | None = None
    serial: str | None = None
    marca: str | None = None
    modelo: str | None = None
    estado: ActivoStatus | None = None
    usuario_id: int | None = None

class ActivoInDBBase(ActivoBase):
    id: int
    persona_id: int | None = None
    fecha_compra: datetime | None = None
    especificaciones: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class Activo(ActivoInDBBase):
    pass
