/* AELAA Accreditation gate: shared sign-in and access check for every page in the Accreditation area.
   Access = signed in + on the member list + membership paid through today or later
            + $500 Accreditation donation paid through today or later (admins always pass).
   The database enforces the same rule (has_accreditation() in aelaa-setup/accreditation.sql);
   this file only decides what the visitor sees.

   Page requirements: <section id="gate"><div id="panel"></div></section> somewhere in the body,
   and the supabase-js script loaded before this file.
   Usage: AELAAGate.start({ title: 'Page name', onReady: async (sb, me) => { ... } }); */
(function(){
'use strict';
const CONFIG={
  supabaseUrl:'https://klovxeutlqrsgdrbkgpm.supabase.co',
  supabaseAnonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsb3Z4ZXV0bHFyc2dkcmJrZ3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyOTk2MjMsImV4cCI6MjExMDg3NTYyM30.pArb7kEohW1QOIliudpComam0G4j9BvZQKmigJFGvcQ',
  joinUrl:'https://aelaa.org/#membership',
  graderUrl:'https://grader.aelaa.org',
  // The public link of the $500 Accreditation donation form on Zeffy ("AELAA Accreditation").
  // If it is ever emptied, visitors are asked to email AELAA instead.
  donateUrl:'https://www.zeffy.com/en-US/donation-form/aelaa-accreditation',
  contactEmail:'contactaelaa@gmail.com',
  donation:'$500'
};
let sb=null, me=null, opts={};
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e;};
const todayISO=()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const fmtDate=iso=>new Date(iso+'T00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});

function show(mode,o){
  o=o||{};
  if(opts.onLock) opts.onLock();
  const gate=$('#gate'); gate.hidden=false;
  const p=$('#panel'); p.replaceChildren();
  const h=t=>p.append(el('h1',null,t));
  const para=(t,c)=>{const x=el('p',c,t); p.append(x); return x;};
  const link=(text,href)=>{const a=el('a',null,text); a.href=href; return a;};
  const back=()=>{const b=el('button','linkbtn','Back to sign in'); b.type='button'; b.onclick=()=>show('signin'); p.append(b);};
  const outBtn=()=>{const b=el('button','btn ghost','Sign out'); b.type='button'; b.onclick=signOut; p.append(b);};
  if(mode==='loading'){ h(opts.title||'AELAA Accreditation'); para('Checking your sign-in…'); return; }
  if(mode==='signin'||mode==='reset'||mode==='newpw'){
    h({signin:opts.title||'AELAA Accreditation',reset:'Reset your password',newpw:'Choose a new password'}[mode]);
    if(mode==='signin') para('For AELAA members with an Accreditation donation. Sign in with the same email and password as your AELAA Grader account.');
    const f=el('form','stack');
    const field=(label,id,type,ac)=>{const l=el('label','f',label); const i=el('input'); i.id=id; i.type=type; i.required=true; i.autocomplete=ac; if(mode==='newpw') i.minLength=8; l.append(i); f.append(l); return i;};
    let em,pw,pw2;
    if(mode!=='newpw') em=field('Email','gEmail','email','email');
    if(mode==='signin') pw=field('Password','gPw','password','current-password');
    if(mode==='newpw'){ pw=field('New password (at least 8 characters)','gPw','password','new-password'); pw2=field('Confirm new password','gPw2','password','new-password'); }
    if(em&&o.email) em.value=o.email;
    if(o.err) f.append(el('p','err',o.err));
    const sub=el('button','btn',{signin:'Sign in',reset:'Email me a reset link',newpw:'Save new password'}[mode]); sub.type='submit'; f.append(sub);
    f.onsubmit=async e=>{
      e.preventDefault(); sub.disabled=true;
      const email=em?em.value.trim().toLowerCase():'';
      try{
        if(mode==='signin'){ const {data,error}=await sb.auth.signInWithPassword({email,password:pw.value}); if(error) throw error; await check(data.user); return; }
        if(mode==='reset'){ const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}); if(error) throw error;
          show('message',{title:'Check your email',text:'If '+email+' has an account, a password reset link is on its way. Open it on this device to choose a new password.'}); return; }
        if(mode==='newpw'){ if(pw.value!==pw2.value) throw new Error('The two passwords don’t match.');
          const {data,error}=await sb.auth.updateUser({password:pw.value}); if(error) throw error; await check(data.user); return; }
      }catch(err){ show(mode,{email,err:authError(err)}); }
    };
    p.append(f);
    if(mode==='signin'){
      const r=el('button','linkbtn','Forgot your password?'); r.type='button'; r.onclick=()=>show('reset',{email:em.value}); p.append(r);
      const n=el('p','small','No account yet? Create one on the '); n.append(link('AELAA Grader',CONFIG.graderUrl),' with the email on your membership, then sign in here.'); p.append(n);
    } else back();
    const first=p.querySelector('input'); if(first&&!first.value) first.focus();
    return;
  }
  if(mode==='message'){ h(o.title); para(o.text); back(); return; }
  if(mode==='notmember'){ h('Not on the member list'); para(me.email+' isn’t on the AELAA member list. The Accreditation area is for AELAA members who have also made an Accreditation donation.'); const j=el('p'); j.append(link('Join AELAA',CONFIG.joinUrl)); p.append(j); outBtn(); return; }
  if(mode==='expired'){ h('Membership has ended'); para('The AELAA membership for '+me.email+(me.paid_until?' ended on '+fmtDate(me.paid_until):' has no paid-through date')+'. Renew your membership to use the Accreditation area.'); const j=el('p'); j.append(link('Renew at aelaa.org',CONFIG.joinUrl)); p.append(j); outBtn(); return; }
  if(mode==='nodonation'){
    h('Accreditation donation needed');
    const lapsed=me.accred_until?'Your Accreditation access ended on '+fmtDate(me.accred_until)+'. ':'';
    para(lapsed+'The Accreditation area (Curriculum Mapping, CIR Report Builder and the AACSB Q&A Depository) is open to AELAA members who make a '+CONFIG.donation+' donation, which gives one year of access. Access usually starts within a few minutes of donating.');
    const j=el('p');
    if(CONFIG.donateUrl){ const a=link('Donate '+CONFIG.donation+' on Zeffy',CONFIG.donateUrl); a.className='btn'; j.append(a); }
    else { j.append('To donate, email ',el('b',null,CONFIG.contactEmail),'.'); }
    p.append(j);
    para('Use the same email address as your membership ('+me.email+') so the donation is matched to your account.','small');
    outBtn(); return;
  }
  if(mode==='error'){ h('Can’t reach the sign-in service'); if(o.err) para(o.err,'err'); para('Check your internet connection and reload the page.'); if(me) outBtn(); return; }
}
function authError(e){
  const m=String(e&&e.message||e||'');
  if(/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if(/Email not confirmed/i.test(m)) return 'Confirm your email first: open the link sent when you created your account.';
  if(/rate limit|too many/i.test(m)) return 'Too many attempts just now. Wait a few minutes and try again.';
  if(/password/i.test(m)) return 'Choose a longer, harder-to-guess password (at least 8 characters).';
  return 'Something went wrong. Try again.';
}
async function signOut(){ try{ await sb.auth.signOut(); }catch(e){} location.reload(); }

async function check(user){
  if(!user) return show('signin');
  const email=String(user.email||'').toLowerCase();
  me={email};
  const res=await sb.from('members').select('email,paid_until,accred_until,role').eq('email',email).maybeSingle();
  if(res.error) return show('error',{err:'Couldn’t check your membership.'});
  if(!res.data) return show('notmember');
  me=Object.assign({},res.data,{email});
  const t=todayISO();
  if(me.role!=='admin'){
    if(!me.paid_until||me.paid_until<t) return show('expired');
    if(!me.accred_until||me.accred_until<t) return show('nodonation');
  }
  $('#gate').hidden=true;
  try{ await opts.onReady(sb,me,{signOut}); }
  catch(err){ const m=String(err&&err.message||''); show('error',{err:/^(Couldn’t open|This account)/.test(m)?m:'Something went wrong. Try again.'}); }
}

// Copyright line and Terms of Use link at the bottom of every Accreditation page.
function legalFooter(){
  if(document.querySelector('.aelaa-legal')) return;
  const f=document.createElement('footer'); f.className='aelaa-legal';
  f.style.cssText='max-width:1100px;margin:32px auto 24px;padding:0 20px;text-align:center;font:12.5px/1.5 system-ui,sans-serif;color:#5b6478';
  f.innerHTML='© 2026 Alliance of Educators for Learning, Assessment &amp; Accreditation (AELAA). All rights reserved. · <a href="/terms/" style="color:inherit">Terms of Use</a>';
  document.body.append(f);
}

window.AELAAGate={
  config:CONFIG,
  signOut:()=>signOut(),
  footer:legalFooter,
  async start(o){
    opts=o||{};
    legalFooter();
    if(!window.supabase) return show('error',{err:'The sign-in service didn’t load.'});
    sb=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey);
    show('loading');
    let recovering=false;
    sb.auth.onAuthStateChange(ev=>{ if(ev==='PASSWORD_RECOVERY'){ recovering=true; setTimeout(()=>show('newpw'),0); } });
    let session=null;
    try{ ({data:{session}}=await sb.auth.getSession()); }catch(err){ return show('error',{err:'The sign-in service didn’t respond.'}); }
    if(recovering) return;
    if(session) await check(session.user); else show('signin');
  }
};
})();
