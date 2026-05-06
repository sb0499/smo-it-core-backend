from typing import Any
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.usuario import Usuario
from app.schemas.ticket_schema import Ticket, TicketCreate, TicketUpdate
from app.services.ticket_service import ticket_service

router = APIRouter()

@router.get("/", response_model=list[Ticket])
def read_tickets(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    return ticket_service.get_tickets(db, skip=skip, limit=limit)

@router.post("/", response_model=Ticket)
def create_ticket(
    *,
    db: Session = Depends(deps.get_db),
    ticket_in: TicketCreate,
    current_user: Usuario = Depends(deps.get_current_user),
    background_tasks: BackgroundTasks
) -> Any:
    # LA CORRECCIÓN ESTÁ AQUÍ: Pasamos el current_user completo al servicio
    return ticket_service.create_ticket(
        db=db, 
        ticket_in=ticket_in, 
        current_user=current_user, 
        background_tasks=background_tasks
    )

@router.put("/{ticket_id}", response_model=Ticket)
def update_ticket(
    *,
    db: Session = Depends(deps.get_db),
    ticket_id: int,
    ticket_in: TicketUpdate,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    ticket = ticket_service.update_ticket(db, ticket_id, ticket_in)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket