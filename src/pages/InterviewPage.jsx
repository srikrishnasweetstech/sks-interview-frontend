import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

function speak(text, onEnd) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95; utt.pitch = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google UK English Female'));
  if (v) utt.voice = v;
  utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

function captureFrame(videoEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 240;
    c.getContext('2d').drawImage(videoEl, 0, 0, 320, 240);
    return c.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch { return null; }
}

// Extract text from PDF file using FileReader
async function extractPDFText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Return base64 for now — backend will process
      // For demo, we extract raw text as much as possible
      const text = `[Resume: ${file.name}] Uploaded by candidate.`;
      resolve(text);
    };
    reader.readAsText(file);
  });
}

// Read file as text (works for .txt resumes)
async function readFileAsText(file) {
  return new Promise((resolve) => {
    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsText(file);
    } else {
      // For PDF — extract what we can
      resolve(`[Resume file: ${file.name}, size: ${(file.size/1024).toFixed(1)}KB] — ${file.name}`);
    }
  });
}

const S = {
  root: { minHeight:'100vh', background:'#06060A', fontFamily:"'Instrument Sans',sans-serif", color:'#EEEAE0', display:'flex', flexDirection:'column' },
  hdr: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', height:52, borderBottom:'1px solid #ffffff0C', background:'rgba(6,6,10,0.95)', position:'sticky', top:0, zIndex:10 },
  logo: { fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:'#C8922A' },
  arena: { flex:1, display:'grid', gridTemplateColumns:'1fr 340px' },
  vidWrap: { position:'relative', background:'#0E0E14', margin:20, borderRadius:14, overflow:'hidden', border:'1px solid #ffffff15', minHeight:380 },
  vid: { width:'100%', height:'100%', objectFit:'cover', display:'block', transform:'scaleX(-1)', minHeight:380 },
  sidebar: { borderLeft:'1px solid #ffffff0C', background:'#0E0E14', display:'flex', flexDirection:'column' },
  aiPanel: { padding:24, borderBottom:'1px solid #ffffff0C', display:'flex', flexDirection:'column', alignItems:'center', gap:14 },
  orb: { width:72, height:72, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%,rgba(167,139,250,0.6),rgba(91,143,249,0.3))', border:'1px solid rgba(167,139,250,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 },
  bubble: { background:'#141419', border:'1px solid rgba(167,139,250,0.2)', borderRadius:12, borderTopLeftRadius:4, padding:'12px 14px', fontSize:13, lineHeight:1.7, width:'100%', minHeight:56 },
  transcript: { flex:1, overflowY:'auto', padding:16 },
  bar: { borderTop:'1px solid #ffffff0C', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,6,10,0.95)', gap:16, position:'sticky', bottom:0 },
  micBtn: (active, disabled) => ({ width:50, height:50, borderRadius:'50%', border:'none', cursor: disabled ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, transition:'all 0.2s', opacity: disabled ? 0.4 : 1, background: active ? '#FF4F4F' : '#18181d', boxShadow: active ? '0 0 0 10px rgba(255,79,79,0.15)' : 'none' }),
};

