(() => {
  'use strict';

  const copy = {
    ru: {
      'nav.roles':'Кому подходит','nav.how':'Как работает','nav.screens':'В приложении','nav.support':'Поддержка','nav.download':'Скачать приложение',
      'language.label':'Язык сайта','hero.eyebrow':'Для грузоотправителей и водителей','hero.title':'Найдите партнёра для следующего рейса.','hero.body':'UrTruck объединяет объявления о грузах и рейсах, предложения по перевозке и общение участников в мобильном приложении.','hero.cta':'Посмотреть приложение','hero.secondary':'Как это работает','hero.note':'Выберите магазин и подтвердите установку на его странице.','hero.route':'Груз · рейс · сделка',
      'strip.one':'Объявления о грузах и рейсах','strip.two':'Предложения и обсуждение условий','strip.three':'Сделки и чат',
      'roles.eyebrow':'Один сервис — две стороны перевозки','roles.title':'Работайте со своей стороны маршрута','roles.intro':'В приложении можно искать подходящие предложения, договариваться и продолжать работу в сделке.','roles.shipper.title':'Грузоотправителю','roles.shipper.body':'Разместите груз с маршрутом и условиями. Получайте предложения водителей, обсуждайте цену и ведите принятую перевозку в сделке.','roles.driver.title':'Водителю','roles.driver.body':'Просматривайте доступные грузы, отправляйте предложение или находите заказчика через публикацию собственного рейса.','roles.more':'Посмотреть экраны',
      'how.eyebrow':'Понятная последовательность','how.title':'От объявления до завершения перевозки','how.step1.title':'Найдите или разместите','how.step1.body':'Грузоотправитель публикует груз, а водитель просматривает доступные объявления или размещает свой рейс.','how.step2.title':'Обсудите условия','how.step2.body':'Участники отправляют предложения, обсуждают цену и принимают согласованный вариант.','how.step3.title':'Продолжайте в сделке','how.step3.body':'После принятия предложения участники используют чат и доступные этапы перевозки.','how.note':'Доступность отдельных действий зависит от условий объявления, роли и состояния сделки.',
      'screens.eyebrow':'Взгляд внутрь','screens.title':'Рабочие экраны приложения','screens.body':'Здесь показаны скриншоты UrTruck из материалов приложения.','screens.tab1':'Грузы','screens.tab2':'Мои рейсы','screens.tab3':'Сделки','screens.caption1':'Лента грузов','screens.caption2':'Мои рейсы','screens.caption3':'Сделки','screens.captionBody':'Список объявлений с маршрутами и условиями.','screens.captionBody2':'Личный список опубликованных рейсов.','screens.captionBody3':'Переписки и работа по сделкам.','screens.side':'Интерфейс показан на подлинных скриншотах приложения',
      'download.eyebrow':'Выберите официальную платформу','download.title':'Продолжите в приложении UrTruck','download.body':'Откройте страницу приложения в своём магазине. Установка начинается только после вашего подтверждения.','download.desktop':'Выберите магазин для своего устройства.','download.android':'Для Android выделен Google Play. Обе страницы магазинов доступны ниже.','download.ios':'Для iPhone выделен App Store. Обе страницы магазинов доступны ниже.','download.google':'Открыть Google Play','download.apple':'Открыть App Store','download.qr':'Сканируйте камерой телефона',
      'support.eyebrow':'Мы на связи','support.title':'Нужна помощь?','support.body':'По вопросам приложения, доступа к аккаунту или удаления учётной записи напишите в поддержку.','footer.copy':'Сервис для участников грузоперевозок. Работа с аккаунтом доступна в мобильном приложении.','footer.terms':'Условия использования','footer.privacy':'Конфиденциальность','footer.support':'Поддержка','footer.delete':'Запросить удаление аккаунта','callback.success':'Эта страница не выполняет вход и не открывает регистрацию. Продолжите работу в приложении UrTruck. Если приложение ещё не установлено, выберите магазин ниже.','callback.error':'Не удалось завершить вход на этой странице. Веб-регистрация недоступна. Откройте приложение UrTruck или выберите магазин ниже.','callback.generic':'Для работы с аккаунтом используйте приложение UrTruck. На публичном сайте нет экранов входа и регистрации.',
    },
    en: {
      'nav.roles':'Who it’s for','nav.how':'How it works','nav.screens':'In the app','nav.support':'Support','nav.download':'Get the app','language.label':'Website language',
      'hero.eyebrow':'For shippers and drivers','hero.title':'Find a partner for your next trip.','hero.body':'UrTruck brings cargo and trip listings, transport offers, and participant communication together in a mobile app.','hero.cta':'Explore the app','hero.secondary':'How it works','hero.note':'Choose a store and confirm installation on its page.','hero.route':'Cargo · trip · deal',
      'strip.one':'Cargo and trip listings','strip.two':'Offers and terms discussion','strip.three':'Deals and chat',
      'roles.eyebrow':'One service, both sides of a shipment','roles.title':'Work from your side of the route','roles.intro':'Use the app to find relevant listings, agree on terms, and continue work in a deal.','roles.shipper.title':'For shippers','roles.shipper.body':'Post cargo with its route and terms. Receive driver offers, discuss the price, and manage an accepted shipment in a deal.','roles.driver.title':'For drivers','roles.driver.body':'Browse available cargo, send an offer, or find a customer by posting your own trip.','roles.more':'View app screens',
      'how.eyebrow':'A clear sequence','how.title':'From listing to completed transport','how.step1.title':'Find or post','how.step1.body':'A shipper posts cargo while a driver browses available listings or posts a trip.','how.step2.title':'Discuss the terms','how.step2.body':'Participants send offers, discuss the price, and accept an agreed option.','how.step3.title':'Continue in the deal','how.step3.body':'After an offer is accepted, participants use chat and the available transport stages.','how.note':'Available actions depend on the listing terms, role, and deal status.',
      'screens.eyebrow':'A closer look','screens.title':'Screens from the app','screens.body':'These are UrTruck screenshots from the app materials.','screens.tab1':'Cargo','screens.tab2':'My trips','screens.tab3':'Deals','screens.caption1':'Cargo feed','screens.caption2':'My trips','screens.caption3':'Deals','screens.captionBody':'Listings with routes and terms.','screens.captionBody2':'A personal list of published trips.','screens.captionBody3':'Conversations and deal activity.','screens.side':'The interface is shown in authentic app screenshots',
      'download.eyebrow':'Choose an official platform','download.title':'Continue in the UrTruck app','download.body':'Open the app page in your store. Installation starts only after you confirm it there.','download.desktop':'Choose the store for your device.','download.android':'Google Play is highlighted for Android. Both store pages remain available below.','download.ios':'App Store is highlighted for iPhone. Both store pages remain available below.','download.google':'Open Google Play','download.apple':'Open App Store','download.qr':'Scan with your phone camera',
      'support.eyebrow':'We’re here to help','support.title':'Need help?','support.body':'Contact support about the app, account access, or an account deletion request.','footer.copy':'A service for freight participants. Account features are available in the mobile app.','footer.terms':'Terms of use','footer.privacy':'Privacy','footer.support':'Support','footer.delete':'Request account deletion','callback.success':'This page does not sign you in or open registration. Continue in the UrTruck app. If it is not installed, choose a store below.','callback.error':'Sign-in could not be completed on this page. Web registration is unavailable. Open the UrTruck app or choose a store below.','callback.generic':'Use the UrTruck app for account features. The public website has no sign-in or registration screens.',
    },
    kk: {
      'nav.roles':'Кімдерге арналған','nav.how':'Қалай жұмыс істейді','nav.screens':'Қосымшада','nav.support':'Қолдау','nav.download':'Қосымшаны жүктеу','language.label':'Сайт тілі',
      'hero.eyebrow':'Жүк жөнелтушілер мен жүргізушілерге','hero.title':'Келесі рейске серіктес табыңыз.','hero.body':'UrTruck жүк пен рейс хабарландыруларын, тасымалдау ұсыныстарын және қатысушылар байланысын мобильді қосымшада біріктіреді.','hero.cta':'Қосымшаны көру','hero.secondary':'Қалай жұмыс істейді','hero.note':'Дүкенді таңдап, оның бетінен орнатуды растаңыз.','hero.route':'Жүк · рейс · мәміле',
      'strip.one':'Жүк пен рейс хабарландырулары','strip.two':'Ұсыныстар және шарттарды талқылау','strip.three':'Мәмілелер мен чат',
      'roles.eyebrow':'Бір сервис — тасымалдың екі тарабы','roles.title':'Маршруттың өз тарабыңыздан жұмыс істеңіз','roles.intro':'Қосымшада ұсыныстарды іздеп, шарттарды келісіп, мәміле ішінде жұмысты жалғастыруға болады.','roles.shipper.title':'Жүк жөнелтушіге','roles.shipper.body':'Маршруты мен шарттарын көрсетіп жүк жариялаңыз. Жүргізушілер ұсыныстарын алып, бағаны талқылап, қабылданған тасымалды мәміледе жүргізіңіз.','roles.driver.title':'Жүргізушіге','roles.driver.body':'Қолжетімді жүктерді қарап, ұсыныс жіберіңіз немесе өз рейсіңізді жариялап тапсырыс беруші табыңыз.','roles.more':'Қосымша экрандарын көру',
      'how.eyebrow':'Түсінікті реттілік','how.title':'Хабарландырудан тасымалдың аяқталуына дейін','how.step1.title':'Табыңыз немесе жариялаңыз','how.step1.body':'Жүк жөнелтуші жүкті жариялайды, ал жүргізуші хабарландыруларды қарайды немесе рейсін жариялайды.','how.step2.title':'Шарттарды талқылаңыз','how.step2.body':'Қатысушылар ұсыныстар жіберіп, бағаны талқылап, келіскен нұсқаны қабылдайды.','how.step3.title':'Мәміледе жалғастырыңыз','how.step3.body':'Ұсыныс қабылданғаннан кейін қатысушылар чат пен қолжетімді тасымал кезеңдерін пайдаланады.','how.note':'Әрекеттердің қолжетімділігі хабарландыру шарттарына, рөлге және мәміле күйіне байланысты.',
      'screens.eyebrow':'Ішіне көз жүгіртіңіз','screens.title':'Қосымшадағы жұмыс экрандары','screens.body':'Мұнда UrTruck қосымшасының материалдарындағы скриншоттар көрсетілген.','screens.tab1':'Жүктер','screens.tab2':'Рейстерім','screens.tab3':'Мәмілелер','screens.caption1':'Жүк таспасы','screens.caption2':'Рейстерім','screens.caption3':'Мәмілелер','screens.captionBody':'Маршруттары мен шарттары бар хабарландырулар.','screens.captionBody2':'Жарияланған рейстердің жеке тізімі.','screens.captionBody3':'Хат алмасу және мәміле жұмысы.','screens.side':'Интерфейс қосымшаның шынайы скриншоттарында көрсетілген',
      'download.eyebrow':'Ресми платформаны таңдаңыз','download.title':'UrTruck қосымшасында жалғастырыңыз','download.body':'Дүкеннен қосымша бетін ашыңыз. Орнату тек сол жерде растағаннан кейін басталады.','download.desktop':'Құрылғыңызға арналған дүкенді таңдаңыз.','download.android':'Android үшін Google Play ерекшеленген. Төменде екі дүкен сілтемесі де бар.','download.ios':'iPhone үшін App Store ерекшеленген. Төменде екі дүкен сілтемесі де бар.','download.google':'Google Play ашу','download.apple':'App Store ашу','download.qr':'Телефон камерасымен сканерлеңіз',
      'support.eyebrow':'Байланыстамыз','support.title':'Көмек керек пе?','support.body':'Қосымша, аккаунтқа қолжетімділік немесе аккаунтты жою сұрауы бойынша қолдауға жазыңыз.','footer.copy':'Жүк тасымалына қатысушыларға арналған сервис. Аккаунтпен жұмыс мобильді қосымшада қолжетімді.','footer.terms':'Пайдалану шарттары','footer.privacy':'Құпиялылық','footer.support':'Қолдау','footer.delete':'Аккаунтты жоюға сұрау','callback.success':'Бұл бет жүйеге кіргізбейді және тіркеуді ашпайды. UrTruck қосымшасында жалғастырыңыз. Қосымша орнатылмаса, төменнен дүкенді таңдаңыз.','callback.error':'Бұл бетте кіруді аяқтау мүмкін болмады. Веб-тіркеу қолжетімсіз. UrTruck қосымшасын ашыңыз немесе төменнен дүкенді таңдаңыз.','callback.generic':'Аккаунтпен жұмыс істеу үшін UrTruck қосымшасын пайдаланыңыз. Ашық сайтта кіру және тіркелу экрандары жоқ.',
    },
    zh: {
      'nav.roles':'适用对象','nav.how':'使用方式','nav.screens':'应用界面','nav.support':'支持','nav.download':'下载应用','language.label':'网站语言',
      'hero.eyebrow':'面向货主与司机','hero.title':'为下一趟运输找到合作伙伴。','hero.body':'UrTruck 在移动应用中汇集货运与线路信息、运输报价以及参与方沟通。','hero.cta':'了解应用','hero.secondary':'了解使用方式','hero.note':'选择应用商店，并在商店页面确认安装。','hero.route':'货物 · 线路 · 交易',
      'strip.one':'货物与线路信息','strip.two':'报价与条件沟通','strip.three':'交易与聊天',
      'roles.eyebrow':'同一服务，连接运输双方','roles.title':'从您的运输角色开始','roles.intro':'在应用中查找合适的信息、协商条件，并在交易中继续处理。','roles.shipper.title':'货主','roles.shipper.body':'发布货物路线与条件。接收司机报价、讨论价格，并在交易中跟进已接受的运输。','roles.driver.title':'司机','roles.driver.body':'浏览可用货物、发送报价，或发布自己的线路寻找客户。','roles.more':'查看应用界面',
      'how.eyebrow':'清晰的流程','how.title':'从发布信息到完成运输','how.step1.title':'查找或发布','how.step1.body':'货主发布货物，司机浏览可用信息或发布自己的线路。','how.step2.title':'讨论条件','how.step2.body':'参与方发送报价、讨论价格并接受达成一致的方案。','how.step3.title':'在交易中继续','how.step3.body':'报价接受后，参与方使用聊天和可用的运输阶段功能。','how.note':'具体操作取决于信息条件、用户角色和交易状态。',
      'screens.eyebrow':'应用一览','screens.title':'应用中的工作界面','screens.body':'以下为 UrTruck 应用资料中的真实截图。','screens.tab1':'货物','screens.tab2':'我的线路','screens.tab3':'交易','screens.caption1':'货物列表','screens.caption2':'我的线路','screens.caption3':'交易','screens.captionBody':'显示线路与条件的货物信息。','screens.captionBody2':'已发布线路的个人列表。','screens.captionBody3':'交易沟通与处理。','screens.side':'界面来自应用的实际截图',
      'download.eyebrow':'选择官方平台','download.title':'在 UrTruck 应用中继续','download.body':'打开应用商店中的 UrTruck 页面。只有您在商店确认后才会开始安装。','download.desktop':'请选择适合您设备的商店。','download.android':'Android 用户优先显示 Google Play。下方仍保留两个商店链接。','download.ios':'iPhone 用户优先显示 App Store。下方仍保留两个商店链接。','download.google':'打开 Google Play','download.apple':'打开 App Store','download.qr':'使用手机相机扫描',
      'support.eyebrow':'联系我们','support.title':'需要帮助？','support.body':'如有应用、账户访问或账户删除请求，请联系支持团队。','footer.copy':'为货运参与方提供的服务。账户功能请在移动应用中使用。','footer.terms':'使用条款','footer.privacy':'隐私政策','footer.support':'支持','footer.delete':'申请删除账户','callback.success':'此页面不会登录账户或打开注册。请在 UrTruck 应用中继续。如果尚未安装，请在下方选择商店。','callback.error':'无法在此页面完成登录。网页注册不可用。请打开 UrTruck 应用或在下方选择商店。','callback.generic':'账户功能请使用 UrTruck 应用。此公开网站不提供登录或注册页面。',
    },
  };

  const screens = {
    cargo: { src: '/site/assets/cargo-feed.png', alt: { ru:'Скриншот ленты грузов UrTruck', en:'UrTruck cargo feed screenshot', kk:'UrTruck жүк таспасының скриншоты', zh:'UrTruck 货物列表截图' }, title:'screens.caption1', body:'screens.captionBody', number:'01 / 03' },
    trips: { src: '/site/assets/trips-screen.png', alt: { ru:'Скриншот личного списка рейсов UrTruck', en:'UrTruck personal trips screenshot', kk:'UrTruck жеке рейстер тізімінің скриншоты', zh:'UrTruck 个人线路列表截图' }, title:'screens.caption2', body:'screens.captionBody2', number:'02 / 03' },
    deals: { src: '/site/assets/deal-screen.png', alt: { ru:'Скриншот сделок UrTruck', en:'UrTruck deals screenshot', kk:'UrTruck мәмілелер скриншоты', zh:'UrTruck 交易页面截图' }, title:'screens.caption3', body:'screens.captionBody3', number:'03 / 03' },
  };

  function applyLanguage(language) {
    const lang = copy[language] ? language : 'ru';
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    document.documentElement.dataset.language = lang;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = copy[lang][element.dataset.i18n];
      if (typeof value === 'string') element.textContent = value;
    });
    const select = document.getElementById('language-select');
    if (select) select.value = lang;
    try { localStorage.setItem('urtruck-site-language', lang); } catch { /* Optional preference only. */ }
    if (currentScreen) showScreen(currentScreen, lang);
    if (callbackKind) showCallbackNotice(callbackKind, lang);
  }

  let currentScreen = 'cargo';
  function showScreen(name, lang = document.documentElement.dataset.language || 'ru') {
    const screen = screens[name];
    if (!screen) return;
    currentScreen = name;
    const image = document.getElementById('app-screenshot');
    image.style.opacity = '0';
    window.setTimeout(() => { image.src = screen.src; image.alt = screen.alt[lang] || screen.alt.ru; image.style.opacity = '1'; }, 100);
    document.getElementById('screen-caption').textContent = copy[lang][screen.title];
    document.getElementById('screen-number').textContent = screen.number;
    document.querySelector('.screen-caption p').textContent = copy[lang][screen.body];
    document.querySelectorAll('.screen-tab').forEach((tab) => {
      const active = tab.dataset.screen === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  let callbackKind = null;
  function consumePublicCallback() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const callbackKeys = ['social_auth', 'code', 'state', 'error', 'error_description', 'access_token', 'refresh_token'];
    const hasCallback = url.searchParams.has('social_auth')
      || url.searchParams.has('code')
      || url.searchParams.has('state')
      || (url.searchParams.has('error') && url.searchParams.has('error_description'))
      || hashParams.has('access_token') || hashParams.has('refresh_token');
    if (!hasCallback) return;
    const failed = url.searchParams.has('error') || url.searchParams.has('error_description') || hashParams.has('error') || hashParams.has('error_description');
    callbackKind = failed ? 'error' : (url.searchParams.has('social_auth') || url.searchParams.has('code') || hashParams.has('access_token') ? 'success' : 'generic');
    callbackKeys.forEach((key) => { url.searchParams.delete(key); hashParams.delete(key); });
    url.hash = hashParams.size ? `#${hashParams.toString()}` : '';
    window.history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function showCallbackNotice(kind, lang) {
    const notice = document.getElementById('callback-notice');
    if (!notice || !kind) return;
    const key = kind === 'error' ? 'callback.error' : kind === 'success' ? 'callback.success' : 'callback.generic';
    notice.textContent = copy[lang][key];
    notice.hidden = false;
  }

  function highlightStore() {
    const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`;
    const platform = /Android/i.test(ua) ? 'android'
      : (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : null);
    if (!platform) return;
    document.documentElement.dataset.storePlatform = platform;
    document.querySelector(`[data-store-card="${platform}"]`)?.classList.add('is-primary');
    const lang = document.documentElement.dataset.language || 'ru';
    const hint = document.getElementById('platform-hint');
    hint.textContent = copy[lang][platform === 'android' ? 'download.android' : 'download.ios'];
  }

  function init() {
    consumePublicCallback();
    let language = 'ru';
    try { language = localStorage.getItem('urtruck-site-language') || 'ru'; } catch { /* Use Russian default. */ }
    if (new URLSearchParams(location.search).has('lang')) language = new URLSearchParams(location.search).get('lang');
    document.getElementById('language-select')?.addEventListener('change', (event) => applyLanguage(event.target.value));
    document.querySelectorAll('.screen-tab').forEach((tab) => tab.addEventListener('click', () => showScreen(tab.dataset.screen)));
    applyLanguage(language);
    highlightStore();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
