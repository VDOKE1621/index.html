# Face Attendance System v2 — Actual Browser Face Recognition

## What changed
This version adds real browser-side face detection and face recognition using FaceAPI. The system:
- Loads face detection, landmark, and face-recognition models.
- Detects a face during student registration.
- Generates a 128-value face descriptor for the registered student.
- Stores the descriptor locally in the browser.
- Opens the attendance camera.
- Detects a face continuously.
- Compares the live face descriptor with registered student descriptors.
- Automatically marks attendance when the best match is within the configured threshold.
- Prevents duplicate attendance for the same student on the same date.

FaceAPI supports browser face detection and recognition and loads model manifests/weights from a model directory. This project uses the browser build and model files served through jsDelivr. 

## Files
- index.html
- style.css
- app.js
- README.md

## How to use
1. Extract the ZIP.
2. Open the project through a local server or HTTPS website. Camera access can be blocked when opening an HTML file directly with `file://`.
3. Wait until `Face AI models: ready` appears.
4. Open **Register Student**.
5. Enter student information.
6. Open the camera.
7. Click **Capture Face** while the face is clearly visible.
8. Click **Save Student**.
9. Register additional students in the same way.
10. Open **Take Attendance**.
11. Open the camera.
12. Click **Start Face Recognition**.
13. Look at the camera. A recognized student is automatically marked present.

## Recognition threshold
`MATCH_THRESHOLD = 0.52` is defined in `app.js`. Face descriptor distance is lower for more similar faces. This is a prototype setting and should be tested with your actual camera, lighting, and student population before relying on it for real attendance.

## Important limitations
- Student face descriptors and images are stored in localStorage, so this is a single-browser prototype.
- Clearing browser data removes the records.
- The model files are loaded from the internet, so the first load needs an internet connection.
- Camera access normally requires a secure context such as HTTPS or localhost.
- For a real college deployment, use authenticated storage, encrypted/controlled biometric data handling, access controls, consent, retention/deletion policies, and a secure backend rather than storing biometric data in localStorage.

## Next planned upgrade
Connect the system to Firebase so registered students, face descriptors, and attendance records can be synchronized securely across authorized devices.
