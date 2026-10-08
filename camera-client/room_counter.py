import os
import re
import time

import cv2
import requests
from ultralytics import YOLO

SERVER_URL = os.getenv("ATTENDANCE_SERVER_URL", "http://localhost:3000").rstrip("/")
SEND_INTERVAL = float(os.getenv("ROOM_COUNT_INTERVAL_SECONDS", "10"))
CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.5"))
CAMERA_INDEX = int(os.getenv("ROOM_CAMERA_INDEX", "0"))
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

model = YOLO(MODEL_PATH)


def get_active_session():
    try:
        response = requests.get(f"{SERVER_URL}/api/camera1/session/active", timeout=5)
        if response.status_code == 200:
            return response.json()
    except Exception as error:
        print(f"[WARN] Cannot connect to server: {error}")
    return None


def send_verify(session_id, count_in_room):
    try:
        response = requests.post(
            f"{SERVER_URL}/api/camera2/verify",
            json={
                "session_id": session_id,
                "count_in_room": count_in_room,
                "detected_ids": [],
            },
            timeout=5,
        )
        return response.json()
    except Exception as error:
        print(f"[WARN] Cannot send verify: {error}")
        return None


def ascii_only(text):
    return re.sub(r"[^\x00-\x7F]+", "", text).strip()


def put_text(frame, text, pos, color, scale=0.6, thickness=2):
    cv2.putText(
        frame,
        text,
        pos,
        cv2.FONT_HERSHEY_SIMPLEX,
        scale,
        color,
        thickness,
    )


def main():
    print(f"[INFO] Connecting to server: {SERVER_URL}")

    session = get_active_session()
    if session:
        subject_raw = session.get("subject_name", "Unknown")
        room_raw = session.get("room", "-")
        room_display = ascii_only(room_raw) or room_raw.encode("ascii", "ignore").decode()
        if not room_display:
            room_display = "-"
        print(f"[INFO] Session: {subject_raw} | Room: {room_raw}")
    else:
        room_display = "-"
        print("[WARN] No active session")

    capture = cv2.VideoCapture(CAMERA_INDEX)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    last_sent = 0
    last_result_text = "Waiting..."
    last_match = None
    checked_count = 0

    print("[INFO] Room counter started | Press Q to quit\n")

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        results = model(frame, verbose=False)
        person_count = 0
        for box in results[0].boxes:
            detected_class = int(box.cls[0])
            confidence = float(box.conf[0])
            if detected_class == 0 and confidence >= CONFIDENCE:
                person_count += 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 255), 2)
                put_text(frame, f"Person {person_count}", (x1, y1 - 8), (0, 200, 255), 0.5, 1)

        now = time.time()
        if now - last_sent >= SEND_INTERVAL:
            if session:
                result = send_verify(session["id"], person_count)
                if result:
                    last_match = result.get("is_matched")
                    checked_count = result.get("count_checked", 0)
                    if last_match:
                        last_result_text = f"MATCHED! Checked:{checked_count} = Room:{person_count}"
                        print(f"[OK] MATCHED - Checked:{checked_count} | Room:{person_count}")
                    else:
                        last_result_text = f"NOT MATCH Checked:{checked_count} / Room:{person_count}"
                        print(f"[WARN] NOT MATCHED - Checked:{checked_count} | Room:{person_count}")
                else:
                    last_result_text = "Server error - retrying..."
            last_sent = now

        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (640, 130), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.45, frame, 0.55, 0, frame)

        put_text(frame, f"ROOM COUNTER | Room: {room_display}", (10, 25), (255, 255, 0), 0.6)
        put_text(frame, f"People in room : {person_count}", (10, 55), (0, 200, 255), 0.65)
        put_text(frame, f"Checked in DB  : {checked_count}", (10, 82), (180, 255, 180), 0.6)

        if last_match is True:
            result_color = (0, 255, 0)
        elif last_match is False:
            result_color = (0, 60, 255)
        else:
            result_color = (180, 180, 180)
        put_text(frame, last_result_text, (10, 110), result_color, 0.52)

        countdown = max(0, int(SEND_INTERVAL - (now - last_sent)))
        put_text(frame, f"Next send: {countdown}s", (490, 25), (150, 150, 150), 0.45, 1)

        cv2.imshow("Anonymous Room Counter", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    capture.release()
    cv2.destroyAllWindows()
    print("[INFO] Camera closed")


if __name__ == "__main__":
    main()
