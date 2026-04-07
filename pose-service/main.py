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
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

def get_song_offset_seconds(video_url: str, mp3_url: str) -> float:
    """
    Find where in the mp3 the video's audio starts.
    Uses chromaprint fingerprinting + sliding window cross-correlation.
    Returns offset in seconds. Returns 0.0 on any failure.
    """
    try:
        import acoustid

        # Download video to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            video_path = f.name
        with httpx.Client(timeout=120) as client:
            r = client.get(video_url)
            r.raise_for_status()
            with open(video_path, 'wb') as f:
                f.write(r.content)

        # Download mp3 to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            mp3_path = f.name
        with httpx.Client(timeout=60) as client:
            r = client.get(mp3_url)
            r.raise_for_status()
            with open(mp3_path, 'wb') as f:
                f.write(r.content)

        # Extract audio from video as wav
        wav_path = video_path + '.wav'
        os.system(
            f'ffmpeg -i {video_path} -ar 11025 -ac 1 '
            f'-f wav {wav_path} -y -loglevel quiet'
        )

        # Fingerprint both files using chromaprint via acoustid
        vid_duration, vid_fp = acoustid.fingerprint_file(wav_path)
        mp3_duration, mp3_fp = acoustid.fingerprint_file(mp3_path)

        # Decode to raw integer arrays
        import chromaprint
        vid_raw, _ = chromaprint.decode_fingerprint(vid_fp)
        mp3_raw, _ = chromaprint.decode_fingerprint(mp3_fp)

        # Sliding window: find position in mp3 that best matches video audio
        # Each fingerprint frame = ~0.5 seconds
        best_offset = 0
        best_score = -1
        search_limit = min(len(mp3_raw), len(mp3_raw) - len(vid_raw) + 1)
        step = 4  # check every 2 seconds

        for i in range(0, max(1, search_limit), step):
            overlap = min(len(vid_raw), len(mp3_raw) - i)
            if overlap < 8:
                break
            # Count matching bits using XOR (fewer differing bits = better match)
            matches = sum(
                bin(a ^ b).count('0')
                for a, b in zip(vid_raw[:overlap], mp3_raw[i:i+overlap])
            )
            score = matches / (overlap * 32)  # 32 bits per int
            if score > best_score:
                best_score = score
                best_offset = i * 0.5

        print(f'[fingerprint] ref video starts at {best_offset:.1f}s in song '
              f'(confidence {best_score:.3f})')
        return best_offset

    except Exception as e:
        print(f'[fingerprint] failed, defaulting to 0.0s: {e}')
        return 0.0
    finally:
        for path in [video_path, wav_path, mp3_path]:
            try: os.unlink(path)
            except: pass


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

class ExtractRequest(BaseModel):
    video_url: str
    recording_id: str

class ScoreRequest(BaseModel):
    reference_keypoints_url: str
    student_video_url: str
    session_id: str
    recording_id: str = ""
    student_recording_id: str = ""
    music_url: str = ""
    reference_video_url: str = ""
    student_music_offset_ms: int = 0

@app.get("/health")
def health():
    return {"status": "ok", "service": "pose-service", "version": "0.2.0"}

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

    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles
    cap = cv2.VideoCapture(tmp_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    skel_path = tmp_path.replace(".mp4", "_skeleton.mp4")
    tmpdir = tempfile.mkdtemp()

    frames = []
    frame_idx = 0

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)
            timestamp_ms = int((frame_idx / fps) * 1000)

            if result.pose_landmarks:
                keypoints = [
                    {"x": lm.x, "y": lm.y, "z": lm.z, "v": lm.visibility}
                    for lm in result.pose_landmarks.landmark
                ]
                frames.append({"t": timestamp_ms, "kp": keypoints})

                mp_drawing.draw_landmarks(
                    frame,
                    result.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style()
                )

            cv2.imwrite(f"{tmpdir}/frame_{frame_idx:06d}.png", frame)
            frame_idx += 1

    cap.release()
    os.unlink(tmp_path)

    # Assemble PNG sequence into H.264 MP4
    import subprocess, shutil
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(int(fps)),
        "-i", f"{tmpdir}/frame_%06d.png",
        "-vcodec", "libx264",
        "-crf", "28",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        skel_path
    ], check=True)
    shutil.rmtree(tmpdir)

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

    # Music-anchored alignment
    ref_offset_s = 0.0
    student_offset_s = req.student_music_offset_ms / 1000.0

    if req.music_url and req.reference_video_url:
        ref_offset_s = get_song_offset_seconds(
            req.reference_video_url, req.music_url
        )

    # Extract student poses
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
        with httpx.Client(timeout=120) as client:
            r = client.get(req.student_video_url)
            r.raise_for_status()
            f.write(r.content)

    mp_pose = mp.solutions.pose
    cap = cv2.VideoCapture(tmp_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    student_vectors = []

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)
            if result.pose_landmarks:
                vec = np.array([
                    v for lm in result.pose_landmarks.landmark
                    for v in (lm.x, lm.y, lm.z)
                ])
                student_vectors.append(vec)

    cap.release()
    os.unlink(tmp_path)

    if not ref_vectors or not student_vectors:
        raise HTTPException(status_code=422, detail="Could not extract poses")

    # Trim ref_vectors to start at the song position
    fps_ref = 30
    ref_start_frame = int(ref_offset_s * fps_ref)
    ref_vectors = ref_vectors[ref_start_frame:] if ref_start_frame < len(ref_vectors) else ref_vectors

    def cosine_sim(a, b):
        n = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / n) if n > 0 else 0.0

    # If music_url provided, align by song time (no DTW)
    # Otherwise fall back to DTW
    if req.music_url and req.reference_video_url:
        # Direct frame-by-frame scoring at matching song positions
        min_len = min(len(ref_vectors), len(student_vectors))
        frame_scores = [cosine_sim(ref_vectors[i], student_vectors[i])
                        for i in range(min_len)]
    else:
        # DTW fallback (no music)
        from dtaidistance import dtw
        ref_norms = np.array([np.linalg.norm(v) for v in ref_vectors])
        stu_norms = np.array([np.linalg.norm(v) for v in student_vectors])
        _, paths = dtw.warping_paths(ref_norms, stu_norms)
        best_path = dtw.best_path(paths)
        frame_scores = [cosine_sim(ref_vectors[i], student_vectors[j])
                        for i, j in best_path]
    overall = int(np.mean(frame_scores) * 100)

    # Per-second timeline
    bucket = int(fps)
    timeline = [
        {"t_ms": int((i / fps) * 1000), "score": int(np.mean(frame_scores[i:i+bucket]) * 100)}
        for i in range(0, len(frame_scores), bucket)
    ]

    # Call back to Supabase update-score edge function
    student_rec_id = req.student_recording_id or req.recording_id
    if SUPABASE_URL and student_rec_id:
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    f"{SUPABASE_URL}/functions/v1/update-score",
                    json={
                        "session_id": req.session_id,
                        "student_recording_id": student_rec_id,
                        "overall_score": overall,
                        "timeline": timeline,
                    },
                    headers={
                        "Content-Type": "application/json",
                        "x-internal-secret": INTERNAL_SECRET,
                    },
                )
                print(f"[score-student] update-score status: {resp.status_code} body: {resp.text}")
        except Exception as e:
            print(f"[score-student] update-score callback error: {e}")

    return {
        "session_id": req.session_id,
        "overall_score": overall,
        "timeline": timeline,
        "frame_count": len(frame_scores),
        "processing_ms": int((time.time() - start) * 1000)
    }
