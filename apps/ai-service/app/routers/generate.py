"""`POST /generate` — run one AI generation turn.

Authenticated by `verify_internal_secret` (the core-service -> ai-service hop).
The route is thin: hand the validated request to the generator and return its
response; domain errors are mapped to the `{code, message}` contract by the
handlers in `app.exceptions`.
"""

from fastapi import APIRouter, Depends

from app.generator import generate
from app.llm import llm_client
from app.schemas import GenerateRequest, GenerateResponse
from app.security import verify_internal_secret

router = APIRouter(tags=["generate"], dependencies=[Depends(verify_internal_secret)])


@router.post("/generate", response_model=GenerateResponse)
async def generate_route(req: GenerateRequest) -> GenerateResponse:
    return await generate(req, llm_client)
