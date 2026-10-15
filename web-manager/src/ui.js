export const appName='ระบบจัดการทัวร์นาเมนฟุตบอล';
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8"/>',
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 teams:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/>',
 players:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
 chart:'<path d="M4 3v18h17M8 17v-5m5 5V7m5 10V4"/>',
 table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 branch:'<path d="M6 3v12a4 4 0 0 0 4 4h8M6 8h12m-3-3 3 3-3 3m0 5 3 3-3 3"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
 logout:'<path d="M9 3H3v18h6m-1-9h13m-5-5 5 5-5 5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
};
export const icon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.trophy}</svg>`;
const navIcons={dashboard:'dashboard',teams:'teams',players:'players',competitions:'trophy',matches:'calendar',standings:'table',stats:'chart',settings:'settings'};
const actionIcons={'members':'players','delete-competition':'trash','entries':'players','publish':'globe','child-competition':'branch','copy-season':'copy','advance-teams':'arrow',refresh:'refresh',logout:'logout',obs:'download'};
export function actionButton(text,action,id='',cls=''){
 const kind=action==='nav'?navIcons[id]:actionIcons[action]||(action.startsWith('edit-')?(id?'edit':'plus'):null);
 const compact=!!kind&&action!=='nav'&&!(action.startsWith('edit-')&&!id);
 return `<button class="${cls} ${compact?'icon-button':''}" data-action="${action}" data-id="${escapeHTML(id)}" aria-label="${escapeHTML(text)}" title="${escapeHTML(text)}">${kind?icon(kind):''}${compact?'':`<span>${escapeHTML(kind==='plus'?text.replace(/^\+\s*/,''):text)}</span>`}</button>`;
}
export const validLogo=value=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value||'');
export const competitionCrest=c=>validLogo(c?.logo_data)?`<img class="competition-logo" src="${c.logo_data}" alt="โลโก้ ${escapeHTML(c.name)}">`:`<span class="competition-logo logo-placeholder">${icon('trophy')}</span>`;
