const mobile=()=>matchMedia('(max-width: 650px)').matches;
export function sidebarOpen(){return document.body.classList.contains('sidebar-open');}
export function closeSidebar(restore=true){
 document.body.classList.remove('sidebar-open');
 const aside=document.querySelector('#app-sidebar'),main=document.querySelector('.shell>main'),toggle=document.querySelector('#mobile-menu-toggle');
 if(main)main.inert=false;
 if(aside){aside.removeAttribute('aria-modal');aside.removeAttribute('role');}
 toggle?.setAttribute('aria-expanded','false');
 if(restore&&mobile())toggle?.focus();
}
export function openSidebar(){
 if(!mobile())return;
 document.body.classList.add('sidebar-open');
 const aside=document.querySelector('#app-sidebar');aside?.setAttribute('role','dialog');aside?.setAttribute('aria-modal','true');
 document.querySelector('#mobile-menu-toggle')?.setAttribute('aria-expanded','true');
 document.querySelector('#mobile-menu-close')?.focus();
 const main=document.querySelector('.shell>main');if(main)main.inert=true;
}
document.addEventListener('click',e=>{
 if(e.target.closest('#mobile-menu-toggle'))openSidebar();
 if(e.target.closest('#mobile-menu-close,.sidebar-backdrop'))closeSidebar();
 if(e.target.closest('#app-sidebar [data-action="nav"]'))closeSidebar(false);
});
document.addEventListener('keydown',e=>{
 if(!sidebarOpen())return;
 if(e.key==='Escape'){e.preventDefault();closeSidebar();}
 if(e.key==='Tab'){
  const nodes=[...document.querySelectorAll('#app-sidebar button:not(:disabled),#app-sidebar a[href]')].filter(n=>n.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});
matchMedia('(max-width: 650px)').addEventListener('change',()=>closeSidebar(false));
