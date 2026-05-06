from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict
from app.models.ticket import TicketStatus, TicketPriority, MedioSolicitud

class TicketBase(BaseModel):
    
    titulo: str
    descripcion: str
    categoria: str
    empresa: str | None = None
    area_solicitante: str | None = None
    persona_solicitante: str | None = None
    medio_solicitud: MedioSolicitud = MedioSolicitud.PLATAFORMA
    fecha_final_tentativa: datetime | None = None
    avance_proceso: int | None = 0
    observaciones: str | None = None
    prioridad: TicketPriority = TicketPriority.MEDIA
    estado: TicketStatus = TicketStatus.NUEVO
    bitacora_dinamica: list[Any] | None = []

class TicketCreate(TicketBase):
    pass

class TicketUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    categoria: str | None = None
    empresa: str | None = None
    area_solicitante: str | None = None
    persona_solicitante: str | None = None
    medio_solicitud: MedioSolicitud | None = None
    fecha_final_tentativa: datetime | None = None
    avance_proceso: int | None = None
    observaciones: str | None = None
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