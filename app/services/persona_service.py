from sqlalchemy.orm import Session
from app.models.persona import Persona
from app.schemas.persona_schema import PersonaCreate, PersonaUpdate

class PersonaService:
    @staticmethod
    def get_personas(db: Session, skip: int = 0, limit: int = 100):
        return db.query(Persona).offset(skip).limit(limit).all()

    @staticmethod
    def get_persona_by_cedula(db: Session, cedula: str):
        return db.query(Persona).filter(Persona.cedula == cedula).first()

    @staticmethod
    def create_persona(db: Session, persona_in: PersonaCreate) -> Persona:
        db_persona = Persona(**persona_in.model_dump())
        db.add(db_persona)
        db.commit()
        db.refresh(db_persona)
        return db_persona

    @staticmethod
    def update_persona(db: Session, persona_id: int, persona_in: PersonaUpdate) -> Persona | None:
        db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
        if not db_persona:
            return None
        
        update_data = persona_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_persona, field, value)
        
        db.commit()
        db.refresh(db_persona)
        return db_persona

persona_service = PersonaService()