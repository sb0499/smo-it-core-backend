from sqlalchemy.orm import Session
from app.models.proyecto import Proyecto, TareaInterna, TaskStatus
from app.models.ticket import Ticket, TicketStatus
from app.schemas.proyecto_schema import ProyectoCreate

class ProyectoService:
    @staticmethod
    def create_proyecto(db: Session, proyecto_in: ProyectoCreate) -> Proyecto:
        db_proyecto = Proyecto(**proyecto_in.model_dump())
        db.add(db_proyecto)
        db.commit()
        db.refresh(db_proyecto)
        return db_proyecto

    @staticmethod
    def escalar_ticket_a_tarea(db: Session, ticket_id: int, proyecto_id: int, responsable_id: int) -> TareaInterna | None:
        ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if not ticket:
            return None
        
        tarea = TareaInterna(
            titulo=f"ESC: {ticket.titulo}",
            descripcion=ticket.descripcion,
            proyecto_id=proyecto_id,
            responsable_id=responsable_id,
            ticket_origen_id=ticket.id,
            estado=TaskStatus.PENDIENTE
        )
        
        ticket.estado = TicketStatus.EN_PROCESO
        
        db.add(tarea)
        db.commit()
        db.refresh(tarea)
        return tarea

proyecto_service = ProyectoService()
