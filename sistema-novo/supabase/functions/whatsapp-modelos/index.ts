import { contexto, json, headers, fail, meta, limitarEnvios } from '../_shared/whatsapp.ts';
import { UUID } from '../_shared/security.ts';

export function modeloSuportado(m: any) {
  return m.status==='APPROVED' && Array.isArray(m.components) && m.components.some((c:any)=>c.type==='BODY') &&
    m.components.every((c:any)=>['BODY','FOOTER'].includes(c.type)||c.type==='HEADER'&&c.format==='TEXT');
}
export function preencherModelo(m: any,values: Record<string,string>) {
  const components:any[]=[],texts:string[]=[];
  for(const component of m.components){
    const keys=[...new Set([...String(component.text||'').matchAll(/\{\{(\w+)\}\}/g)].map(x=>x[1]))];
    const parameters=keys.map(key=>{
      const text=values[`${component.type}:${key}`];
      if(typeof text!=='string'||!text.trim()||text.length>1024)fail(400,'Preencha todas as variáveis do modelo (até 1.024 caracteres por campo).');
      return {type:'text',text,...(/^\d+$/.test(key)?{}:{parameter_name:key})};
    });
    if(parameters.length)components.push({type:component.type.toLowerCase(),parameters});
    texts.push(String(component.text||'').replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>values[`${component.type}:${key}`]||''));
  }
  return {components,text:texts.filter(Boolean).join('\n\n')};
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:headers(req)});
  if(req.method!=='POST')return json(req,405,{erro:'Método não permitido.'});
  try{
    const b=await req.json().catch(()=>fail(400,'Corpo inválido.'));
    const ctx=await contexto(req,String(b.conversa_id||''),true);
    const {admin,conversa,integration,token,user}=ctx;
    if(!integration.config.waba_id)fail(422,'Cadastre o ID da conta WhatsApp em Integrações.');
    const suffix=b.nome?`&name=${encodeURIComponent(String(b.nome))}`:'';
    const dados=await meta(token,`${integration.config.waba_id}/message_templates?fields=id,name,language,status,components&limit=100${suffix}`);
    const modelos=(dados.data||[]).filter(modeloSuportado);
    if(b.acao==='listar')return json(req,200,{modelos,mais:!!dados.paging?.next});
    if(b.acao!=='enviar')fail(400,'Ação inválida.');
    const m=modelos.find((m:any)=>m.name===b.nome&&m.language===b.idioma);
    if(!m)fail(422,'Esse modelo não está aprovado ou seu formato ainda não é suportado pelo CRM.');
    const values=b.valores||{};
    const {components,text}=preencherModelo(m,values);
    const id=String(b.mensagem_id||'');if(!UUID.test(id))fail(400,'Identificador inválido.');
    const assinatura=JSON.stringify({nome:m.name,idioma:m.language,valores:Object.fromEntries(Object.entries(values).sort())});
    const {data:old}=await admin.from('mensagens').select('*').eq('id',id).maybeSingle();
    if(old){
      if(old.conversa_id!==conversa.id||old.autor_id!==user.id||old.midia?.envio!==assinatura)fail(409,'Identificador já utilizado.');
      return json(req,old.status==='falhou'?422:200,{mensagem:old,erro:old.erro,pendente:old.status==='enviando'});
    }
    await limitarEnvios(admin,user.id);
    const {data:registro,error}=await admin.from('mensagens').insert({id,empresa_id:conversa.empresa_id,conversa_id:conversa.id,autor_id:user.id,
      direcao:'saida',tipo:'texto',texto:text,midia:{modelo:m.name,envio:assinatura},status:'enviando'}).select().single();
    if(error)fail(error.code==='23505'?409:503,'Não foi possível registrar o envio. Consulte o histórico antes de repetir.');
    let resposta;
    try{resposta=await meta(token,`${integration.config.phone_number_id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:conversa.wa_id,type:'template',template:{name:m.name,language:{code:m.language},components}})});
    }catch(e){
      const recusado=(e as any).status===502;
      await admin.from('mensagens').update({status:recusado?'falhou':'enviando',erro:recusado?(e as Error).message:'Confirmação do provedor pendente. Confira o histórico antes de reenviar.'}).eq('id',id).eq('status','enviando');
      return json(req,recusado?502:202,{pendente:!recusado,erro:recusado?(e as Error).message:undefined,mensagem:registro});
    }
    if(!resposta.messages?.[0]?.id)return json(req,202,{pendente:true,mensagem:registro});
    const {data:enviada,error:erroUpdate}=await admin.from('mensagens').update({wa_message_id:resposta.messages[0].id,status:'enviada'}).eq('id',id).eq('status','enviando').select().maybeSingle();
    if(erroUpdate)return json(req,202,{pendente:true,mensagem:registro});
    await admin.from('conversas').update({ultima_mensagem_em:registro.criado_em,ultima_previa:text.slice(0,140)}).eq('id',conversa.id).lte('ultima_mensagem_em',registro.criado_em);
    return json(req,200,{mensagem:enviada||registro});
  }catch(e){return json(req,(e as any).status||500,{erro:(e as any).status?(e as Error).message:'Não foi possível concluir a operação. Tente novamente.'});}
});
