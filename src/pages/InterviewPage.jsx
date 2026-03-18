import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

// ─────────────────────────────────────────────────────────────
// TTS helpers — Chrome bug: speechSynthesis stops after ~15s.
// Fix: pause+resume tick every 10s. Safety watchdog if onend
// never fires (Chrome sometimes swallows the event).
// ─────────────────────────────────────────────────────────────
let _ttsTick = null;
function _startTick() {
  if (_ttsTick) return;
  _ttsTick = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}
function _stopTick() { clearInterval(_ttsTick); _ttsTick = null; }

function speak(text, onEnd, muted = false) {
  window.speechSynthesis.cancel();
  if (muted) { setTimeout(() => onEnd && onEnd(), 0); return; }

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92; utt.pitch = 1.05; utt.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = ['Google UK English Female','Samantha','Karen','Moira','Tessa'];
    const v = preferred.reduce((f, n) => f || voices.find(v => v.name.includes(n)), null)
      || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    if (v) utt.voice = v;

    // Watchdog: release if onend never fires (~word count × 650ms + 4s buffer)
    const maxMs = Math.max(text.split(/\s+/).length * 650 + 4000, 8000);
    let wd = setTimeout(() => { _stopTick(); onEnd && onEnd(); }, maxMs);
    utt.onend  = () => { clearTimeout(wd); _stopTick(); onEnd && onEnd(); };
    utt.onerror = () => { clearTimeout(wd); _stopTick(); onEnd && onEnd(); };
    _startTick();
    window.speechSynthesis.speak(utt);
  };

  const v = window.speechSynthesis.getVoices();
  if (v.length > 0) { doSpeak(); }
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null; doSpeak();
    };
    setTimeout(doSpeak, 600);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function captureFrame(videoEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 240;
    c.getContext('2d').drawImage(videoEl, 0, 0, 320, 240);
    return c.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch { return null; }
}

async function readFileAsText(file) {
  return new Promise(resolve => {
    if (file.type === 'text/plain') {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.readAsText(file);
    } else {
      resolve(`[Resume: ${file.name}]`);
    }
  });
}

const isMobile = () => window.innerWidth <= 768;
const getBrowserSupport = () => ({
  hasCamera: !!(navigator.mediaDevices?.getUserMedia),
  hasSpeech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  hasTTS:    !!window.speechSynthesis,
  isChrome:  /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent),
});

