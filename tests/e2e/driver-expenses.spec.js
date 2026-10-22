// Только loopback/synthetic fixtures; никаких production API/данных.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(process.env.URTRUCK_EXPENSE_DIST || path.resolve(__dirname, '../../dist'));
  const mime = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('API must be intercepted'); return; }
    const relative = decodeURIComponent(req.url.split('?')[0]);
    let file = path.resolve(dist, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', video: 'off', trace: 'off' });

const DEAL = 'confirm-deal';
const ROOM = 'confirm-room';
async function fixture(page, { role, initialStatus = 'at_border', failFirst = false, lang = 'RU', reviewEligible = false, reviewEligibility404 = false }) {
  const user = { id: role === 'driver' ? 'confirm-driver' : 'confirm-client', role, verification_level: 3 };
  const box = { status: initialStatus, posts: [], errors: [], failFirst, expenses: [], expensePosts: [], failExpense: false };
  const deal = () => ({
    id: DEAL, shipper_id: 'confirm-client', driver_id: 'confirm-driver',
    driver_name: 'Перевозчик', shipper_name: 'Отправитель',
    from_city: 'Ош', to_city: 'Поти', from_country: 'KG', to_country: 'GE',
    is_international: true, route_country_valid: true,
    cargo_id: null, trip_id: null, bid_id: 'confirm-bid', chat_room_id: ROOM,
    amount: 10000, currency: 'USD', cargo_desc: 'Мебель', status: box.status,
    created_at: '2026-10-15 00:00:00',
  });
  page.on('pageerror', error => box.errors.push(error.message));
  await page.addInitScript(({ user, lang }) => {
    localStorage.setItem('ur_reg_token', 'confirm-fixture-token');
    localStorage.setItem('ur_session', JSON.stringify({ user }));
    localStorage.setItem('ur_verification_level', '3');
    localStorage.setItem('ur_lang', lang);
  }, { user, lang });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data = {};
    if (url.pathname === '/api/v1/driver/expenses/options') data = { ok:true, vehicles:[{id:'v1',license_plate:'А123ВС'}], deals:[{id:DEAL,from_city:'Ош',to_city:'Поти',vehicle_id:'v1',vehicle_plate_snapshot:'А123ВС'}] };
    else if (url.pathname === '/api/v1/driver/expenses') {
      if(route.request().method()==='POST') {
        const body=route.request().postDataJSON(); box.expensePosts.push(body);
        if(box.failExpense) { box.failExpense=false; return route.fulfill({status:503,contentType:'application/json',body:'{}'}); }
        const item={...body,id:'expense-'+box.expenses.length,version:1,vehicle_plate:'А123ВС',deal_label:'Ош → Поти'};
        box.expenses.unshift(item); data={ok:true,expense:item};
      } else data={ok:true,expenses:box.expenses,total:box.expenses.length,totals:box.expenses.length?[{currency:'KZT',amount:box.expenses.reduce((sum,item)=>sum+Number(item.amount),0).toFixed(2)}]:[]};
    }
    else if (url.pathname === '/api/v1/register/me') data = user;
    else if (url.pathname === '/api/v1/users/me') data = { ...user, name: 'Проверка', city: 'Ош' };
    else if (url.pathname === '/api/v1/market/my') data = {
      my_cargos: [], my_trips: [], my_bids: [], incoming_bids: [], my_deals: [deal()],
    };
    else if (url.pathname === '/api/v1/market/my/listings') data = {
      items: [], total: 0, archive_total: 0, next_offset: null,
    };
    else if (url.pathname === '/api/v1/market/deals') data = { deals: [deal()] };
    else if (url.pathname === '/api/v1/market/deals/' + DEAL) data = deal();
    else if (url.pathname === '/api/v1/market/deals/' + DEAL + '/status') {
      const status = url.searchParams.get('new_status');
      box.posts.push(status);
      if (box.failFirst) {
        box.failFirst = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic status failure"}' });
      }
      box.status = status; data = { ok: true, status };
    } else if (url.pathname === '/api/v1/market/deals/' + DEAL + '/tracking') data = { ok: true, tracking: { status: 'stopped' } };
    else if (url.pathname === '/api/v1/chat/rooms') data = { rooms: [{
      id: ROOM, deal_id: DEAL, partner_id: role === 'driver' ? 'confirm-client' : 'confirm-driver',
      partner_name: 'Участник', partner_role: role === 'driver' ? 'client' : 'driver',
    }] };
    else if (url.pathname.endsWith('/timeline')) data = { events: [] };
    else if (url.pathname.includes('/chat/') && url.pathname.endsWith('/attachments')) data = { attachments: [] };
    else if (url.pathname.includes('/chat/')) data = { messages: [], rooms: [], unread: 0 };
    else if (url.pathname.includes('/notifications')) data = { notifications: [], unread: 0 };
    else if (url.pathname.includes('/favorites')) data = { favorites: [] };
    else if (url.pathname.includes('/reviews')) {
      if (reviewEligibility404) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not found"}' });
      data = { ok: true, eligible: reviewEligible, already_reviewed: !reviewEligible, reviews: [], summary: {} };
    }
    else if (url.pathname.includes('/market/trips')) data = { trips: [], total: 0 };
    else if (url.pathname.includes('/market/cargos')) data = { cargos: [], total: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('bottom-nav-deals')).toBeVisible({ timeout: 20000 });
  // Дожидаемся асинхронной проверки browser permission: баннер сдвигает вкладки.
  await expect(page.getByTestId('push-permission-banner')).toBeVisible();
  await page.getByTestId('bottom-nav-deals').click();
  await page.getByTestId('deals-tab-active').click();
  await expect(page.getByTestId('deals-deal-card')).toHaveCount(1);
  await page.getByTestId('deals-deal-card').click();
  await expect(page.getByTestId('deal-workspace-screen')).toBeVisible();
  await expect(page.getByTestId('deal-chat-input')).toBeVisible();
  return box;
}


test('driver private expenses: deal context, retry with same key, free description and profile entry', async ({ page }) => {
  const box=await fixture(page,{role:'driver'});
  await page.getByTestId('deal-chat-plus').click();
  await page.getByTestId('deal-chat-attach-expenses').click();
  await expect(page.getByTestId('expenses-add')).toBeEnabled();
  await page.getByTestId('expenses-add').click();
  await expect(page.getByTestId('expense-deal')).toContainText('Ош → Поти');
  await expect(page.getByTestId('expense-vehicle')).toContainText('А123ВС');
  await page.getByTestId('expense-amount').fill('1 500,20');
  await page.getByTestId('expense-category-food').click();
  await page.getByTestId('expense-description').fill('Купил хлеб и жвачку');
  box.failExpense=true;
  await page.getByTestId('expense-save').click();
  await expect(page.getByTestId('expense-description')).toHaveValue('Купил хлеб и жвачку');
  await expect(page.getByTestId('expense-save')).toBeEnabled();
  await page.getByTestId('expense-save').click();
  await expect(page.getByTestId('expense-record')).toHaveCount(1);
  await expect(page.getByTestId('expense-record')).toContainText('Купил хлеб и жвачку');
  expect(box.expensePosts).toHaveLength(2);
  expect(box.expensePosts[0].client_id).toBe(box.expensePosts[1].client_id);
  expect(box.expensePosts[1].amount).toBe('1500.20');
  expect(box.expensePosts[1].deal_id).toBe(DEAL);
  expect(box.expensePosts[1].vehicle_id).toBe('v1');
  expect(box.posts).toHaveLength(0);
  await page.screenshot({path:'/private/tmp/urtruck-driver-expenses-list-20261018.png',fullPage:true});
  await page.getByTestId('expenses-add').click();
  await page.getByTestId('expense-amount').fill('1500');
  await page.getByTestId('expense-description').fill('Купил хлеб и жвачку');
  await page.screenshot({path:'/private/tmp/urtruck-driver-expenses-form-20261018.png',fullPage:true});
  await page.getByTestId('expenses-back').click();
  await page.getByTestId('expenses-back').click();
  await expect(page.getByTestId('deal-chat-input')).toBeVisible();
  await page.getByTestId('deal-workspace-back').click();
  const menu=page.getByTestId('feed-menu-btn');
  await page.getByTestId('bottom-nav-feed').click();
  await menu.click();
  await page.getByTestId('profile-my-expenses').click();
  await expect(page.getByTestId('expenses-filter-deal')).toBeVisible();
  await expect(page.getByTestId('expense-record')).toHaveCount(1);
  expect(box.errors).toEqual([]);
});

test('shipper keeps the seven chat actions and has no expense entry', async ({page})=>{
  const box=await fixture(page,{role:'client'});
  await page.getByTestId('deal-chat-plus').click();
  await expect(page.getByTestId('deal-chat-attach-contact')).toBeVisible();
  await expect(page.getByTestId('deal-chat-attach-expenses')).toHaveCount(0);
  expect(box.errors).toEqual([]);
});

for (const [lang, title] of [['RU','Расходы рейса'],['KK','Рейс шығындары'],['ZH','行程支出'],['EN','Trip expenses']]) {
  test(`полная подпись расходов и восемь доступных кнопок меню: ${lang}`, async ({ page }) => {
    const box = await fixture(page,{role:'driver',lang});
    await page.getByTestId('deal-chat-plus').click();
    const buttons = ['photo','camera','share','status','location','document','contact','expenses'].map(key=>page.getByTestId('deal-chat-attach-'+key));
    const bounds=[];
    for (const button of buttons) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      bounds.push(await button.boundingBox());
    }
    const expense=buttons[7];
    await expect(expense).toHaveAttribute('aria-label',title);
    await expect(expense).toContainText(title);
    const textFits=await expense.evaluate(node=>Array.from(node.querySelectorAll('div')).filter(n=>n.textContent===node.getAttribute('aria-label')).every(n=>n.scrollWidth<=n.clientWidth+1));
    expect(textFits).toBeTruthy();
    for(const b of bounds){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}
    await page.screenshot({path:`/private/tmp/urtruck-expenses-candidate-menu-${lang}.png`,fullPage:true});
    await expense.click();
    await expect(page.getByTestId('expenses-add')).toBeVisible();
    expect(box.posts).toHaveLength(0);expect(box.errors).toEqual([]);
  });
}
