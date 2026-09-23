const $ = id => document.getElementById(id);
const STORAGE_STUDENTS = "faceAttend_students";
const STORAGE_RECORDS = "faceAttend_records";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/model";
const MATCH_THRESHOLD = 0.52;

let registerStream = null;
let attendanceStream = null;
let recognitionTimer = null;
let modelsReady = false;
let recognitionBusy = false;
let lastRecognitionAt = 0;
let lastRecognizedId = null;

const getStudents = () => JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]");
const getRecords = () => JSON.parse(localStorage.getItem(STORAGE_RECORDS) || "[]");
const saveStudents = data => localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(data));
const saveRecords = data => localStorage.setItem(STORAGE_RECORDS, JSON.stringify(data));

function toast(message){
  const t=$("toast"); t.textContent=message; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2500);
}
function showSection(id){
  document.querySelectorAll(".section").forEach(s=>s.classList.toggle("active",s.id===id));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.section===id));
  const names={dashboard:"Dashboard",register:"Register Student",attendance:"Take Attendance",students:"Students",records:"Attendance Records"};
  $("pageTitle").textContent=names[id]||"Dashboard";
  if(id==="dashboard") renderDashboard();
  if(id==="students") renderStudents();
  if(id==="records") renderRecords();
  if(id==="attendance") renderPicker();
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.go)));
$("quickAttendance").onclick=()=>showSection("attendance");

async function loadFaceModels(){
  try{
    $("modelStatus").textContent="Face AI models: loading...";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsReady=true;
    $("modelStatus").textContent="Face AI models: ready";
    $("modelStatus").style.color="#a9ffc0";
    $("attendanceStatus").textContent="AI models ready. Open the camera to begin.";
  }catch(err){
    console.error(err);
    $("modelStatus").textContent="Face AI models: failed to load. Check internet connection.";
    $("attendanceStatus").textContent="Could not load face-recognition models.";
  }
}

async function startCamera(video, status){
  if(!navigator.mediaDevices?.getUserMedia){
    status.textContent="Camera API is unavailable. Use a modern browser over HTTPS or localhost.";
    return null;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    video.srcObject=stream;
    await video.play();
    status.textContent="Camera is active.";
    return stream;
  }catch(e){
    status.textContent="Camera access failed. Allow camera permission and use HTTPS or localhost.";
    toast("Camera permission required");
    return null;
  }
}

$("startRegisterCamera").onclick=async()=>{
  if(registerStream) registerStream.getTracks().forEach(t=>t.stop());
  registerStream=await startCamera($("registerVideo"),$("registerStatus"));
};

$("captureFace").onclick=async()=>{
  const video=$("registerVideo"), canvas=$("registerCanvas");
  if(!video.srcObject){toast("Open the camera first");return}
  if(!modelsReady){toast("Face AI models are still loading");return}
  const detection=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5}))
    .withFaceLandmarks(true).withFaceDescriptor();
  if(!detection){$("registerStatus").textContent="No clear face detected. Look directly at the camera.";toast("Face not detected");return}
  canvas.width=video.videoWidth||640; canvas.height=video.videoHeight||480;
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
  $("facePreview").src=canvas.toDataURL("image/jpeg",0.85);
  $("facePreview").dataset.descriptor=JSON.stringify(Array.from(detection.descriptor));
  $("registerStatus").textContent="Face captured and face descriptor generated.";
};

$("saveStudent").onclick=()=>{
  const name=$("studentName").value.trim(), roll=$("rollNumber").value.trim();
  const face=$("facePreview").src, descriptor=$("facePreview").dataset.descriptor;
  if(!name||!roll||!face||!descriptor){toast("Enter details and capture a detected face");return}
  const students=getStudents();
  if(students.some(s=>s.roll.toLowerCase()===roll.toLowerCase())){toast("Roll number already exists");return}
  students.push({
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),
    name,roll,department:$("department").value.trim(),year:$("year").value.trim(),
    face,descriptor:JSON.parse(descriptor),createdAt:new Date().toISOString()
  });
  saveStudents(students);
  ["studentName","rollNumber","department","year"].forEach(id=>$(id).value="");
  $("facePreview").removeAttribute("src"); delete $("facePreview").dataset.descriptor;
  $("registerStatus").textContent="Camera is not active.";
  toast("Student registered with face recognition data");
  showSection("students");
};

$("startAttendanceCamera").onclick=async()=>{
  if(attendanceStream) attendanceStream.getTracks().forEach(t=>t.stop());
  attendanceStream=await startCamera($("attendanceVideo"),$("attendanceStatus"));
};

$("startRecognition").onclick=async()=>{
  if(!modelsReady){toast("AI models are not ready");return}
  if(!attendanceStream){attendanceStream=await startCamera($("attendanceVideo"),$("attendanceStatus"))}
  if(!attendanceStream)return;
  if(recognitionTimer) clearInterval(recognitionTimer);
  lastRecognizedId=null;
  $("attendanceStatus").textContent="Recognition running. Look at the camera.";
  recognitionTimer=setInterval(recognizeFace,900);
};

