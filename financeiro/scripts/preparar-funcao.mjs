// A Edge Function usa o mesmo montador de mensagem da tela (o cliente recebe o que a prévia mostrou).
// O deploy só enxerga a pasta da função, então copiamos o arquivo pra lá. Rodar antes de publicar a função.
import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../site/public/mensagem.js', import.meta.url), new URL('../supabase/functions/financeiro/mensagem.js', import.meta.url));
console.log('mensagem.js copiado para a função');