const C = {
  dark:'#06060A', card:'#0E0E14', gold:'#C8922A',
  purple:'#A78BFA', green:'#2ECC8A', red:'#FF4F4F', amber:'#F59E0B',
};
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`;

const MIC_ERRORS = {
  'network':       'Network issue — mic cannot reach speech servers. Check your connection and try again.',
  'not-allowed':   'Microphone access denied. Please allow it in your browser settings.',
  'no-speech':     'No speech detected. Please speak louder or move closer to your mic.',
  'aborted':       'Microphone was interrupted. Please try again.',
  'audio-capture': 'No microphone found. Please connect one and try again.',
};

// ═════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════
export default function InterviewPage() {
  const { token } = useParams();

  // Gate state
  const [gateStep,         setGateStep]         = useState('email');
  const [invite,           setInvite]            = useState(null);
  const [emailInput,       setEmailInput]        = useState('');
  const [emailError,       setEmailError]        = useState('');
  const [verifying,        setVerifying]         = useState(false);
  const [candidateName,    setCandidateName]     = useState('');
  const [resumeFile,       setResumeFile]        = useState(null);
  const [resumeUploading,  setResumeUploading]   = useState(false);
  const [checks,           setChecks]            = useState({ camera:'pending', mic:'pending', attire:'pending', connection:'pending' });
  const [attire,           setAttire]            = useState(null);
  const [rejoinDetected,   setRejoinDetected]    = useState(false);

  // Interview state
  const [phase,            setPhase]             = useState('gate');
  const [startingInterview,setStartingInterview] = useState(false);
  const [sessionId,        setSessionId]         = useState(null);
  const [transcript,       setTranscript]        = useState([]);
  const [aiText,           setAiText]            = useState('');
  const [aiStatus,         setAiStatus]          = useState('idle');
  const [isListening,      setIsListening]       = useState(false);
  const [interim,          setInterim]           = useState('');
  const [sequence,         setSequence]          = useState(2);
  const [elapsed,          setElapsed]           = useState(0);
  const [isRejoin,         setIsRejoin]          = useState(false);
  const [punctuality,      setPunctuality]       = useState(null);
  const [error,            setError]             = useState('');
  const [micError,         setMicError]          = useState('');
  const [mobile,           setMobile]            = useState(isMobile());
  const [support,          setSupport]           = useState(null);
  const [ttsMuted,         setTtsMuted]          = useState(false);
  const [showEndConfirm,   setShowEndConfirm]    = useState(false);
  const [endingInterview,  setEndingInterview]   = useState(false);
  const [retryAnswer,      setRetryAnswer]       = useState(null); // last failed answer
  const [networkError,     setNetworkError]      = useState('');

  // Refs
  const videoRef      = useRef(null);
  const gateVideoRef  = useRef(null);
  const streamRef     = useRef(null);
  const recogRef      = useRef(null);
  const timerRef      = useRef(null);
  const lastAnswer    = useRef('');
  const transcriptEnd = useRef(null);
  // Refs that are always in sync with state — prevents stale closures
  const ttsMutedRef   = useRef(false);
  const sequenceRef   = useRef(2);
  const sessionRef    = useRef(null);
  const elapsedRef    = useRef(0);
  const sendingRef    = useRef(false); // prevents double-send race

  // Keep refs in sync with state
  useEffect(() => { ttsMutedRef.current = ttsMuted; }, [ttsMuted]);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
  useEffect(() => { sessionRef.current  = sessionId; }, [sessionId]);
  useEffect(() => { elapsedRef.current  = elapsed; }, [elapsed]);

  // ── Init
  useEffect(() => {
    setSupport(getBrowserSupport());
    const onR = () => setMobile(isMobile());
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // ── Validate invite
  useEffect(() => {
    api.invites.validate(token)
      .then(r => setInvite(r.invite))
      .catch(e => setError(e.message));
  }, [token]);

  // ── Cleanup
  useEffect(() => () => {
    window.speechSynthesis.cancel();
    _stopTick();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    recogRef.current?.abort();
  }, []);

  // ── Auto-scroll
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  // ── Keepalive every 30s while in interview
  useEffect(() => {
    if (!sessionId || phase !== 'interview') return;
    const ka = setInterval(() => {
      api.interview.keepalive({ session_id: sessionId }).catch(() => {});
    }, 30000);
    return () => clearInterval(ka);
  }, [sessionId, phase]);

  // ── Proctoring: track tab visibility changes
  useEffect(() => {
    if (phase !== 'interview' || !sessionId) return;
    let hiddenAt = null;
    const onVisibility = () => {
      const sid = sessionRef.current;
      const sec = elapsedRef.current;
      if (!sid) return;
      if (document.hidden) {
        hiddenAt = Date.now();
        api.interview.proctoring({
          session_id: sid, event_type: 'tab_hidden',
          severity: 'medium', description: 'Candidate switched away from interview tab',
          session_second: sec,
        }).catch(() => {});
      } else if (hiddenAt) {
        const awaySeconds = Math.round((Date.now() - hiddenAt) / 1000);
        hiddenAt = null;
        if (awaySeconds > 3) {
          api.interview.proctoring({
            session_id: sid, event_type: 'tab_returned',
            severity: awaySeconds > 30 ? 'high' : 'low',
            description: `Candidate was away for ${awaySeconds}s`,
            session_second: sec,
          }).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, sessionId]);

  // ── Proctoring: periodic face-in-frame check every 45s
  useEffect(() => {
    if (phase !== 'interview' || !sessionId) return;
    const check = setInterval(() => {
      const vid = videoRef.current;
      const sid = sessionRef.current;
      const sec = elapsedRef.current;
      if (!vid || !sid) return;
      try {
        const frame = captureFrame(vid);
        if (!frame) {
          api.interview.proctoring({
            session_id: sid, event_type: 'camera_unavailable',
            severity: 'medium', description: 'Camera frame could not be captured',
            session_second: sec,
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    }, 45000);
    return () => clearInterval(check);
  }, [phase, sessionId]);

  // ─────────────────────────────────────────────────────────
  // Gate handlers
  // ─────────────────────────────────────────────────────────
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setVerifying(true); setEmailError('');
    try {
      const result = await api.invites.verifyEmail(token, emailInput);
      setCandidateName(result.candidate_name);
      // Check for in-progress session (rejoin)
      try {
        const sc = await api.invites.getSession(token);
        if (sc?.session) {
          setRejoinDetected(true);
          setGateStep('rejoin');
          setVerifying(false);
          return;
        }
      } catch { /* fresh start */ }
      setGateStep('info');
    } catch (e) { setEmailError(e.message); }
    setVerifying(false);
  };

  const handleResumeUpload = async () => {
    setResumeUploading(true);
    try {
      const text = resumeFile ? await readFileAsText(resumeFile) : null;
      await api.interview.uploadResume({ invite_token: token, resume_text: text });
    } catch { /* silent */ }
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
      if (ref?.current) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); }
      return stream;
    } catch (e) { console.error('Camera:', e.message); return null; }
  };

  const beginChecks = async () => {
    setChecks({ camera:'checking', mic:'pending', attire:'pending', connection:'pending' });
    const stream = await startCamera(gateVideoRef);
    setChecks(p => ({...p, camera: stream ? 'pass' : 'fail'}));
    await new Promise(r => setTimeout(r, 400));
    setChecks(p => ({...p, mic: 'checking'}));
    await new Promise(r => setTimeout(r, 700));
    setChecks(p => ({...p, mic: stream ? 'pass' : 'fail'}));
    setChecks(p => ({...p, attire: 'checking'}));
    if (stream && gateVideoRef.current) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        const frame = captureFrame(gateVideoRef.current);
        if (frame) setAttire(await api.interview.attire({ image_base64: frame }));
        else setAttire({ score:75, level:'Business Casual', note:'Looking professional!' });
      } catch { setAttire({ score:75, level:'Business Casual', note:'Looking professional!' }); }
    }
    setChecks(p => ({...p, attire: 'pass', connection: 'pass'}));
    setGateStep('ready');
  };

  // ─────────────────────────────────────────────────────────
  // Start interview — stays on gate screen until API responds
  // ─────────────────────────────────────────────────────────
  const startInterview = async () => {
    setStartingInterview(true);
    try {
      const res = await api.interview.start({ invite_token: token, candidate_name: candidateName });

      // Sync all refs immediately
      sessionRef.current  = res.session_id;
      sequenceRef.current = res.is_rejoin ? (res.sequence || 2) : 2;

      setSessionId(res.session_id);
      setIsRejoin(!!res.is_rejoin);
      if (res.punctuality_score != null) setPunctuality(res.punctuality_score);
      if (res.is_rejoin) setSequence(res.sequence || 2);
      setTranscript([{ role:'ai', text: res.ai_message }]);
      setAiText(res.ai_message);

      // Switch phase AFTER data is ready
      setPhase('interview');
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setAiStatus('speaking');
      speak(res.ai_message, () => setAiStatus('idle'), ttsMutedRef.current);
    } catch (e) {
      setStartingInterview(false);
      setError(e.message);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Send answer — uses refs to prevent stale closures + double-sends
  // ─────────────────────────────────────────────────────────
  const sendAnswer = async (answer) => {
    const sid = sessionRef.current;
    if (!answer?.trim() || !sid) return;
    if (sendingRef.current) {
      console.warn('sendAnswer: already sending, dropping duplicate');
      return;
    }

    sendingRef.current = true;
    const seq = sequenceRef.current;
    sequenceRef.current += 2;
    setSequence(seq + 2);

    setTranscript(p => [...p, { role:'candidate', text: answer }]);
    setAiStatus('thinking');
    setMicError('');
    setNetworkError('');
    setRetryAnswer(null);

    try {
      const res = await api.interview.message({ session_id: sid, candidate_answer: answer, sequence: seq });
      setTranscript(p => [...p, { role:'ai', text: res.ai_message }]);
      setAiText(res.ai_message);
      setAiStatus('speaking');
      speak(res.ai_message, () => {
        setAiStatus('idle');
        if (res.is_complete) setTimeout(endInterviewDirect, 2000);
      }, ttsMutedRef.current);
    } catch (e) {
      setAiStatus('idle');
      // Rollback sequence so candidate can retry
      sequenceRef.current = seq;
      setSequence(seq);
      setNetworkError('Failed to send your answer. Tap "Retry" or try speaking again.');
      setRetryAnswer(answer);
      console.error('sendAnswer error:', e.message);
    } finally {
      sendingRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────
  // Microphone — continuous=true prevents Chrome auto-stopping
  // ─────────────────────────────────────────────────────────
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicError('Voice input requires Google Chrome. Please open this link in Chrome.');
      return;
    }
    if (aiStatus !== 'idle' || sendingRef.current) return;

    setMicError(''); setNetworkError(''); setRetryAnswer(null);
    const recog = new SR();
    recog.continuous = true;      // KEY: prevents auto-stop after brief pauses
    recog.interimResults = true;
    recog.lang = 'en-IN';
    recog.maxAlternatives = 1;

    setIsListening(true); setInterim(''); lastAnswer.current = '';

    recog.onresult = (e) => {
      let fin = '', intr = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
        else intr += e.results[i][0].transcript;
      }
      if (fin) { lastAnswer.current += fin; setInterim(lastAnswer.current.trim()); }
      else { setInterim((lastAnswer.current + intr).trim()); }
    };

    recog.onend = () => {
      setIsListening(false); setInterim('');
      const ans = lastAnswer.current.trim(); lastAnswer.current = '';
      if (ans.length > 2) sendAnswer(ans);
    };

    recog.onerror = (e) => {
      console.error('Speech error:', e.error);
      setIsListening(false); setInterim('');
      const ans = lastAnswer.current.trim(); lastAnswer.current = '';
      if (ans.length > 2) { sendAnswer(ans); }
      else { setMicError(MIC_ERRORS[e.error] || `Mic error: ${e.error}. Please try again.`); }
    };

    recogRef.current = recog;
    recog.start();
  };

  const stopListening = () => recogRef.current?.stop();

  // ─────────────────────────────────────────────────────────
  // End interview
  // ─────────────────────────────────────────────────────────
  const endInterviewDirect = async () => {
    window.speechSynthesis.cancel();
    _stopTick();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    recogRef.current?.abort();
    setEndingInterview(true);
    const sid = sessionRef.current;
    const dur = elapsedRef.current;
    if (sid) {
      await api.interview.complete({ session_id: sid, duration_seconds: dur }).catch(console.error);
    }
    setEndingInterview(false);
    setPhase('end');
  };

  const requestEnd = () => {
    if (aiStatus === 'thinking') return; // don't interrupt mid-response
    setShowEndConfirm(true);
  };

  // ─────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  const allPass = checks.camera === 'pass' && checks.mic === 'pass' && checks.attire === 'pass' && checks.connection === 'pass';
  const gateCard = {
    width: mobile ? '92vw' : 520, maxWidth: 520,
    background: C.card, border: '1px solid #ffffff15',
    borderRadius: 18, padding: mobile ? 28 : 44,
    boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
  };

  // ─────────────────────────────────────────────────────────
  // RENDER: ERROR
  // ─────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:C.dark, flexDirection:'column', textAlign:'center', padding:28, color:'#EEEAE0' }}>
      <style>{FONTS}</style>
      <div style={{ fontSize:44, marginBottom:20 }}>⚠️</div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?18:22, fontWeight:700, marginBottom:12 }}>Cannot Enter Interview</div>
      <div style={{ color:'#6B6876', maxWidth:380, lineHeight:1.7, fontSize:14 }}>{error}</div>
      <div style={{ marginTop:24, fontSize:12, color:'#444', maxWidth:300 }}>If you believe this is an error, please contact the recruiter.</div>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // RENDER: GATE
  // ─────────────────────────────────────────────────────────
  if (phase === 'gate') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:C.dark, padding:16 }}>
      <style>{FONTS}</style>
      <div style={gateCard}>

        {/* EMAIL */}
        {gateStep === 'email' && <>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.gold }}>SriKrishnaSweets</div>
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
              <input style={{ width:'100%', padding:'13px 14px', background:'#1A1A22', border:'1px solid #333', borderRadius:8, fontSize:15, color:'#EEEAE0', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                type="email" placeholder="yourname@email.com" required autoComplete="email"
                value={emailInput} onChange={e => setEmailInput(e.target.value)} />
            </div>
            <button type="submit" disabled={verifying}
              style={{ padding:14, background:verifying?'#222':C.gold, border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:verifying?'#555':'#000', cursor:verifying?'not-allowed':'pointer' }}>
              {verifying ? 'Verifying...' : 'Continue →'}
            </button>
          </form>
          {support && !support.isChrome && (
            <div style={{ marginTop:20, background:'rgba(200,146,42,0.1)', border:'1px solid rgba(200,146,42,0.3)', borderRadius:8, padding:'12px 14px', fontSize:12, color:C.gold, lineHeight:1.6 }}>
              ⚠️ For best experience, please open this link in <strong>Google Chrome</strong>.
            </div>
          )}
        </>}

        {/* REJOIN */}
        {gateStep === 'rejoin' && <>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🔄</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:22, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>
              Welcome Back, {candidateName?.split(' ')[0]}
            </div>
            <div style={{ color:'#6B6876', fontSize:14, lineHeight:1.7 }}>
              Your interview session is still active. We'll reconnect you where you left off.
            </div>
          </div>
          <div style={{ background:'rgba(200,146,42,0.08)', border:'1px solid rgba(200,146,42,0.2)', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#6B6876', marginBottom:24, lineHeight:2.1 }}>
            ✦ <strong style={{ color:'#EEEAE0' }}>Resume required</strong> — Aria needs your resume again to continue your personalised interview.
          </div>
          <button style={{ width:'100%', padding:14, background:C.gold, border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:'#000', cursor:'pointer' }}
            onClick={() => setGateStep('resume')}>
            Re-upload Resume & Reconnect →
          </button>
        </>}

        {/* INFO */}
        {gateStep === 'info' && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:24, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>Hi {candidateName?.split(' ')[0]} 👋</div>
          <div style={{ color:'#6B6876', fontSize:14, marginBottom:24, lineHeight:1.6 }}>
            You're interviewing for <strong style={{ color:C.gold }}>{invite?.jobs?.title}</strong> at SriKrishnaSweets.
          </div>
          <div style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#6B6876', marginBottom:24, lineHeight:2 }}>
            ✓ Use <strong style={{ color:'#EEEAE0' }}>Google Chrome</strong><br/>
            ✓ Find a <strong style={{ color:'#EEEAE0' }}>quiet, well-lit</strong> space<br/>
            ✓ Dress <strong style={{ color:'#EEEAE0' }}>professionally</strong><br/>
            ✓ Have <strong style={{ color:'#EEEAE0' }}>salary & notice period</strong> ready<br/>
            ✓ Duration: ~<strong style={{ color:'#EEEAE0' }}>{invite?.jobs?.interview_configs?.duration_minutes || 45} minutes</strong>
          </div>
          <button style={{ width:'100%', padding:14, background:C.gold, border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:'#000', cursor:'pointer' }}
            onClick={() => setGateStep('resume')}>Continue →</button>
        </>}

        {/* RESUME */}
        {gateStep === 'resume' && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:22, fontWeight:800, color:'#EEEAE0', marginBottom:8 }}>
            {rejoinDetected ? 'Re-upload Resume 🔄' : 'Upload Resume 📄'}
          </div>
          <div style={{ color:'#6B6876', fontSize:13, marginBottom:20, lineHeight:1.6 }}>
            {rejoinDetected
              ? 'Re-upload your resume so Aria can continue with full context.'
              : 'Aria will ask personalised questions based on your resume.'}
          </div>
          <div onClick={() => document.getElementById('resume-file').click()}
            style={{ border:resumeFile?'2px solid rgba(46,204,138,0.5)':'2px dashed #333', borderRadius:12, padding:'28px 16px', textAlign:'center', cursor:'pointer', background:resumeFile?'rgba(46,204,138,0.05)':'#141419', marginBottom:16 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>{resumeFile ? '✅' : '📂'}</div>
            <div style={{ fontSize:13, color:resumeFile ? C.green : '#6B6876' }}>
              {resumeFile ? resumeFile.name : 'Tap to upload (.pdf, .txt, .doc)'}
            </div>
          </div>
          <input id="resume-file" type="file" accept=".pdf,.txt,.doc,.docx" style={{ display:'none' }}
            onChange={e => setResumeFile(e.target.files[0])} />
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button
              style={{ padding:13, background:resumeFile&&!resumeUploading?C.gold:'#222', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:resumeFile&&!resumeUploading?'#000':'#555', cursor:resumeFile&&!resumeUploading?'pointer':'not-allowed' }}
              onClick={handleResumeUpload} disabled={!resumeFile||resumeUploading}>
              {resumeUploading ? 'Uploading...' : rejoinDetected ? 'Upload & Reconnect →' : 'Upload & Continue →'}
            </button>
            <button style={{ padding:11, background:'transparent', border:'1px solid #333', borderRadius:10, color:'#6B6876', fontSize:13, cursor:'pointer' }}
              onClick={() => { setGateStep('checks'); beginChecks(); }}>
              {rejoinDetected ? 'Continue without re-uploading' : 'Skip — interview without resume'}
            </button>
          </div>
        </>}

        {/* CHECKS */}
        {(gateStep === 'checks' || gateStep === 'ready') && <>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?18:22, fontWeight:800, color:'#EEEAE0', marginBottom:16 }}>System Check</div>
          <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #ffffff15', height:mobile?140:160, background:'#141419', marginBottom:16, position:'relative' }}>
            <video ref={gateVideoRef} style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }} muted playsInline autoPlay />
            {checks.camera === 'pass' && (
              <div style={{ position:'absolute', bottom:8, left:8, background:'rgba(0,0,0,0.75)', color:C.green, fontSize:11, padding:'3px 10px', borderRadius:4 }}>✓ Camera active</div>
            )}
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
                <span style={{ fontSize:11, color:checks[item.key]==='pass'?C.green:C.amber, fontFamily:'monospace' }}>
                  {checks[item.key]==='pass'?'✓':checks[item.key]==='checking'?'...':''}
                </span>
              </div>
            ))}
          </div>

          {gateStep === 'ready' && !startingInterview && (
            <button style={{ width:'100%', padding:14, background:allPass?C.gold:'#222', border:'none', borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:allPass?'#000':'#555', cursor:allPass?'pointer':'not-allowed' }}
              onClick={startInterview} disabled={!allPass}>
              {rejoinDetected ? 'Reconnect with Aria ✦' : 'Begin Interview with Aria ✦'}
            </button>
          )}
          {startingInterview && (
            <div style={{ padding:'20px 0', textAlign:'center' }}>
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:12 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:C.gold, animation:`pulse 1.2s ${i*0.2}s ease-in-out infinite` }} />
                ))}
              </div>
              <div style={{ fontSize:14, color:'#EEEAE0', fontWeight:600 }}>
                {rejoinDetected ? 'Reconnecting your session...' : 'Aria is preparing your interview...'}
              </div>
              <div style={{ fontSize:12, color:'#444', marginTop:6 }}>Generating personalised questions — this takes a few seconds</div>
            </div>
          )}
        </>}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // RENDER: END
  // ─────────────────────────────────────────────────────────
  if (phase === 'end') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:C.dark, padding:16 }}>
      <style>{FONTS}</style>
      <div style={{ width:mobile?'92vw':520, maxWidth:520, background:C.card, border:'1px solid #ffffff15', borderRadius:18, padding:mobile?28:48, boxShadow:'0 40px 100px rgba(0,0,0,0.6)', textAlign:'center' }}>
        {endingInterview ? (
          <>
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:16 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:C.gold, animation:`pulse 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
            </div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:'#EEEAE0', marginBottom:8 }}>Saving your interview...</div>
            <div style={{ color:'#6B6876', fontSize:13 }}>Generating your evaluation report. Please wait.</div>
          </>
        ) : <>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(46,204,138,0.12)', border:'1px solid rgba(46,204,138,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>✓</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?20:24, fontWeight:800, marginBottom:12, color:'#EEEAE0' }}>Interview Complete!</div>
          <div style={{ color:'#6B6876', fontSize:14, lineHeight:1.7, marginBottom:24 }}>
            Thank you, <strong style={{ color:'#EEEAE0' }}>{candidateName?.split(' ')[0]}</strong>. Your responses have been recorded. The hiring team will be in touch within 3–5 business days.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:24 }}>
            {[
              { label:'Duration',  val: fmt(elapsed) },
              { label:'Responses', val: transcript.filter(m=>m.role==='candidate').length },
              { label:'Attire',    val: attire?.score ? `${attire.score}/100` : '—' },
            ].map(s => (
              <div key={s.label} style={{ background:'#141419', border:'1px solid #ffffff0C', borderRadius:8, padding:'12px 8px' }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:C.gold }}>{s.val}</div>
                <div style={{ fontSize:11, color:'#6B6876', marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#333' }}>You may now close this window.</div>
        </>}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // RENDER: LIVE INTERVIEW
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:C.dark, fontFamily:"'Instrument Sans',sans-serif", color:'#EEEAE0', display:'flex', flexDirection:'column' }}>
      <style>{`
        ${FONTS}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 6px rgba(255,79,79,0.15)}50%{box-shadow:0 0 0 16px rgba(255,79,79,0.05)}}
        .mic-active{animation:micPulse 1s ease-in-out infinite}
        *{box-sizing:border-box}
      `}</style>

      {/* ── END CONFIRMATION MODAL */}
      {showEndConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:C.card, border:'1px solid rgba(255,79,79,0.35)', borderRadius:16, padding:mobile?24:40, maxWidth:420, width:'100%', textAlign:'center', boxShadow:'0 30px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ fontSize:40, marginBottom:14 }}>⚠️</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?18:22, fontWeight:800, color:'#EEEAE0', marginBottom:10 }}>End Interview?</div>
            <div style={{ color:'#6B6876', fontSize:14, lineHeight:1.8, marginBottom:28 }}>
              Are you sure you want to end this interview?<br/>
              <strong style={{ color:'#EEEAE0' }}>This cannot be undone.</strong> Your responses so far will be saved and scored.
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <button style={{ flex:1, padding:'13px 0', borderRadius:10, border:'1px solid #333', background:'transparent', color:'#6B6876', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
                onClick={() => setShowEndConfirm(false)}>← Continue Interview</button>
              <button style={{ flex:1, padding:'13px 0', borderRadius:10, border:'none', background:C.red, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Syne',sans-serif" }}
                onClick={() => { setShowEndConfirm(false); endInterviewDirect(); }}>Yes, End Now</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:mobile?'0 16px':'0 28px', height:mobile?48:52, borderBottom:'1px solid #ffffff0C', background:'rgba(6,6,10,0.97)', flexShrink:0 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:mobile?13:16, fontWeight:800, color:C.gold }}>SriKrishnaSweets</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, background:C.red, borderRadius:'50%', animation:'pulse 1.2s infinite' }} />
          <span style={{ fontFamily:'monospace', fontSize:mobile?11:12, color:C.red }}>LIVE</span>
          <span style={{ fontFamily:'monospace', fontSize:mobile?12:13, background:'#141419', border:'1px solid #ffffff18', padding:'3px 10px', borderRadius:6 }}>{fmt(elapsed)}</span>
          <button onClick={() => { setTtsMuted(m => { const n=!m; if(n) window.speechSynthesis.cancel(); return n; }); }}
            title={ttsMuted?'Unmute Aria':'Mute Aria'}
            style={{ padding:'3px 9px', background:'#141419', border:'1px solid #ffffff18', borderRadius:6, color:ttsMuted?C.amber:'#6B6876', fontSize:10, cursor:'pointer', fontFamily:'monospace' }}>
            {ttsMuted ? '🔇' : '🔊'}
          </button>
        </div>
        <div style={{ fontFamily:'monospace', fontSize:10, color:aiStatus==='idle'?C.green:C.gold, background:'#141419', border:'1px solid', borderColor:aiStatus==='idle'?'rgba(46,204,138,0.3)':'rgba(200,146,42,0.3)', padding:'3px 10px', borderRadius:4 }}>
          {aiStatus==='speaking'?'ARIA SPEAKING':aiStatus==='thinking'?'THINKING…':'READY'}
        </div>
      </div>

      {/* ── PROGRESS */}
      <div style={{ height:2, background:'#ffffff08', flexShrink:0 }}>
        <div style={{ height:'100%', background:`linear-gradient(90deg,${C.purple},${C.gold})`, width:`${Math.min((transcript.filter(m=>m.role==='ai').length/14)*100,100)}%`, transition:'width 1s' }} />
      </div>

      {/* ── MAIN */}
      <div style={{ flex:1, display:'flex', flexDirection:!mobile?'row':'column', overflow:'hidden' }}>

        {/* Video */}
        <div style={{ flex:!mobile?1:'none', position:'relative', background:'#0E0E14', margin:mobile?'10px 10px 0':'16px 16px 0', borderRadius:12, overflow:'hidden', border:'1px solid #ffffff15', height:mobile?'35vh':'auto', minHeight:mobile?180:300 }}>
          <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', transform:'scaleX(-1)' }} muted playsInline autoPlay />
          {[['tl','2px 0 0 2px','top:10px;left:10px'],['tr','2px 2px 0 0','top:10px;right:10px'],['bl','0 0 2px 2px','bottom:10px;left:10px'],['br','0 2px 2px 0','bottom:10px;right:10px']].map(([k,bw,pos]) => (
            <div key={k} style={{ position:'absolute', width:18, height:18, borderColor:C.gold, borderStyle:'solid', borderWidth:bw, borderRadius:2, opacity:0.6, ...(Object.fromEntries(pos.split(';').map(p=>p.split(':').map(s=>s.trim())))) }} />
          ))}
          {attire && (
            <div style={{ position:'absolute', bottom:8, left:8, background:'rgba(0,0,0,0.8)', border:'1px solid #ffffff18', borderRadius:6, padding:'4px 10px', fontSize:11 }}>
              Attire: <strong style={{ color:C.green }}>{attire.score}/100</strong>
            </div>
          )}
          <div style={{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.8)', border:'1px solid #ffffff18', borderRadius:6, padding:'4px 10px' }}>
            <div style={{ fontSize:11, fontWeight:600 }}>{candidateName}</div>
          </div>
          {isRejoin && (
            <div style={{ position:'absolute', top:8, left:8, background:'rgba(200,146,42,0.12)', border:'1px solid rgba(200,146,42,0.3)', borderRadius:6, padding:'3px 8px', fontSize:10, color:C.amber }}>
              🔄 REJOINED
            </div>
          )}
        </div>

        {/* Aria + transcript */}
        <div style={{ width:!mobile?320:'auto', borderLeft:!mobile?'1px solid #ffffff0C':'none', borderTop:!mobile?'none':'1px solid #ffffff0C', background:'#0E0E14', display:'flex', flexDirection:'column', overflow:'hidden', flex:mobile?1:'none', margin:mobile?'0 10px 10px':0, borderRadius:mobile?12:0 }}>
          <div style={{ padding:mobile?'12px 14px':20, borderBottom:'1px solid #ffffff0C', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%,rgba(167,139,250,0.7),rgba(91,143,249,0.3))', border:'1px solid rgba(167,139,250,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🤖</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, color:C.purple }}>Aria</div>
                <div style={{ fontSize:10, color:'#6B6876' }}>
                  {aiStatus==='thinking'?'Thinking...':aiStatus==='speaking'?ttsMuted?'Speaking (muted)':'Speaking to you':'Listening'}
                </div>
              </div>
              {aiStatus === 'speaking' && !ttsMuted && (
                <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:20 }}>
                  {[4,8,12,8,6].map((h,i) => (
                    <div key={i} style={{ width:3, height:h, background:C.purple, borderRadius:2, animation:`pulse 0.7s ${i*0.1}s ease-in-out infinite` }} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ background:'#141419', border:'1px solid rgba(167,139,250,0.2)', borderRadius:10, borderTopLeftRadius:3, padding:'10px 12px', fontSize:13, lineHeight:1.7, minHeight:44 }}>
              {aiStatus==='thinking' ? (
                <div style={{ display:'flex', gap:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:C.purple, animation:`pulse 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              ) : aiText || <span style={{ color:'#6B6876', fontStyle:'italic' }}>Starting...</span>}
            </div>
          </div>

          {/* Transcript */}
          <div style={{ flex:1, overflowY:'auto', padding:mobile?'10px 12px':14 }}>
            <div style={{ fontSize:10, color:'#6B6876', textTransform:'uppercase', letterSpacing:1, marginBottom:10, paddingBottom:8, borderBottom:'1px solid #ffffff0C' }}>TRANSCRIPT</div>
            {transcript.map((m, i) => (
              <div key={i} style={{ marginBottom:10, opacity:i>=transcript.length-2?1:0.55 }}>
                <div style={{ fontSize:10, color:m.role==='ai'?C.purple:'#6B6876', textTransform:'uppercase', marginBottom:4, letterSpacing:0.5 }}>
                  {m.role==='ai'?'ARIA':'YOU'}
                </div>
                <div style={{ fontSize:12, lineHeight:1.6, padding:'7px 10px', borderRadius:7, background:m.role==='ai'?'rgba(167,139,250,0.05)':'#141419', border:'1px solid #ffffff08' }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
        </div>
      </div>

      {/* Interim speech */}
      {(isListening || interim) && (
        <div style={{ margin:'0 10px', padding:'10px 14px', background:'#141419', border:'1px solid rgba(255,79,79,0.25)', borderRadius:8, fontSize:13, color:'#EEEAE0', display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
          <div style={{ display:'flex', gap:3, alignItems:'flex-end' }}>
            {[3,6,9,6,3].map((h,i) => <div key={i} style={{ width:3, height:h, background:C.red, borderRadius:2, animation:`pulse 0.8s ${i*0.12}s infinite` }} />)}
          </div>
          <span style={{ flex:1, fontStyle:interim?'normal':'italic', color:interim?'#EEEAE0':'#6B6876' }}>
            {interim || 'Listening... speak now'}
          </span>
          <span style={{ fontSize:10, color:C.red, fontFamily:'monospace' }}>● REC</span>
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{ margin:'4px 10px 0', padding:'8px 14px', background:'rgba(255,79,79,0.08)', border:'1px solid rgba(255,79,79,0.3)', borderRadius:8, fontSize:12, color:'#FCA5A5', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span>⚠ {micError}</span>
          <button onClick={() => setMicError('')} style={{ background:'none', border:'none', color:'#FCA5A5', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
        </div>
      )}

      {/* Network error + retry */}
      {networkError && (
        <div style={{ margin:'4px 10px 0', padding:'8px 14px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, fontSize:12, color:'#FCD34D', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, gap:10 }}>
          <span>⚠ {networkError}</span>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {retryAnswer && (
              <button onClick={() => { setNetworkError(''); sendAnswer(retryAnswer); }}
                style={{ background:C.amber, border:'none', borderRadius:6, color:'#000', cursor:'pointer', fontSize:12, fontWeight:600, padding:'4px 12px' }}>
                Retry
              </button>
            )}
            <button onClick={() => { setNetworkError(''); setRetryAnswer(null); }}
              style={{ background:'none', border:'none', color:'#FCD34D', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
          </div>
        </div>
      )}

      {/* ── BOTTOM BAR */}
      <div style={{ borderTop:'1px solid #ffffff0C', padding:mobile?'12px 16px':'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,6,10,0.97)', gap:12, flexShrink:0 }}>
        <button onClick={requestEnd} disabled={endingInterview}
          style={{ padding:mobile?'8px 12px':'8px 18px', borderRadius:7, border:'1px solid rgba(255,79,79,0.3)', background:'rgba(255,79,79,0.08)', color:C.red, fontSize:mobile?12:13, cursor:endingInterview?'not-allowed':'pointer', whiteSpace:'nowrap', opacity:endingInterview?0.5:1 }}>
          {mobile ? 'End' : 'End Interview'}
        </button>

        <div style={{ textAlign:'center', flex:1 }}>
          <button
            style={{ width:mobile?48:54, height:mobile?48:54, borderRadius:'50%', border:'none', cursor:aiStatus!=='idle'||sendingRef.current?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:mobile?20:22, transition:'all 0.2s', opacity:aiStatus!=='idle'?0.35:1, background:isListening?C.red:'#1A1A22', boxShadow:isListening?'0 0 0 8px rgba(255,79,79,0.15)':'none', margin:'0 auto' }}
            onClick={isListening ? stopListening : startListening}
            disabled={aiStatus !== 'idle'}
            className={isListening ? 'mic-active' : ''}>
            {isListening ? '⏹' : '🎙'}
          </button>
          <div style={{ fontSize:11, color:'#6B6876', marginTop:6 }}>
            {aiStatus==='speaking' ? 'Wait for Aria to finish...'
             : aiStatus==='thinking' ? 'Aria is thinking...'
             : isListening ? <strong style={{ color:'#EEEAE0' }}>Tap ⏹ when done speaking</strong>
             : 'Tap 🎙 to answer'}
          </div>
        </div>

        <div style={{ textAlign:'right', minWidth:mobile?60:90 }}>
          <div style={{ fontSize:11, color:'#6B6876' }}>Q{transcript.filter(m=>m.role==='ai').length}</div>
          {punctuality != null && (
            <div style={{ fontSize:10, color:punctuality<80?C.red:'#6B6876', marginTop:2 }}>
              Punctuality: {punctuality}
            </div>
          )}
          {isRejoin && <div style={{ fontSize:9, color:C.amber, marginTop:2 }}>🔄 REJOINED</div>}
        </div>
      </div>
    </div>
  );
}
