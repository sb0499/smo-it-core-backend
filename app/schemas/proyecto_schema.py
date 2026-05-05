from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.proyecto import TaskStatus

class TareaInternaBase(BaseModel):
    titulo: str
    descripcion: str | None = None
    estado: TaskStatus = TaskStatus.PENDIENTE

class TareaInternaCreate(TareaInternaBase):
    proyecto_id: int
    responsable_id: int
    ticket_origen_id: int | None = None

class TareaInternaUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    estado: TaskStatus | None = None
    responsable_id: int | None = None

class TareaInternaInDBBase(TareaInternaBase):
    id: int
    proyecto_id: int
    responsable_id: int
    ticket_origen_id: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TareaInterna(TareaInternaInDBBase):
    pass

class ProyectoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    fecha_fin_estimada: datetime | None = None

class ProyectoCreate(ProyectoBase):
    pass

class ProyectoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    fecha_fin_estimada: datetime | None = None

class ProyectoInDBBase(ProyectoBase):
    id: int
    fecha_inicio: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Proyecto(ProyectoInDBBase):
    tareas: list[TareaInterna] = []
