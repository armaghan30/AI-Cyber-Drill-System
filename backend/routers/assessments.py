from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.dependencies import get_db, get_current_user
from backend.models.user import User
from backend.schemas.assessment import AssessmentCreate, AssessmentResponse
from backend.services import assessment_service
from backend.services.simulation_service import NoTrainedModelError

router = APIRouter(prefix="/assessments", tags=["Assessments"])


@router.post("/", response_model=AssessmentResponse, status_code=202)
def start(payload: AssessmentCreate, db: Session = Depends(get_db),
          user: User = Depends(get_current_user)):
    try:
        a = assessment_service.start_assessment(db, payload.scenario_id, user.id,
                                                drills=payload.drills, steps=payload.steps)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except NoTrainedModelError as e:
        raise HTTPException(400, str(e))
    return assessment_service.serialize(a)


@router.get("/", response_model=list[AssessmentResponse])
def list_all(scenario_id: int = Query(None), db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return [assessment_service.serialize(a)
            for a in assessment_service.list_assessments(db, scenario_id, user.id)]


@router.get("/latest", response_model=AssessmentResponse)
def latest(scenario_id: int = Query(...), db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    a = assessment_service.latest_assessment(db, scenario_id, user.id)
    if not a:
        raise HTTPException(404, "No completed assessment for this scenario yet")
    return assessment_service.serialize(a)


@router.get("/{assessment_id}", response_model=AssessmentResponse)
def get_one(assessment_id: int, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    a = assessment_service.get_assessment(db, assessment_id, user.id)
    if not a:
        raise HTTPException(404, "Assessment not found")
    return assessment_service.serialize(a)
