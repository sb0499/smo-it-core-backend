from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.usuario import UserRole

class UsuarioBase(BaseModel):
    email: EmailStr
    nombre_completo: str
    rol: UserRole = UserRole.USUARIO
    is_active: bool | None = True

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioUpdate(BaseModel):
    email: EmailStr | None = None
    nombre_completo: str | None = None
    rol: UserRole | None = None
    password: str | None = None
    is_active: bool | None = None

class UsuarioInDBBase(UsuarioBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Usuario(UsuarioInDBBase):
    pass
