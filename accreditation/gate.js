/* AELAA Accreditation gate: shared sign-in and access check for every page in the Accreditation area.
   Access = signed in + on the member list + not suspended + Premium membership ($500/year) paid
            through today or later (admins always pass). An earlier $500 Accreditation donation
            with a current accred_until also counts, on top of a current membership. A seat at an
            institution with a current Premium membership counts too, and so does a paying member's
            one free week of Premium (upgrade_level/upgrade_ends_at, see upgrade-trial.sql). That week
            is approved and started by an AELAA admin for Standard members who ask.
   The database enforces the same rule (has_accreditation() in aelaa-setup/membership-levels.sql);
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
  // Where to pay for Premium. The "AELAA Accreditation" form on Zeffy: $500 there now buys the
  // Premium membership. If it is ever emptied, visitors are asked to email AELAA instead.
  donateUrl:'https://www.zeffy.com/en-US/donation-form/aelaa-accreditation',
  // While Premium/Accreditation is still being developed: no payment link, a "Coming soon" note instead.
  comingSoon:true,
  contactEmail:'contactaelaa@gmail.com',
  premium:'$500'
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
  function copyText(t){ return (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{ const a=document.createElement('textarea'); a.value=t; a.setAttribute('readonly',''); a.style.cssText='position:fixed;opacity:0'; document.body.append(a); a.select(); const ok=document.execCommand('copy'); a.remove(); if(!ok) throw new Error('copy'); }); }
  const link=(text,href)=>{const a=el('a',null,text); a.href=href; return a;};
  const back=()=>{const b=el('button','linkbtn','Back to sign in'); b.type='button'; b.onclick=()=>show('signin'); p.append(b);};
  const outBtn=()=>{const b=el('button','btn ghost','Sign out'); b.type='button'; b.onclick=signOut; p.append(b);};
  if(mode==='loading'){ h(opts.title||'AELAA Accreditation'); para('Checking your sign-in…'); return; }
  if(mode==='signin'||mode==='reset'||mode==='newpw'){
    h({signin:opts.title||'AELAA Accreditation',reset:'Reset your password',newpw:'Choose a new password'}[mode]);
    if(mode==='signin') para('For AELAA Premium members. Sign in with the same email and password as your AELAA Grader account.');
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
  if(mode==='notmember'){ h('Not on the member list'); para(me.email+' isn’t on the AELAA member list. The Accreditation area is for AELAA Premium members ('+CONFIG.premium+' a year).'); const j=el('p'); j.append(link('Join AELAA',CONFIG.joinUrl)); p.append(j); outBtn(); return; }
  if(mode==='expired'){ h('Membership has ended'); para('The AELAA membership for '+me.email+(me.paid_until?' ended on '+fmtDate(me.paid_until):' has no paid-through date')+'. Renew your membership to use the Accreditation area.'); const j=el('p'); j.append(link('Renew at aelaa.org',CONFIG.joinUrl)); p.append(j); outBtn(); return; }
  if(mode==='suspended'){ h('Account suspended'); para('AELAA has suspended access for '+me.email+'. To find out why or to restore it, email '+CONFIG.contactEmail+'.'); outBtn(); return; }
  if(mode==='nodonation'){
    h('Premium membership needed');
    const lvl={basic:'Basic',standard:'Standard'}[me.level], inst=me.instActive&&me.institution;
    const now=me.trial?'You are on the free trial, which covers the Grader (Oral Exams coming soon). '
      :inst?'Your seat from '+inst.name+' is at the '+({basic:'Basic',standard:'Standard'}[inst.level]||inst.level)+' level, which doesn’t include Accreditation. Ask your institution’s AELAA manager about Premium seats, or get Premium on your own. '
      :lvl?'Your '+lvl+' membership doesn’t include Accreditation. ':'';
    if(CONFIG.comingSoon){
      para(now+'The Accreditation area (Curriculum Mapping, CIR Report Builder and the AACSB Q&A Depository) is part of the Premium membership, which is still being developed.');
      const s=el('p'); s.append(el('b',null,'Coming soon. Premium isn’t open for purchase yet.')); p.append(s);
      outBtn(); return;
    }
    para(now+'The Accreditation area (Curriculum Mapping, CIR Report Builder and the AACSB Q&A Depository) is part of the Premium membership: '+CONFIG.premium+' a year, which also covers the AELAA Grader and Oral Exams. Access usually starts within a few minutes of paying.');
    const j=el('p');
    if(CONFIG.donateUrl){ const a=link('Get Premium ('+CONFIG.premium+'/year) on Zeffy',CONFIG.donateUrl); a.className='btn'; j.append(a); }
    else { j.append('To donate, email ',el('b',null,CONFIG.contactEmail),'.'); }
    p.append(j);
    if(CONFIG.donateUrl){ const t=el('p'); t.append(el('b',null,'At checkout, Zeffy adds an optional tip for Zeffy itself (not AELAA); you can change the tip to $0 and pay only the membership fee.')); p.append(t); }
    para('Use the same email address as your account ('+me.email+') so the payment is matched to it.','small');
    if(me.canAskPremium){
      const q=el('p'); q.append('Not sure yet? Standard members can ask AELAA for one free Premium week. ');
      const subj='Free Premium week request', body='Please start a free Premium week for my AELAA account: '+me.email;
      const to=encodeURIComponent(CONFIG.contactEmail), su=encodeURIComponent(subj), bo=encodeURIComponent(body);
      const a=link('Ask AELAA for a free Premium week','mailto:'+CONFIG.contactEmail+'?subject='+su+'&body='+bo);
      q.append(a,'. Once it’s approved it starts right away, and afterwards you go back to Standard.'); p.append(q);
      // A mailto: link does nothing on computers with no mail app set up, so clicking also shows
      // the address and message, with Copy and webmail links.
      const box=el('div','small'); box.hidden=true;
      box.style.cssText='border:1px solid #ccc;border-radius:6px;padding:10px 12px;margin:0 0 14px';
      const line=(label,text)=>{ const d=el('div'); d.append(el('b',null,label+' '),text); box.append(d); };
      box.append(el('div',null,'If no email window opened, send this email yourself.'));
      line('To:',CONFIG.contactEmail); line('Subject:',subj); line('Message:',body);
      const row=el('div'); row.style.cssText='display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px';
      const cp=el('button','linkbtn','Copy email'); cp.type='button'; cp.style.fontSize='14px';
      cp.onclick=async()=>{ try{ await copyText('To: '+CONFIG.contactEmail+'\nSubject: '+subj+'\n\n'+body); cp.textContent='Copied'; }catch(e){ cp.textContent='Couldn’t copy: use the text above'; } };
      row.append(cp);
      [['Open in Gmail','https://mail.google.com/mail/?view=cm&fs=1&to='+to+'&su='+su+'&body='+bo],
       ['Outlook','https://outlook.live.com/mail/0/deeplink/compose?to='+to+'&subject='+su+'&body='+bo],
       ['Yahoo Mail','https://compose.mail.yahoo.com/?to='+to+'&subject='+su+'&body='+bo]].forEach(([t,h])=>{ const w=link(t+' ↗',h); w.target='_blank'; w.rel='noopener'; row.append(w); });
      box.append(row); p.append(box);
      a.addEventListener('click',()=>{ box.hidden=false; });
    }
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
  const res=await sb.from('members').select('email,paid_until,accred_until,role,level,suspended,trial_ends_at,upgrade_level,upgrade_ends_at,institution:institutions(name,level,paid_until,suspended)').eq('email',email).maybeSingle();
  if(res.error) return show('error',{err:'Couldn’t check your membership.'});
  if(!res.data) return show('notmember');
  me=Object.assign({},res.data,{email});
  const t=todayISO();
  if(me.role!=='admin'){
    if(me.suspended) return show('suspended');
    const paid=me.paid_until&&me.paid_until>=t, i=me.institution;
    me.instActive=!!(i&&!i.suspended&&i.paid_until&&i.paid_until>=t);
    me.trial=!paid&&!me.instActive&&me.trial_ends_at&&new Date(me.trial_ends_at)>new Date();
    if(!paid&&!me.instActive&&!me.trial) return show('expired');
    const legacy=me.accred_until&&me.accred_until>=t;
    me.viaInstitution=me.instActive&&i.level==='premium'&&!(paid&&(me.level==='premium'||legacy));
    const own=(paid&&(me.level==='premium'||legacy))||me.viaInstitution;
    me.upgradeTrial=!own&&(paid||me.instActive)&&me.upgrade_level==='premium'&&me.upgrade_ends_at&&new Date(me.upgrade_ends_at)>new Date();
    const R={basic:1,standard:2,premium:3}, paidRank=Math.max(paid?R[me.level]||0:0, me.instActive?R[i.level]||0:0);
    me.canAskPremium=paidRank===2&&!(me.upgrade_level==='premium'&&me.upgrade_ends_at);
    if(!own&&!me.upgradeTrial) return show('nodonation');
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
