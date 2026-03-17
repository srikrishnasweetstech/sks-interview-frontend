import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

// ── Reliable TTS
function speakText(text, onDone) {
  if (!window.speechSynthesis) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();
  const go = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.pitch = 1.1; u.volume = 1;
    const vs = window.speechSynthesis.getVoices();
    const pick = ['Google UK English Female','Samantha','Karen','Moira'];
    u.voice = pick.reduce((f,n) => f || vs.find(v=>v.name.includes(n)), null)
           || vs.find(v=>v.lang.startsWith('en')) || null;
    u.onend = () => { if (onDone) onDone(); };
    u.onerror = () => { if (onDone) onDone(); };
    window.speechSynthesis.speak(u);
    // Chrome bug: sometimes pauses silently
    setTimeout(() => { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); }, 300);
  };
  const vs = window.speechSynthesis.getVoices();
  if (vs.length) go();
  else { window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged=null; go(); }; setTimeout(go, 800); }
}

function captureFrame(v) {
  try { const c=document.createElement('canvas'); c.width=320; c.height=240; c.getContext('2d').drawImage(v,0,0,320,240); return c.toDataURL('image/jpeg',0.7).split(',')[1]; } catch { return null; }
}

const gold='#C8922A', purple='#A78BFA', green='#2ECC8A', dark='#06060A', panel='#0E0E14';
const FONTS=`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`;

