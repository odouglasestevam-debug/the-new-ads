import {meta,fail} from './whatsapp.ts';
const LIMITES_MIDIA:Record<string,{max:number,ext:string}>={
  'image/jpeg':{max:5242880,ext:'jpg'},'image/png':{max:5242880,ext:'png'},'image/webp':{max:512000,ext:'webp'},
  'video/mp4':{max:16777216,ext:'mp4'},'audio/ogg':{max:16777216,ext:'ogg'},'audio/mpeg':{max:16777216,ext:'mp3'},
  'audio/mp4':{max:16777216,ext:'m4a'},'application/pdf':{max:20971520,ext:'pdf'},
};
export async function copiarMidiaRecebida(admin:any,token:string,phone:string,message:any){
  if(message.midia?.storage_path)return;
  const id=String(message.midia?.id||'');if(!/^\d+$/.test(id))return;
  const info=await meta(token,`${id}?phone_number_id=${encodeURIComponent(phone)}`);
  const mime=String(info.mime_type||'').split(';')[0],tipo=LIMITES_MIDIA[mime];
  if(!tipo){await admin.from('mensagens').update({midia:{...message.midia,erro_arquivo:'Formato não suportado'}}).eq('id',message.id);return;}
  const url=new URL(info.url);
  if(url.protocol!=='https:'||!['lookaside.fbsbx.com','mmg.whatsapp.net'].includes(url.hostname))fail(502,'Endereço de mídia inesperado');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)fail(r.status===404||r.status===410?410:503,'Mídia temporariamente indisponível');
  const reader=r.body?.getReader();if(!reader)fail(503,'Mídia indisponível');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>tipo.max){await reader.cancel();await admin.from('mensagens').update({midia:{...message.midia,erro_arquivo:'Arquivo acima do limite'}}).eq('id',message.id);return;}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const path=`${message.empresa_id}/${message.conversa_id}/${message.id}.${tipo.ext}`;
  const {error}=await admin.storage.from('crm-midias').upload(path,bytes,{contentType:mime,upsert:true});
  if(error)fail(503,'Não foi possível armazenar mídia');
  const {error:saveError}=await admin.from('mensagens').update({midia:{...message.midia,storage_path:path,mime_type:mime}}).eq('id',message.id).eq('empresa_id',message.empresa_id);
  if(saveError)fail(503,'Não foi possível registrar mídia');
}
