from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import os, tempfile, time, json, hmac, hashlib, datetime
import httpx, numpy as np

app = FastAPI()

POSE_SERVICE_SECRET = os.environ.get("POSE_SERVICE_SECRET", "")
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "nrh-recordings")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

MODEL_PATH = "/tmp/pose_landmarker_full.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker"
    "/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
)

def ensure_model():
    if not os.path.exists(MODEL_PATH):
        with httpx.Client(timeout=120) as client:
            r = client.get(MODEL_URL)
            r.raise_for_status()
            with open(MODEL_PATH, "wb") as f:
                f.write(r.content)
    return MODEL_PATH

def verify(secret: str = ""):
    if secret != POSE_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

def r2_endpoint():
    return f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

def upload_to_r2(key: str, data: bytes, content_type: str):
    """Upload bytes to R2 using AWS SigV4 signing."""
    import hashlib, hmac, datetime
    service = "s3"
    region = "auto"
    host = f"{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    endpoint = f"https://{host}/{R2_BUCKET}/{key}"
    now = datetime.datetime.utcnow()
    amzdate = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(data).hexdigest()

    headers = {
        "host": host,
        "x-amz-date": amzdate,
        "x-amz-content-sha256": payload_hash,
        "content-type": content_type,
    }

    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_headers = "".join(f"{k}:{v}\n" for k, v in sorted(headers.items()))
    canonical_request = "\n".join([
        "PUT", f"/{R2_BUCKET}/{key}", "",
        canonical_headers, signed_headers, payload_hash
    ])

    credential_scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256", amzdate, credential_scope,
        hashlib.sha256(canonical_request.encode()).hexdigest()
    ])

    def sign(key, msg):
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    signing_key = sign(
        sign(sign(sign(
            f"AWS4{R2_SECRET_ACCESS_KEY}".encode(), datestamp),
            region), service), "aws4_request"
    )
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    auth = (
        f"AWS4-HMAC-SHA256 Credential={R2_ACCESS_KEY_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    with httpx.Client(timeout=120) as client:
        r = client.put(endpoint, content=data, headers={
            **headers, "Authorization": auth
        })
        r.raise_for_status()

def update_recording(recording_id: str, fields: dict):
    """Update recordings row in Supabase."""
    with httpx.Client(timeout=30) as client:
        r = client.patch(
            f"{SUPABASE_URL}/rest/v1/recordings?id=eq.{recording_id}",
            json=fields,
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
        )
        r.raise_for_status()

def _make_landmarker():
    """Create a PoseLandmarker in VIDEO running mode."""
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import (
        PoseLandmarker, PoseLandmarkerOptions, RunningMode
    )
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=ensure_model()),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return PoseLandmarker.create_from_options(options)

def _draw_landmarks(frame, detection_result):
    """Draw pose skeleton onto a BGR frame using Tasks API result."""
    import mediapipe as mp
    from mediapipe.framework.formats import landmark_pb2

    for pose_landmarks in detection_result.pose_landmarks:
        proto = landmark_pb2.NormalizedLandmarkList()
        proto.landmark.extend([
            landmark_pb2.NormalizedLandmark(x=lm.x, y=lm.y, z=lm.z)
            for lm in pose_landmarks
        ])
        mp.solutions.drawing_utils.draw_landmarks(
            frame,
            proto,
            mp.solutions.pose.POSE_CONNECTIONS,
            mp.solutions.drawing_styles.get_default_pose_landmarks_style(),
        )

class ExtractRequest(BaseModel):
    video_url: str
    recording_id: str

class ScoreRequest(BaseModel):
    reference_keypoints_url: str
    student_video_url: str
    session_id: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "pose-service", "version": "0.3.0"}