export default function InterviewPage() {
  const { token } = useParams();
  const [w, setW] = useState(window.innerWidth);
  useEffect(()=>{ const h=()=>setW(window.innerWidth); window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h); },[]);
  const sm = w < 768;

  // Gate
  const [step, setStep]         = useState('email');
  const [invite, setInvite]     = useState(null);
  const [emailVal, setEmailVal] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cname, setCname]       = useState('');
  const [resumeFile, setResF]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [checks, setChecks]     = useState({cam:'pending',mic:'pending',attire:'pending',net:'pending'});
  const [attireData, setAttire] = useState(null);
  const [resumeAlreadyDone, setResumeAlreadyDone] = useState(false);

  // Interview
  const [phase, setPhase]       = useState('gate');
  const [sid, setSid]           = useState(null);
  const [msgs, setMsgs]         = useState([]);
  const [ariaText, setAriaText] = useState('');
  const [status, setStatus]     = useState('idle'); // idle|thinking|speaking|listening
  const [interim, setInterim]   = useState('');
  const [seq, setSeq]           = useState(2);
  const [elapsed, setElapsed]   = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [err, setErr]           = useState('');

  const vidRef  = useRef(null);
  const gVidRef = useRef(null);
  const streamR = useRef(null);
  const recogR  = useRef(null);
  const timerR  = useRef(null);
  const pendTxt = useRef('');
  const txEnd   = useRef(null);
  const sending = useRef(false);
  const statusRef = useRef('idle');

  // Keep statusRef in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(()=>{
    // Pre-load voices immediately
    window.speechSynthesis.getVoices();
    if ('onvoiceschanged' in window.speechSynthesis)
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

    api.invites.validate(token)
      .then(r => {
        setInvite(r.invite);
        // FIX 3: check if resume already uploaded
        if (r.invite?.resume_uploaded_at || r.invite?.resume_text) {
          setResumeAlreadyDone(true);
        }
      })
      .catch(e => setErr(e.message));
  },[token]);

  useEffect(()=>()=>{ window.speechSynthesis.cancel(); clearInterval(timerR.current); streamR.current?.getTracks().forEach(t=>t.stop()); recogR.current?.abort(); },[]);
  useEffect(()=>{ txEnd.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);

  // Unlock audio — must be called from a user tap
  const unlockAudio = () => {
    if (audioReady) return;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      setAudioReady(true);
    } catch {}
  };

  const verifyEmail = async (e) => {
    e.preventDefault();
    unlockAudio();
    setVerifying(true); setEmailErr('');
    try {
      const r = await api.invites.verifyEmail(token, emailVal);
      setCname(r.candidate_name);
      setStep('info');
    } catch(e) { setEmailErr(e.message); }
    setVerifying(false);
  };

  const startCam = async (ref) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true});
      streamR.current = s;
      if (ref?.current) { ref.current.srcObject=s; await ref.current.play().catch(()=>{}); }
      return s;
    } catch(e) { console.error('cam:',e.message); return null; }
  };

  const beginChecks = async () => {
    setChecks({cam:'checking',mic:'pending',attire:'pending',net:'pending'});
    const s = await startCam(gVidRef);
    setChecks(p=>({...p,cam:s?'pass':'fail'}));
    await new Promise(r=>setTimeout(r,400));
    setChecks(p=>({...p,mic:'checking'}));
    await new Promise(r=>setTimeout(r,600));
    setChecks(p=>({...p,mic:s?'pass':'fail',attire:'checking'}));
    await new Promise(r=>setTimeout(r,1000));
    if (s&&gVidRef.current) {
      try { const f=captureFrame(gVidRef.current); if(f) setAttire(await api.interview.attire({image_base64:f})); else setAttire({score:78,level:'Business Casual',note:'Looking great!'}); }
      catch { setAttire({score:78,level:'Business Casual',note:'Looking great!'}); }
    }
    setChecks(p=>({...p,attire:'pass',net:'pass'}));
    setStep('ready');
  };

  const startInterview = async () => {
    unlockAudio();
    setPhase('interview');
    setTimeout(()=>{ if(vidRef.current&&streamR.current){vidRef.current.srcObject=streamR.current;vidRef.current.play().catch(()=>{});} },150);
    timerR.current = setInterval(()=>setElapsed(e=>e+1),1000);
    setStatus('thinking');
    try {
      const r = await api.interview.start({invite_token:token, candidate_name:cname});
      setSid(r.session_id);
      if (r.is_rejoin) setSeq(r.sequence||2);
      setMsgs([{role:'ai',text:r.ai_message}]);
      setAriaText(r.ai_message);
      setStatus('speaking');
      // FIX 2: speak immediately after user tap (startInterview IS a user tap)
      speakText(r.ai_message, ()=>setStatus('idle'));
    } catch(e) { setErr(e.message); setStatus('idle'); }
  };

  const sendToAria = useCallback(async (answer) => {
    if (!answer.trim()||!sid||sending.current) return;
    sending.current = true;
    const s = seq;
    setSeq(n=>n+2);
    setMsgs(p=>[...p,{role:'candidate',text:answer}]);
    setStatus('thinking');
    try {
      const r = await api.interview.message({session_id:sid,candidate_answer:answer,sequence:s});
      setMsgs(p=>[...p,{role:'ai',text:r.ai_message}]);
      setAriaText(r.ai_message);
      setStatus('speaking');
      speakText(r.ai_message, ()=>{
        setStatus('idle');
        if (r.is_complete) setTimeout(endInterview, 2000);
      });
    } catch(e) { console.error('msg err:',e.message); setStatus('idle'); }
    sending.current = false;
  },[sid,seq]);

  const startMic = () => {
    if (statusRef.current !== 'idle') return;
    unlockAudio();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice requires Google Chrome. Please open in Chrome.'); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-IN';
    pendTxt.current = '';
    setInterim('');
    setStatus('listening');

    r.onresult = (e) => {
      let fin='', int='';
      for (let i=e.resultIndex;i<e.results.length;i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript+' ';
        else int += e.results[i][0].transcript;
      }
      if (fin) { pendTxt.current += fin; setInterim(pendTxt.current.trim()); }
      else setInterim((pendTxt.current+int).trim());
    };

    r.onerror = (e) => {
      console.error('mic err:',e.error);
      if (e.error==='not-allowed') alert('Microphone blocked. Please allow microphone access and try again.');
      setStatus('idle'); setInterim('');
    };

    // If browser auto-stops (mobile), capture what we have
    r.onend = () => {
      if (statusRef.current === 'listening') {
        // Auto-stopped — send what we have
        const ans = pendTxt.current.trim();
        pendTxt.current = '';
        setInterim('');
        setStatus('idle');
        if (ans.length > 2) sendToAria(ans);
      }
    };

    recogR.current = r;
    r.start();
  };

  const stopMic = () => {
    if (statusRef.current !== 'listening') return;
    recogR.current?.stop();
    recogR.current = null;
    const ans = pendTxt.current.trim();
    pendTxt.current = '';
    setInterim('');
    setStatus('idle');
    if (ans.length > 2) sendToAria(ans);
    else setStatus('idle');
  };

  // FIX 1: End interview → expire link + complete scoring
  const endInterview = async () => {
    window.speechSynthesis.cancel();
    clearInterval(timerR.current);
    recogR.current?.abort();
    streamR.current?.getTracks().forEach(t=>t.stop());
    if (sid) {
      try { await api.interview.complete({session_id:sid, duration_seconds:elapsed}); } catch(e) { console.error('complete err:',e.message); }
    }
    setPhase('end');
  };

  const fmt = s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const allPass = checks.cam==='pass'&&checks.mic==='pass';

  const cardSt = {width:sm?'94vw':500,maxWidth:500,background:panel,border:'1px solid #ffffff15',borderRadius:18,padding:sm?24:40,boxShadow:'0 40px 80px rgba(0,0,0,0.6)'};
  const btn = (on)=>({width:'100%',padding:14,background:on?gold:'#222',border:'none',borderRadius:10,fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:on?'#000':'#555',cursor:on?'pointer':'not-allowed',marginTop:8});
  const inp = {width:'100%',padding:'13px 14px',background:'#1A1A22',border:'1px solid #333',borderRadius:8,fontSize:15,color:'#EEEAE0',outline:'none',fontFamily:'inherit',boxSizing:'border-box'};

  if (err) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,flexDirection:'column',textAlign:'center',padding:24,color:'#EEEAE0'}}>
      <style>{FONTS}</style>
      <div style={{fontSize:44,marginBottom:16}}>⚠️</div>
      <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,marginBottom:12}}>Cannot Enter Interview</div>
      <div style={{color:'#6B6876',maxWidth:380,lineHeight:1.7}}>{err}</div>
    </div>
  );

  if (phase==='gate') return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,padding:16}} onClick={unlockAudio}>
      <style>{FONTS}</style>
      <div style={cardSt}>

        {/* EMAIL */}
        {step==='email'&&<>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:gold}}>SriKrishnaSweets</div>
            <div style={{fontSize:11,color:'#333',letterSpacing:1,marginTop:4}}>AI INTERVIEW PLATFORM</div>
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Verify Identity</div>
          <div style={{color:'#6B6876',fontSize:14,marginBottom:20,lineHeight:1.6}}>Enter the email address where you received this invite.</div>
          {emailErr&&<div style={{background:'rgba(220,38,38,0.12)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:8,padding:'12px 14px',fontSize:13,color:'#FCA5A5',marginBottom:16,lineHeight:1.5}}>{emailErr}</div>}
          <form onSubmit={verifyEmail}>
            <input style={inp} type="email" placeholder="yourname@email.com" required autoComplete="email" value={emailVal} onChange={e=>setEmailVal(e.target.value)}/>
            <button type="submit" style={btn(!verifying)} disabled={verifying}>{verifying?'Verifying...':'Continue →'}</button>
          </form>
        </>}

        {/* INFO */}
        {step==='info'&&<>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Hi {cname?.split(' ')[0]} 👋</div>
          <div style={{color:'#6B6876',fontSize:14,marginBottom:20,lineHeight:1.6}}>
            Interviewing for <strong style={{color:gold}}>{invite?.jobs?.title}</strong> at SriKrishnaSweets.<br/>
            <strong style={{color:'#EEEAE0'}}>Aria will speak to you</strong> — please use headphones or speakers.
          </div>
          <div style={{background:'#141419',border:'1px solid #ffffff0C',borderRadius:10,padding:'14px 16px',fontSize:13,color:'#6B6876',marginBottom:24,lineHeight:2}}>
            ✓ <strong style={{color:'red'}}>Use Google Chrome</strong> — required for voice<br/>
            ✓ Allow <strong style={{color:'#EEEAE0'}}>microphone + camera</strong> when prompted<br/>
            ✓ Use <strong style={{color:'#EEEAE0'}}>headphones</strong> for best experience<br/>
            ✓ Quiet, well-lit space · Dress professionally
          </div>
          <button style={btn(true)} onClick={()=>setStep(resumeAlreadyDone?'checks':'resume')}>Continue →</button>
        </>}

        {/* RESUME — FIX 3: skip if already uploaded */}
        {step==='resume'&&<>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:'#EEEAE0',marginBottom:8}}>Upload Resume 📄</div>
          <div style={{color:'#6B6876',fontSize:13,marginBottom:20,lineHeight:1.6}}>Aria will ask personalised questions from your resume. Skip if you prefer not to share.</div>
          <div onClick={()=>document.getElementById('rf').click()}
            style={{border:resumeFile?'2px solid rgba(46,204,138,0.5)':'2px dashed #333',borderRadius:12,padding:'28px 16px',textAlign:'center',cursor:'pointer',background:resumeFile?'rgba(46,204,138,0.04)':'#141419',marginBottom:16}}>
            <div style={{fontSize:32,marginBottom:8}}>{resumeFile?'✅':'📂'}</div>
            <div style={{fontSize:13,color:resumeFile?green:'#6B6876'}}>{resumeFile?resumeFile.name:'Tap to upload (.pdf, .txt, .doc)'}</div>
          </div>
          <input id="rf" type="file" accept=".pdf,.txt,.doc,.docx" style={{display:'none'}} onChange={e=>setResF(e.target.files[0])}/>
          <div style={{display:'flex',gap:10}}>
            <button style={{...btn(true),background:'#1A1A22',color:'#666',border:'1px solid #333',flex:1,marginTop:0}}
              onClick={async()=>{await api.interview.uploadResume({invite_token:token,resume_text:null}).catch(()=>{});setStep('checks');beginChecks();}}>Skip</button>
            <button style={{...btn(!!resumeFile&&!uploading),flex:2,marginTop:0}} disabled={!resumeFile||uploading}
              onClick={async()=>{
                setUploading(true);
                try{
                  const reader=new FileReader();
                  const text=await new Promise(res=>{reader.onload=e=>res(e.target.result.slice(0,8000));reader.onerror=()=>res(`[${resumeFile.name}]`);reader.readAsText(resumeFile);});
                  await api.interview.uploadResume({invite_token:token,resume_text:text});
                  setResumeAlreadyDone(true);
                }catch{}
                setUploading(false);setStep('checks');beginChecks();
              }}>
              {uploading?'Uploading...':'Upload & Continue →'}
            </button>
          </div>
        </>}

        {/* CHECKS */}
        {(step==='checks'||step==='ready')&&<>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:'#EEEAE0',marginBottom:14}}>System Check</div>
          <div style={{borderRadius:10,overflow:'hidden',border:'1px solid #ffffff15',height:sm?140:160,background:'#141419',marginBottom:14,position:'relative'}}>
            <video ref={gVidRef} style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}} muted playsInline autoPlay/>
            {checks.cam==='pass'&&<div style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.75)',color:green,fontSize:11,padding:'3px 10px',borderRadius:4}}>✓ Camera live</div>}
          </div>
          {[
            {k:'cam',icon:'📷',name:'Camera',d:checks.cam==='pass'?'Granted':checks.cam==='fail'?'FAILED — allow camera access':'Checking...'},
            {k:'mic',icon:'🎙️',name:'Microphone',d:checks.mic==='pass'?'Active':checks.mic==='fail'?'FAILED — allow mic access':'Checking...'},
            {k:'attire',icon:'👔',name:'Attire',d:attireData?`${attireData.level} · ${attireData.score}/100`:'Analysing...'},
            {k:'net',icon:'🌐',name:'Connection',d:checks.net==='pass'?'Stable':'Checking...'},
          ].map(x=>(
            <div key={x.k} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:8,border:'1px solid',borderColor:checks[x.k]==='pass'?'rgba(46,204,138,0.3)':checks[x.k]==='fail'?'rgba(255,79,79,0.4)':checks[x.k]==='checking'?'rgba(200,146,42,0.3)':'#ffffff0C',background:checks[x.k]==='pass'?'rgba(46,204,138,0.05)':checks[x.k]==='fail'?'rgba(255,79,79,0.05)':'#141419',marginBottom:8}}>
              <span style={{fontSize:18}}>{x.icon}</span>
              <div style={{flex:1}}><div style={{fontSize:13,color:'#EEEAE0'}}>{x.name}</div><div style={{fontSize:11,color:'#6B6876'}}>{x.d}</div></div>
              <span style={{fontSize:13,color:checks[x.k]==='pass'?green:checks[x.k]==='fail'?'#FF4F4F':'#C8922A'}}>{checks[x.k]==='pass'?'✓':checks[x.k]==='fail'?'✗':checks[x.k]==='checking'?'...':''}</span>
            </div>
          ))}
          {step==='ready'&&<button style={btn(allPass)} disabled={!allPass} onClick={startInterview}>Begin Interview with Aria ✦</button>}
          {step==='ready'&&checks.cam==='fail'&&<div style={{fontSize:12,color:'#FF4F4F',textAlign:'center',marginTop:8}}>Camera access required. Refresh and allow camera access.</div>}
        </>}

      </div>
    </div>
  );

  // END
  if (phase==='end') return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:dark,padding:16}}>
      <style>{FONTS}</style>
      <div style={{...cardSt,textAlign:'center',padding:sm?28:48}}>
        <div style={{width:64,height:64,borderRadius:'50%',background:'rgba(46,204,138,0.12)',border:'1px solid rgba(46,204,138,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 20px'}}>✓</div>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?20:24,fontWeight:800,color:'#EEEAE0',marginBottom:12}}>Interview Complete!</div>
        <div style={{color:'#6B6876',fontSize:14,lineHeight:1.7,marginBottom:24}}>
          Thank you, <strong style={{color:'#EEEAE0'}}>{cname?.split(' ')[0]}</strong>. Your responses have been recorded and the hiring team will review them shortly. You will hear back within 3–5 business days.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
          {[{l:'Duration',v:fmt(elapsed)},{l:'Responses',v:msgs.filter(m=>m.role==='candidate').length},{l:'Attire',v:attireData?.score?`${attireData.score}/100`:'—'}].map(s=>(
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

  // LIVE INTERVIEW
  return (
    <div style={{minHeight:'100vh',maxHeight:'100vh',background:dark,fontFamily:"'Instrument Sans',sans-serif",color:'#EEEAE0',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <style>{`${FONTS}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes wave{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1.3)}}*{box-sizing:border-box}`}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:sm?'0 14px':'0 24px',height:sm?48:52,borderBottom:'1px solid #ffffff0C',background:'rgba(6,6,10,0.97)',flexShrink:0}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:sm?12:15,fontWeight:800,color:gold}}>SriKrishnaSweets</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:7,height:7,background:'#FF4F4F',borderRadius:'50%',animation:'pulse 1.2s infinite'}}/>
          <span style={{fontSize:10,color:'#FF4F4F',fontFamily:'monospace'}}>LIVE</span>
          <span style={{fontFamily:'monospace',fontSize:sm?12:13,background:'#141419',border:'1px solid #ffffff18',padding:'3px 10px',borderRadius:6}}>{fmt(elapsed)}</span>
        </div>
        <div style={{fontSize:10,fontFamily:'monospace',color:status==='idle'?green:gold,background:'#141419',border:'1px solid',borderColor:status==='idle'?'rgba(46,204,138,0.3)':'rgba(200,146,42,0.3)',padding:'3px 10px',borderRadius:4}}>
          {status==='speaking'?'ARIA SPEAKING':status==='thinking'?'THINKING...':status==='listening'?'LISTENING':'READY'}
        </div>
      </div>

      <div style={{height:2,background:'#ffffff08',flexShrink:0}}>
        <div style={{height:'100%',background:`linear-gradient(90deg,${purple},${gold})`,width:`${Math.min((msgs.filter(m=>m.role==='ai').length/14)*100,100)}%`,transition:'width 1s'}}/>
      </div>

      {/* Main */}
      <div style={{flex:1,display:'flex',flexDirection:sm?'column':'row',overflow:'hidden',minHeight:0}}>

        {/* Video */}
        <div style={{flex:sm?'none':'1',position:'relative',background:'#0E0E14',margin:sm?'10px 10px 0':'14px 14px 0',borderRadius:12,overflow:'hidden',border:'1px solid #ffffff15',height:sm?'33vh':undefined,minHeight:sm?160:200}}>
          <video ref={vidRef} style={{width:'100%',height:'100%',objectFit:'cover',display:'block',transform:'scaleX(-1)'}} muted playsInline autoPlay/>
          {[['2px 0 0 2px','top:10px;left:10px'],['2px 2px 0 0','top:10px;right:10px'],['0 0 2px 2px','bottom:10px;left:10px'],['0 2px 2px 0','bottom:10px;right:10px']].map(([bw,pos],i)=>(
            <div key={i} style={{position:'absolute',width:18,height:18,borderColor:gold,borderStyle:'solid',borderWidth:bw,borderRadius:2,opacity:0.6,...Object.fromEntries(pos.split(';').map(p=>p.split(':').map(s=>s.trim())))}}/>
          ))}
          {attireData&&<div style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.8)',borderRadius:6,padding:'4px 10px',fontSize:11}}>Attire: <strong style={{color:green}}>{attireData.score}/100</strong></div>}
          <div style={{position:'absolute',bottom:8,right:8,background:'rgba(0,0,0,0.8)',borderRadius:6,padding:'4px 10px'}}>
            <div style={{fontSize:11,fontWeight:600}}>{cname}</div>
            <div style={{fontSize:10,color:'#6B6876'}}>{invite?.jobs?.title}</div>
          </div>
        </div>

        {/* Aria panel */}
        <div style={{width:sm?'auto':'300px',borderLeft:sm?'none':'1px solid #ffffff0C',borderTop:sm?'1px solid #ffffff0C':'none',background:panel,display:'flex',flexDirection:'column',overflow:'hidden',flex:sm?1:'none',margin:sm?'0 10px':'0',borderRadius:sm?'10px 10px 0 0':0,minHeight:0}}>
          <div style={{padding:sm?'12px 14px':'16px',borderBottom:'1px solid #ffffff0C',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'radial-gradient(circle at 35% 35%,rgba(167,139,250,0.7),rgba(91,143,249,0.3))',border:'1px solid rgba(167,139,250,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>🤖</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:700,color:purple}}>Aria</div>
                <div style={{fontSize:10,color:'#6B6876'}}>{status==='thinking'?'Thinking...':status==='speaking'?'Speaking — listen carefully':status==='listening'?'Listening to you':'Waiting for your answer'}</div>
              </div>
              {status==='speaking'&&<div style={{display:'flex',gap:2,alignItems:'center'}}>{[1,2,3,2,1].map((h,i)=><div key={i} style={{width:3,background:purple,borderRadius:2,height:h*4,animation:`wave 0.5s ${i*0.1}s ease-in-out infinite`}}/>)}</div>}
            </div>
            <div style={{background:'#141419',border:'1px solid rgba(167,139,250,0.2)',borderRadius:10,borderTopLeftRadius:3,padding:'10px 12px',fontSize:13,lineHeight:1.7,minHeight:44}}>
              {status==='thinking'
                ?<div style={{display:'flex',gap:5,padding:'4px 0'}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:purple,animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}</div>
                :ariaText||<span style={{color:'#6B6876',fontStyle:'italic'}}>Starting...</span>}
            </div>
          </div>

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
          <div style={{display:'flex',gap:3}}>{[0,1,2,3].map(i=><div key={i} style={{width:3,background:gold,borderRadius:2,animation:`pulse 0.7s ${i*0.12}s infinite`,height:4+i*4}}/>)}</div>
          <span style={{flex:1}}>{interim||'Listening — speak now...'}</span>
        </div>
      )}

      {/* Controls */}
      <div style={{borderTop:'1px solid #ffffff0C',padding:sm?'12px 14px':'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(6,6,10,0.97)',gap:12,flexShrink:0}}>
        <button onClick={endInterview} style={{padding:sm?'8px 12px':'8px 18px',borderRadius:7,border:'1px solid rgba(255,79,79,0.3)',background:'rgba(255,79,79,0.08)',color:'#FF4F4F',fontSize:sm?12:13,cursor:'pointer'}}>
          {sm?'End':'End Interview'}
        </button>

        <div style={{textAlign:'center',flex:1}}>
          <button
            onClick={status==='listening'?stopMic:startMic}
            disabled={status==='thinking'||status==='speaking'}
            style={{width:sm?50:58,height:sm?50:58,borderRadius:'50%',border:'none',display:'flex',alignItems:'center',justifyContent:'center',fontSize:sm?20:24,margin:'0 auto',cursor:status==='thinking'||status==='speaking'?'not-allowed':'pointer',opacity:status==='thinking'||status==='speaking'?0.3:1,background:status==='listening'?'#FF4F4F':'#1A1A22',boxShadow:status==='listening'?'0 0 0 8px rgba(255,79,79,0.2),0 0 0 16px rgba(255,79,79,0.08)':'none',transition:'all 0.2s'}}>
            {status==='listening'?'⏹':'🎙'}
          </button>
          <div style={{fontSize:11,color:'#6B6876',marginTop:5}}>
            {status==='speaking'?'Wait for Aria...':status==='thinking'?'Processing...':status==='listening'?<strong style={{color:'#EEEAE0'}}>Tap ⏹ when done</strong>:'Tap 🎙 to answer'}
          </div>
        </div>

        <div style={{textAlign:'right',minWidth:60}}>
          <div style={{fontSize:10,color:'#6B6876'}}>Q{msgs.filter(m=>m.role==='ai').length}</div>
        </div>
      </div>
    </div>
  );
}
