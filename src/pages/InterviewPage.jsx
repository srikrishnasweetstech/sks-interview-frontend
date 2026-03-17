import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

// ── Voice: wait for voices to load before speaking
function speak(text, onEnd) {
  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92; utt.pitch = 1.05; utt.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = [
      'Google UK English Female',
      'Samantha',
      'Karen',
      'Moira',
      'Tessa',
    ];
    const v = preferred.reduce((found, name) =>
      found || voices.find(v => v.name.includes(name)), null
    ) || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    if (v) utt.voice = v;
    utt.onend  = onEnd;
    utt.onerror = () => { if (onEnd) onEnd(); };
    window.speechSynthesis.speak(utt);
  };

  // Voices may not be ready yet
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
    // Fallback if onvoiceschanged never fires
    setTimeout(doSpeak, 500);
  }
}

function captureFrame(videoEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 240;
    c.getContext('2d').drawImage(videoEl, 0, 0, 320, 240);
    return c.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch { return null; }
}

async function readFileAsText(file) {
  return new Promise((resolve) => {
    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsText(file);
    } else {
      resolve(`[Resume: ${file.name}]`);
    }
  });
}

// ── Detect mobile
const isMobile = () => window.innerWidth <= 768;

// ── Check browser support
function getBrowserSupport() {
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasTTS    = !!window.speechSynthesis;
  const isChrome  = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
  return { hasCamera, hasSpeech, hasTTS, isChrome };
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`;

export default function InterviewPage() {
  const { token } = useParams();

  const [gateStep, setGateStep]         = useState('email');
  const [invite, setInvite]             = useState(null);
  const [emailInput, setEmailInput]     = useState('');
  const [emailError, setEmailError]     = useState('');
  const [verifying, setVerifying]       = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [resumeFile, setResumeFile]     = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [checks, setChecks]             = useState({ camera:'pending', mic:'pending', attire:'pending', connection:'pending' });
  const [attire, setAttire]             = useState(null);

  const [phase, setPhase]               = useState('gate');
  const [sessionId, setSessionId]       = useState(null);
  const [transcript, setTranscript]     = useState([]);
  const [aiText, setAiText]             = useState('');
  const [aiStatus, setAiStatus]         = useState('idle');
  const [isListening, setIsListening]   = useState(false);
  const [interim, setInterim]           = useState('');
  const [sequence, setSequence]         = useState(2);
  const [elapsed, setElapsed]           = useState(0);
  const [isRejoin, setIsRejoin]         = useState(false);
  const [punctuality, setPunctuality]   = useState(null);
  const [error, setError]               = useState('');
  const [mobile, setMobile]             = useState(isMobile());
  const [support, setSupport]           = useState(null);

  const videoRef     = useRef(null);
  const gateVideoRef = useRef(null);
  const streamRef    = useRef(null);
  const recogRef     = useRef(null);
  const timerRef     = useRef(null);
  const lastAnswer   = useRef('');
  const transcriptEnd = useRef(null);

  useEffect(() => {
    setSupport(getBrowserSupport());
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setVerifying(true); setEmailError('');
    try {
      const result = await api.invites.verifyEmail(token, emailInput);
      setCandidateName(result.candidate_name);
      setGateStep('info');
    } catch (e) { setEmailError(e.message); }
    setVerifying(false);
  };

  const handleResumeUpload = async () => {
    setResumeUploading(true);
    try {
      const text = resumeFile ? await readFileAsText(resumeFile) : null;
      await api.interview.uploadResume({ invite_token: token, resume_text: text });
    } catch {}
    setResumeUploading(false);
    setGateStep('checks');
    beginChecks();
  };

  const startCamera = async (ref) => {
    try {
      const constraints = mobile
        ? { video: { facingMode: 'user', width: 640, height: 480 }, audio: true }
        : { video: true, audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (ref?.current) { ref.current.srcObject = stream; ref.current.play().catch(()=>{}); }
      return stream;
    } catch (e) {
      console.error('Camera error:', e.message);
      return null;
    }
  };

  const beginChecks = async () => {
    setChecks({ camera:'checking', mic:'pending', attire:'pending', connection:'pending' });
    const stream = await startCamera(gateVideoRef);
    setChecks(p => ({...p, camera: stream?'pass':'fail'}));
    await new Promise(r => setTimeout(r, 400));
    setChecks(p => ({...p, mic:'checking'}));
    await new Promise(r => setTimeout(r, 700));
    setChecks(p => ({...p, mic: stream?'pass':'fail'}));
    setChecks(p => ({...p, attire:'checking'}));
    if (stream && gateVideoRef.current) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        const frame = captureFrame(gateVideoRef.current);
        if (frame) setAttire(await api.interview.attire({ image_base64: frame }));
        else setAttire({ score:75, level:'Business Casual', note:'Looking professional!' });
      } catch { setAttire({ score:75, level:'Business Casual', note:'Looking professional!' }); }
    }
    setChecks(p => ({...p, attire:'pass', connection:'pass'}));
    setGateStep('ready');
  };

  const startInterview = async () => {
    setPhase('interview');
    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(()=>{});
      }
    }, 200);
    timerRef.current = setInterval(() => setElapsed(e => e+1), 1000);
    setAiStatus('thinking');
    try {
      const res = await api.interview.start({ invite_token: token, candidate_name: candidateName });
      setSessionId(res.session_id);
      setIsRejoin(!!res.is_rejoin);
      if (res.punctuality_score != null) setPunctuality(res.punctuality_score);
      if (res.is_rejoin) setSequence(res.sequence || 2);
      setTranscript([{ role:'ai', text: res.ai_message }]);
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
    setSequence(s => s+2);
    setTranscript(p => [...p, { role:'candidate', text:answer }]);
    setAiStatus('thinking');
    try {
      const res = await api.interview.message({ session_id:sessionId, candidate_answer:answer, sequence:seq });
      setTranscript(p => [...p, { role:'ai', text:res.ai_message }]);
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
    if (!SR) { alert('Voice input requires Google Chrome. Please open this link in Chrome.'); return; }
    const recog = new SR();
    recog.continuous = false; recog.interimResults = true; recog.lang = 'en-IN';
    setIsListening(true); setInterim(''); lastAnswer.current = '';
    recog.onresult = e => {
      let fin='', int='';
      for (let i=e.resultIndex; i<e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      setInterim(fin||int); lastAnswer.current = fin||int;
    };
    recog.onend = () => {
      setIsListening(false); setInterim('');
      if (lastAnswer.current.trim().length > 2) sendAnswer(lastAnswer.current.trim());
    };
    recog.onerror = e => { console.error('Speech error:', e.error); setIsListening(false); setInterim(''); };
    recogRef.current = recog;
    recog.start();
  };

  const stopListening = () => recogRef.current?.stop();

  const endInterview = async () => {
    window.speechSynthesis.cancel();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (sessionId) await api.interview.complete({ session_id:sessionId, duration_seconds:elapsed }).catch(console.error);
    setPhase('end');
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const allPass = checks.camera==='pass' && checks.mic==='pass' && checks.attire==='pass' && checks.connection==='pass';

  // ── STYLES — responsive
  const dark = '#06060A';
  const card = '#0E0E14';
  const gold = '#C8922A';
  const purple = '#A78BFA';
  const green = '#2ECC8A';

  const gateCard = {
    width: mobile ? '92vw' : 520,
    maxWidth: 520,
    background: card,
    border: '1px solid #ffffff15',
    borderRadius: 18,
    padding: mobile ? 28 : 44,
    boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
  };

  // ERROR
  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:dark, flexDirection:'column', textAlign:'center', padding:28, color:'#EEEAE0' }}>
      <style>{FONTS}</style>
      <div style={{ fontSize:44, marginBottom:20 }}>⚠️</div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?18:22, fontWeight:700, marginBottom:12 }}>Cannot Enter Interview</div>
      <div style={{ color:'#6B6876', maxWidth:380, lineHeight:1.7, fontSize:14 }}>{error}</div>
      <div style={{ marginTop:24, fontSize:12, color:'#444', maxWidth:300 }}>
        If you believe this is an error, please contact the recruiter.
      </div>
    </div>
  );

  // GATE
  if (phase === 'gate') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:dark, padding:16 }}>
      <style>{FONTS}</style>
      <div style={gateCard}>

        {/* Email verification */}
        {gateStep === 'email' && <>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:gold }}>SriKrishnaSweets</div>
            <div style={{ fontSize:11, color:'#333', letterSpacing:1, marginTop:4 }}>AI INTERVIEW PLATFORM</div>
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:24, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>Verify Your Identity</div>
          <div style={{ color:'#6B6876', fontSize:14, marginBottom:24, lineHeight:1.6 }}>
            Enter the email address where you received this interview invite.
          </div>
          {emailError && (
            <div style={{ background:'rgba(220,38,38,0.12)', border:'1px solid rgba(220,38,38,0.3)', borderRadius:8, padding:'12px 14px', fontSize:13, color:'#FCA5A5', marginBottom:20, lineHeight:1.5 }}>
              {emailError}
            </div>
          )}
          <form onSubmit={handleVerifyEmail} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ display:'block', fontSize:11, color:'#6B6876', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Your Email</label>
              <input
                style={{ width:'100%', padding:'13px 14px', background:'#1A1A22', border:'1px solid #333', borderRadius:8, fontSize:15, color:'#EEEAE0', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                type="email" placeholder="yourname@email.com" required autoComplete="email"
                value={emailInput} onChange={e => setEmailInput(e.target.value)}
              />
            </div>
            <button type="submit" disabled={verifying}
              style={{ padding:14, background:verifying?'#222':gold, border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:verifying?'#555':'#000', cursor:verifying?'not-allowed':'pointer' }}>
              {verifying ? 'Verifying...' : 'Continue →'}
            </button>
          </form>
          {support && !support.isChrome && (
            <div style={{ marginTop:20, background:'rgba(200,146,42,0.1)', border:'1px solid rgba(200,146,42,0.3)', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#C8922A', lineHeight:1.6 }}>
              ⚠️ For best experience, please open this link in <strong>Google Chrome</strong>.
            </div>
          )}
        </>}

        {/* Info */}
        {gateStep === 'info' && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:24, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>
            Hi {candidateName?.split(' ')[0]} 👋
          </div>
          <div style={{ color:'#6B6876', fontSize:14, marginBottom:24, lineHeight:1.6 }}>
            You're interviewing for <strong style={{ color:gold }}>{invite?.jobs?.title}</strong> at SriKrishnaSweets.
          </div>
          <div style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#6B6876', marginBottom:24, lineHeight:2 }}>
            ✓ Use <strong style={{ color:'#EEEAE0' }}>Google Chrome</strong><br/>
            ✓ Find a <strong style={{ color:'#EEEAE0' }}>quiet, well-lit</strong> space<br/>
            ✓ Dress <strong style={{ color:'#EEEAE0' }}>professionally</strong><br/>
            ✓ Have <strong style={{ color:'#EEEAE0' }}>salary & notice period</strong> ready<br/>
            ✓ Duration: ~<strong style={{ color:'#EEEAE0' }}>{invite?.jobs?.interview_configs?.duration_minutes || 45} minutes</strong>
          </div>
          <button style={{ width:'100%', padding:14, background:gold, border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:'#000', cursor:'pointer' }}
            onClick={() => setGateStep('resume')}>Continue →</button>
        </>}

        {/* Resume */}
        {gateStep === 'resume' && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:22, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>Upload Resume 📄</div>
          <div style={{ color:'#6B6876', fontSize:13, marginBottom:20, lineHeight:1.6 }}>
            Aria will ask personalised questions based on your resume.
          </div>
          <div onClick={() => document.getElementById('resume-file').click()}
            style={{ border:resumeFile?'2px solid rgba(46,204,138,0.5)':'2px dashed #333', borderRadius:12, padding:'28px 16px', textAlign:'center', cursor:'pointer', background:resumeFile?'rgba(46,204,138,0.05)':'#141419', marginBottom:16 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>{resumeFile?'✅':'📂'}</div>
            <div style={{ fontSize:13, color:resumeFile?green:'#6B6876' }}>
              {resumeFile ? resumeFile.name : 'Tap to upload (.pdf, .txt, .doc)'}
            </div>
          </div>
          <input id="resume-file" type="file" accept=".pdf,.txt,.doc,.docx" style={{ display:'none' }}
            onChange={e => setResumeFile(e.target.files[0])} />
          <div style={{ display:'flex', gap:10 }}>
            <button style={{ flex:1, padding:12, background:'#141419', border:'1px solid #333', borderRadius:10, color:'#6B6876', fontSize:14, cursor:'pointer' }}
              onClick={() => { setGateStep('checks'); beginChecks(); }}>Skip</button>
            <button style={{ flex:2, padding:12, background:resumeFile&&!resumeUploading?gold:'#222', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:resumeFile&&!resumeUploading?'#000':'#555', cursor:resumeFile&&!resumeUploading?'pointer':'not-allowed' }}
              onClick={handleResumeUpload} disabled={!resumeFile||resumeUploading}>
              {resumeUploading?'Uploading...':'Upload & Continue →'}
            </button>
          </div>
        </>}

        {/* System checks */}
        {(gateStep === 'checks' || gateStep === 'ready') && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?18:22, fontWeight:800, color:'#EEEAE0', marginBottom:16 }}>System Check</div>
          <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff15', height:mobile?140:160, background:'#141419', marginBottom:16, position:'relative' }}>
            <video ref={gateVideoRef} style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} muted playsInline autoPlay />
            {checks.camera==='pass' && <div style={{ position:'absolute', bottom:8, left:8, background:'rgba(0,0,0,0.75)', color:green, fontSize:11, padding:'3px 10px', borderRadius:4 }}>✓ Camera active</div>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {[
              { key:'camera',     icon:'📷', name:'Camera',     detail:checks.camera==='pass'?'Granted':'Checking...' },
              { key:'mic',        icon:'🎙️', name:'Microphone', detail:checks.mic==='pass'?'Active':'Checking...' },
              { key:'attire',     icon:'👔', name:'Attire',      detail:attire?`${attire.level} · ${attire.score}/100`:'Analysing...' },
              { key:'connection', icon:'🌐', name:'Connection',  detail:checks.connection==='pass'?'Stable':'Checking...' },
            ].map(item => (
              <div key={item.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:8, border:'1px solid', borderColor:checks[item.key]==='pass'?'rgba(46,204,138,0.3)':checks[item.key]==='checking'?'rgba(200,146,42,0.3)':'#ffffff0C', background:checks[item.key]==='pass'?'rgba(46,204,138,0.05)':checks[item.key]==='checking'?'rgba(200,146,42,0.05)':'#141419' }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'#EEEAE0' }}>{item.name}</div>
                  <div style={{ fontSize:11, color:'#6B6876' }}>{item.detail}</div>
                </div>
                <span style={{ fontSize:11, color:checks[item.key]==='pass'?green:'#C8922A', fontFamily:'monospace' }}>
                  {checks[item.key]==='pass'?'✓':checks[item.key]==='checking'?'...':''}
                </span>
              </div>
            ))}
          </div>
          {gateStep === 'ready' && (
            <button style={{ width:'100%', padding:14, background:allPass?gold:'#222', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:allPass?'#000':'#555', cursor:allPass?'pointer':'not-allowed' }}
              onClick={startInterview} disabled={!allPass}>
              Begin Interview with Aria ✦
            </button>
          )}
        </>}
      </div>
    </div>
  );

  // END SCREEN
  if (phase === 'end') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:dark, padding:16 }}>
      <style>{FONTS}</style>
      <div style={{ ...gateCard, textAlign:'center', padding:mobile?28:48 }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(46,204,138,0.12)', border:'1px solid rgba(46,204,138,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:24, fontWeight:800, marginBottom:12, color:'#EEEAE0' }}>Interview Complete!</div>
        <div style={{ color:'#6B6876', fontSize:14, lineHeight:1.7, marginBottom:24 }}>
          Thank you, <strong style={{ color:'#EEEAE0' }}>{candidateName?.split(' ')[0]}</strong>. Your responses have been recorded. The hiring team will be in touch within 3–5 business days.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'Duration',  val:fmt(elapsed) },
            { label:'Responses', val:transcript.filter(m=>m.role==='candidate').length },
            { label:'Attire',    val:attire?.score?`${attire.score}/100`:'—' },
          ].map(s => (
            <div key={s.label} style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:8, padding:'12px 8px' }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:gold }}>{s.val}</div>
              <div style={{ fontSize:11, color:'#6B6876', marginTop:3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:'#333' }}>You may now close this window.</div>
      </div>
    </div>
  );

  // ── LIVE INTERVIEW — responsive layout
  const isDesktop = !mobile;

  return (
    <div style={{ minHeight:'100vh', background:dark, fontFamily:"'Instrument Sans',sans-serif", color:'#EEEAE0', display:'flex', flexDirection:'column' }}>
      <style>{`${FONTS}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 6px rgba(255,79,79,0.15)}50%{box-shadow:0 0 0 12px rgba(255,79,79,0.06)}}
        .mic-btn-active{animation:micPulse 1s ease-in-out infinite}
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:mobile?'0 16px':'0 28px', height:mobile?48:52, borderBottom:'1px solid #ffffff0C', background:'rgba(6,6,10,0.97)', flexShrink:0 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?13:16, fontWeight:800, color:gold }}>SriKrishnaSweets</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:7, height:7, background:'#FF4F4F', borderRadius:'50%', animation:'pulse 1.2s infinite' }} />
          <span style={{ fontFamily:'monospace', fontSize:mobile?11:12, color:'#FF4F4F' }}>LIVE</span>
          <span style={{ fontFamily:'monospace', fontSize:mobile?12:13, background:'#141419', border:'1px solid #ffffff18', padding:'3px 10px', borderRadius:6 }}>{fmt(elapsed)}</span>
        </div>
        <div style={{ fontFamily:'monospace', fontSize:10, color:aiStatus==='idle'?green:gold, background:'#141419', border:'1px solid', borderColor:aiStatus==='idle'?'rgba(46,204,138,0.3)':'rgba(200,146,42,0.3)', padding:'3px 10px', borderRadius:4 }}>
          {aiStatus==='speaking'?'ARIA':aiStatus==='thinking'?'...':'READY'}
        </div>
      </div>

      {/* Progress */}
      <div style={{ height:2, background:'#ffffff08', flexShrink:0 }}>
        <div style={{ height:'100%', background:`linear-gradient(90deg,${purple},${gold})`, width:`${Math.min((transcript.filter(m=>m.role==='ai').length/14)*100,100)}%`, transition:'width 1s' }} />
      </div>

      {/* Main content — desktop: side by side, mobile: stacked */}
      <div style={{ flex:1, display:'flex', flexDirection: isDesktop?'row':'column', overflow:'hidden' }}>

        {/* Video panel */}
        <div style={{ flex: isDesktop?1:'none', position:'relative', background:'#0E0E14', margin:mobile?'10px 10px 0':'16px 16px 0', borderRadius:12, overflow:'hidden', border:'1px solid #ffffff15', height:mobile?'35vh':'auto', minHeight:mobile?180:300 }}>
          <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', transform:'scaleX(-1)' }} muted playsInline autoPlay />
          {[['tl','2px 0 0 2px','top:10px;left:10px'],['tr','2px 2px 0 0','top:10px;right:10px'],['bl','0 0 2px 2px','bottom:10px;left:10px'],['br','0 2px 2px 0','bottom:10px;right:10px']].map(([k,bw,pos]) => (
            <div key={k} style={{ position:'absolute', width:18, height:18, borderColor:gold, borderStyle:'solid', borderWidth:bw, borderRadius:2, opacity:0.6, ...(Object.fromEntries(pos.split(';').map(p=>p.split(':').map(s=>s.trim())))) }} />
          ))}
          {attire && (
            <div style={{ position:'absolute', bottom:8, left:8, background:'rgba(0,0,0,0.8)', border:'1px solid #ffffff18', borderRadius:6, padding:'4px 10px', fontSize:11 }}>
              Attire: <strong style={{ color:green }}>{attire.score}/100</strong>
            </div>
          )}
          <div style={{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.8)', border:'1px solid #ffffff18', borderRadius:6, padding:'4px 10px' }}>
            <div style={{ fontSize:11, fontWeight:600 }}>{candidateName}</div>
          </div>
        </div>

        {/* Aria + transcript panel */}
        <div style={{ width:isDesktop?320:'auto', borderLeft:isDesktop?'1px solid #ffffff0C':'none', borderTop:isDesktop?'none':'1px solid #ffffff0C', background:'#0E0E14', display:'flex', flexDirection:'column', overflow:'hidden', flex:mobile?1:'none', margin:mobile?'0 10px 10px':0, borderRadius:mobile?12:0 }}>

          {/* Aria bubble */}
          <div style={{ padding:mobile?'12px 14px':20, borderBottom:'1px solid #ffffff0C', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%,rgba(167,139,250,0.7),rgba(91,143,249,0.3))', border:'1px solid rgba(167,139,250,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🤖</div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, color:purple }}>Aria</div>
                <div style={{ fontSize:10, color:'#6B6876' }}>
                  {aiStatus==='thinking'?'Thinking...':aiStatus==='speaking'?'Speaking':'Listening'}
                </div>
              </div>
            </div>
            <div style={{ background:'#141419', border:'1px solid rgba(167,139,250,0.2)', borderRadius:10, borderTopLeftRadius:3, padding:'10px 12px', fontSize:13, lineHeight:1.7, minHeight:44 }}>
              {aiStatus==='thinking' ? (
                <div style={{ display:'flex', gap:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:purple, animation:`pulse 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              ) : aiText || <span style={{ color:'#6B6876', fontStyle:'italic' }}>Starting...</span>}
            </div>
          </div>

          {/* Transcript */}
          <div style={{ flex:1, overflowY:'auto', padding:mobile?'10px 12px':14 }}>
            <div style={{ fontSize:10, color:'#6B6876', textTransform:'uppercase', letterSpacing:1, marginBottom:10, paddingBottom:8, borderBottom:'1px solid #ffffff0C' }}>TRANSCRIPT</div>
            {transcript.map((m, i) => (
              <div key={i} style={{ marginBottom:10, opacity:i>=transcript.length-2?1:0.55 }}>
                <div style={{ fontSize:10, color:m.role==='ai'?purple:'#6B6876', textTransform:'uppercase', marginBottom:4, letterSpacing:0.5 }}>{m.role==='ai'?'ARIA':'YOU'}</div>
                <div style={{ fontSize:12, lineHeight:1.6, padding:'7px 10px', borderRadius:7, background:m.role==='ai'?'rgba(167,139,250,0.05)':'#141419', border:'1px solid #ffffff08' }}>{m.text}</div>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
        </div>
      </div>

      {/* Interim speech */}
      {(isListening || interim) && (
        <div style={{ margin:'0 10px', padding:'10px 14px', background:'#141419', border:'1px solid #ffffff18', borderRadius:8, fontSize:13, color:'#6B6876', fontStyle:'italic', display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
          <div style={{ display:'flex', gap:3 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width:3, background:gold, borderRadius:2, animation:`pulse 0.8s ${i*0.15}s infinite`, height:4+i*4 }} />)}
          </div>
          {interim || 'Listening...'}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ borderTop:'1px solid #ffffff0C', padding:mobile?'12px 16px':'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,6,10,0.97)', gap:12, flexShrink:0 }}>
        <button onClick={endInterview}
          style={{ padding:mobile?'8px 12px':'8px 18px', borderRadius:7, border:'1px solid rgba(255,79,79,0.3)', background:'rgba(255,79,79,0.08)', color:'#FF4F4F', fontSize:mobile?12:13, cursor:'pointer', whiteSpace:'nowrap' }}>
          {mobile ? 'End' : 'End Interview'}
        </button>

        <div style={{ textAlign:'center', flex:1 }}>
          <button
            style={{ width:mobile?44:50, height:mobile?44:50, borderRadius:'50%', border:'none', cursor:aiStatus!=='idle'?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:mobile?18:20, transition:'all 0.2s', opacity:aiStatus!=='idle'?0.4:1, background:isListening?'#FF4F4F':'#18181d', boxShadow:isListening?'0 0 0 8px rgba(255,79,79,0.15)':'none', margin:'0 auto' }}
            onClick={isListening ? stopListening : startListening}
            disabled={aiStatus !== 'idle'}
            className={isListening ? 'mic-btn-active' : ''}
          >
            {isListening ? '⏹' : '🎙'}
          </button>
          <div style={{ fontSize:11, color:'#6B6876', marginTop:5 }}>
            {aiStatus==='speaking'?'Wait...':aiStatus==='thinking'?'Thinking...':isListening?<strong style={{color:'#EEEAE0'}}>Tap to stop</strong>:'Tap to answer'}
          </div>
        </div>

        <div style={{ textAlign:'right', minWidth:mobile?60:80 }}>
          <div style={{ fontSize:10, color:'#6B6876' }}>Q{transcript.filter(m=>m.role==='ai').length}</div>
          {punctuality != null && (
            <div style={{ fontSize:10, color:punctuality<80?'#FF4F4F':'#6B6876', marginTop:2 }}>P:{punctuality}/100</div>
          )}
        </div>
      </div>
    </div>
  );
}
