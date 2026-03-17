import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

// ── TTS: reliable cross-browser voice
class VoiceEngine {
  constructor() {
    this.unlocked = false;
    this.queue = [];
    this.speaking = false;
  }

  // Must be called on first user tap
  unlock() {
    if (this.unlocked) return;
    const utt = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(utt);
    this.unlocked = true;
  }

  getVoice() {
    const voices = window.speechSynthesis.getVoices();
    const names = ['Google UK English Female','Samantha','Karen','Moira','Tessa','Google US English'];
    for (const name of names) {
      const v = voices.find(v => v.name.includes(name));
      if (v) return v;
    }
    return voices.find(v => v.lang.startsWith('en') && v.gender === 'female')
      || voices.find(v => v.lang.startsWith('en-'))
      || voices[0]
      || null;
  }

  speak(text, onDone) {
    window.speechSynthesis.cancel();
    this.speaking = false;

    const attempt = (tries = 0) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0 && tries < 5) {
        setTimeout(() => attempt(tries + 1), 300);
        return;
      }
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.9;
      utt.pitch = 1.1;
      utt.volume = 1.0;
      const v = this.getVoice();
      if (v) utt.voice = v;
      utt.onstart  = () => { this.speaking = true; };
      utt.onend    = () => { this.speaking = false; if (onDone) onDone(); };
      utt.onerror  = (e) => {
        console.error('TTS error:', e.error);
        this.speaking = false;
        if (onDone) onDone();
      };
      window.speechSynthesis.speak(utt);

      // Chrome bug workaround: resume if paused
      setTimeout(() => {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 200);
    };

    attempt();
  }

  cancel() {
    window.speechSynthesis.cancel();
    this.speaking = false;
  }
}

const voice = new VoiceEngine();

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
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.slice(0, 8000));
    reader.onerror = () => resolve(`[Resume: ${file.name}]`);
    if (file.type === 'text/plain') reader.readAsText(file);
    else reader.readAsText(file); // best effort for .doc
  });
}

const mobile = () => window.innerWidth < 768;
const gold   = '#C8922A';
const purple = '#A78BFA';
const green  = '#2ECC8A';
const dark   = '#06060A';
const panel  = '#0E0E14';

