import * as pdfjs from './pdfjs.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.js', import.meta.url).href;
const text = {
  RU:['Загрузка документа…','Не удалось открыть документ. Проверьте сеть или откройте документ заново.','Повторить','Предыдущая страница','Следующая страница'],
  KK:['Құжат жүктелуде…','Құжат ашылмады. Желіні тексеріңіз немесе құжатты қайта ашыңыз.','Қайталау','Алдыңғы бет','Келесі бет'],
  EN:['Loading document…','Could not open the document. Check your connection or reopen it.','Retry','Previous page','Next page'],
  ZH:['正在加载文档…','无法打开文档。请检查网络或重新打开文档。','重试','上一页','下一页'],
  TR:['Belge yükleniyor…','Belge açılamadı. Bağlantıyı kontrol edin veya belgeyi yeniden açın.','Tekrar dene','Önceki sayfa','Sonraki sayfa'],
  UZ:['Hujjat yuklanmoqda…','Hujjatni ochib boʻlmadi. Tarmoqni tekshiring yoki hujjatni qayta oching.','Qayta urinish','Oldingi sahifa','Keyingi sahifa'],
  KY:['Документ жүктөлүүдө…','Документ ачылган жок. Тармакты текшериңиз же кайра ачыңыз.','Кайталоо','Мурунку бет','Кийинки бет'],
  TG:['Ҳуҷҷат бор шуда истодааст…','Ҳуҷҷат кушода нашуд. Шабакаро санҷед ё дубора кушоед.','Дубора','Саҳифаи пешина','Саҳифаи навбатӣ'],
  BE:['Дакумент загружаецца…','Не ўдалося адкрыць дакумент. Праверце сетку або адкрыйце яго зноў.','Паўтарыць','Папярэдняя старонка','Наступная старонка'],
};
const status=document.getElementById('status'), retry=document.getElementById('retry'), controls=document.getElementById('controls');
const canvas=document.getElementById('page'), prev=document.getElementById('previous'), next=document.getElementById('next'), count=document.getElementById('page-count');
let language='RU', url='', task, documentPdf, abort, serial=0, pageNumber=1, renderTask, drawing=false;
const copy=()=>text[language]||text.EN;
function allowed(value) {
  try {
    const u=new URL(value,location.origin);
    return (u.origin===location.origin && (u.pathname.startsWith('/security/storage/')||u.pathname.startsWith('/storage/')||u.pathname.startsWith('/qa2/storage/')))
      || (u.origin==='https://pymddxenwtjcbmrafvnc.supabase.co' && u.pathname.startsWith('/storage/v1/object/sign/urtruck-docs/'));
  } catch { return false; }
}
function signal(type, payload={}) { parent.postMessage({channel:'urtruck-pdf-viewer',type,...payload},location.origin); }
function cleanup() { abort?.abort(); renderTask?.cancel(); task?.destroy(); task=null; documentPdf=null; canvas.width=1; canvas.height=1; }
async function draw(n, seq) {
  const page=await documentPdf.getPage(n); if(seq!==serial)return;
  const unit=page.getViewport({scale:1}); const scale=Math.min(2,Math.max(1,document.documentElement.clientWidth-16)/unit.width,Math.sqrt(4000000/(unit.width*unit.height)));
  const viewport=page.getViewport({scale}); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
  renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport}); await renderTask.promise;
  if(seq!==serial)return; pageNumber=n; canvas.hidden=false; status.hidden=true; controls.hidden=false;
  count.textContent=`${n} / ${documentPdf.numPages}`; prev.disabled=n<=1; next.disabled=n>=documentPdf.numPages;
  signal('rendered',{page:n,pages:documentPdf.numPages});
}
async function open() {
  const seq=++serial; cleanup(); status.hidden=false; status.textContent=copy()[0]; retry.hidden=true;controls.hidden=true;canvas.hidden=true;
  const timeout=setTimeout(()=>{
    if(seq!==serial)return;
    serial++; cleanup(); status.hidden=false; status.textContent=copy()[1]; retry.hidden=false; controls.hidden=true; canvas.hidden=true; signal('error');
  },20000);
  try {
    if(!allowed(url))throw Error('unsupported_url');
    abort=new AbortController(); const response=await fetch(url,{signal:abort.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('http_error');
    const bytes=await response.arrayBuffer(); if(seq!==serial)return;
    task=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:'./cmaps/',cMapPacked:true,standardFontDataUrl:'./standard_fonts/',wasmUrl:'./wasm/',iccUrl:'./iccs/'});
    documentPdf=await task.promise; if(seq!==serial)return;
    signal('metadata',{pages:documentPdf.numPages}); await draw(1,seq);
  } catch(error) {
    if(seq!==serial || error?.name==='AbortError')return;
    cleanup();status.hidden=false;status.textContent=copy()[1];retry.hidden=false;controls.hidden=true;canvas.hidden=true;signal('error');
  } finally { clearTimeout(timeout); }
}
retry.addEventListener('click',open);
async function changePage(n) {
  if (!documentPdf || drawing) return;
  const seq=serial; drawing=true; prev.disabled=true; next.disabled=true;
  try { await draw(n,seq); }
  catch(error) {
    if (seq===serial) { status.hidden=false; status.textContent=copy()[1]; retry.hidden=false; controls.hidden=true; canvas.hidden=true; signal('error'); }
  } finally { drawing=false; }
}
prev.addEventListener('click',()=>{if(documentPdf&&pageNumber>1)changePage(pageNumber-1);});
next.addEventListener('click',()=>{if(documentPdf&&pageNumber<documentPdf.numPages)changePage(pageNumber+1);});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='urtruck-pdf-parent'||event.data?.type!=='open')return;
  language=Object.hasOwn(text,event.data.language)?event.data.language:'EN';url=String(event.data.url||'');
  retry.textContent=copy()[2];prev.setAttribute('aria-label',copy()[3]);next.setAttribute('aria-label',copy()[4]);open();
});
window.addEventListener('pagehide',()=>{serial++;cleanup();});
signal('ready');
