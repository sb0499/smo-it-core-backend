from typing import Any
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks
from app.models.ticket import Ticket
from app.models.guardia import GuardiaFeriado # Listo para la lógica de turnos
from app.schemas.ticket_schema import TicketCreate, TicketUpdate
from app.services.notificacion_service import notificacion_service

class TicketService:
    @staticmethod
    def get_tickets(db: Session, skip: int = 0, limit: int = 100) -> list[Ticket]:
        return db.query(Ticket).offset(skip).limit(limit).all()

    @staticmethod
    def create_ticket(db: Session, ticket_in: TicketCreate, creador_id: int, background_tasks: BackgroundTasks) -> Ticket:
        # Extraemos los datos del esquema
        db_ticket = Ticket(
            titulo=ticket_in.titulo,
            descripcion=ticket_in.descripcion,
            categoria=ticket_in.categoria,
            empresa=ticket_in.empresa,
            area_solicitante=ticket_in.area_solicitante,
            persona_solicitante=ticket_in.persona_solicitante,
            medio_solicitud=ticket_in.medio_solicitud,
            fecha_final_tentativa=ticket_in.fecha_final_tentativa,
            avance_proceso=ticket_in.avance_proceso,
            observaciones=ticket_in.observaciones,
            prioridad=ticket_in.prioridad,
            estado=ticket_in.estado,
            bitacora_dinamica=[{"accion": "Ticket Creado", "fecha": str(datetime.now())}],
            creador_id=creador_id
        )
        
        db.add(db_ticket)
        db.commit()
        db.refresh(db_ticket)
        
        # Enviamos la notificación en segundo plano
        background_tasks.add_task(
            notificacion_service.enviar_correo,
            "soporte@smo.com",
            f"Nuevo Ticket: {db_ticket.titulo}",
            f"Se ha creado un nuevo ticket con ID {db_ticket.id} para la empresa {db_ticket.empresa or 'N/A'}."
        )
        
        return db_ticket

    @staticmethod
    def update_ticket(db: Session, ticket_id: int, ticket_in: TicketUpdate) -> Ticket | None:
        db_ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if not db_ticket:
            return None
        
        update_data = ticket_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_ticket, field, value)
        
        db.commit()
        db.refresh(db_ticket)
        return db_ticket

ticket_service = TicketService()