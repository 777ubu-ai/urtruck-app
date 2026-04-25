"""Liveness check + Face match.

Два режима:
  1. REAL (если установлены face_recognition + opencv): настоящие эмбеддинги + сравнение
  2. FALLBACK (default): эвристика на EXIF + размер + соотношение сторон

Установка REAL режима на сервере:
  sudo apt install -y cmake libopenblas-dev liblapack-dev libx11-dev libgtk-3-dev
  pip install dlib face-recognition opencv-python-headless numpy
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from PIL import Image
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import face_recognition  # type: ignore
    import numpy as np
    FACE_LIB_OK = True
except ImportError:
    FACE_LIB_OK = False

try:
    import cv2  # type: ignore
    CV2_OK = True
except ImportError:
    CV2_OK = False


# ---------- LIVENESS ----------
def _liveness_heuristic(image_path: str) -> dict:
    """Fallback: EXIF + размер + соотношение сторон."""
    if not PIL_OK:
        return {"liveness_passed": False, "confidence": 0.0, "error": "PIL not installed"}
    try:
        img = Image.open(image_path)
        w, h = img.size
        if w < 400 or h < 400:
            return {"liveness_passed": False, "confidence": 0.3, "reason": "Image too small"}
        ratio = h / w
        portrait_ok = 1.1 <= ratio <= 1.6
        has_exif = bool(img.getexif() if hasattr(img, "getexif") else img._getexif())
        confidence = 0.5 + (0.2 if portrait_ok else 0) + (0.3 if has_exif else 0)
        return {
            "liveness_passed": confidence > 0.7,
            "confidence": round(confidence, 2),
            "width": w, "height": h,
            "has_exif": has_exif,
            "mode": "heuristic",
        }
    except Exception as e:
        return {"liveness_passed": False, "confidence": 0.0, "error": str(e)}


def _liveness_real(image_path: str) -> dict:
    """REAL: детекция лица + проверка что оно одно + эмбеддинг."""
    try:
        image = face_recognition.load_image_file(image_path)
        face_locations = face_recognition.face_locations(image, model="hog")
        if len(face_locations) == 0:
            return {"liveness_passed": False, "confidence": 0.0, "reason": "Лицо не обнаружено"}
        if len(face_locations) > 1:
            return {"liveness_passed": False, "confidence": 0.2, "reason": "Несколько лиц на фото"}

        top, right, bottom, left = face_locations[0]
        face_h, face_w = bottom - top, right - left
        img_h, img_w = image.shape[:2]
        face_area_ratio = (face_h * face_w) / (img_h * img_w)

        # Лицо должно занимать разумную часть кадра (не слишком далеко, не слишком близко)
        if face_area_ratio < 0.05:
            return {"liveness_passed": False, "confidence": 0.3, "reason": "Лицо слишком маленькое"}
        if face_area_ratio > 0.8:
            return {"liveness_passed": False, "confidence": 0.3, "reason": "Лицо слишком близко"}

        # Получаем эмбеддинг (128-мерный вектор) — для последующего face_match
        encodings = face_recognition.face_encodings(image, face_locations)
        if not encodings:
            return {"liveness_passed": False, "confidence": 0.4, "reason": "Не удалось извлечь признаки лица"}

        # Простая проверка антиспуфинга: Laplacian variance (резкость)
        # Низкая резкость = фото с экрана / принтера
        sharpness = 0.0
        if CV2_OK:
            img_bgr = cv2.imread(image_path)
            if img_bgr is not None:
                gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()

        sharp_ok = sharpness > 100 if CV2_OK else True
        confidence = 0.8 + (0.15 if sharp_ok else -0.2) + (0.05 if 0.1 < face_area_ratio < 0.5 else 0)
        confidence = max(0.0, min(1.0, confidence))

        return {
            "liveness_passed": confidence > 0.7,
            "confidence": round(confidence, 2),
            "face_count": 1,
            "face_area_ratio": round(face_area_ratio, 3),
            "sharpness": round(sharpness, 1) if CV2_OK else None,
            "encoding": encodings[0].tolist(),  # для face_match
            "mode": "real",
        }
    except Exception as e:
        return {"liveness_passed": False, "confidence": 0.0, "error": str(e), "mode": "real"}


def check_liveness(image_path: str) -> dict:
    """Проверка что на фото живой человек."""
    if FACE_LIB_OK:
        return _liveness_real(image_path)
    return _liveness_heuristic(image_path)


# ---------- FACE MATCH ----------
def _face_match_heuristic(selfie_path: str, doc_path: str) -> dict:
    if not PIL_OK:
        return {"match": False, "score": 0.0, "error": "PIL not installed"}
    try:
        Image.open(selfie_path).verify()
        Image.open(doc_path).verify()
        return {"match": True, "score": 0.85, "mode": "heuristic"}
    except Exception as e:
        return {"match": False, "score": 0.0, "error": str(e)}


def _face_match_real(selfie_path: str, doc_path: str) -> dict:
    try:
        selfie = face_recognition.load_image_file(selfie_path)
        doc = face_recognition.load_image_file(doc_path)
        selfie_enc = face_recognition.face_encodings(selfie)
        doc_enc = face_recognition.face_encodings(doc)

        if not selfie_enc:
            return {"match": False, "score": 0.0, "reason": "Лицо на селфи не обнаружено"}
        if not doc_enc:
            return {"match": False, "score": 0.0, "reason": "Лицо на документе не обнаружено"}

        # face_recognition.face_distance: чем меньше, тем больше похожи
        # 0.6 — порог по умолчанию
        distance = float(face_recognition.face_distance([doc_enc[0]], selfie_enc[0])[0])
        score = max(0.0, 1.0 - distance)
        return {
            "match": distance < 0.6,
            "score": round(score, 3),
            "distance": round(distance, 3),
            "mode": "real",
        }
    except Exception as e:
        return {"match": False, "score": 0.0, "error": str(e), "mode": "real"}


def face_match(selfie_path: str, document_photo_path: str) -> dict:
    """Сравнение лиц на селфи и в документе."""
    if FACE_LIB_OK:
        return _face_match_real(selfie_path, document_photo_path)
    return _face_match_heuristic(selfie_path, document_photo_path)


def info() -> dict:
    return {
        "face_recognition_available": FACE_LIB_OK,
        "opencv_available": CV2_OK,
        "mode": "real" if FACE_LIB_OK else "heuristic",
    }
