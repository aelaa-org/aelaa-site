/* Loads an Accreditation tool whose code lives in the private Supabase storage bucket
   "accreditation-tools". The bucket only serves files to people who pass has_accreditation(),
   so the tools' code is never in this public website.
   Usage: AELAATool.load({ folder:'curriculum-mapper', title:'Curriculum Mapping', scripts:['seed.js','app.js'] }); */
(function(){
'use strict';
const BUCKET='accreditation-tools';
async function fetchText(sb,path){
  const {data,error}=await sb.storage.from(BUCKET).download(path);
  if(error) throw new Error('Couldn’t open this tool. If your Accreditation access just ended, renew it; otherwise reload the page.');
  return await data.text();
}
window.AELAATool={
  load(o){
    AELAAGate.start({
      title:o.title,
      onReady:async(sb)=>{
        const files=['body.html','styles.css'].concat(o.scripts);
        const texts=await Promise.all(files.map(f=>fetchText(sb,o.folder+'/'+f)));
        const [body,css]=texts, scripts=texts.slice(2);
        // Swap the gate's styling and markup for the tool's own.
        document.querySelectorAll('link[data-gate],style[data-gate]').forEach(n=>n.remove());
        const style=document.createElement('style'); style.textContent=css; document.head.append(style);
        document.body.innerHTML=body;
        const actions=document.querySelector('.top-actions');
        if(actions){
          const back=document.createElement('a'); back.className='btn ghost'; back.href='../'; back.textContent='← Accreditation';
          actions.prepend(back);
          const out=document.createElement('button'); out.className='btn ghost'; out.type='button'; out.textContent='Sign out'; out.onclick=AELAAGate.signOut;
          actions.append(out);
        }
        for(const src of scripts){ const s=document.createElement('script'); s.textContent=src; document.body.append(s); }
        AELAAGate.footer();
      }
    });
  }
};
})();
