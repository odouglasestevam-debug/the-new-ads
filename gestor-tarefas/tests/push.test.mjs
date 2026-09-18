import test from 'node:test';
import assert from 'node:assert/strict';
import { endpointPermitido } from '../supabase/functions/tarefas-lembrete/push-seguro.ts';
test('push aceita provedores conhecidos e rejeita SSRF e URLs enganosas', () => {
  for (const host of ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2.notify.windows.com']) {
    assert.equal(endpointPermitido(`https://${host}/push/test`), true);
  }
  for (const url of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com@evil.test/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://evil.test/x', 'not a URL']) {
    assert.equal(endpointPermitido(url), false, url);
  }
});
