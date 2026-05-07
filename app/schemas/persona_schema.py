from pydantic import BaseModel, ConfigDict

class PersonaBase(BaseModel):
    cedula : str
    nombre : str
    telefono : str | None = None
    departamento : str | None = None
    cargo : str | None = None
    empresa_id : int

class PersonaCreate(PersonaBase):
    pass    

class PersonaUpdate(PersonaBase):
    cedula : str | None = None
    nombre : str | None = None
    telefono : str | None = None
    departamento : str | None = None
    cargo : str | None = None
    empresa_id : int | None = None

class PersonaResponse(PersonaBase):
    id : int
    model_config = ConfigDict(from_attributes=True)