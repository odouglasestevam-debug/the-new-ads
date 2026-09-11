(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const indices = {ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1};
      if (event.key in indices) {event.preventDefault();selectTab(tabs[indices[event.key]], true);}
    });
  });

  const dialog = document.getElementById('lead-dialog');
  const form = document.getElementById('lead-form');
  const fieldsets = [...form.querySelectorAll('fieldset')];
  const title = document.getElementById('dialog-title');
  const intro = document.getElementById('dialog-intro');
  const submit = form.querySelector('[type="submit"]');
  const back = form.querySelector('.back-button');
  const serverError = document.getElementById('submit-error');
  const success = document.getElementById('form-success');
  const keys = ['nome','email','telefone','empresa','faturamento','verba'];
  const inputs = Object.fromEntries(keys.map(key => [key, document.getElementById(key)]));
  const fieldsByStep = [['nome','email','telefone'],['empresa','faturamento'],['verba']];
  const progress = [...document.querySelectorAll('.form-progress span')];
  const titles = ['Vamos nos conhecer.','Agora, sua empresa.','Vamos dimensionar a operação.'];
  const descriptions = ['Comece pelo seu contato. São 3 etapas até a agenda.','Esses dados ajudam a entender o momento do seu negócio.','A verba de mídia é separada dos honorários de gestão.'];
  let step = 0, leadId = null, openedAt = 0, opener = null, busy = false, complete = false;
  const eventIds = {};
  window.dataLayer = window.dataLayer || [];
  const cookie = name => {
    const found = document.cookie.split('; ').find(part => part.startsWith(name + '='));
    return found ? found.slice(name.length + 1) : '';
  };
  const params = new URLSearchParams(location.search);
  const tracking = {all_params:Object.fromEntries(params),referrer:document.referrer || '',landing_page:location.href};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic','gclid','gbraid','wbraid','fbclid','ttclid','msclkid'].forEach(key => {tracking[key] = params.get(key) || '';});
  tracking.utm_placement = params.get('utm_placement') || params.get('placement') || '';
  function eventId(name) {
    if (!eventIds[name]) eventIds[name] = name + '.' + (globalThis.crypto?.randomUUID?.() || Date.now() + '.' + Math.random().toString(36).slice(2));
    return eventIds[name];
  }
  function track(event, extra = {}) {window.dataLayer.push({event,event_id:eventId(event),...extra});}
  function values() {return Object.fromEntries(keys.map(key => [key,inputs[key].value.trim()]));}
  function setBusy(value) {
    busy = value;submit.disabled = value;back.disabled = value;form.setAttribute('aria-busy', String(value));
    fieldsets.forEach((fieldset,index) => {fieldset.disabled = value || index !== step;});
    submit.textContent = value ? 'Salvando suas respostas…' : step === 2 ? 'Concluir e ver o próximo passo' : 'Continuar';
  }
  function clearError(key) {
    inputs[key].removeAttribute('aria-invalid');
    document.getElementById(key + '-error').textContent = '';
  }
  keys.forEach(key => {
    const description = inputs[key].getAttribute('aria-describedby');
    inputs[key].setAttribute('aria-describedby', [description,key + '-error'].filter(Boolean).join(' '));
    inputs[key].addEventListener('input', () => clearError(key));
  });
  function renderStep(focus = true) {
    fieldsets.forEach((fieldset,index) => {fieldset.hidden = index !== step;fieldset.disabled = index !== step;});
    progress.forEach((item,index) => {item.classList.toggle('active', index <= step);if(index===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
    title.textContent = titles[step];
    intro.textContent = step === 0 && leadId ? 'Seu contato está salvo. Continue para revisar os dados da empresa.' : descriptions[step];
    back.hidden = step === 0;
    serverError.hidden = true;
    setBusy(false);
    if(focus && dialog.open) inputs[fieldsByStep[step][0]].focus({preventScroll:true});
  }
  document.querySelectorAll('[data-open-form]').forEach(button => button.addEventListener('click', () => {
    opener = button;
    if (!openedAt) openedAt = Date.now();
    dialog.showModal();
    if(!complete && !busy) {renderStep(false);inputs[fieldsByStep[step][0]].focus({preventScroll:true});}
    else if(busy) document.querySelector('.close-button').focus({preventScroll:true});
    else success.querySelector('h3').focus({preventScroll:true});
    if (!eventIds.IniciouFormulario) track('IniciouFormulario');
  }));
  document.querySelector('.close-button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus({preventScroll:true}));
  let outsideDown = false;
  dialog.addEventListener('pointerdown', event => {const r=dialog.getBoundingClientRect();outsideDown=event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;});
  dialog.addEventListener('click', event => {if(event.target!==dialog||!outsideDown)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  back.addEventListener('click', () => {if(step > 0 && !busy) {step--;renderStep();}});

  function validate() {
    let firstInvalid = null;
    fieldsByStep[step].forEach(key => {
      clearError(key);
      const input = inputs[key], value = input.value.trim();
      let message = '';
      if(!value) message = input.tagName === 'SELECT' ? 'Selecione uma faixa para continuar.' : 'Preencha este campo para continuar.';
      else if(key==='email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) message = 'Confira o e-mail. Use o formato voce@empresa.com.';
      else if(key==='telefone') {
        const digits = value.replace(/\D/g,'');
        const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
        if(!/^[1-9]{2}\d{8,9}$/.test(local)) message = 'Informe um telefone com DDD, como (48) 99999-9999.';
      }
      if(message) {input.setAttribute('aria-invalid','true');document.getElementById(key+'-error').textContent=message;firstInvalid ||= input;}
    });
    firstInvalid?.focus();return !firstInvalid;
  }
  async function save(payload) {
    // Match the existing API's minimum human interaction window, including autofill.
    if (!leadId) {
      const wait = 3200 - (Date.now() - openedAt);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/lead', {method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({origem:'landing-the-new-ads',url:location.href,ts:new Date().toISOString(),tracking:{...tracking,fbp:cookie('_fbp'),fbc:cookie('_fbc')},lead_id:leadId,tempo_ms:Date.now()-openedAt,empresa_site:document.getElementById('empresa_site').value,...payload})});
      if(!response.ok) throw new Error(response.status===429 ? 'rate-limit' : 'request-failed');
      const result = await response.json();
      if(!result.id || result.error) throw new Error('request-failed');
      leadId = result.id;
    } finally {clearTimeout(timeout);}
  }
  function finish(data, qualified) {
    complete = true;form.hidden = true;success.hidden = false;
    document.querySelector('.form-progress').classList.add('completed');
    title.textContent = 'Próximo passo';intro.textContent = 'Suas respostas foram enviadas.';
    const heading = success.querySelector('h3'), description = success.querySelector('p'), link = document.getElementById('success-link');
    const firstName = data.nome.split(/\s+/)[0];
    if(qualified) {
      heading.textContent = 'Tudo certo, ' + firstName + '.';
      description.textContent = 'Escolha um horário disponível para conversar com o Douglas sobre sua operação.';
      const url = new URL('/agendar',location.origin);
      // The incumbent scheduler interpolates prefill values into HTML attributes.
      // Omit unsafe prefill here; the scheduler lets the visitor enter it directly.
      // Its shared template still needs a separate fix to assign inputs via .value.
      ['nome','email','telefone'].forEach(key => {
        if (!/[<>"\u0000-\u001f]/.test(data[key])) url.searchParams.set(key,data[key]);
      });
      url.searchParams.set('lead_id',leadId);
      link.href = url.href;link.textContent = 'Escolher horário na agenda';
    } else {
      heading.textContent = 'Vamos conversar sobre sua base, ' + firstName + '.';
      description.textContent = 'Pelo seu momento atual, podemos conversar sobre trackeamento e organização dos dados antes de uma operação completa de tráfego pago.';
      const labels = {nome:'Nome',email:'E-mail',telefone:'Telefone',empresa:'Empresa',faturamento:'Faturamento',verba:'Verba de mídia'};
      const message = 'Olá! Vim pela landing page da The New Ads. Tenho interesse em ajuda com trackeamento.\n\n' + keys.map(key => labels[key] + ': ' + data[key]).join('\n');
      link.href = 'https://wa.me/5548996936361?text=' + encodeURIComponent(message);link.textContent = 'Falar sobre trackeamento';link.target='_blank';link.rel='noopener';
    }
    if(dialog.open) heading.focus({preventScroll:true});
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();if(busy || !validate()) return;
    const data = values();serverError.hidden = true;
    if(step===1) {step++;renderStep();return;}
    if(step===0 && leadId) {step++;renderStep();return;}
    setBusy(true);
    try {
      if(step===0) {
        await save({evento:'lead',etapa:'contato',nome:data.nome,email:data.email,telefone:data.telefone,event_id:eventId('Lead')});
        track('Lead',{nome:data.nome,email:data.email,telefone:data.telefone});
        // The existing API only updates company/qualification after contact creation.
        // Keep the saved contact readable so it cannot diverge from the actual lead.
        ['nome','email','telefone'].forEach(key => {inputs[key].readOnly=true;});
        step++;renderStep();
      } else {
        // Keep the incumbent qualification rule: low revenue AND low media budget.
        const qualified = !(['Ate R$ 30 mil','R$ 30 mil a R$ 70 mil'].includes(data.faturamento) && data.verba==='Ate R$ 1 mil');
        await save({...data,evento:qualified?'formulario_completo':'formulario_incompleto_perfil',qualificado:qualified,event_id:eventId('CompletouFormulario')});
        track('CompletouFormulario',{dentro_do_perfil:qualified,empresa:data.empresa,faturamento:data.faturamento,verba:data.verba});
        finish(data,qualified);
      }
    } catch(error) {
      serverError.textContent = error.message==='rate-limit' ? 'Houve muitas tentativas. Aguarde alguns minutos e tente novamente. Suas respostas continuam aqui.' : 'Não conseguimos salvar agora. Confira sua conexão e tente novamente. Suas respostas continuam aqui.';
      serverError.hidden = false;
    } finally {setBusy(false);}
  });
})();
