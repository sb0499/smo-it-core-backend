from datetime import datetime
from pydantic import BaseModel, ConfigDict

class MovimientoResponse(BaseModel):
    id: int
    activo_id: int
    desde_persona_id: int | None = None
    hacia_persona_id: int | None = None
    usuario_id: int
    tipo: str
    fecha: datetime
    observaciones: str | None = None

    model_config = ConfigDict(from_attributes=True)