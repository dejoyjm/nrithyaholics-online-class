from fastapi import FastAPI, Header, HTTPException
import os

app = FastAPI()

POSE_SERVICE_SECRET = os.environ.get("POSE_SERVICE_SECRET", "")

def verify(secret: str = ""):
    if secret != POSE_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/health")
def health():
    return {"status": "ok", "service": "pose-service", "version": "0.1.0"}

@app.post("/extract-pose")
def extract_pose(x_secret: str = Header(default="")):
    verify(x_secret)
    return {"status": "not_implemented", "message": "MediaPipe coming in v0.2"}

@app.post("/score")
def score(x_secret: str = Header(default="")):
    verify(x_secret)
    return {"status": "not_implemented", "message": "Scoring coming in v0.2"}
