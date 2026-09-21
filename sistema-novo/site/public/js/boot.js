iniciar().catch(() => { const aviso = document.getElementById("aviso-login"); aviso.className = "aviso erro"; aviso.textContent = "Não foi possível verificar sua sessão. Recarregue a página para tentar novamente."; });
sb.auth.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT' && usuario) {
    pararTempoReal();
    document.getElementById('app').replaceChildren();
    location.reload();
  }
});

// Gavetas e modais existentes mantêm o foco dentro da tarefa e devolvem ao acionador.
let ultimoFocoWorkspace=document.activeElement;
const focoDosDialogos=new Map();
document.addEventListener('focusin',event=>{if(!event.target.closest('.fundo-modal'))ultimoFocoWorkspace=event.target;});
const focaveisDialogo=el=>[...el.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&x.getClientRects().length);
new MutationObserver(()=>{
  const abertos=[...document.querySelectorAll('.fundo-modal')];
  for(const fundo of abertos){
    const novo=!focoDosDialogos.has(fundo);
    if(novo)focoDosDialogos.set(fundo,ultimoFocoWorkspace);
    const dialogo=fundo.querySelector('.gaveta,.caixa-modal')||fundo;
    dialogo.setAttribute('role','dialog');dialogo.setAttribute('aria-modal','true');dialogo.tabIndex=-1;
    const titulo=dialogo.querySelector('h2');
    if(titulo){if(!titulo.id)titulo.id='dialogo-'+crypto.randomUUID();dialogo.setAttribute('aria-labelledby',titulo.id);}
    if(novo&&!fundo.contains(document.activeElement))(focaveisDialogo(dialogo)[0]||dialogo).focus({preventScroll:true});
  }
  for(const [fundo,anterior] of focoDosDialogos){
    if(fundo.isConnected)continue;
    focoDosDialogos.delete(fundo);
    if(!abertos.length)(anterior?.isConnected?anterior:document.getElementById('conteudo'))?.focus({preventScroll:true});
  }
}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const fundo=[...document.querySelectorAll('.fundo-modal')].at(-1);if(!fundo)return;
  const itens=focaveisDialogo(fundo),primeiro=itens[0],ultimo=itens.at(-1);
  if(!primeiro){event.preventDefault();fundo.querySelector('[role=dialog]')?.focus();return;}
  if(event.shiftKey&&(document.activeElement===primeiro||!itens.includes(document.activeElement))){event.preventDefault();ultimo.focus();}
  else if(!event.shiftKey&&(document.activeElement===ultimo||!itens.includes(document.activeElement))){event.preventDefault();primeiro.focus();}
});
