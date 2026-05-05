from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict
from app.models.ticket import TicketStatus, TicketPriority

class TicketBase(BaseModel):
    titulo: str
    descripcion: str
    categoria: str
    prioridad: TicketPriority = TicketPriority.MEDIA
    estado: TicketStatus = TicketStatus.NUEVO
    bitacora_dinamica: list[Any] | None = []

class TicketCreate(TicketBase):
    pass

class TicketUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    categoria: str | None = None
    prioridad: TicketPriority | None = None
    estado: TicketStatus | None = None
    bitacora_dinamica: list[Any] | None = None
    tecnico_id: int | None = None

class TicketInDBBase(TicketBase):
    id: int
    creador_id: int
    tecnico_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class Ticket(TicketInDBBase):
    pass
