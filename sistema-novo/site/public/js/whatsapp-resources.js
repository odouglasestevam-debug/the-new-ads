async function recursoWhatsApp(nome,body) {
  const {data}=await sb.auth.getSession();
  if(!data.session)throw new Error('Sua sessão expirou. Entre novamente.');
  const multipart=body instanceof FormData;
  const response=await fetch(`${SUPABASE_URL}/functions/v1/${nome}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${data.session.access_token}`,...(multipart?{}:{'Content-Type':'application/json'})},body:multipart?body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.erro||'Não foi possível concluir. Tente novamente.');
  return result;
}
function variaveisModelo(modelo) {
  return (modelo.components||[]).flatMap(c=>[...new Set([...String(c.text||'').matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]))].map(key=>({id:`${c.type}:${key}`,label:`${c.type==='HEADER'?'Cabeçalho':'Mensagem'} · ${key}`})));
}
function ligarRecursosWhatsApp(raiz,conversa,aoMudar){
  const extra=()=>document.querySelector(`[data-chat="${conversa.id}"] .chat-extra`);
  const modelosButton=raiz.querySelector('[data-modelos]:not([data-ligado])');
  if(modelosButton)modelosButton.dataset.ligado='true';
  modelosButton?.addEventListener('click',async()=>{
    const container=extra();if(!container)return;
    if(container.childElementCount){container.replaceChildren();return;}
    container.innerHTML='<p role="status">Buscando modelos aprovados…</p>';
    try{
      const {modelos,mais}=await recursoWhatsApp('whatsapp-modelos',{acao:'listar',conversa_id:conversa.id});
      if(!modelos.length){container.innerHTML='<p>Nenhum modelo de texto aprovado disponível. Crie ou revise seus modelos no WhatsApp Manager.</p><button class="mini" data-fechar-extra>Fechar</button>';container.querySelector('button').onclick=()=>container.replaceChildren();return;}
      container.innerHTML=`<form class="modelo-form"><label>Modelo aprovado<select name="modelo">${modelos.map((m,i)=>`<option value="${i}">${escapar(m.name)} · ${escapar(m.language)}</option>`).join('')}</select></label><div data-variaveis></div><p class="modelo-previa"></p><p class="ajuda">Envie somente a contatos que autorizaram mensagens da empresa. A Meta pode cobrar pelo envio de modelos.</p>${mais?'<p class="ajuda">Exibindo até 100 modelos aprovados.</p>':''}<div class="acoes-recursos"><button class="mini" type="button" data-cancelar>Cancelar</button><button class="btn" type="submit">Enviar modelo</button></div><p role="status" data-resultado></p></form>`;
      const form=container.querySelector('form'),select=form.elements.modelo;
      let envioId=crypto.randomUUID();
      function previa(){
        const m=modelos[Number(select.value)];
        const valores=Object.fromEntries([...form.querySelectorAll('[data-variavel]')].map(el=>[el.dataset.variavel,el.value]));
        form.querySelector('.modelo-previa').textContent=m.components.filter(c=>c.text).map(c=>c.text.replace(/\{\{(\w+)\}\}/g,(original,key)=>valores[`${c.type}:${key}`]||original)).join('\n\n');
      }
      function atualizar(){
        const m=modelos[Number(select.value)];
        form.querySelector('[data-variaveis]').innerHTML=variaveisModelo(m).map(v=>`<label>${escapar(v.label)}<input type="text" required maxlength="1024" data-variavel="${escapar(v.id)}"></label>`).join('');
        previa();
        envioId=crypto.randomUUID();
      }
      select.addEventListener('change',atualizar);atualizar();
      form.querySelector('[data-variaveis]').addEventListener('input',previa);
      form.querySelector('[data-cancelar]').onclick=()=>container.replaceChildren();
      form.addEventListener('submit',async e=>{
        e.preventDefault();const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;
        const status=form.querySelector('[data-resultado]');status.textContent='Enviando modelo…';
        const m=modelos[Number(select.value)],valores=Object.fromEntries([...form.querySelectorAll('[data-variavel]')].map(el=>[el.dataset.variavel,el.value]));
        try{
          const result=await recursoWhatsApp('whatsapp-modelos',{acao:'enviar',conversa_id:conversa.id,mensagem_id:envioId,nome:m.name,idioma:m.language,valores});
          container.replaceChildren();await carregarMensagens(conversa.id);aoMudar();
          if(result.pendente)extra().textContent='Envio registrado; aguardando confirmação do provedor.';
        }catch(error){status.textContent=error.message;submit.disabled=false;}
      });
    }catch(error){container.innerHTML=`<p role="alert">${escapar(error.message)}</p><button class="mini">Fechar</button>`;container.querySelector('button').onclick=()=>container.replaceChildren();}
  });
  const arquivoInput=raiz.querySelector('[data-arquivo]:not([data-ligado])');
  if(arquivoInput)arquivoInput.dataset.ligado='true';
  arquivoInput?.addEventListener('change',e=>{
    const file=e.target.files?.[0],container=extra();if(!file||!container)return;
    container.innerHTML=`<form class="arquivo-form"><p>${escapar(file.name)} · ${(file.size/1024/1024).toFixed(1)} MB</p><label>Legenda (opcional)<input name="legenda" maxlength="1024" type="text"></label><div class="acoes-recursos"><button type="button" class="mini">Cancelar</button><button type="submit" class="btn">Enviar arquivo</button></div><p role="status"></p></form>`;
    container.querySelector('[type=button]').onclick=()=>container.replaceChildren();
    const id=crypto.randomUUID();
    container.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
      const status=form.querySelector('[role=status]');status.textContent='Enviando arquivo…';
      const body=new FormData();body.set('arquivo',file);body.set('conversa_id',conversa.id);body.set('mensagem_id',id);body.set('legenda',form.elements.legenda.value);
      try{await recursoWhatsApp('whatsapp-midia',body);container.replaceChildren();await carregarMensagens(conversa.id);aoMudar();}
      catch(error){status.textContent=error.message;button.disabled=false;}
    };
    e.target.value='';
  });
  raiz.querySelectorAll('[data-abrir-midia]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const m=await recursoWhatsApp('whatsapp-midia',{conversa_id:conversa.id,mensagem_id:button.dataset.abrirMidia});
      const url=new URL(m.url);if(url.origin!==SUPABASE_URL)throw new Error('Endereço de arquivo inválido.');
      const wrapper=document.createElement('div');wrapper.className='midia-aberta';wrapper.dataset.midiaAberta=button.dataset.abrirMidia;
      if(['imagem','figurinha'].includes(m.tipo)){const img=document.createElement('img');img.src=url.href;img.alt=m.filename||'Imagem recebida';wrapper.append(img);}
      else if(['audio','video'].includes(m.tipo)){const el=document.createElement(m.tipo==='audio'?'audio':'video');el.src=url.href;el.controls=true;el.preload='metadata';wrapper.append(el);}
      const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=m.tipo==='documento'?'Abrir documento':'Abrir arquivo';link.className='mini';wrapper.append(link);
      button.replaceWith(wrapper);
    }catch(error){button.textContent=error.message;button.disabled=false;}
  }));
}
