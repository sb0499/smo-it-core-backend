from pydantic import BaseModel, ConfigDict
from datetime import date
from .usuario_schema import UsuarioResponse

class GuardiaBase(BaseModel):
    fecha: date
    tecnico_id: int
    observaciones: str | None = None

class GuardiaCreate(GuardiaBase):
    pass

class GuardiaUpdate(GuardiaBase):
    fecha: date | None = None
    tecnico_id: int | None = None
    observaciones: str | None = None

class GuardiaResponse(GuardiaBase):
    id: int
    tecnico: UsuarioResponse | None = None

    model_config = ConfigDict(from_attributes=True)