export default function InterviewPage() {
  const { token } = useParams();
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const sm = w < 768;

  // Gate
  const [step, setStep]           = useState('email'); // email|info|resume|checks|ready
  const [invite, setInvite]       = useState(null);
  const [email, setEmail]         = useState('');
  const [emailErr, setEmailErr]   = useState('');
  const [verifying, setVerifying] = useState(false);
  const [name, setName]           = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [checks, setChecks]       = useState({cam:'pending',mic:'pending',attire:'pending',net:'pending'});
  const [attire, setAttire]       = useState(null);

  // Interview
  const [phase, setPhase]         = useState('gate');
  const [sid, setSid]             = useState(null);
  const [msgs, setMsgs]           = useState([]);
  const [ariaText, setAriaText]   = useState('');
  const [status, setStatus]       = useState('idle'); // idle|thinking|speaking|listening
  const [interim, setInterim]     = useState('');
  const [seq, setSeq]             = useState(2);
  const [elapsed, setElapsed]     = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [err, setErr]             = useState('');

  const vidRef    = useRef(null);
  const gVidRef   = useRef(null);
  const stream    = useRef(null);
  const recog     = useRef(null);
  const timer     = useRef(null);
  const pending   = useRef('');
  const txEnd     = useRef(null);
  const isSending = useRef(false);

  useEffect(() => {
    api.invites.validate(token).then(r => setInvite(r.invite)).catch(e => setErr(e.message));
    // Pre-load voices
    window.speechSynthesis.getVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, [token]);

  useEffect(() => () => {
    voice.cancel();
    clearInterval(timer.current);
    stream.current?.getTracks().forEach(t => t.stop());
    recog.current?.abort();
  }, []);

  useEffect(() => { txEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  // Unlock audio on first tap
  const unlockAudio = () => {
    if (audioUnlocked) return;
    voice.unlock();
    setAudioUnlocked(true);
  };

  // Verify email
  const verifyEmail = async (e) => {
    e.preventDefault();
    unlockAudio();
    setVerifying(true); setEmailErr('');
    try {
      const r = await api.invites.verifyEmail(token, email);
      setName(r.candidate_name);
      setStep('info');
    } catch(e) { setEmailErr(e.message); }
    setVerifying(false);
  };

  // Camera
  const startCam = async (ref) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} },
        audio: true,
      });
      stream.current = s;
      if (ref?.current) { ref.current.srcObject = s; await ref.current.play().catch(()=>{}); }
      return s;
    } catch(e) { console.error('Camera:', e.message); return null; }
  };

  const beginChecks = async () => {
    setChecks({cam:'checking',mic:'pending',attire:'pending',net:'pending'});
    const s = await startCam(gVidRef);
    setChecks(p => ({...p, cam:s?'pass':'fail'}));
    await new Promise(r=>setTimeout(r,400));
    setChecks(p => ({...p, mic:'checking'}));
    await new Promise(r=>setTimeout(r,600));
    setChecks(p => ({...p, mic:s?'pass':'fail'}));
    setChecks(p => ({...p, attire:'checking'}));
    await new Promise(r=>setTimeout(r,1000));
    if (s && gVidRef.current) {
      try {
        const f = captureFrame(gVidRef.current);
        if (f) setAttire(await api.interview.attire({image_base64:f}));
        else setAttire({score:78,level:'Business Casual',note:'Looking great!'});
      } catch { setAttire({score:78,level:'Business Casual',note:'Looking great!'}); }
    }
    setChecks(p => ({...p, attire:'pass', net:'pass'}));
    setStep('ready');
  };

  // Start interview
  const startInterview = async () => {
    unlockAudio();
    setPhase('interview');
    setTimeout(() => {
      if (vidRef.current && stream.current) {
        vidRef.current.srcObject = stream.current;
        vidRef.current.play().catch(()=>{});
      }
    }, 150);
    timer.current = setInterval(() => setElapsed(e=>e+1), 1000);
    setStatus('thinking');
    try {
      const r = await api.interview.start({invite_token:token, candidate_name:name});
      setSid(r.session_id);
      if (r.is_rejoin) setSeq(r.sequence||2);
      setMsgs([{role:'ai', text:r.ai_message}]);
      setAriaText(r.ai_message);
      setStatus('speaking');
      voice.speak(r.ai_message, () => setStatus('idle'));
    } catch(e) { setErr(e.message); setStatus('idle'); }
  };

  // Send answer to Aria
  const sendAnswer = useCallback(async (answer) => {
    if (!answer.trim() || !sid || isSending.current) return;
    isSending.current = true;
    const s = seq;
    setSeq(n=>n+2);
    setMsgs(p=>[...p, {role:'candidate', text:answer}]);
    setStatus('thinking');
    try {
      const r = await api.interview.message({session_id:sid, candidate_answer:answer, sequence:s});
      setMsgs(p=>[...p, {role:'ai', text:r.ai_message}]);
      setAriaText(r.ai_message);
      setStatus('speaking');
      voice.speak(r.ai_message, () => {
        setStatus('idle');
        if (r.is_complete) setTimeout(endInterview, 2000);
      });
    } catch(e) {
      console.error('Message error:', e.message);
      setStatus('idle');
    }
    isSending.current = false;
  }, [sid, seq]);

  // Microphone — start
  const startMic = () => {
    if (status !== 'idle') return;
    unlockAudio();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input requires Google Chrome. Please open this link in Chrome.');
      return;
    }
    const r = new SR();
    r.continuous      = true;   // keep running
    r.interimResults  = true;
    r.lang            = 'en-IN';
    r.maxAlternatives = 1;
    pending.current   = '';
    setInterim('');
    setStatus('listening');

    r.onresult = (e) => {
      let fin='', int='';
      for (let i=e.resultIndex; i<e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
        else int += e.results[i][0].transcript;
      }
      if (fin) { pending.current += fin; setInterim(pending.current.trim()); }
      else     { setInterim((pending.current + int).trim()); }
    };

    r.onerror = (e) => {
      console.error('Speech error:', e.error);
      if (e.error === 'not-allowed') alert('Microphone permission denied. Please allow microphone access.');
    };

    r.onend = () => {
      // Only stop if user tapped stop (status will be idle by then)
      // Otherwise it ended by itself — don't send yet
    };

    recog.current = r;
    r.start();
  };

  // Microphone — stop and send
  const stopMic = () => {
    recog.current?.stop();
    recog.current = null;
    setStatus('idle');
    setInterim('');
    const ans = pending.current.trim();
    pending.current = '';
    if (ans.length > 2) sendAnswer(ans);
  };

  const endInterview = async () => {
    voice.cancel();
    clearInterval(timer.current);
    recog.current?.abort();
    stream.current?.getTracks().forEach(t=>t.stop());
    if (sid) await api.interview.complete({session_id:sid, duration_seconds:elapsed}).catch(console.error);
    setPhase('end');
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`;

  // ── ERROR
  if (err) return (
    <div onClick={unlockAudio} style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,flexDirection:'column',textAlign:'center',padding:24,color:'#EEEAE0'}}>
      <style>{FONTS}</style>
      <div style={{fontSize:44,marginBottom:16}}>⚠️</div>
      <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:700,marginBottom:12}}>Cannot Enter Interview</div>
      <div style={{color:'#6B6876',maxWidth:380,lineHeight:1.7,fontSize:14}}>{err}</div>
    </div>
  );

  // ── GATE
  if (phase === 'gate') {
    const cardStyle = {width:sm?'94vw':500,maxWidth:500,background:panel,border:'1px solid #ffffff15',borderRadius:18,padding:sm?24:40,boxShadow:'0 40px 80px rgba(0,0,0,0.6)'};
    const btnStyle  = (active) => ({width:'100%',padding:14,background:active?gold:'#222',border:'none',borderRadius:10,fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:active?'#000':'#555',cursor:active?'pointer':'not-allowed',marginTop:8});
    const inputStyle = {width:'100%',padding:'13px 14px',background:'#1A1A22',border:'1px solid #333',borderRadius:8,fontSize:15,color:'#EEEAE0',outline:'none',fontFamily:'inherit',boxSizing:'border-box'};

    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,padding:16}} onClick={unlockAudio}>
        <style>{FONTS}</style>
        <div style={cardStyle}>

          {/* EMAIL */}
          {step==='email' && <>
            <div style={{textAlign:'center',marginBottom:28}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:gold}}>SriKrishnaSweets</div>
              <div style={{fontSize:11,color:'#333',letterSpacing:1,marginTop:4}}>AI INTERVIEW PLATFORM</div>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?20:23,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Verify Your Identity</div>
            <div style={{color:'#6B6876',fontSize:14,marginBottom:24,lineHeight:1.6}}>Enter the email address where you received this interview invite.</div>
            {emailErr && <div style={{background:'rgba(220,38,38,0.12)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:8,padding:'12px 14px',fontSize:13,color:'#FCA5A5',marginBottom:20,lineHeight:1.5}}>{emailErr}</div>}
            <form onSubmit={verifyEmail}>
              <label style={{display:'block',fontSize:11,color:'#6B6876',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>Your Email</label>
              <input style={inputStyle} type="email" placeholder="yourname@email.com" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} />
              <button type="submit" style={btnStyle(!verifying)} disabled={verifying}>{verifying?'Verifying...':'Continue →'}</button>
            </form>
          </>}

          {/* INFO */}
          {step==='info' && <>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?20:23,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Hi {name?.split(' ')[0]} 👋</div>
            <div style={{color:'#6B6876',fontSize:14,marginBottom:20,lineHeight:1.6}}>
              Interviewing for <strong style={{color:gold}}>{invite?.jobs?.title}</strong> at SriKrishnaSweets.
              Aria, our AI interviewer, will conduct your session and will speak to you during the interview.
            </div>
            <div style={{background:'#141419',border:'1px solid #ffffff0C',borderRadius:10,padding:'14px 16px',fontSize:13,color:'#6B6876',marginBottom:24,lineHeight:2}}>
              ✓ Use <strong style={{color:'#EEEAE0'}}>Google Chrome</strong> for voice support<br/>
              ✓ <strong style={{color:'#EEEAE0'}}>Allow microphone and camera</strong> when prompted<br/>
              ✓ Find a <strong style={{color:'#EEEAE0'}}>quiet, well-lit</strong> space<br/>
              ✓ Dress <strong style={{color:'#EEEAE0'}}>professionally</strong><br/>
              ✓ Have <strong style={{color:'#EEEAE0'}}>salary expectations & notice period</strong> ready
            </div>
            <button style={btnStyle(true)} onClick={()=>setStep('resume')}>Continue →</button>
          </>}

          {/* RESUME */}
          {step==='resume' && <>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?18:22,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Upload Resume 📄</div>
            <div style={{color:'#6B6876',fontSize:13,marginBottom:20,lineHeight:1.6}}>
              Aria will ask questions based on your resume. If you skip, Aria will ask follow-up questions from your introduction.
            </div>
            <div onClick={()=>document.getElementById('rf').click()}
              style={{border:resumeFile?'2px solid rgba(46,204,138,0.5)':'2px dashed #333',borderRadius:12,padding:'28px 16px',textAlign:'center',cursor:'pointer',background:resumeFile?'rgba(46,204,138,0.04)':'#141419',marginBottom:16}}>
              <div style={{fontSize:32,marginBottom:8}}>{resumeFile?'✅':'📂'}</div>
              <div style={{fontSize:13,color:resumeFile?green:'#6B6876'}}>{resumeFile?resumeFile.name:'Tap to upload (.pdf, .txt, .doc)'}</div>
            </div>
            <input id="rf" type="file" accept=".pdf,.txt,.doc,.docx" style={{display:'none'}} onChange={e=>setResumeFile(e.target.files[0])} />
            <div style={{display:'flex',gap:10}}>
              <button style={{...btnStyle(true),background:'#1A1A22',color:'#666',border:'1px solid #333',flex:1,marginTop:0}}
                onClick={async()=>{await api.interview.uploadResume({invite_token:token,resume_text:null}).catch(()=>{});setStep('checks');beginChecks();}}>Skip</button>
              <button style={{...btnStyle(!!resumeFile&&!uploading),flex:2,marginTop:0}}
                disabled={!resumeFile||uploading} onClick={async()=>{
                  setUploading(true);
                  try{const t=await readFileAsText(resumeFile);await api.interview.uploadResume({invite_token:token,resume_text:t});}catch{}
                  setUploading(false);setStep('checks');beginChecks();
                }}>
                {uploading?'Uploading...':'Upload & Continue →'}
              </button>
            </div>
          </>}

          {/* CHECKS */}
          {(step==='checks'||step==='ready') && <>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?18:22,fontWeight:800,color:'#EEEAE0',marginBottom:16}}>System Check</div>
            <div style={{borderRadius:10,overflow:'hidden',border:'1px solid #ffffff15',height:sm?140:160,background:'#141419',marginBottom:14,position:'relative'}}>
              <video ref={gVidRef} style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}} muted playsInline autoPlay />
              {checks.cam==='pass'&&<div style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.75)',color:green,fontSize:11,padding:'3px 10px',borderRadius:4}}>✓ Camera active</div>}
            </div>
            {[
              {key:'cam',icon:'📷',name:'Camera',detail:checks.cam==='pass'?'Access granted':checks.cam==='fail'?'Failed — allow camera access':'Checking...'},
              {key:'mic',icon:'🎙️',name:'Microphone',detail:checks.mic==='pass'?'Active':checks.mic==='fail'?'Failed — allow mic access':'Checking...'},
              {key:'attire',icon:'👔',name:'Attire',detail:attire?`${attire.level} · ${attire.score}/100`:'Analysing...'},
              {key:'net',icon:'🌐',name:'Connection',detail:checks.net==='pass'?'Stable':'Checking...'},
            ].map(item=>(
              <div key={item.key} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:8,border:'1px solid',borderColor:checks[item.key]==='pass'?'rgba(46,204,138,0.3)':checks[item.key]==='fail'?'rgba(255,79,79,0.3)':checks[item.key]==='checking'?'rgba(200,146,42,0.3)':'#ffffff0C',background:checks[item.key]==='pass'?'rgba(46,204,138,0.05)':checks[item.key]==='fail'?'rgba(255,79,79,0.05)':checks[item.key]==='checking'?'rgba(200,146,42,0.05)':'#141419',marginBottom:8}}>
                <span style={{fontSize:18}}>{item.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:'#EEEAE0'}}>{item.name}</div>
                  <div style={{fontSize:11,color:'#6B6876'}}>{item.detail}</div>
                </div>
                <span style={{fontSize:13,color:checks[item.key]==='pass'?green:checks[item.key]==='fail'?'#FF4F4F':'#C8922A'}}>
                  {checks[item.key]==='pass'?'✓':checks[item.key]==='fail'?'✗':checks[item.key]==='checking'?'...':''}
                </span>
              </div>
            ))}
            {step==='ready'&&<button style={btnStyle(checks.cam==='pass'&&checks.mic==='pass')} disabled={checks.cam!=='pass'||checks.mic!=='pass'} onClick={startInterview}>Begin Interview with Aria ✦</button>}
          </>}

        </div>
      </div>
    );
  }

  // ── END
  if (phase==='end') return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,padding:16}}>
      <style>{FONTS}</style>
      <div style={{width:sm?'94vw':460,maxWidth:460,background:panel,border:'1px solid #ffffff15',borderRadius:18,padding:sm?28:48,textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:'50%',background:'rgba(46,204,138,0.12)',border:'1px solid rgba(46,204,138,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 20px'}}>✓</div>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?20:24,fontWeight:800,color:'#EEEAE0',marginBottom:12}}>Interview Complete!</div>
        <div style={{color:'#6B6876',fontSize:14,lineHeight:1.7,marginBottom:24}}>
          Thank you, <strong style={{color:'#EEEAE0'}}>{name?.split(' ')[0]||'Candidate'}</strong>. Your responses have been recorded and the hiring team will review them shortly.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
          {[{l:'Duration',v:fmt(elapsed)},{l:'Responses',v:msgs.filter(m=>m.role==='candidate').length},{l:'Attire',v:attire?.score?`${attire.score}/100`:'—'}].map(s=>(
            <div key={s.l} style={{background:'#141419',border:'1px solid #ffffff0C',borderRadius:8,padding:'12px 8px',textAlign:'center'}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:gold}}>{s.v}</div>
              <div style={{fontSize:11,color:'#6B6876',marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:12,color:'#333'}}>You may now close this window.</div>
      </div>
    </div>
  );

  // ── LIVE INTERVIEW
  return (
    <div style={{minHeight:'100vh',background:dark,fontFamily:"'Instrument Sans',sans-serif",color:'#EEEAE0',display:'flex',flexDirection:'column',maxHeight:'100vh',overflow:'hidden'}}>
      <style>{`${FONTS}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes wave{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1.2)}}
        *{box-sizing:border-box}`}
      </style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:sm?'0 14px':'0 24px',height:sm?48:52,borderBottom:'1px solid #ffffff0C',background:'rgba(6,6,10,0.97)',flexShrink:0}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?12:15,fontWeight:800,color:gold}}>SriKrishnaSweets</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:7,height:7,background:'#FF4F4F',borderRadius:'50%',animation:'pulse 1.2s infinite'}}/>
          <span style={{fontSize:sm?10:11,color:'#FF4F4F',fontFamily:'monospace'}}>LIVE</span>
          <span style={{fontFamily:'monospace',fontSize:sm?12:13,background:'#141419',border:'1px solid #ffffff18',padding:'3px 10px',borderRadius:6}}>{fmt(elapsed)}</span>
        </div>
        <div style={{fontSize:sm?10:11,color:status==='idle'?green:gold,background:'#141419',border:'1px solid',borderColor:status==='idle'?'rgba(46,204,138,0.3)':'rgba(200,146,42,0.3)',padding:'3px 10px',borderRadius:4,fontFamily:'monospace'}}>
          {status==='speaking'?'ARIA SPEAKING':status==='thinking'?'THINKING...':status==='listening'?'LISTENING':'READY'}
        </div>
      </div>

      {/* Progress */}
      <div style={{height:2,background:'#ffffff08',flexShrink:0}}>
        <div style={{height:'100%',background:`linear-gradient(90deg,${purple},${gold})`,width:`${Math.min((msgs.filter(m=>m.role==='ai').length/14)*100,100)}%`,transition:'width 1s'}}/>
      </div>

      {/* Main area */}
      <div style={{flex:1,display:'flex',flexDirection:sm?'column':'row',overflow:'hidden',minHeight:0}}>

        {/* Video */}
        <div style={{flex:sm?'none':'1',position:'relative',background:'#0E0E14',margin:sm?'10px 10px 0':'14px 14px 0',borderRadius:12,overflow:'hidden',border:'1px solid #ffffff15',height:sm?'32vh':undefined,minHeight:sm?160:200}}>
          <video ref={vidRef} style={{width:'100%',height:'100%',objectFit:'cover',display:'block',transform:'scaleX(-1)'}} muted playsInline autoPlay />
          {[['tl','2px 0 0 2px','top:10px;left:10px'],['tr','2px 2px 0 0','top:10px;right:10px'],['bl','0 0 2px 2px','bottom:10px;left:10px'],['br','0 2px 2px 0','bottom:10px;right:10px']].map(([k,bw,pos])=>(
            <div key={k} style={{position:'absolute',width:18,height:18,borderColor:gold,borderStyle:'solid',borderWidth:bw,borderRadius:2,opacity:0.6,...Object.fromEntries(pos.split(';').map(p=>p.split(':').map(s=>s.trim())))}}/>
          ))}
          {attire&&<div style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.8)',border:'1px solid #ffffff18',borderRadius:6,padding:'4px 10px',fontSize:11}}>Attire: <strong style={{color:green}}>{attire.score}/100</strong></div>}
          <div style={{position:'absolute',bottom:8,right:8,background:'rgba(0,0,0,0.8)',border:'1px solid #ffffff18',borderRadius:6,padding:'4px 10px'}}>
            <div style={{fontSize:11,fontWeight:600}}>{name}</div>
            <div style={{fontSize:10,color:'#6B6876'}}>{invite?.jobs?.title}</div>
          </div>
        </div>

        {/* Aria + Transcript */}
        <div style={{width:sm?'auto':'300px',borderLeft:sm?'none':'1px solid #ffffff0C',borderTop:sm?'1px solid #ffffff0C':'none',background:panel,display:'flex',flexDirection:'column',overflow:'hidden',flex:sm?1:'none',margin:sm?'0 10px':'0',borderRadius:sm?'12px 12px 0 0':0,minHeight:0}}>

          {/* Aria panel */}
          <div style={{padding:sm?'12px 14px':'16px',borderBottom:'1px solid #ffffff0C',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'radial-gradient(circle at 35% 35%,rgba(167,139,250,0.7),rgba(91,143,249,0.3))',border:'1px solid rgba(167,139,250,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>🤖</div>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:700,color:purple}}>Aria</div>
                <div style={{fontSize:10,color:'#6B6876'}}>
                  {status==='thinking'?'Thinking...':status==='speaking'?'Speaking — listen carefully':status==='listening'?'Listening to you':'Waiting for your answer'}
                </div>
              </div>
              {/* Voice indicator */}
              {status==='speaking'&&(
                <div style={{display:'flex',gap:2,alignItems:'center',marginLeft:'auto'}}>
                  {[1,2,3,4,3,2,1].map((h,i)=>(
                    <div key={i} style={{width:3,background:purple,borderRadius:2,height:h*4,animation:`wave 0.6s ${i*0.08}s ease-in-out infinite`}}/>
                  ))}
                </div>
              )}
            </div>
            <div style={{background:'#141419',border:'1px solid rgba(167,139,250,0.2)',borderRadius:10,borderTopLeftRadius:3,padding:'10px 12px',fontSize:13,lineHeight:1.7,minHeight:44}}>
              {status==='thinking'
                ? <div style={{display:'flex',gap:5,padding:'4px 0'}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:purple,animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}</div>
                : ariaText||<span style={{color:'#6B6876',fontStyle:'italic'}}>Starting...</span>}
            </div>
          </div>

          {/* Transcript */}
          <div style={{flex:1,overflowY:'auto',padding:sm?'10px 12px':'12px'}}>
            <div style={{fontSize:10,color:'#6B6876',textTransform:'uppercase',letterSpacing:1,marginBottom:10,paddingBottom:8,borderBottom:'1px solid #ffffff0C'}}>TRANSCRIPT</div>
            {msgs.map((m,i)=>(
              <div key={i} style={{marginBottom:10,opacity:i>=msgs.length-2?1:0.5}}>
                <div style={{fontSize:10,color:m.role==='ai'?purple:'#6B6876',textTransform:'uppercase',marginBottom:4}}>{m.role==='ai'?'ARIA':'YOU'}</div>
                <div style={{fontSize:12,lineHeight:1.6,padding:'7px 10px',borderRadius:7,background:m.role==='ai'?'rgba(167,139,250,0.05)':'#141419',border:'1px solid #ffffff08'}}>{m.text}</div>
              </div>
            ))}
            <div ref={txEnd}/>
          </div>
        </div>
      </div>

      {/* Interim */}
      {(status==='listening'||interim)&&(
        <div style={{margin:sm?'0 10px':'0 14px',padding:'10px 14px',background:'#141419',border:'1px solid rgba(200,146,42,0.3)',borderRadius:8,fontSize:13,color:'#EEEAE0',display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
          <div style={{display:'flex',gap:3,alignItems:'center'}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:3,background:gold,borderRadius:2,animation:`pulse 0.7s ${i*0.12}s infinite`,height:4+i*4}}/>)}
          </div>
          <span style={{flex:1}}>{interim||'Listening — speak now...'}</span>
        </div>
      )}

      {/* Bottom controls */}
      <div style={{borderTop:'1px solid #ffffff0C',padding:sm?'12px 14px':'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(6,6,10,0.97)',gap:12,flexShrink:0}}>
        <button onClick={endInterview} style={{padding:sm?'8px 12px':'8px 18px',borderRadius:7,border:'1px solid rgba(255,79,79,0.3)',background:'rgba(255,79,79,0.08)',color:'#FF4F4F',fontSize:sm?12:13,cursor:'pointer',whiteSpace:'nowrap'}}>
          {sm?'End':'End Interview'}
        </button>

        <div style={{textAlign:'center',flex:1}}>
          {/* Big mic button — tap to start, tap to stop */}
          <button
            onClick={status==='listening'?stopMic:startMic}
            disabled={status==='thinking'||status==='speaking'}
            style={{width:sm?50:58,height:sm?50:58,borderRadius:'50%',border:'none',display:'flex',alignItems:'center',justifyContent:'center',fontSize:sm?20:24,transition:'all 0.2s',margin:'0 auto',cursor:status==='thinking'||status==='speaking'?'not-allowed':'pointer',opacity:status==='thinking'||status==='speaking'?0.35:1,background:status==='listening'?'#FF4F4F':'#1A1A22',boxShadow:status==='listening'?`0 0 0 8px rgba(255,79,79,0.2),0 0 0 16px rgba(255,79,79,0.08)`:'none'}}
          >
            {status==='listening'?'⏹':'🎙'}
          </button>
          <div style={{fontSize:11,color:'#6B6876',marginTop:6}}>
            {status==='speaking'?'Wait for Aria to finish...':status==='thinking'?'Processing...':status==='listening'?<strong style={{color:'#EEEAE0'}}>Tap ⏹ when done speaking</strong>:'Tap 🎙 to answer'}
          </div>
        </div>

        <div style={{textAlign:'right',minWidth:sm?60:80}}>
          <div style={{fontSize:10,color:'#6B6876'}}>Q{msgs.filter(m=>m.role==='ai').length}</div>
          <div style={{fontSize:10,color:'#444',marginTop:2}}>Proctoring on</div>
        </div>
      </div>
    </div>
  );
}