@app.post("/extract-pose")
def extract_pose(req: ExtractRequest, x_secret: str = Header(default="")):
    verify(x_secret)
    import mediapipe as mp
    import cv2

    start = time.time()

    # Download video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
        with httpx.Client(timeout=120) as client:
            r = client.get(req.video_url)
            r.raise_for_status()
            f.write(r.content)

    cap = cv2.VideoCapture(tmp_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Skeleton video writer
    skel_path = tmp_path.replace(".mp4", "_skeleton.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(skel_path, fourcc, fps, (width, height))

    frames = []
    frame_idx = 0

    with _make_landmarker() as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            timestamp_ms = int((frame_idx / fps) * 1000)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks:
                pose_lms = result.pose_landmarks[0]
                keypoints = [
                    {"x": lm.x, "y": lm.y, "z": lm.z, "v": lm.visibility or 0.0}
                    for lm in pose_lms
                ]
                frames.append({"t": timestamp_ms, "kp": keypoints})
                _draw_landmarks(frame, result)

            writer.write(frame)
            frame_idx += 1

    cap.release()
    writer.release()
    os.unlink(tmp_path)

    # Upload keypoints JSON to R2
    pose_key = f"pose-data/{req.recording_id}_keypoints.json"
    keypoints_bytes = json.dumps({"frames": frames}).encode()
    upload_to_r2(pose_key, keypoints_bytes, "application/json")

    # Upload skeleton video to R2
    skel_key = f"pose-data/{req.recording_id}_skeleton.mp4"
    with open(skel_path, "rb") as f:
        skel_bytes = f.read()
    upload_to_r2(skel_key, skel_bytes, "video/mp4")
    os.unlink(skel_path)

    # Update recordings table
    update_recording(req.recording_id, {
        "pose_extracted": True,
        "pose_r2_key": pose_key,
        "skeleton_r2_key": skel_key
    })

    return {
        "recording_id": req.recording_id,
        "frame_count": len(frames),
        "duration_ms": frames[-1]["t"] if frames else 0,
        "pose_r2_key": pose_key,
        "skeleton_r2_key": skel_key,
        "processing_ms": int((time.time() - start) * 1000)
    }

@app.post("/score-student")
def score_student(req: ScoreRequest, x_secret: str = Header(default="")):
    verify(x_secret)
    import mediapipe as mp
    import cv2
    from dtaidistance import dtw

    start = time.time()

    # Load reference keypoints from R2
    with httpx.Client(timeout=60) as client:
        r = client.get(req.reference_keypoints_url)
        r.raise_for_status()
        ref_data = r.json()

    ref_vectors = [
        np.array([v for kp in frame["kp"] for v in (kp["x"], kp["y"], kp["z"])])
        for frame in ref_data["frames"]
    ]

    # Extract student poses
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
        with httpx.Client(timeout=120) as client:
            r = client.get(req.student_video_url)
            r.raise_for_status()
            f.write(r.content)

    cap = cv2.VideoCapture(tmp_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    student_vectors = []
    frame_idx = 0

    with _make_landmarker() as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            timestamp_ms = int((frame_idx / fps) * 1000)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)
            if result.pose_landmarks:
                pose_lms = result.pose_landmarks[0]
                vec = np.array([v for lm in pose_lms for v in (lm.x, lm.y, lm.z)])
                student_vectors.append(vec)
            frame_idx += 1

    cap.release()
    os.unlink(tmp_path)

    if not ref_vectors or not student_vectors:
        raise HTTPException(status_code=422, detail="Could not extract poses")

    # DTW alignment
    ref_norms = np.array([np.linalg.norm(v) for v in ref_vectors])
    stu_norms = np.array([np.linalg.norm(v) for v in student_vectors])
    _, paths = dtw.warping_paths(ref_norms, stu_norms)
    best_path = dtw.best_path(paths)

    # Cosine similarity per aligned frame pair
    def cosine_sim(a, b):
        n = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / n) if n > 0 else 0.0

    frame_scores = [cosine_sim(ref_vectors[i], student_vectors[j]) for i, j in best_path]
    overall = int(np.mean(frame_scores) * 100)

    # Per-second timeline
    bucket = int(fps)
    timeline = [
        {"t_ms": int((i / fps) * 1000), "score": int(np.mean(frame_scores[i:i+bucket]) * 100)}
        for i in range(0, len(frame_scores), bucket)
    ]

    return {
        "session_id": req.session_id,
        "overall_score": overall,
        "timeline": timeline,
        "frame_count": len(frame_scores),
        "processing_ms": int((time.time() - start) * 1000)
    }