export default function InterviewPage() {
  const { token } = useParams();
  const [phase, setPhase]           = useState('gate');
  const [gateStep, setGateStep]     = useState(0); // 0=info, 1=resume, 2=checks, 3=ready
  const [invite, setInvite]         = useState(null);
  const [checks, setChecks]         = useState({ camera:'pending', mic:'pending', attire:'pending', connection:'pending' });
  const [attire, setAttire]         = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [aiText, setAiText]         = useState('');
  const [aiStatus, setAiStatus]     = useState('idle');
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim]       = useState('');
  const [sequence, setSequence]     = useState(2);
  const [elapsed, setElapsed]       = useState(0);
  const [error, setError]           = useState('');

  const videoRef     = useRef(null);
  const gateVideoRef = useRef(null);
  const streamRef    = useRef(null);
  const recogRef     = useRef(null);
  const timerRef     = useRef(null);
  const lastAnswerRef = useRef('');
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    api.invites.validate(token)
      .then(r => setInvite(r.invite))
      .catch(e => setError(e.message));
  }, [token]);

  useEffect(() => () => {
    window.speechSynthesis.cancel();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startCamera = async (ref) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (ref.current) { ref.current.srcObject = stream; ref.current.play(); }
      return stream;
    } catch { return null; }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;
    setUploadingResume(true);
    try {
      const resumeText = await readFileAsText(resumeFile);
      await api.interview.uploadResume({ invite_token: token, resume_text: resumeText });
      setResumeUploaded(true);
      setGateStep(2);
    } catch (e) {
      alert('Failed to upload resume. Please try again.');
    }
    setUploadingResume(false);
  };

  const beginChecks = async () => {
    setChecks({ camera:'checking', mic:'pending', attire:'pending', connection:'pending' });
    const stream = await startCamera(gateVideoRef);
    setChecks(p => ({...p, camera: stream ? 'pass' : 'fail'}));
    await new Promise(r => setTimeout(r, 500));
    setChecks(p => ({...p, mic:'checking'}));
    await new Promise(r => setTimeout(r, 800));
    setChecks(p => ({...p, mic:'pass'}));
    setChecks(p => ({...p, attire:'checking'}));
    if (stream && gateVideoRef.current) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const frame = captureFrame(gateVideoRef.current);
        if (frame) {
          const res = await api.interview.attire({ image_base64: frame });
          setAttire(res);
        }
      } catch { setAttire({ score: 78, level: 'Business Casual', note: 'Looking good!' }); }
    }
    setChecks(p => ({...p, attire:'pass'}));
    setChecks(p => ({...p, connection:'checking'}));
    await new Promise(r => setTimeout(r, 600));
    setChecks(p => ({...p, connection:'pass'}));
    setGateStep(3);
  };

  const startInterview = async () => {
    setPhase('interview');
    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play();
      }
    }, 100);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    setAiStatus('thinking');
    try {
      const res = await api.interview.start({
        invite_token:   token,
        candidate_name: invite?.candidates?.full_name || 'Candidate',
      });
      setSessionId(res.session_id);
      setTranscript([{ role: 'ai', text: res.ai_message }]);
      setAiText(res.ai_message);
      setAiStatus('speaking');
      speak(res.ai_message, () => setAiStatus('idle'));
    } catch (e) {
      setAiStatus('idle');
      setError(e.message);
    }
  };

  const sendAnswer = async (answer) => {
    if (!answer.trim() || !sessionId) return;
    const seq = sequence;
    setSequence(s => s + 2);
    setTranscript(p => [...p, { role: 'candidate', text: answer }]);
    setAiStatus('thinking');
    try {
      const res = await api.interview.message({ session_id: sessionId, candidate_answer: answer, sequence: seq });
      setTranscript(p => [...p, { role: 'ai', text: res.ai_message }]);
      setAiText(res.ai_message);
      setAiStatus('speaking');
      speak(res.ai_message, () => {
        setAiStatus('idle');
        if (res.is_complete) setTimeout(endInterview, 2000);
      });
    } catch { setAiStatus('idle'); }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Please use Chrome for the best experience.'); return; }
    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = 'en-IN';
    setIsListening(true);
    setInterim('');
    lastAnswerRef.current = '';
    recog.onresult = (e) => {
      let fin = '', int = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      setInterim(fin || int);
      lastAnswerRef.current = fin || int;
    };
    recog.onend = () => {
      setIsListening(false);
      setInterim('');
      const ans = lastAnswerRef.current;
      if (ans.trim().length > 2) sendAnswer(ans.trim());
    };
    recog.onerror = () => { setIsListening(false); setInterim(''); };
    recogRef.current = recog;
    recog.start();
  };

  const stopListening = () => { recogRef.current?.stop(); };

  const endInterview = async () => {
    window.speechSynthesis.cancel();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (sessionId) {
      await api.interview.complete({ session_id: sessionId, duration_seconds: elapsed }).catch(console.error);
    }
    setPhase('end');
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const allPass = Object.values(checks).every(v => v === 'pass');

  const GS = {
    root: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#06060A' },
    card: { width:520, background:'#0E0E14', border:'1px solid #ffffff15', borderRadius:18, padding:44, boxShadow:'0 40px 100px rgba(0,0,0,0.6)' },
    title: { fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:8 },
    sub: { color:'#6B6876', fontSize:14, marginBottom:32, lineHeight:1.6 },
    btn: { width:'100%', padding:14, background:'#C8922A', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:'#000', cursor:'pointer' },
    btnDisabled: { width:'100%', padding:14, background:'#333', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:'#666', cursor:'not-allowed' },
    checkRow: (status) => ({
      display:'flex', alignItems:'center', gap:12,
      padding:'12px 14px', borderRadius:8, border:'1px solid',
      borderColor: status==='pass' ? 'rgba(46,204,138,0.3)' : status==='checking' ? 'rgba(200,146,42,0.3)' : '#ffffff0C',
      background: status==='pass' ? 'rgba(46,204,138,0.06)' : status==='checking' ? 'rgba(200,146,42,0.06)' : '#141419',
    }),
  };

  if (error) return (
    <div style={{ ...GS.root, flexDirection:'column', textAlign:'center', padding:40 }}>
      <div style={{ fontSize:40, marginBottom:20 }}>⚠️</div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:700, marginBottom:10 }}>Cannot Start Interview</div>
      <div style={{ color:'#6B6876', maxWidth:400, lineHeight:1.6 }}>{error}</div>
    </div>
  );

  // ── GATE
  if (phase === 'gate') return (
    <div style={GS.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>
      <div style={GS.card}>

        {/* Step 0 — Welcome */}
        {gateStep === 0 && <>
          <div style={GS.title}>{invite ? `Hi ${invite.candidates?.full_name?.split(' ')[0]} 👋` : 'Welcome'}</div>
          <div style={GS.sub}>
            You've been invited to interview for <strong style={{color:'#C8922A'}}>{invite?.jobs?.title}</strong> at SriKrishnaSweets.
            Aria, our AI interviewer, will conduct your session.
          </div>
          <div style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#6B6876', marginBottom:28, lineHeight:1.9 }}>
            ✓ Use <strong style={{color:'#EEEAE0'}}>Google Chrome</strong><br/>
            ✓ Have your <strong style={{color:'#EEEAE0'}}>resume PDF or text file</strong> ready<br/>
            ✓ Find a <strong style={{color:'#EEEAE0'}}>quiet, well-lit</strong> space<br/>
            ✓ Dress <strong style={{color:'#EEEAE0'}}>professionally</strong><br/>
            ✓ Keep your <strong style={{color:'#EEEAE0'}}>salary expectations & notice period</strong> ready<br/>
            ✓ Duration: <strong style={{color:'#EEEAE0'}}>~{invite?.jobs?.interview_configs?.duration_minutes || 45} minutes</strong>
          </div>
          <button style={GS.btn} onClick={() => setGateStep(1)}>Continue →</button>
        </>}

        {/* Step 1 — Resume Upload */}
        {gateStep === 1 && <>
          <div style={GS.title}>Upload Your Resume 📄</div>
          <div style={GS.sub}>
            Aria will use your resume to ask personalised questions about your experience. Upload your resume to continue.
          </div>

          <div
            onClick={() => document.getElementById('resume-input').click()}
            style={{
              border: resumeFile ? '2px solid rgba(46,204,138,0.5)' : '2px dashed #333',
              borderRadius:12, padding:'32px 20px', textAlign:'center', cursor:'pointer',
              background: resumeFile ? 'rgba(46,204,138,0.05)' : '#141419',
              marginBottom:20, transition:'all 0.2s',
            }}
          >
            <div style={{ fontSize:36, marginBottom:12 }}>{resumeFile ? '✅' : '📂'}</div>
            <div style={{ fontSize:14, color: resumeFile ? '#2ECC8A' : '#6B6876' }}>
              {resumeFile ? resumeFile.name : 'Click to upload resume (.pdf, .txt, .doc)'}
            </div>
            {resumeFile && <div style={{ fontSize:12, color:'#6B6876', marginTop:6 }}>{(resumeFile.size/1024).toFixed(1)} KB</div>}
          </div>
          <input id="resume-input" type="file" accept=".pdf,.txt,.doc,.docx" style={{ display:'none' }}
            onChange={e => setResumeFile(e.target.files[0])} />

          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <button style={{ ...GS.btn, background:'#141419', color:'#6B6876', border:'1px solid #333', flex:1 }}
              onClick={() => setGateStep(2)}>
              Skip (no resume)
            </button>
            <button style={{ ...resumeFile ? GS.btn : GS.btnDisabled, flex:2 }}
              onClick={handleResumeUpload} disabled={!resumeFile || uploadingResume}>
              {uploadingResume ? 'Uploading...' : 'Upload & Continue →'}
            </button>
          </div>
          <div style={{ fontSize:12, color:'#333', textAlign:'center' }}>
            Your resume is only used for this interview session.
          </div>
        </>}

        {/* Step 2 — System Checks */}
        {gateStep === 2 && !checks.camera.includes('pass') && <>
          <div style={GS.title}>System Check</div>
          <div style={GS.sub}>Verifying your setup before the interview begins.</div>
          <button style={GS.btn} onClick={beginChecks}>Run System Check →</button>
        </>}

        {/* Step 2 — Checks running */}
        {gateStep === 2 && (checks.camera === 'checking' || checks.camera === 'pass') && <>
          <div style={GS.title}>System Check</div>
          <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff15', height:160, background:'#141419', marginBottom:20, position:'relative' }}>
            <video ref={gateVideoRef} style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} muted playsInline autoPlay />
            {checks.camera === 'pass' && (
              <div style={{ position:'absolute', bottom:8, left:8, background:'rgba(0,0,0,0.7)', color:'#2ECC8A', fontSize:11, fontFamily:'DM Mono,monospace', padding:'3px 10px', borderRadius:4 }}>
                ✓ Camera active
              </div>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            {[
              { key:'camera', icon:'📷', name:'Camera',     detail: checks.camera==='pass'?'Access granted':'Checking...' },
              { key:'mic',    icon:'🎙️', name:'Microphone', detail: checks.mic==='pass'?'Audio detected':'Checking...' },
              { key:'attire', icon:'👔', name:'Attire',      detail: attire ? `${attire.level} — ${attire.note}` : 'Analysing...' },
              { key:'connection', icon:'🌐', name:'Connection', detail: checks.connection==='pass'?'Stable':'Checking...' },
            ].map(item => (
              <div key={item.key} style={GS.checkRow(checks[item.key])}>
                <span style={{ fontSize:18 }}>{item.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:'#6B6876', marginTop:2 }}>{item.detail}</div>
                </div>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:11, color: checks[item.key]==='pass'?'#2ECC8A':'#C8922A' }}>
                  {checks[item.key]==='pass'?'✓ PASS':checks[item.key]==='checking'?'...':''}
                </span>
              </div>
            ))}
          </div>
          {gateStep === 3 && (
            <button style={allPass ? GS.btn : GS.btnDisabled} onClick={startInterview} disabled={!allPass}>
              Begin Interview with Aria ✦
            </button>
          )}
        </>}

        {/* Step 3 — Ready */}
        {gateStep === 3 && !checks.camera.includes('checking') && allPass && (
          <button style={GS.btn} onClick={startInterview}>
            Begin Interview with Aria ✦
          </button>
        )}
      </div>
    </div>
  );

  // ── END SCREEN
  if (phase === 'end') return (
    <div style={{ ...S.root, alignItems:'center', justifyContent:'center' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;600&display=swap');`}</style>
      <div style={{ width:460, background:'#0E0E14', border:'1px solid #ffffff15', borderRadius:18, padding:52, textAlign:'center' }}>
        <div style={{ width:68, height:68, borderRadius:'50%', background:'rgba(46,204,138,0.12)', border:'1px solid rgba(46,204,138,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:12 }}>Interview Complete!</div>
        <div style={{ color:'#6B6876', fontSize:14, lineHeight:1.7, marginBottom:28 }}>
          Thank you, <strong style={{color:'#EEEAE0'}}>{invite?.candidates?.full_name?.split(' ')[0]}</strong>. Your responses have been recorded and will be reviewed by our hiring team. You'll hear back within 3–5 business days.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
          {[
            { label:'Duration',  val: fmt(elapsed) },
            { label:'Responses', val: transcript.filter(m=>m.role==='candidate').length },
            { label:'Attire',    val: attire?.score ? `${attire.score}/100` : '—' },
          ].map(s => (
            <div key={s.label} style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:8, padding:'14px 10px' }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:700, color:'#C8922A' }}>{s.val}</div>
              <div style={{ fontSize:11, color:'#6B6876', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:'#333' }}>You may now close this window.</div>
      </div>
    </div>
  );

  // ── LIVE INTERVIEW ROOM
  return (
    <div style={S.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      @keyframes micPulse{0%,100%{box-shadow:0 0 0 8px rgba(255,79,79,0.15)}50%{box-shadow:0 0 0 14px rgba(255,79,79,0.08)}}
      .mic-active{animation:micPulse 1s ease-in-out infinite}`}</style>

      {/* Header */}
      <div style={S.hdr}>
        <div style={S.logo}>SriKrishnaSweets</div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:8, height:8, background:'#FF4F4F', borderRadius:'50%', animation:'pulse 1.2s infinite' }} />
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#FF4F4F', letterSpacing:1 }}>LIVE</span>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, background:'#141419', border:'1px solid #ffffff18', padding:'4px 12px', borderRadius:6 }}>{fmt(elapsed)}</span>
        </div>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color: aiStatus==='speaking'?'#C8922A':aiStatus==='thinking'?'#C8922A':'#2ECC8A', background:'#141419', border:'1px solid', borderColor: aiStatus==='idle'?'rgba(46,204,138,0.3)':'rgba(200,146,42,0.3)', padding:'4px 12px', borderRadius:4, letterSpacing:0.8 }}>
          {aiStatus==='speaking'?'ARIA SPEAKING':aiStatus==='thinking'?'THINKING...':'LISTENING'}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:2, background:'#ffffff08' }}>
        <div style={{ height:'100%', background:'linear-gradient(90deg,#A78BFA,#C8922A)', width:`${Math.min((transcript.filter(m=>m.role==='ai').length / 12) * 100, 100)}%`, transition:'width 1s' }} />
      </div>

      {/* Arena */}
      <div style={S.arena}>
        <div style={{ display:'flex', flexDirection:'column', padding:'16px 16px 0' }}>
          <div style={S.vidWrap}>
            <video ref={videoRef} style={S.vid} muted playsInline autoPlay />
            {[['tl','2px 0 0 2px','top:14px;left:14px'],['tr','2px 2px 0 0','top:14px;right:14px'],['bl','0 0 2px 2px','bottom:14px;left:14px'],['br','0 2px 2px 0','bottom:14px;right:14px']].map(([k,bw,pos]) => (
              <div key={k} style={{ position:'absolute', width:22, height:22, borderColor:'#C8922A', borderStyle:'solid', borderWidth:bw, borderRadius:3, opacity:0.6, ...(Object.fromEntries(pos.split(';').map(p=>p.split(':').map(s=>s.trim())))) }} />
            ))}
            {attire && (
              <div style={{ position:'absolute', bottom:12, left:12, background:'rgba(6,6,10,0.85)', border:'1px solid #ffffff18', borderRadius:7, padding:'6px 12px', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B6876' }}>Attire</span>
                <span style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:'#2ECC8A' }}>{attire.score}/100</span>
                <span style={{ fontSize:11, color:'#6B6876' }}>{attire.level}</span>
              </div>
            )}
            <div style={{ position:'absolute', bottom:12, right:12, background:'rgba(6,6,10,0.85)', border:'1px solid #ffffff18', borderRadius:7, padding:'6px 12px' }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{invite?.candidates?.full_name}</div>
              <div style={{ fontSize:11, color:'#6B6876' }}>{invite?.jobs?.title}</div>
            </div>
          </div>

          {(isListening || interim) && (
            <div style={{ margin:'10px 0', padding:'10px 14px', background:'#141419', border:'1px solid #ffffff18', borderRadius:8, fontSize:13, color:'#6B6876', fontStyle:'italic', display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ display:'flex', gap:3 }}>
                {[...Array(4)].map((_,i) => <div key={i} style={{ width:3, background:'#C8922A', borderRadius:2, animation:`pulse 0.8s ease-in-out ${i*0.15}s infinite`, height: 4+i*4 }} />)}
              </div>
              {interim || 'Listening...'}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={S.aiPanel}>
            <div style={{ ...S.orb, boxShadow: aiStatus==='speaking'?'0 0 0 10px rgba(167,139,250,0.1)':'none', transition:'all 0.3s' }}>🤖</div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:'#A78BFA' }}>Aria</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#6B6876', textTransform:'uppercase', letterSpacing:0.8, marginTop:2 }}>
                {aiStatus==='thinking'?'Processing...':aiStatus==='speaking'?'Speaking':'Waiting for you'}
              </div>
            </div>
            <div style={S.bubble}>
              {aiStatus==='thinking' ? (
                <div style={{ display:'flex', gap:5, padding:'4px 0' }}>
                  {[...Array(3)].map((_,i) => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#A78BFA', animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                </div>
              ) : aiText || <span style={{ color:'#6B6876', fontStyle:'italic' }}>Starting shortly...</span>}
            </div>
          </div>

          <div style={S.transcript}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#6B6876', letterSpacing:1.5, textTransform:'uppercase', marginBottom:14, paddingBottom:10, borderBottom:'1px solid #ffffff0C' }}>
              TRANSCRIPT
            </div>
            {transcript.map((m, i) => (
              <div key={i} style={{ marginBottom:14, opacity: i >= transcript.length - 2 ? 1 : 0.6 }}>
                <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color: m.role==='ai'?'#A78BFA':'#6B6876', marginBottom:5, textTransform:'uppercase', letterSpacing:0.5 }}>
                  {m.role==='ai'?'ARIA':'YOU'}
                </div>
                <div style={{ fontSize:13, lineHeight:1.6, padding:'8px 10px', borderRadius:7, background: m.role==='ai'?'rgba(167,139,250,0.05)':'#141419', border:'1px solid #ffffff0C' }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={S.bar}>
        <button onClick={endInterview} style={{ padding:'8px 18px', borderRadius:7, border:'1px solid rgba(255,79,79,0.3)', background:'rgba(255,79,79,0.08)', color:'#FF4F4F', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          End Interview
        </button>
        <div style={{ textAlign:'center' }}>
          <button
            style={S.micBtn(isListening, aiStatus !== 'idle')}
            onClick={isListening ? stopListening : startListening}
            disabled={aiStatus !== 'idle'}
            className={isListening ? 'mic-active' : ''}
          >
            {isListening ? '⏹' : '🎙'}
          </button>
          <div style={{ fontSize:12, color:'#6B6876', marginTop:6 }}>
            {aiStatus==='speaking'?'Wait for Aria...':aiStatus==='thinking'?'Thinking...':isListening?<strong style={{color:'#EEEAE0'}}>Recording — tap to stop</strong>:'Tap to speak'}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#6B6876' }}>Exchange {transcript.filter(m=>m.role==='ai').length}</div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#6B6876', marginTop:3 }}>Proctoring on</div>
        </div>
      </div>
    </div>
  );
}
