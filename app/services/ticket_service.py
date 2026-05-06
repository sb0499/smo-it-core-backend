from typing import Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import BackgroundTasks
from app.models.ticket import Ticket, TicketStatus
from app.models.usuario import Usuario
from app.models.rol import Rol # <--- IMPORTAMOS LA NUEVA TABLA ROL
from app.models.guardia import GuardiaFeriado
from app.models.empresa import Empresa
from app.schemas.ticket_schema import TicketCreate, TicketUpdate
from app.services.notificacion_service import notificacion_service

class TicketService:
    @staticmethod
    def get_tickets(db: Session, skip: int = 0, limit: int = 100) -> list[Ticket]:
        return db.query(Ticket).offset(skip).limit(limit).all()

    @staticmethod
    def create_ticket(db: Session, ticket_in: TicketCreate, current_user: Usuario, background_tasks: BackgroundTasks) -> Ticket:
        
        tecnico_asignado = None
        hoy = datetime.now()
        dia_semana = hoy.weekday() 

        # --- REGLA 1: LEEMOS EL ROL DESDE LA BASE DE DATOS ---
        if current_user.rol.nombre == "TECNICO":
            tecnico_asignado = current_user.id
            
        elif current_user.rol.nombre == "ADMIN" and ticket_in.tecnico_id:
            tecnico_asignado = ticket_in.tecnico_id
            
        else:
            if dia_semana < 5: 
                nombre_empresa = ""
                if ticket_in.empresa_id:
                    emp_db = db.query(Empresa).filter(Empresa.id == ticket_in.empresa_id).first()
                    if emp_db:
                        nombre_empresa = emp_db.nombre.upper()
                
                TECNICOS_SEDE = {
                    "CCI": "cci@smo.com",
                    "SCALA": "scala@smo.com",
                    "CONDADO": "condado@smo.com"
                }
                
                if nombre_empresa in TECNICOS_SEDE:
                    email_fijo = TECNICOS_SEDE[nombre_empresa]
                    tecnico_fijo = db.query(Usuario).filter(Usuario.email == email_fijo).first()
                    if tecnico_fijo:
                        tecnico_asignado = tecnico_fijo.id
                
                if not tecnico_asignado:
                    # --- CORRECCIÓN EN EL BALANCEO DE CARGA ---
                    tecnico_menos_ocupado = db.query(
                        Usuario.id, func.count(Ticket.id).label('total_tickets')
                    ).outerjoin(
                        Ticket, (Usuario.id == Ticket.tecnico_id) & (Ticket.estado.in_([TicketStatus.NUEVO, TicketStatus.PENDIENTE]))
                    ).join(
                        Rol, Usuario.rol_id == Rol.id # <-- Unimos la tabla Rol
                    ).filter(
                        Rol.nombre == "TECNICO",      # <-- Filtramos por el nombre del Rol
                        Usuario.is_active == True
                    ).group_by(Usuario.id).order_by('total_tickets').first()

                    if tecnico_menos_ocupado:
                        tecnico_asignado = tecnico_menos_ocupado.id
            else:
                guardia = db.query(GuardiaFeriado).filter(GuardiaFeriado.fecha == hoy.date()).first()
                if guardia:
                    tecnico_asignado = guardia.tecnico_id

        db_ticket = Ticket(
            titulo=ticket_in.titulo,
            descripcion=ticket_in.descripcion,
            categoria=ticket_in.categoria,
            empresa_id=ticket_in.empresa_id, 
            area_solicitante=ticket_in.area_solicitante,
            persona_solicitante=ticket_in.persona_solicitante,
            medio_solicitud=ticket_in.medio_solicitud,
            fecha_final_tentativa=ticket_in.fecha_final_tentativa,
            avance_proceso=ticket_in.avance_proceso,
            observaciones=ticket_in.observaciones,
            prioridad=ticket_in.prioridad,
            estado=ticket_in.estado,
            bitacora_dinamica=[{"accion": f"Ticket Creado por {current_user.nombre_completo}", "fecha": str(hoy)}],
            creador_id=current_user.id,
            tecnico_id=tecnico_asignado
        )
        
        db.add(db_ticket)
        db.commit()
        db.refresh(db_ticket)
        
        background_tasks.add_task(
            notificacion_service.enviar_correo,
            "soporte@smo.com",
            f"Nuevo Ticket: {db_ticket.titulo}",
            f"Se ha creado un nuevo ticket. Asignado al técnico ID: {tecnico_asignado or 'Sin asignar'}."
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

    @staticmethod
    def agregar_bitacora(db: Session, ticket_id: int, current_user: Usuario, accion: str) -> Ticket | None:
        db_ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if not db_ticket:
            return None
        
        nueva_entrada = {
            "accion": accion,
            "fecha": str(datetime.now()),
            "usuario": current_user.nombre_completo
        }
        
        bitacora_actual = list(db_ticket.bitacora_dinamica) if db_ticket.bitacora_dinamica else []
        bitacora_actual.append(nueva_entrada)
        db_ticket.bitacora_dinamica = bitacora_actual
        
        db.commit()
        db.refresh(db_ticket)
        return db_ticket

ticket_service = TicketService()