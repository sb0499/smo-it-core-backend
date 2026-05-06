from datetime import datetime
from pydantic import BaseModel, ConfigDict

class RolBase(BaseModel):
    id: int
    nombre: str

class EmpresaBase(BaseModel):
    id: int
    nombre: str

class UsuarioBase(BaseModel):
    email: str
    nombre_completo: str
    is_active: bool = True
    rol_id: int

class UsuarioCreate(UsuarioBase):
    password: str
    empresa_ids: list[int] = []

class UsuarioUpdate(BaseModel):
    email: str | None = None
    nombre_completo: str | None = None
    is_active: bool | None = None
    rol_id: int | None = None
    password: str | None = None
    empresa_ids: list[int] | None = None

class UsuarioResponse(UsuarioBase):
    id: int
    created_at: datetime
    rol: RolBase
    empresas: list[EmpresaBase] = []

    model_config = ConfigDict(from_attributes=True)    