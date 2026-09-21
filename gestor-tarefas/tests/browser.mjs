import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(process.env.PUBLIC_DIR || 'site/public');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    const file = await readFile(path);
    const headers = await readFile(resolve(root, '_headers'), 'utf8');
    for (const line of headers.split('\n').filter(l=>l.startsWith('  '))) {
      const colon = line.indexOf(':');
      res.setHeader(line.slice(0,colon).trim(),line.slice(colon+1).trim());
    }
    res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(path)] || 'application/json');
    res.end(file);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
try {
  await mkdir('tests/artifacts', {recursive:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/vendor/supabase.js', route => route.fulfill({contentType:'text/javascript',body:`
    window.fixture={writes:[], tables:{}, failResponsaveis:false};
    window.supabase={createClient:()=>({
      auth:{getSession:async()=>({data:{session:fixture.session||null}}),onAuthStateChange:fn=>{window.authEvent=fn},mfa:{getAuthenticatorAssuranceLevel:async()=>({error:{message:'offline'}})}},
      rpc:async(name,args)=>{
        fixture.rpcWrites=fixture.rpcWrites||[];
        if(name==='tarefas_acessos_membro')return {data:fixture.acesso||{acesso_total:false,espacos:['p1'],pastas:[],listas:[]}};
        if(fixture.failACL)return {error:{message:'Falha de conexão simulada'}};
        fixture.rpcWrites.push({name,args});
        const u=fixture.tables.tarefas_usuarios.find(x=>x.user_id===args.p_user);
        if(u)Object.assign(u,{nome:args.p_nome,admin:args.p_admin,ativo:args.p_ativo,acesso_total:args.p_total});
        return {data:null,error:null};
      },
      from:table=>{
        let action='select', payload, filters=[], single=false;
        const q={select:()=>q,order:()=>q,range:()=>q,
          eq:(k,v)=>{filters.push([k,v]);return q},
          in:(k,v)=>{filters.push([k,v,'in']);return q},
          insert:p=>{action='insert';payload=p;return q},
          update:p=>{action='update';payload=p;return q},
          delete:()=>{action='delete';return q},
          single:()=>{single=true;return q},maybeSingle:()=>{single=true;return q},
          then:(ok,no)=>new Promise(resolve=>setTimeout(()=>{
            let rows=fixture.tables[table]||[];
            const casa=r=>filters.every(([k,v,op])=>op==='in'?v.includes(r[k]):r[k]===v);
            let found=rows.filter(casa);
            if(action!=='select')fixture.writes.push({table,action,payload});
            if(table==='tarefas_responsaveis'&&fixture.failResponsaveis)return resolve({error:{message:'Falha simulada'}});
            if(action==='insert'){
              const data={id:'new-'+fixture.writes.length,...payload};rows.push(data);found=[data];
              if(table==='tarefas_tarefas')fixture.tables.tarefas_visao.push({...fixture.template,...data,responsaveis:[],situacao:'sem_data'});
            }
            if(action==='update'){
              found.forEach(r=>Object.assign(r,payload));
              if(table==='tarefas_tarefas')for(const r of fixture.tables.tarefas_visao.filter(casa)){Object.assign(r,payload);const st=fixture.tables.tarefas_status.find(s=>s.id===r.status_id);Object.assign(r,{status_nome:st.nome,status_tipo:st.tipo,status_cor:st.cor,situacao:st.tipo==='concluido'?'concluida':!r.data_entrega?'sem_data':r.data_entrega<hojeSP()?'atrasada':r.data_entrega===hojeSP()?'vence_hoje':'a_vencer'});}
            }
            if(action==='delete'){
              for(const nome of [table,table==='tarefas_tarefas'?'tarefas_visao':null].filter(Boolean)){
                const alvo=fixture.tables[nome]||[];
                for(const r of alvo.filter(casa))alvo.splice(alvo.indexOf(r),1);
              }
            }
            resolve({data:single?found[0]||null:found,error:null});
          },60)).then(ok,no)
        };return q;
      }
    })};
  `}));
  await page.addInitScript(()=>{window.__resizes=0;addEventListener('resize',()=>{window.__resizes++;});});
  // Trocar de viewport só devolve o controle depois que o resize chega na página: o evento
  // atrasado fechava um menu aberto logo em seguida e deixava o teste na sorte.
  const redimensionar=async(width,height)=>{
    const antes=await page.evaluate(()=>window.__resizes);
    await page.setViewportSize({width,height});
    await page.waitForFunction(n=>window.__resizes>n,antes,{timeout:3000}).catch(()=>{});
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByLabel('Tema da tela de acesso').selectOption('escuro');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-tema'),'escuro');
  assert.equal(await page.getByLabel('Tema da tela de acesso').inputValue(),'escuro');
  await page.screenshot({path:'tests/artifacts/login-escuro.png'});
  await page.getByLabel('Tema da tela de acesso').selectOption('sistema');
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.documentElement.dataset.tema==='escuro');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.tema==='claro');
  await page.getByLabel('Tema da tela de acesso').selectOption('claro');
  await assert.rejects(page.evaluate(() => precisaSegundaEtapa()), /segurança da sessão/);
  await page.screenshot({path:'tests/artifacts/login.png'});
  await page.evaluate(() => {
    S.user={id:'u1'};S.eu={user_id:'u1',nome:'Douglas',email:'demo@example.test',admin:true,ativo:true};
    S.usuarios=[S.eu,{user_id:'u2',nome:'Lucas',ativo:true},{user_id:'u3',nome:'Rafael',ativo:true}];
    S.projetos=[{id:'p1',nome:'Demandas da agência',cor:'#6941c6'},{id:'p2',nome:'Operação interna',cor:'#245eaf'}];
    S.listas=[{id:'l1',projeto_id:'p1',pasta_id:null,nome:'Campanhas'},{id:'l2',projeto_id:'p1',pasta_id:null,nome:'Criação'},{id:'l3',projeto_id:'p2',pasta_id:null,nome:'Planejamento'}];
    S.status=[{id:'s1',nome:'A fazer',tipo:'aberto',cor:'#616675',ordem:1},{id:'s2',nome:'Em andamento',tipo:'aberto',cor:'#245eaf',ordem:2},{id:'s3',nome:'Em revisão',tipo:'aberto',cor:'#895a09',ordem:3},{id:'s4',nome:'Concluído',tipo:'concluido',cor:'#187549',ordem:4}];
    const nomes=['Revisar campanha de captação','Ajustar criativos da próxima semana','Conferir eventos de conversão','Preparar relatório de resultados','Revisar briefing da landing page','Organizar demandas da semana','Enviar material para aprovação','Conferir orçamento das campanhas'];
    S.tarefas=nomes.map((titulo,i)=>({id:'t'+i,titulo,descricao:'Dados fictícios para teste local.',lista_id:i===5?'l3':'l1',projeto_id:i===5?'p2':'p1',projeto_cor:'#6941c6',status_id:S.status[i%3].id,status_nome:S.status[i%3].nome,status_cor:S.status[i%3].cor,status_tipo:'aberto',status_ordem:i%3,prioridade:['alta','normal','urgente','baixa'][i%4],data_entrega:i===5?null:hojeSP(),situacao:i<2?'atrasada':i===5?'sem_data':'vence_hoje',dias_atraso:i<2?2:0,dias_para_vencer:0,criado_em:'2026-09-17T12:00:00Z',responsaveis:[i%2?'u2':'u1'],recorrencia:null,tarefa_pai_id:null}));
    S.tarefas.filter(t=>t.situacao==='atrasada').forEach(t=>{t.data_entrega=emDias(-2);t.dias_para_vencer=-2;});
    fixture.tables={tarefas_usuarios:S.usuarios,tarefas_projetos:S.projetos,tarefas_pastas:[],tarefas_listas:S.listas,tarefas_status:S.status,tarefas_tarefas:S.tarefas.map(t=>({...t})),tarefas_visao:S.tarefas,tarefas_comentarios:[],tarefas_responsaveis:[]};
    fixture.template={...S.tarefas[0]};
    expandidos.add('projeto:p1');expandidos.add('projeto:p2');
    document.getElementById('tela-login').style.display='none';
    document.getElementById('app').classList.add('ativo');
    document.getElementById('usuario-nome').textContent='Ambiente de teste · Dados fictícios';
    history.replaceState(null,'','#/central');renderTudo();
  });
  assert.equal(await page.locator('.linha, .cu-linha').count(),7);
  await page.getByRole('button',{name:'Modo eu',exact:true}).click();
  assert.equal(await page.locator('.linha, .cu-linha').count(),4);
  await page.getByRole('button',{name:'+ Tarefa',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>S.add.responsaveis),['u1'],'Modo eu atribui novas tarefas ao usuário atual');
  await page.evaluate(()=>cancelarAdicionar());
  assert.equal(await page.evaluate(()=>localStorage.getItem('tf_modo_eu_u1')),'true');
  await page.evaluate(()=>{S.user={id:'u2'};S.eu=S.usuarios[1];renderTudo();});
  assert.equal(await page.getByRole('button',{name:'Modo eu',exact:true}).getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'Modo eu',exact:true}).click();
  assert.equal(await page.locator('.linha, .cu-linha').count(),3);
  await page.evaluate(()=>{history.replaceState(null,'','#/lista/l3');renderTudo();});
  assert.equal(await page.locator('.linha, .cu-linha').count(),1);
  assert.match(await page.locator('.linha, .cu-linha').innerText(),/Organizar demandas/);
  await page.evaluate(()=>{S.user={id:'u1'};S.eu=S.usuarios[0];history.replaceState(null,'','#/central');renderTudo();});
  assert.equal(await page.getByRole('button',{name:'Modo eu',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Modo eu',exact:true}).click();
  await page.locator('#btn-mais-filtros').click();
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  await page.getByLabel('Adicionar filtro',{exact:true}).selectOption('status');
  await page.locator('[data-multi="status"] summary').click();
  await page.getByLabel('A fazer',{exact:true}).check();
  assert.equal(await page.locator('.linha, .cu-linha').count(),3);
  await page.getByLabel('Adicionar filtro',{exact:true}).selectOption('prioridade');
  await page.getByLabel('Prioridade do filtro',{exact:true}).selectOption('urgente');
  assert.equal(await page.locator('.linha, .cu-linha').count(),1);
  await page.getByLabel('Combinar filtros',{exact:true}).selectOption('ou');
  assert.equal(await page.locator('.linha, .cu-linha').count(),4);
  await page.screenshot({path:'tests/artifacts/filtros-desktop.png',fullPage:true});
  await redimensionar(390,844);
  await page.evaluate(()=>abrirMaisFiltros(document.getElementById('btn-mais-filtros')));
  assert.equal(await page.evaluate(()=>{const r=document.querySelector('.filtros-popover').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}),true);
  await page.screenshot({path:'tests/artifacts/filtros-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Fechar filtros',exact:true}).click();
  await redimensionar(1440,1000);
  await page.getByRole('button',{name:'Modo eu',exact:true}).click();
  assert.equal(await page.locator('.linha, .cu-linha').count(),3,'OU não expande além do Modo eu');
  await page.locator('#btn-mais-filtros').click();
  await page.getByRole('button',{name:'Remover filtro Prioridade',exact:true}).click();
  assert.equal(await page.locator('.linha, .cu-linha').count(),2);
  await page.locator('[data-multi="status"] summary').click();
  await page.getByLabel('A fazer',{exact:true}).uncheck();
  assert.equal(await page.locator('[data-multi="status"]').count(),1,'condição vazia permanece editável');
  await page.getByLabel('Em andamento',{exact:true}).check();
  assert.equal(await page.locator('.linha, .cu-linha').count(),1);
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  await page.getByRole('button',{name:'Fechar filtros',exact:true}).click();
  await page.getByRole('button',{name:'Modo eu',exact:true}).click();
  await page.evaluate(()=>{filtros.central.prazo=['atrasada','vence_hoje'];renderTudo();});
  assert.equal(await page.locator('.linha, .cu-linha').count(),7);
  assert.ok(await page.locator('.cabecalho-tarefas').evaluate(el=>el.getBoundingClientRect().height<135),'Cabeçalho compacto');
  await page.screenshot({path:'tests/artifacts/desktop-lista.png',fullPage:true});
  await page.getByLabel('Tema do aplicativo').selectOption('escuro');
  await page.screenshot({path:'tests/artifacts/desktop-lista-escuro.png',fullPage:true});
  await page.getByRole('searchbox').fill('relatório');
  assert.equal(await page.locator('.linha, .cu-linha').count(),1);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button',{name:'Quadro',exact:true}).click();
  assert.equal(await page.locator('.quadro-coluna').count(),4);
  await page.screenshot({path:'tests/artifacts/desktop-quadro.png',fullPage:true});
  await page.locator('.quadro-cartao').first().locator('.status-pill').click();
  assert.equal(await page.locator('#menu-flutuante .bolinha-menu').count(),4,'Menu de status mostra cor de cada status');
  await page.locator('#menu-flutuante button',{hasText:'Em revisão'}).click();
  await page.waitForFunction(()=>!gravacoesPendentes.size);
  await page.getByRole('button',{name:'Lista',exact:true}).click();
  await page.getByRole('button',{name:'Revisar campanha de captação',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#g-titulo').inputValue(),'Revisar campanha de captação');
  await page.locator('#comentario-texto').fill('Comentário de teste');
  await page.evaluate(()=>{const f=document.getElementById('form-comentario');enviarComentario({preventDefault(){},target:f});enviarComentario({preventDefault(){},target:f});});
  await page.waitForFunction(()=>!enviandoComentario);
  assert.equal(await page.evaluate(()=>fixture.writes.filter(x=>x.table==='tarefas_comentarios').length),1);
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'+ Tarefa',exact:true}).click();
  await page.locator('#add-titulo').fill('Tarefa única de teste');
  await page.evaluate(()=>{const f=document.getElementById('form-add');salvarAdicionar({preventDefault(){},target:f});salvarAdicionar({preventDefault(){},target:f});});
  await page.waitForFunction(()=>!criandoTarefa);
  assert.equal(await page.evaluate(()=>fixture.writes.filter(x=>x.table==='tarefas_tarefas'&&x.action==='insert').length),1);
  await page.evaluate(()=>cancelarAdicionar());
  // Falha parcial de responsáveis abre a tarefa já criada em vez de perder o erro.
  await page.getByRole('button',{name:'+ Tarefa',exact:true}).click();
  await page.locator('#add-titulo').fill('Responsável com falha simulada');
  await page.evaluate(()=>{S.add.responsaveis=['u2'];fixture.failResponsaveis=true;});
  await page.locator('#form-add').getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>!criandoTarefa);
  assert.match(await page.locator('#toast').innerText(),/responsáveis não foram salvos/);
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.evaluate(()=>{document.getElementById('toast').className='toast';});
  await redimensionar(390,844);
  await page.screenshot({path:'tests/artifacts/mobile-lista.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow no celular');
  await page.getByRole('button',{name:'Quadro',exact:true}).click();
  await page.screenshot({path:'tests/artifacts/mobile-quadro.png',fullPage:true});
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByLabel('Tema do aplicativo').selectOption('claro');
  assert.equal(await page.locator('html').getAttribute('data-tema'),'claro');
  await page.getByLabel('Tema do aplicativo').selectOption('escuro');
  await page.evaluate(()=>fecharMenuLateral());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(!process.env.LEGACY_RELEASE) {
  // Editor de permissões usa fixtures. Nenhuma chamada de cadastro chega ao servidor real.
  await page.route('**/functions/v1/tarefas-usuarios',async route=>{
    const corpo=route.request().postDataJSON();
    assert.deepEqual(corpo.permissoes,{acesso_total:false,espacos:['p1'],pastas:['pa1'],listas:[]});
    assert.equal(corpo.admin,false);
    await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,conta_nova:true})});
  });
  await redimensionar(1440,1000);
  await page.evaluate(()=>{
    S.eu.acesso_total=true;
    S.pastas=[{id:'pa1',projeto_id:'p1',pasta_pai_id:null,nome:'Financeiro'},{id:'pa2',projeto_id:'p1',pasta_pai_id:'pa1',nome:'Contratos'}];
    S.listas.push({id:'l4',nome:'Documentos internos',projeto_id:'p1',pasta_id:'pa2'});
    fixture.tables.tarefas_pastas=S.pastas;
    S.abaAjustes='usuarios';history.replaceState(null,'','#/ajustes');renderTudo();
  });
  await page.getByRole('button',{name:'Adicionar membro',exact:true}).click();
  await page.getByLabel('Nome',{exact:true}).fill('Colaborador de teste');
  await page.locator('#form-membro').getByLabel('E-mail',{exact:true}).fill('colaborador@example.test');
  await page.getByLabel('Senha inicial',{exact:true}).fill('senha-ficticia-123');
  assert.equal(await page.locator('[data-regra="listas"][data-id="l1"]').isDisabled(),true);
  await page.locator('[data-regra="espacos"][data-id="p1"]').check();
  assert.equal(await page.locator('[data-regra="listas"][data-id="l1"]').isChecked(),true);
  await page.locator('[data-regra="pastas"][data-id="pa1"]').uncheck();
  assert.equal(await page.locator('[data-regra="pastas"][data-id="pa2"]').isDisabled(),true);
  assert.equal(await page.locator('[data-regra="listas"][data-id="l4"]').isChecked(),false);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'tests/artifacts/membros-desktop.png',fullPage:true});
  await page.getByLabel('Função',{exact:true}).selectOption('admin');
  assert.match(await page.locator('#regras-membro').innerText(),/Administradores têm acesso a todos/);
  await page.getByLabel('Função',{exact:true}).selectOption('membro');
  assert.equal(await page.locator('[data-regra="pastas"][data-id="pa1"]').isChecked(),false);
  await redimensionar(390,844);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'tests/artifacts/membros-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{fixture.session={access_token:'fixture-only'};});
  await page.locator('#salvar-membro').click();
  await page.waitForFunction(()=>!document.getElementById('form-membro'));
  await page.getByRole('button',{name:'Editar acesso de Lucas',exact:true}).click();
  await page.locator('#m-nome').fill('Lucas editado');
  await page.locator('[data-regra="listas"][data-id="l2"]').uncheck();
  await page.evaluate(()=>{fixture.failACL=true;});
  await page.locator('#salvar-membro').click();
  await page.waitForFunction(()=>!editorMembro.salvando);
  assert.match(await page.locator('#aviso-membro').innerText(),/Falha de conexão/);
  assert.equal(await page.locator('#m-nome').inputValue(),'Lucas editado');
  await page.evaluate(()=>{fixture.failACL=false;});
  await page.locator('#salvar-membro').click();
  await page.waitForFunction(()=>!document.getElementById('form-membro'));
  assert.deepEqual(await page.evaluate(()=>fixture.rpcWrites.at(-1).args.p_listas),['l2']);
  await page.evaluate(()=>{S.eu.admin=false;renderTudo();});
  assert.equal(await page.locator('[data-editar-membro]').count(),0);
  }

  // ---- Prévia da recorrência espelha o banco: a série anda pela âncora, não pela entrega remarcada ----
  const serie=(base,entrega)=>page.evaluate(([b,e])=>proximaRecorrencia({recorrencia:'semanal',recorrencia_intervalo:1,
    recorrencia_dias_semana:[1,3,5],recorrencia_base:b,data_entrega:e}),[base,entrega]);
  assert.equal(await serie('2026-09-21','2026-09-21'),'2026-09-23','segunda no dia: próxima é quarta');
  assert.equal(await serie('2026-09-21','2026-09-22'),'2026-09-23','segunda remarcada para terça: próxima continua quarta');
  assert.equal(await serie('2026-09-21','2026-09-24'),'2026-09-25','remarcada para quinta: pula a quarta que já passou');
  assert.equal(await serie(null,'2026-09-21'),'2026-09-23','tarefa antiga, sem âncora, usa a entrega');

  // ---- Seleção múltipla e ações em lote (dados fictícios) ----
  await redimensionar(1440,1000);
  await page.evaluate(()=>{document.getElementById('toast').className='toast';});
  await page.evaluate(()=>{S.eu.admin=true;fixture.failResponsaveis=false;Object.assign(filtros.central,{visao:'lista',agrupar:'pasta',prazo:[],busca:''});
    history.replaceState(null,'','#/central');renderTudo();});
  const caixas=page.locator('.cu-linha .sel-box, .linha .sel-box');
  assert.ok(await caixas.count()>=4,'toda tarefa tem caixa de seleção');
  await caixas.nth(0).click();
  assert.equal(await page.locator('#barra-lote').isVisible(),true,'a barra de lote aparece com 1 selecionada');
  assert.match(await page.locator('.lote-n').innerText(),/1 tarefa selecionada/);
  await caixas.nth(2).click({modifiers:['Shift']});
  assert.equal(await page.evaluate(()=>selecionadas.size),3,'shift+clique pega o intervalo');
  await page.locator('.lote-btn',{hasText:'Prioridade'}).click();
  await page.locator('#menu-flutuante button',{hasText:'Urgente'}).click();
  await page.waitForFunction(()=>!loteOcupado&&document.getElementById('toast').innerText.includes('prioridade alterada'));
  assert.match(await page.locator('#toast').innerText(),/3 tarefas: prioridade alterada para Urgente/);
  assert.equal(await page.evaluate(()=>[...selecionadas].every(id=>S.tarefas.find(t=>t.id===id).prioridade==='urgente')),true);
  await page.locator('.lote-btn',{hasText:'Responsável'}).click();
  await page.locator('#menu-flutuante button',{hasText:'Rafael'}).click();
  await page.waitForFunction(()=>document.getElementById('toast').innerText.includes('Rafael'));
  assert.equal(await page.evaluate(()=>fixture.writes.filter(x=>x.table==='tarefas_responsaveis'&&x.action==='insert').at(-1).payload.length),3);
  const antesGrupo=await page.evaluate(()=>selecionadas.size);
  await page.locator('.cu-grupo-cab .sel-box, .cab-colunas .sel-box').first().click();
  assert.ok(await page.evaluate(()=>selecionadas.size)>antesGrupo,'o cabeçalho do grupo marca todas de uma vez');
  await page.locator('#sel-todas').click();
  assert.equal(await page.evaluate(()=>idsSelecionados().length),await page.locator('.cu-linha').count(),'a caixa geral marca todas as filtradas');
  await page.locator('#sel-todas').click();
  assert.equal(await page.evaluate(()=>selecionadas.size),0,'clicar de novo na caixa geral desmarca tudo');
  await page.getByRole('searchbox').fill('relatório');
  await page.locator('#sel-todas').click();
  assert.equal(await page.evaluate(()=>idsSelecionados().length),1,'a caixa geral respeita o filtro da tela');
  await page.getByRole('searchbox').fill('');
  await page.locator('#sel-todas').click();
  await page.screenshot({path:'tests/artifacts/selecao-lote.png',fullPage:true});
  const paraExcluir=await page.evaluate(()=>idsSelecionados().length);
  const totalAntes=await page.evaluate(()=>S.tarefas.length);
  await page.locator('.lote-btn',{hasText:'Mais'}).click();
  await page.locator('#menu-flutuante button',{hasText:'Excluir'}).click();
  await page.locator('#btn-confirmar').click();
  await page.waitForFunction(t=>S.tarefas.length<t,totalAntes);
  assert.equal(await page.evaluate(()=>S.tarefas.length),totalAntes-paraExcluir);
  assert.equal(await page.locator('#barra-lote').isVisible(),false,'a barra some quando a seleção esvazia');
  await page.evaluate(()=>{document.getElementById('toast').className='toast';});
  await page.evaluate(()=>authEvent('SIGNED_OUT'));
  assert.equal(await page.locator('#conteudo').innerText(),'');
  assert.equal(await page.locator('#form-login').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('UI: seleção múltipla e ações em lote, Modo eu por usuário/escopo, filtros E/OU, remoção de condições, topo compacto, mobile e fluxos existentes: OK. Dados exclusivamente fictícios.');
} finally {await browser.close();server.close();}
