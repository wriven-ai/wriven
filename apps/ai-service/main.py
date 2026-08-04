from fastapi import FastAPI
from fastapi.responses import JSONResponse
import os

app = FastAPI(
    title="Wriven AI Service",
    description="AI-powered content generation for Wriven CMS",
    version="0.1.0",
)

PORT = int(os.getenv("PORT", 8000))


@app.get("/health")
async def health():
    """Health check endpoint."""
    return JSONResponse({"status": "ok", "service": "ai-service"})


@app.get("/")
async def root():
    """Root endpoint."""
    return {"service": "Wriven AI Service", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
