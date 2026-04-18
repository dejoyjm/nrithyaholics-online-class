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
_last_fingerprint_confidence = 0.0

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
        global _last_fingerprint_confidence
        _last_fingerprint_confidence = best_score
        if best_score < 0.7:
            print(f'[fingerprint] confidence {best_score:.3f} below threshold, using 0.0s')
            return 0.0
        return best_offset

    except Exception as e:
        print(f'[fingerprint] failed, defaulting to 0.0s: {e}')
        return 0.0
    finally:
        for path in [video_path, wav_path, mp3_path]:
            try: os.unlink(path)
            except: pass


def angle_2d(a, b, c):
    """
    Compute angle at point b formed by vectors b->a and b->c.
    Uses 2D XY only (ignores Z — MediaPipe Z is unreliable on phones).
    Returns angle in degrees (0-180).
    """
    ba = np.array([a[0] - b[0], a[1] - b[1]])
    bc = np.array([c[0] - b[0], c[1] - b[1]])
    norm = np.linalg.norm(ba) * np.linalg.norm(bc)
    if norm < 1e-6:
        return 90.0
    cos_angle = np.clip(np.dot(ba, bc) / norm, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


def keypoints_to_angles(kp_list, visibility_threshold=0.5):
    """
    Convert 33 MediaPipe keypoints to 8 joint angles (XY plane only).
    Returns (angles_array, valid_mask).

    angles_array: numpy array of 8 floats (degrees, normalised 0-1 by /180)
    valid_mask:   boolean array — False if any joint in that angle had visibility < threshold

    MediaPipe landmark indices:
      11=left_shoulder, 12=right_shoulder
      13=left_elbow,    14=right_elbow
      15=left_wrist,    16=right_wrist
      23=left_hip,      24=right_hip
      25=left_knee,     26=right_knee
      27=left_ankle,    28=right_ankle

    8 angles:
      0: left_elbow    (shoulder->elbow->wrist):   11,13,15
      1: right_elbow   (shoulder->elbow->wrist):   12,14,16
      2: left_shoulder (elbow->shoulder->hip):     13,11,23
      3: right_shoulder(elbow->shoulder->hip):     14,12,24
      4: left_hip      (shoulder->hip->knee):      11,23,25
      5: right_hip     (shoulder->hip->knee):      12,24,26
      6: left_knee     (hip->knee->ankle):         23,25,27
      7: right_knee    (hip->knee->ankle):         24,26,28
    """
    ANGLE_DEFS = [
        (11, 13, 15),  # left elbow
        (12, 14, 16),  # right elbow
        (13, 11, 23),  # left shoulder
        (14, 12, 24),  # right shoulder
        (11, 23, 25),  # left hip
        (12, 24, 26),  # right hip
        (23, 25, 27),  # left knee
        (24, 26, 28),  # right knee
    ]

    angles = np.zeros(8)
    valid = np.ones(8, dtype=bool)

    for i, (ai, bi, ci) in enumerate(ANGLE_DEFS):
        va = kp_list[ai]['v']
        vb = kp_list[bi]['v']
        vc = kp_list[ci]['v']

        if va < visibility_threshold or vb < visibility_threshold or vc < visibility_threshold:
            valid[i] = False
            angles[i] = 0.0
            continue

        a = (kp_list[ai]['x'], kp_list[ai]['y'])
        b = (kp_list[bi]['x'], kp_list[bi]['y'])
        c = (kp_list[ci]['x'], kp_list[ci]['y'])
        angles[i] = angle_2d(a, b, c) / 180.0  # normalise to 0-1

    return angles, valid


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

    # Compute per-frame angles
    frame_angles = []
    for frame in frames:
        angles, valid = keypoints_to_angles(frame["kp"])
        frame_angles.append({"angles": angles.tolist(), "valid": valid.tolist()})

    # Compute angle variance across all frames → weights
    # High variance = joint moves a lot = important for this choreography
    all_angles = np.array([fa["angles"] for fa in frame_angles])  # shape (N, 8)
    variances = np.var(all_angles, axis=0)  # shape (8,)
    total_var = variances.sum()
    weights = (variances / total_var).tolist() if total_var > 1e-6 else [0.125] * 8

    # Compute bounding box from all visible landmarks
    all_x = [kp["x"] for f in frames for kp in f["kp"] if kp["v"] > 0.5]
    all_y = [kp["y"] for f in frames for kp in f["kp"] if kp["v"] > 0.5]
    bounding_box = {
        "x_min": float(min(all_x)) if all_x else 0.0,
        "x_max": float(max(all_x)) if all_x else 1.0,
        "y_min": float(min(all_y)) if all_y else 0.0,
        "y_max": float(max(all_y)) if all_y else 1.0,
    }

    # Store enriched JSON
    keypoints_data = {
        "frames": frames,
        "frame_angles": frame_angles,
        "weights": weights,
        "bounding_box": bounding_box,
    }
    keypoints_bytes = json.dumps(keypoints_data).encode()

    print(f"[extract-pose] weights: {[round(w,3) for w in weights]}")
    print(f"[extract-pose] bounding_box: {bounding_box}")

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

    # Use pre-computed angle vectors + weights from reference JSON
    # Fall back to raw XYZ if old format (no frame_angles key)
    use_angles = "frame_angles" in ref_data and "weights" in ref_data

    if use_angles:
        ref_angles = [np.array(fa["angles"]) for fa in ref_data["frame_angles"]]
        ref_valids = [np.array(fa["valid"]) for fa in ref_data["frame_angles"]]
        weights = np.array(ref_data["weights"])
        print(f"[score-student] using angle-based scoring, weights: {[round(w,3) for w in weights]}")
    else:
        ref_vectors = [
            np.array([v for kp in frame["kp"] for v in (kp["x"], kp["y"], kp["z"])])
            for frame in ref_data["frames"]
        ]
        print("[score-student] falling back to raw XYZ (old reference format)")

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
    student_angles = []
    student_valids = []
    student_vectors = []  # kept for DTW fallback path

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
                kp_list = [
                    {"x": lm.x, "y": lm.y, "z": lm.z, "v": lm.visibility}
                    for lm in result.pose_landmarks.landmark
                ]
                if use_angles:
                    angles, valid = keypoints_to_angles(kp_list)
                    student_angles.append(angles)
                    student_valids.append(valid)
                else:
                    vec = np.array([v for lm in result.pose_landmarks.landmark
                                   for v in (lm.x, lm.y, lm.z)])
                    student_vectors.append(vec)

    cap.release()
    os.unlink(tmp_path)

    if use_angles:
        if not ref_angles or not student_angles:
            raise HTTPException(status_code=422, detail="Could not extract poses")
    else:
        if not ref_vectors or not student_vectors:
            raise HTTPException(status_code=422, detail="Could not extract poses")

    # Trim reference to music offset
    fps_ref = 30
    ref_start_frame = int(ref_offset_s * fps_ref)

    if use_angles:
        ref_angles = ref_angles[ref_start_frame:] if ref_start_frame < len(ref_angles) else ref_angles
        ref_valids = ref_valids[ref_start_frame:] if ref_start_frame < len(ref_valids) else ref_valids

        import sys
        use_direct_align = (req.music_url and req.reference_video_url
                           and _last_fingerprint_confidence >= 0.7)

        min_len = min(len(ref_angles), len(student_angles))

        def angle_score(ref_a, ref_v, stu_a, stu_v, w):
            """
            Weighted angle similarity for one frame.
            Only includes angles where BOTH ref and student joints are visible.
            Normalises to 0-100 using floor of 0.5 (angle similarity baseline).
            """
            combined_valid = ref_v & stu_v
            if not combined_valid.any():
                return None  # skip frame entirely
            valid_weights = w * combined_valid
            weight_sum = valid_weights.sum()
            if weight_sum < 1e-6:
                return None
            norm_weights = valid_weights / weight_sum
            # Angle similarity: 1 - |angle_diff| (both normalised 0-1)
            similarities = 1.0 - np.abs(ref_a - stu_a)
            raw = float(np.sum(norm_weights * similarities))
            # Normalise: floor is 0.5 (random pose similarity baseline for angles)
            normalised = (raw - 0.5) / 0.5
            return max(0.0, min(1.0, normalised))

        frame_scores_raw = [
            angle_score(
                ref_angles[i], ref_valids[i],
                student_angles[i], student_valids[i],
                weights
            )
            for i in range(min_len)
        ]
        # Drop None frames (both sides had no visible joints)
        frame_scores = [s for s in frame_scores_raw if s is not None]

        # Environment score: average student joint visibility across all frames
        all_vis = [v for sv in student_valids for v in sv.astype(float)]
        environment_score = int(np.mean(all_vis) * 100) if all_vis else 0

    else:
        # Legacy XYZ path
        ref_vectors = ref_vectors[ref_start_frame:] if ref_start_frame < len(ref_vectors) else ref_vectors

        def cosine_sim(a, b):
            n = np.linalg.norm(a) * np.linalg.norm(b)
            return float(np.dot(a, b) / n) if n > 0 else 0.0

        if req.music_url and req.reference_video_url:
            min_len = min(len(ref_vectors), len(student_vectors))
            frame_scores = [cosine_sim(ref_vectors[i], student_vectors[i])
                           for i in range(min_len)]
        else:
            from dtaidistance import dtw
            ref_norms = np.array([np.linalg.norm(v) for v in ref_vectors])
            stu_norms = np.array([np.linalg.norm(v) for v in student_vectors])
            _, paths = dtw.warping_paths(ref_norms, stu_norms)
            best_path = dtw.best_path(paths)
            frame_scores = [cosine_sim(ref_vectors[i], student_vectors[j])
                           for i, j in best_path]

        environment_score = 50  # unknown in legacy path

    overall = int(np.mean(frame_scores) * 100) if frame_scores else 0

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
                        "environment_score": environment_score,
                    },
                    headers={
                        "Content-Type": "application/json",
                        "x-internal-secret": INTERNAL_SECRET,
                    },
                )
                print(f"[score-student] update-score status: {resp.status_code} body: {resp.text}")
        except Exception as e:
            print(f"[score-student] update-score callback error: {e}")

    print(f"[score-student] overall={overall} environment={environment_score} "
          f"frames={len(frame_scores)} use_angles={use_angles}")

    return {
        "session_id": req.session_id,
        "overall_score": overall,
        "timeline": timeline,
        "frame_count": len(frame_scores),
        "processing_ms": int((time.time() - start) * 1000),
        "environment_score": environment_score,
    }