$("stopRecognition").onclick=()=>{
  if(recognitionTimer) clearInterval(recognitionTimer);
  recognitionTimer=null;
  $("attendanceStatus").textContent="Recognition stopped.";
};

async function recognizeFace(){
  if(recognitionBusy || !modelsReady || !attendanceStream)return;
  if($("attendanceVideo").readyState<2)return;
  recognitionBusy=true;
  try{
    const result=await faceapi.detectSingleFace($("attendanceVideo"),new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5}))
      .withFaceLandmarks(true).withFaceDescriptor();
    if(!result){
      $("recognitionResult").textContent="No face detected";
      $("recognitionResult").className="recognition-result warn";
      return;
    }
    const students=getStudents().filter(s=>Array.isArray(s.descriptor)&&s.descriptor.length===128);
    if(!students.length){
      $("recognitionResult").textContent="No registered face profiles available";
      $("recognitionResult").className="recognition-result warn";
      return;
    }
    let best=null, bestDistance=Infinity;
    for(const student of students){
      const distance=faceapi.euclideanDistance(result.descriptor,new Float32Array(student.descriptor));
      if(distance<bestDistance){bestDistance=distance;best=student}
    }
    if(best && bestDistance<=MATCH_THRESHOLD){
      $("recognitionResult").textContent=`✓ Recognized: ${best.name} (${best.roll}) · Match distance ${bestDistance.toFixed(3)}`;
      $("recognitionResult").className="recognition-result success";
      $("attendanceStatus").textContent="Face matched. Attendance is being checked.";
      if(best.id!==lastRecognizedId || Date.now()-lastRecognitionAt>5000){
        markAttendanceFor(best);
        lastRecognizedId=best.id;
        lastRecognitionAt=Date.now();
      }
    }else{
      $("recognitionResult").textContent=`Face detected, but no registered student matched. Best distance: ${bestDistance.toFixed(3)}`;
      $("recognitionResult").className="recognition-result warn";
    }
  }catch(err){
    console.error(err);
    $("attendanceStatus").textContent="Recognition error. See browser console for details.";
  }finally{recognitionBusy=false}
}

function markAttendanceFor(student){
  const now=new Date(), date=now.toISOString().slice(0,10);
  const records=getRecords();
  if(records.some(r=>r.studentId===student.id&&r.date===date)){
    $("attendanceStatus").textContent=`${student.name} is already marked present today.`;
    toast("Attendance already marked today");
    return;
  }
  records.unshift({
    id:Date.now(),studentId:student.id,name:student.name,roll:student.roll,
    date,time:now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),status:"Present"
  });
  saveRecords(records);
  $("attendanceStatus").textContent=`✓ Attendance marked automatically for ${student.name}.`;
  toast(`Attendance marked: ${student.name}`);
  renderDashboard();
}

function renderPicker(){
  const students=getStudents();
  $("attendanceStudentPicker").innerHTML=students.length
    ? `<p class="status">Manual selection is no longer required. Recognition uses the registered face profiles.</p>`
    : "<p class='status'>Register students first.</p>";
}

function renderDashboard(){
  const students=getStudents(), records=getRecords(), today=new Date().toISOString().slice(0,10);
  const todayRecords=records.filter(r=>r.date===today);
  $("totalStudents").textContent=students.length;
  $("presentToday").textContent=todayRecords.length;
  $("absentToday").textContent=Math.max(0,students.length-todayRecords.length);
  $("attendanceRate").textContent=students.length?Math.round(todayRecords.length/students.length*100)+"%":"0%";
  $("recentAttendance").innerHTML=tableHtml(todayRecords.slice(0,8));
}
function tableHtml(rows){
  if(!rows.length)return "<p class='status'>No attendance records available.</p>";
  return `<table class="table"><thead><tr><th>Student</th><th>Roll</th><th>Date</th><th>Time</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.roll)}</td><td>${r.date}</td><td>${r.time}</td><td>${r.status}</td></tr>`).join("")}</tbody></table>`;
}
function renderStudents(){
  const students=getStudents();
  $("studentsList").innerHTML=students.length?students.map(s=>`<article class="student-card"><img src="${s.face}" alt=""><h4>${escapeHtml(s.name)}</h4><p>Roll: ${escapeHtml(s.roll)}</p><p>${escapeHtml(s.department||"Department not set")} · ${escapeHtml(s.year||"Year not set")}</p><p>${Array.isArray(s.descriptor)?"✓ Face profile ready":"Legacy photo only"}</p></article>`).join(""):"<p class='status'>No students registered yet.</p>";
}
function renderRecords(){ $("recordsTable").innerHTML=tableHtml(getRecords()); }
$("clearRecords").onclick=()=>{if(confirm("Clear all attendance records?")){saveRecords([]);renderRecords();renderDashboard();toast("Records cleared")}};

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

renderDashboard();
loadFaceModels();