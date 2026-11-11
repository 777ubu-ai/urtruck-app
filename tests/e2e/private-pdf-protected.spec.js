// Только изолированный локальный backend и тестовые аккаунты.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const H = require('./helpers/webflow');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(H.BASE)) throw Error('Требуется изолированный локальный backend');

test('обе роли открывают защищённые PDF, CSV, фото и аудио; чужие получают отказ', async ({ page, request, browser }) => {
  const suffix = Date.now().toString(36);
  async function actor(role) {
    const token = await H.apiEmailToken(request, `private-pdf-${role}-${suffix}@urtruck.qa`, role);
    const response = await request.get(`${H.API}/register/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    return { token, id: (await response.json()).id, role };
  }
  const owner = await actor('client');
  const driver = await actor('driver');
  const outsiderToken = await H.apiEmailToken(request, `private-pdf-outsider-${suffix}@urtruck.qa`, 'driver');
  const cargo = await H.apiCreateCargo(request, owner.token, { cargo_desc: `private-pdf-${suffix}` });
  expect(cargo.status).toBeLessThan(300);
  const bid = await H.apiCreateBid(request, driver.token, cargo.body.id, 400000);
  expect(bid.status).toBeLessThan(300);
  const accepted = await request.post(`${H.API}/market/bids/${bid.body.id}/accept`, { headers: { Authorization: `Bearer ${owner.token}` } });
  expect(accepted.status()).toBeLessThan(300);
  const dealId = (await accepted.json()).deal_id;
  const list = await request.get(`${H.API}/market/deals`, { headers: { Authorization: `Bearer ${driver.token}` } });
  const body = await list.json();
  const deals = Array.isArray(body) ? body : body.deals;
  const room = deals.find(d => d.id === dealId).chat_room_id;
  const uploaded = await request.post(`${H.API}/chat/conversations/${room}/attachments`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    multipart: { kind: 'document', file: { name: 'private-fixture.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync('tests/fixtures/pdf/local-test.pdf') } },
  });
  expect(uploaded.status()).toBe(200);
  const id = (await uploaded.json()).attachment.id;
  const csv = Buffer.from('item,weight\nbox,12\n');
  const csvUpload = await request.post(`${H.API}/chat/conversations/${room}/attachments`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    multipart: { kind: 'document', file: { name: 'private-fixture.csv', mimeType: 'text/csv', buffer: csv } },
  });
  expect(csvUpload.status()).toBe(200);
  const csvId = (await csvUpload.json()).attachment.id;
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const photoUpload = await request.post(`${H.API}/chat/photo`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    multipart: { file: { name: 'photo.png', mimeType: 'image/png', buffer: photo } },
  });
  expect(photoUpload.status()).toBe(200);
  const sent = await request.post(`${H.API}/chat/send`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { room_id: room, photo_url: (await photoUpload.json()).photo_key, client_msg_id: `photo-${suffix}` },
  });
  expect(sent.status()).toBe(200);
  const photoId = (await sent.json()).message_id;
  const mediaPath = `${H.API}/chat/messages/${room}/media/${photoId}`;
  expect((await request.get(mediaPath, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status()).toBe(403);
  expect([401, 403]).toContain((await request.get(mediaPath)).status());
  const samples = 8000 * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(9000 * Math.sin(i * 2 * Math.PI * 440 / 8000)), 44 + i * 2);
  const voiceUpload = await request.post(`${H.API}/chat/voice`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    multipart: { file: { name: 'voice.wav', mimeType: 'audio/wav', buffer: wav } },
  });
  expect(voiceUpload.status()).toBe(200);
  const voiceSent = await request.post(`${H.API}/chat/send`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { room_id: room, photo_url: (await voiceUpload.json()).voice_key, is_voice: true, client_msg_id: `voice-${suffix}` },
  });
  expect(voiceSent.status()).toBe(200);
  const voiceId = (await voiceSent.json()).message_id;
  const voicePath = `${H.API}/chat/messages/${room}/media/${voiceId}`;
  const voiceResponse = await request.get(voicePath, { headers: { Authorization: `Bearer ${driver.token}` } });
  expect(voiceResponse.status()).toBe(200);
  expect(await voiceResponse.body()).toEqual(wav);
  expect((await request.get(voicePath, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status()).toBe(403);
  const path = `${H.API}/chat/conversations/${room}/attachments/${id}/content`;
  for (const token of [owner.token, driver.token]) {
    const response = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  expect((await request.get(path, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status()).toBe(403);
  expect([401, 403]).toContain((await request.get(path)).status());
  expect((await request.get(`${H.API}/chat/conversations/${room}/attachments/not-the-id/content`, { headers: { Authorization: `Bearer ${owner.token}` } })).status()).toBe(404);
  async function open(actor, target, exerciseRetry = false) {
    const mediaResponses = [];
    target.on('response', r => { if (r.url().endsWith(`/messages/${room}/media/${photoId}`)) mediaResponses.push(r); });
    const voiceResponses = [];
    target.on('response', r => { if (r.url().endsWith(`/messages/${room}/media/${voiceId}`)) voiceResponses.push(r); });
    const legacyFileRequests = [];
    target.on('request', r => { if (/\/security\/storage\/(chat_photos|chat_voice|chat_attachments)\//.test(r.url())) legacyFileRequests.push(r.url()); });
    if (exerciseRetry) {
      let firstMedia = true;
      await target.route(`**/messages/${room}/media/${photoId}`, route => {
        if (firstMedia) { firstMedia = false; return route.abort('failed'); }
        return route.continue();
      });
    }
    await target.goto(H.BASE, { waitUntil: 'networkidle' });
    await target.evaluate(({ token, id, role }) => {
      localStorage.setItem('ur_reg_token', token);
      localStorage.setItem('ur_verification_level', '2');
      localStorage.setItem('ur_session', JSON.stringify({ user: { id, role, phone: null } }));
    }, actor);
    await target.reload({ waitUntil: 'networkidle' });
    await H.dismissFirstVisit(target);
    await target.getByTestId('bottom-nav-deals').click();
    await target.getByTestId('deals-tab-active').click();
    await target.getByTestId('deals-deal-card').click();
    if (exerciseRetry) await target.getByText('Вложение временно недоступно · Повторить').click();
    const bubble = target.getByTestId('deal-chat-photo-bubble');
    await expect(bubble).toBeVisible({ timeout: 15000 });
    await expect.poll(() => mediaResponses.some(r => r.status() === 200)).toBe(true);
    await expect(bubble.locator('img')).toHaveCount(1);
    await expect(bubble.locator('img')).toHaveAttribute('src', /^blob:/);
    await bubble.click();
    await expect(target.getByTestId('deal-chat-photo-fullscreen').locator('img')).toBeVisible();
    await target.getByTestId('deal-chat-photo-close').click();
    const play = target.getByTestId('voice-play-btn');
    await expect(play).toBeEnabled();
    await expect.poll(() => voiceResponses.some(r => r.status() === 200)).toBe(true);
    await play.click();
    await expect(target.getByTestId('voice-pause-btn')).toBeVisible();
    if (exerciseRetry) {
      let first = true;
      await target.route(`**/attachments/${id}/content`, route => {
        if (first) { first = false; return route.abort('failed'); }
        return route.continue();
      });
    }
    let download = exerciseRetry ? null : target.waitForResponse(r => r.url().endsWith(`/attachments/${id}/content`));
    await target.getByTestId('deal-chat-document-bubble').filter({ hasText: 'private-fixture.pdf' }).click();
    if (exerciseRetry) await expect(target.getByText('Не удалось открыть просмотр документа.')).toBeVisible();
    if (exerciseRetry) {
      download = target.waitForResponse(r => r.url().endsWith(`/attachments/${id}/content`));
      await target.getByRole('button', { name: 'Повторить', exact: true }).click();
    }
    expect((await download).status()).toBe(200);
    const frame = target.frameLocator('iframe[src="/pdf-viewer/index.html"]');
    await expect(frame.locator('#page')).toBeVisible();
    const ink = await frame.locator('#page').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0; for (let i=0; i<pixels.length; i+=4) if (pixels[i+3] && pixels[i]<180 && pixels[i+1]<180 && pixels[i+2]<180) count++;
      return count;
    });
    expect(ink).toBeGreaterThan(10);
    await target.getByTestId('pdf-preview-close').click();
    const csvResponse = target.waitForResponse(r => r.url().endsWith(`/attachments/${csvId}/content`));
    const fileDownload = target.waitForEvent('download');
    await target.getByTestId('deal-chat-document-bubble').filter({ hasText: 'private-fixture.csv' }).click();
    expect((await csvResponse).status()).toBe(200);
    const downloaded = await fileDownload;
    expect(downloaded.suggestedFilename()).toBe('private-fixture.csv');
    expect(fs.readFileSync(await downloaded.path())).toEqual(csv);
    expect(legacyFileRequests).toEqual([]);
  }
  await open(driver, page, true);
  const context = await browser.newContext({ locale: 'ru-RU' });
  try { await open(owner, await context.newPage()); } finally { await context.close(); }
});
