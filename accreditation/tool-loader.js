/* Loads an Accreditation tool from AELAA's server (Edge Function "aelaa-api"). The server checks
   has_accreditation(), stamps the copy with a reference tied to the member and logs the download,
   so the tools' code is never in this public website. The tools' calculations (gap analysis, AoL
   status, Tables 3-1 / 3-2 / 8-1 and so on) also run on that server through window.AELAAServer.
   Usage: AELAATool.load({ folder:'curriculum-mapper', title:'Curriculum Mapping' }); */
(function(){
'use strict';
const FN='aelaa-api', APP={'curriculum-mapper':'mapper','cir-report-builder':'cir'};
const ORDER={'curriculum-mapper':['seed.js','app.js'],'cir-report-builder':['standards.js','seed.js','app.js']};
function server(sb){
  return {
    async call(app,fn,args,fp){ const {data,error}=await sb.functions.invoke(FN,{body:{op:'compute',app,fn,args,fp}}); if(error||!data||data.result===undefined) throw new Error('server'); return data.result; },
    async code(app){ const {data,error}=await sb.functions.invoke(FN,{body:{op:'code',app}});
      if(error||!data||!data.files){ const st=error&&error.context&&error.context.status;
        throw new Error(st===429?'This account has opened Accreditation tools unusually often today, so access is paused for 24 hours. If this is a mistake, email contactaelaa@gmail.com.'
          :'Couldn’t open this tool. If your Accreditation access just ended, renew it; otherwise reload the page.'); }
      return data.files; }
  };
}
window.AELAATool={
  load(o){
    AELAAGate.start({
      title:o.title,
      onReady:async(sb)=>{
        window.AELAAServer=server(sb);
        const files=await window.AELAAServer.code(APP[o.folder]);
        // Swap the gate's styling and markup for the tool's own.
        document.querySelectorAll('link[data-gate],style[data-gate]').forEach(n=>n.remove());
        const style=document.createElement('style'); style.textContent=files['styles.css']; document.head.append(style);
        document.body.innerHTML=files['body.html'];
        const actions=document.querySelector('.top-actions');
        if(actions){
          const back=document.createElement('a'); back.className='btn ghost'; back.href='../'; back.textContent='← Accreditation';
          actions.prepend(back);
          const out=document.createElement('button'); out.className='btn ghost'; out.type='button'; out.textContent='Sign out'; out.onclick=AELAAGate.signOut;
          actions.append(out);
        }
        for(const f of ORDER[o.folder]){ const s=document.createElement('script'); s.textContent=files[f]; document.body.append(s); }
        if(AELAAGate.footer) AELAAGate.footer();
      }
    });
  }
};
})();
