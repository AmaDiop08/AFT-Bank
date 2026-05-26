'use strict';

/* =====================
   CONFIG & STORAGE
===================== */
const STORAGE_KEYS = {
  USERS: 'aft_users',
  ACCOUNTS: 'aft_accounts',
  NEXT_ID: 'aft_next_id',
  CARDS: 'aft_cards',
  REQUESTS: 'aft_card_requests',
  UI_PREFS: 'aft_ui_prefs',
  THEME: 'aft_theme',
  LAST_ACCESS: 'aft_last_access'
};

const CONFIG = {
  MAX_MOV: 10,
  MAX_HOLDERS: 3,
  API_LATENCY: [500, 1200]
};

const EMAILJS_CONFIG = {
  serviceId: 'service_5p8xr1c',
  accountServiceId: 'service_a5o2kdw',
  publicKey: '8QsPf-DxlBGVOgVEX',
  accountPublicKey: 'MLFVKa-3iJ2RgLOZu',
  templates: {
    register: 'template_bjve5y2',
    account: 'template_gc8372n',
    card: 'template_s3u8kjq'
  }
};


const PLAN_RULES = {
  BASIC: { limits: { day: 500, online: 300 }, privileges: ['virtual_card', 'online_payments'], contactless: false, price: 0 },
  SILVER:{ limits: { day: 1500, online: 900 }, privileges: ['virtual_card','online_payments','physical_card','stats'], contactless: true, price: 4.99 },
  GOLD:  { limits: { day: 5000, online: 2500 }, privileges: ['virtual_card','online_payments','physical_card','stats','vip'], contactless: true, price: 14.99 }
};

const defaultUsers = [
  { username:'admin', password:'admin', nomeCompleto:'Amministratore', email:'', via:'', telefono:'', cf:'', plan:'BASIC' }
];

const defaultAccounts = [
  { id:'ACC-001', nome:'Conto Principale', tipo:'corrente_canone', saldo:12450.80, tasso:null, dataApertura:'2023-02-14', ultimoInteresse:null, proprietario:'admin', titolari:[{ nome:'Mario', cognome:'Celeste', cf:'CLSMRA80A01H501Z' }], movimenti:[] }
];

const defaultCards = [
  { id:'CARD-001', username:'admin', plan:'BASIC', cardNumber:'5342 1984 7741 4821', expiry:'09/29', cvc:'493', status:'active', virtualLinked:true, secureOnline:true, contactless:false, createdAt:'2025-11-01', lastReplacedAt:null, label:'Carta principale', type:'virtuale', accountId:'ACC-001' }
];

const defaultRequests = [];

/* =====================
   STATE
===================== */
let utenti = loadUsers();
let conti = loadAccounts();
let carte = loadCards();
let richieste = loadRequests();
let nextAccNum = loadNextId();

let utenteCorrente = null;
let authMode = 'login';
let selectedAccountId = null;
let selectedCardId = null;
let editingCardId = null;

let saldoVisibile = true;
let cardExpiryVisible = true;

let selectedPlanForRequest = null;
let requestWizard = { step: 1, fullName: '', cardType: '', shipAddress: '', accountId: '' };
let currentOpType = null;
let opPending = false;
let accountFormMode = 'create';
let editingAccountId = null;
let authStep = 1;
let cardRequestOpen = false;
let accountRequestOpen = false;

let cvcVisible = false;
let cvcTimer = null;
let cvcCountdownTimer = null;
let lastCardId = null;
let xlsxLoadPromise = null;
let lastAccessAt = null;

const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = n => '€ ' + money(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

/* =====================
   STORAGE
===================== */
function loadUsers(){ const raw = localStorage.getItem(STORAGE_KEYS.USERS); return raw ? JSON.parse(raw) : defaultUsers; }
function loadAccounts(){ const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS); return raw ? JSON.parse(raw) : defaultAccounts; }
function loadCards(){
  const raw = localStorage.getItem(STORAGE_KEYS.CARDS);
  const list = raw ? JSON.parse(raw) : defaultCards;
  const mkNumber = () => Array.from({length:16},()=>Math.floor(Math.random()*10)).join('').replace(/(.{4})/g,'$1 ').trim();
  const mkExpiry = () => `${String(Math.floor(Math.random()*12)+1).padStart(2,'0')}/${String(new Date().getFullYear()+3).slice(2)}`;
  const mkCvc = () => String(Math.floor(Math.random()*900)+100);
  list.forEach(c=>{
    if(!c.label) c.label = `${c.plan} • ${c.id}`;
    if(!c.type) c.type = 'virtuale';
    if(!c.cardNumber) c.cardNumber = mkNumber();
    if(!c.expiry) c.expiry = mkExpiry();
    if(!c.cvc) c.cvc = mkCvc();
  });
  return list;
}
function loadRequests(){ const raw = localStorage.getItem(STORAGE_KEYS.REQUESTS); return raw ? JSON.parse(raw) : defaultRequests; }
function loadNextId(){ const raw = localStorage.getItem(STORAGE_KEYS.NEXT_ID); return raw ? parseInt(raw,10) : 2; }
function loadUIPrefs(){
  const raw = localStorage.getItem(STORAGE_KEYS.UI_PREFS);
  return raw ? JSON.parse(raw) : { showExpiry:true };
}
function saveUsers(){ localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(utenti)); }
function saveAccounts(){ localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(conti)); }
function saveCards(){ localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(carte)); }
function saveRequests(){ localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(richieste)); }
function saveNextId(){ localStorage.setItem(STORAGE_KEYS.NEXT_ID, String(nextAccNum)); }
function saveUIPrefs(p){ localStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(p)); }

/* =====================
   MOCK DATA INIT
===================== */
initMockData();

function initMockData(){
  conti.forEach((c, idx)=>{
    if(!c.iban) c.iban = generateIban(c.id, idx);
    if(!c.status) c.status = 'active';
    if(!Array.isArray(c.movimenti)) c.movimenti = [];
    if(c.movimenti.length === 0) c.movimenti = generateMockMovements(c);
  });
  saveAccounts();
}

function generateIban(id, idx){
  const base = String(100000 + idx).padStart(6,'0');
  return `IT60X05428${base}01000000${id.replace('ACC-','')}`;
}

function generateMockMovements(account){
  const templates = [
    { type:'Versamento', desc:'Versamento contanti sportello', amount: 350 },
    { type:'Bonifico', desc:'Bonifico in uscita', amount: -220 },
    { type:'Pagamento', desc:'Pagamento POS', amount: -48.5 },
    { type:'Accredito', desc:'Stipendio', amount: 1450 },
    { type:'Prelevamento', desc:'Prelievo ATM', amount: -120 },
    { type:'Giroconto', desc:'Giroconto interno', amount: 300 },
    { type:'Addebito', desc:'Utenze domestiche', amount: -95.7 }
  ];

  const out = [];
  let currentBalance = account.saldo;
  for(let i=0;i<9;i++){
    const tpl = templates[i % templates.length];
    const date = new Date();
    date.setDate(date.getDate() - (i*3 + 1));
    const amount = tpl.amount;
    const movement = {
      id: `${account.id}-MOV-${String(i+1).padStart(3,'0')}`,
      dateAcc: date.toISOString().split('T')[0],
      dateVal: date.toISOString().split('T')[0],
      type: tpl.type,
      desc: tpl.desc,
      amount,
      balance: currentBalance
    };
    out.push(movement);
    currentBalance = money(currentBalance - amount);
  }
  return out;
}

/* =====================
   API SIMULATION
===================== */
const api = {
  delay(){ const [min,max]=CONFIG.API_LATENCY; return Math.floor(Math.random()*(max-min+1))+min; },
  async updatePlan(username, plan){
    await wait(api.delay());
    const u=utenti.find(x=>x.username===username);
    if(!u) throw new Error('Utente non trovato');
    u.plan=plan;
    saveUsers();
    return u;
  },
  async getCards(username){ await wait(api.delay()); return carte.filter(c=>c.username===username); },
  async updateCard(cardId, patch){ await wait(api.delay()); const c=carte.find(x=>x.id===cardId); Object.assign(c, patch); saveCards(); return c; },
  async createRequest(request){ await wait(api.delay()); richieste.push(request); saveRequests(); return request; },
  async updateRequest(id, patch){ await wait(api.delay()); const r=richieste.find(x=>x.id===id); Object.assign(r, patch); saveRequests(); return r; }
};
const wait = ms => new Promise(r=>setTimeout(r, ms));

function initEmailJs(publicKey){
  if(!window.emailjs) return;
  const key = publicKey || EMAILJS_CONFIG.publicKey;
  if(initEmailJs._doneKey === key) return;
  window.emailjs.init({ publicKey: key });
  initEmailJs._doneKey = key;
}

function sendEmailJs(templateId, params, serviceId, publicKey){
  initEmailJs(publicKey);
  if(!window.emailjs){
    notify('Invio email non disponibile');
    return Promise.resolve(false);
  }
  if(!templateId){
    notify('Template email mancante');
    return Promise.resolve(false);
  }
  if(params && !params.to_email && params.email_utente){
    params.to_email = params.email_utente;
  }
  if(params && !params.to_email){
    console.warn('EmailJS send skipped: to_email missing');
    notify('Email destinatario mancante');
    return Promise.resolve(false);
  }
  notify('Invio email di conferma in corso...');
  const service = serviceId || EMAILJS_CONFIG.serviceId;
  console.log('EmailJS send payload:', JSON.stringify({ service, templateId, params }, null, 2));
  return window.emailjs
    .send(service, templateId, params)
    .then((res)=>{
      console.log('EmailJS send ok:', res.status, res.text);
      notify('Email di conferma inviata');
      return true;
    })
    .catch((err)=>{
      console.error('EmailJS send error:', err);
      if(err && err.text) console.error('EmailJS error text:', err.text);
      notify('Invio email non riuscito');
      return false;
    });
}

/* =====================
   VALIDATION HELPERS
===================== */
const validateCF = cf => cf && /^[A-Z0-9]{16}$/.test(cf);
const validatePhone = phone => /^\+?\d{8,15}$/.test(phone.replace(/\s+/g,''));
const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function setFieldStatus(el, ok){
  if(!el) return;
  el.classList.remove('ok','bad','neutral');
  el.classList.add(ok===null?'neutral':ok?'ok':'bad');
  el.textContent = ok===null ? '—' : ok ? '✓' : '✕';
}

/* =====================
   UTILS
===================== */
const genCardNumber = () => Array.from({length:16},()=>Math.floor(Math.random()*10)).join('').replace(/(.{4})/g,'$1 ').trim();
const genExpiry = () => `${String(Math.floor(Math.random()*12)+1).padStart(2,'0')}/${String(new Date().getFullYear()+3).slice(2)}`;
const genCVC = () => String(Math.floor(Math.random()*900)+100);
const getUserPlan = () => utenteCorrente?.plan || 'BASIC';

function planClass(plan){
  const p = String(plan || 'BASIC').toLowerCase();
  return p === 'silver' ? 'plan-silver' : p === 'gold' ? 'plan-gold' : 'plan-basic';
}

function statusLabel(st){
  switch(st){
    case 'active': return 'Attiva';
    case 'inactive': return 'Inattiva';
    case 'suspended': return 'Sospesa';
    case 'blocked': return 'Bloccata';
    case 'frozen': return 'Congelata';
    case 'expired': return 'Scaduta';
    default: return String(st || '—');
  }
}

function formatDate(it){
  const d = new Date(it);
  return d.toLocaleDateString('it-IT');
}

function formatDateTime(ts){
  const d = new Date(ts);
  const date = d.toLocaleDateString('it-IT');
  const time = d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  return `${date} · ${time}`;
}

function truncate(s, len){ return s.length > len ? s.slice(0, len-1) + '…' : s; }

function abbrevIban(iban){
  if(!iban) return '—';
  return `${iban.slice(0,4)}••••${iban.slice(-4)}`;
}

function labelAccountType(tipo){
  switch(tipo){
    case 'corrente_canone': return 'Corrente (canone fisso)';
    case 'corrente_no_canone': return 'Corrente (senza canone)';
    case 'deposito': return 'Conto deposito';
    default: return String(tipo || '—');
  }
}

function addMovement(account, movement){
  if(!account.movimenti) account.movimenti = [];
  const id = `${account.id}-MOV-${String(account.movimenti.length + 1).padStart(3,'0')}`;
  account.movimenti.unshift({ id, ...movement });
  if(account.movimenti.length > CONFIG.MAX_MOV) account.movimenti.length = CONFIG.MAX_MOV;
}

/* =====================
   THEME
===================== */
function loadTheme(){ return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark'; }
function applyTheme(theme){
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  const label = document.getElementById('themeLabel');
  if(label) label.textContent = theme === 'light' ? 'Chiaro' : 'Scuro';
}

/* =====================
   COOKIE
===================== */
function initCookieBanner(){
  const banner = document.getElementById('cookieBanner');
  const btn = document.getElementById('acceptCookiesBtn');
  if(!banner || !btn) return;

  if(localStorage.getItem('cookieAccettati') === 'true'){
    banner.remove();
    return;
  }

  if(btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', ()=>{
    localStorage.setItem('cookieAccettati', 'true');
    banner.classList.add('is-closing');
    setTimeout(()=>banner.remove(), 260);
  }, { once:true });
}

/* =====================
   AUTH
===================== */
window.switchAuthTab = function(mode){
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('authSteps').style.display = mode === 'register' ? 'flex' : 'none';
  document.getElementById('loginFields').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('loginSubmit').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authHint').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authSubmitLabel').textContent = mode === 'login' ? 'Accedi' : 'Registrati';
  authStep = 1;
  goToAuthStep(1);
  document.getElementById('authError').textContent = '';
  // Prefill demo credentials when switching to login for quicker testing
  if(mode === 'login'){
    const u = document.getElementById('authUser');
    const p = document.getElementById('authPass');
    if(u && p){ u.value = 'admin'; p.value = 'admin'; }
  }
};

function goToAuthStep(step){
  if(authMode !== 'register'){
    document.querySelectorAll('.auth-step').forEach(s=>s.style.display = 'none');
    return;
  }
  authStep = step;
  document.querySelectorAll('.auth-step').forEach(s=>s.style.display = 'none');
  const target = document.getElementById(`authStep${step}`);
  if(target) target.style.display = 'block';

  document.querySelectorAll('.auth-steps .step').forEach(s=>{
    s.classList.toggle('active', Number(s.dataset.step) === step);
  });
}

window.handleAuth = function(e){
  e.preventDefault();
  const err = document.getElementById('authError');

  if(authMode==='register'){
    const nome = document.getElementById('authNome').value.trim();
    const cognome = document.getElementById('authCognome').value.trim();
    const user = document.getElementById('authUserReg').value.trim();
    const pass = document.getElementById('authPassReg').value;

    const cf = document.getElementById('authCF').value.trim().toUpperCase();
    const email = document.getElementById('authEmail').value.trim();
    const via = document.getElementById('authVia').value.trim();

    if(!nome || !cognome || !user || !pass || !email){ err.textContent='Compila tutti i campi obbligatori.'; return; }
    if(email && !validateEmail(email)){ err.textContent='Email non valida.'; return; }
    if(cf && !validateCF(cf)){ err.textContent='Codice fiscale non valido.'; return; }

    utenti.push({ username:user, password:pass, nomeCompleto: nome+' '+cognome, email, via, telefono:'', cf, plan:'BASIC' });
    saveUsers();
    if(email){
      sendEmailJs(EMAILJS_CONFIG.templates.register, {
        nome_utente: nome,
        cognome_utente: cognome,
        email_utente: email,
        id_utente: user,
        data_registrazione: new Date().toLocaleDateString('it-IT'),
        to_email: email,
        email
      });
    }
    entraNellApp({ username:user, nomeCompleto: nome+' '+cognome, email, via, cf, plan:'BASIC', password:pass });
    return;
  }

  const u = document.getElementById('authUser').value.trim();
  const p = document.getElementById('authPass').value;
  const ut = utenti.find(x=>x.username===u && x.password===p);
  if(!ut){ err.textContent='Credenziali non valide.'; return; }
  entraNellApp(ut);
};

function entraNellApp(utente){
  utenteCorrente = utente;

  lastAccessAt = localStorage.getItem(STORAGE_KEYS.LAST_ACCESS);
  localStorage.setItem(STORAGE_KEYS.LAST_ACCESS, new Date().toISOString());

  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  applyTheme(loadTheme());
  initCookieBanner();

  const iniziali = utente.nomeCompleto.split(' ').map(p=>p[0]).join('').toUpperCase();
  document.getElementById('avatarInitials').textContent = iniziali;

  const prefs = loadUIPrefs();
  cardExpiryVisible = prefs.showExpiry ?? true;

  initProfileMenu();
  initCardRequestPanel();
  initRequestWizard();
  initProfileModal();
  initEditCardModal();
  initAccountForm();
  initCardControls();
  initCardsListEvents();
  initCvcAuthModal();
  initBlockCardModal();
  initMovementsFilters();
  initClock();
  initThemeToggle();
  initNav();
  initBalanceToggle();
  initLogoutButtons();

  renderHome();
  renderPlansBadge();
  renderCardsSection();
  renderMovementsSection();
  renderAccountsSection();
  populateOpAccounts();
}

/* =====================
   HOME
===================== */
function renderHome(){
  const ora = new Date().getHours();
  const saluto = ora < 12 ? 'Buongiorno,' : ora < 18 ? 'Buon pomeriggio,' : 'Buonasera,';
  const nomeRaw = (utenteCorrente?.nomeCompleto || 'Utente').split(' ')[0];
  const nome = nomeRaw.charAt(0).toUpperCase() + nomeRaw.slice(1);

  document.getElementById('greetText').textContent = saluto;
  document.getElementById('greetName').textContent = nome;

  const saldo = contiUtente().reduce((s,c)=>s+c.saldo,0);
  const balanceEl = document.getElementById('totalBalance');
  const eyeBtn = document.getElementById('toggleBalanceBtn');

  if(saldoVisibile){
    balanceEl.textContent = fmt(saldo);
    balanceEl.classList.remove('hidden');
    eyeBtn.classList.remove('is-hidden');
    eyeBtn.setAttribute('aria-label','Nascondi saldo');
    eyeBtn.setAttribute('title','Nascondi saldo');
  } else {
    balanceEl.textContent = '••••••';
    balanceEl.classList.add('hidden');
    eyeBtn.classList.add('is-hidden');
    eyeBtn.setAttribute('aria-label','Mostra saldo');
    eyeBtn.setAttribute('title','Mostra saldo');
  }

  const movs = getUserMovements();
  const monthKey = new Date().toISOString().slice(0,7);
  const monthMovs = movs.filter(m=>m.dateAcc.startsWith(monthKey));

  const inTot = monthMovs.filter(m=>m.amount>0).reduce((s,m)=>s+m.amount,0);
  const outTot = Math.abs(monthMovs.filter(m=>m.amount<0).reduce((s,m)=>s+m.amount,0));
  const opsCount = monthMovs.length;

  document.getElementById('homeEntrateMese').textContent = fmt(inTot);
  document.getElementById('homeUsciteMese').textContent = fmt(outTot);
  const opsEl = document.getElementById('homeOpsMese');
  if(opsEl) opsEl.textContent = String(opsCount);
  const quickAccounts = document.getElementById('homeActiveAccounts');
  const quickCards = document.getElementById('homeActiveCards');
  const quickOps = document.getElementById('homeOpsQuick');
  if(quickAccounts) quickAccounts.textContent = String(contiUtente().length);
  if(quickCards) quickCards.textContent = String(carte.filter(c=>c.username===utenteCorrente?.username).length);
  if(quickOps) quickOps.textContent = String(opsCount);

  const net = inTot - outTot;
  const netEl = document.getElementById('homeMonthNet');
  if(netEl){
    netEl.textContent = fmt(net);
    netEl.classList.toggle('pos', net >= 0);
    netEl.classList.toggle('neg', net < 0);
  }

  const lastAccessEl = document.getElementById('homeLastAccess');
  const lastAccessSub = document.getElementById('homeLastAccessSub');
  if(lastAccessEl && lastAccessSub){
    lastAccessEl.textContent = lastAccessAt ? formatDateTime(lastAccessAt) : 'Primo accesso';
    lastAccessSub.textContent = 'Accesso web';
  }

  const pie = document.getElementById('homePie');
  const legend = document.getElementById('homePieLegend');
  if(pie && legend){
    const expenseMovs = monthMovs.filter(m=>m.amount < 0);
    const totals = {};
    expenseMovs.forEach(m=>{
      const key = displayMovementType(m.type) || 'Altro';
      totals[key] = (totals[key] || 0) + Math.abs(m.amount);
    });

    const entries = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
    const top = entries.slice(0,4);
    const rest = entries.slice(4).reduce((s, [,v])=>s+v, 0);
    if(rest > 0) top.push(['Altro', rest]);

    const colors = ['#5f7ae6', '#45c1a1', '#ff8b5c', '#f3b24c', '#9aa6bf'];
    const total = top.reduce((s, [,v])=>s+v, 0);

    if(!total){
      pie.style.background = 'conic-gradient(var(--line) 0 360deg)';
      legend.innerHTML = '<div class="pie-item"><span class="pie-swatch" style="background: var(--line);"></span><span>Nessuna spesa</span><strong>€ 0,00</strong></div>';
    } else {
      let start = 0;
      const segments = top.map(([label, value], idx)=>{
        const angle = (value / total) * 360;
        const end = start + angle;
        const color = colors[idx % colors.length];
        const seg = `${color} ${start}deg ${end}deg`;
        start = end;
        return seg;
      });
      pie.style.background = `conic-gradient(${segments.join(', ')})`;
      legend.innerHTML = top.map(([label, value], idx)=>{
        const color = colors[idx % colors.length];
        return `
          <div class="pie-item">
            <span class="pie-swatch" style="background:${color}"></span>
            <span>${label}</span>
            <strong>${fmt(value)}</strong>
          </div>
        `;
      }).join('');
    }
  }


  const list = document.getElementById('homeLastMovements');
  list.innerHTML = '';
  movs.slice(0,4).forEach(m=>{
    list.innerHTML += `
      <div class="last-mov-item">
        <span>${m.desc}</span>
        <span class="amount ${m.amount>=0?'pos':'neg'}">${fmt(m.amount)}</span>
      </div>
    `;
  });
  if(!movs.length) list.innerHTML = `<div class="muted">Nessun movimento registrato</div>`;

  renderHomeAccounts();
}

function renderHomeAccounts(){
  const accounts = contiUtente();
  const list = document.getElementById('homeAccountsList');
  if(!list) return;
  list.innerHTML = '';
  accounts.forEach(acc=>{
    const last = acc.movimenti?.[0];
    list.innerHTML += `
      <div class="account-row">
        <div>
          <strong>${acc.nome}</strong>
          <small>IBAN: ${abbrevIban(acc.iban)} • ${labelAccountType(acc.tipo)}</small>
        </div>
        <div>
          <small>Saldo</small>
          <strong>${fmt(acc.saldo)}</strong>
        </div>
        <div class="row-right">
          <small>${last ? `${formatDate(last.dateAcc)} · ${last.desc}` : '—'}</small>
        </div>
      </div>
    `;
  });
}

/* =====================
   CONTI
===================== */
const contiUtente = () => utenteCorrente ? conti.filter(c=>c.proprietario===utenteCorrente.username) : [];

function renderAccountsSection(){
  const accounts = contiUtente();
  const totalBalance = accounts.reduce((s,c)=>s+c.saldo,0);
  document.getElementById('contiSummaryBalance').textContent = fmt(totalBalance);
  document.getElementById('contiSummaryActive').textContent = accounts.length;

  const lastMov = getUserMovements()[0];
  document.getElementById('contiSummaryLast').textContent = lastMov ? truncate(lastMov.desc,18) : '—';

  const list = document.getElementById('accountsList');
  const detail = document.getElementById('accountDetailBody');
  const editBtn = document.getElementById('editAccountBtn');
  list.innerHTML = '';

  if(!accounts.length){
    list.innerHTML = '<div class="muted">Nessun conto attivo. Crea il primo conto.</div>';
    selectedAccountId = null;
    if(editBtn) editBtn.disabled = true;
    if(detail) detail.innerHTML = '<div class="muted">Apri un conto per vedere la scheda.</div>';
    accountFormMode = 'create';
    editingAccountId = null;
    openAccountForm();
    goToAccountStep(1);
    openAccountRequestPanel();
    return;
  }

  accounts.forEach(acc=>{
    const row = document.createElement('div');
    row.className = 'account-row';
    if(acc.id === selectedAccountId) row.classList.add('selected');
    row.innerHTML = `
      <div><strong>${acc.nome}</strong><small>${abbrevIban(acc.iban)}</small></div>
      <div><small>Saldo</small><strong>${fmt(acc.saldo)}</strong></div>
      <div class="row-right"><small>${labelAccountType(acc.tipo)}</small></div>
    `;
    row.addEventListener('click', ()=>{
      selectedAccountId = acc.id;
      if(editBtn) editBtn.disabled = false;
      closeAccountRequestPanel();
      renderAccountsSection();
    });
    list.appendChild(row);
  });

  const selected = selectedAccountId ? accounts.find(a=>a.id===selectedAccountId) : null;
  if(selected){
    renderAccountDetail(selected);
    if(editBtn) editBtn.disabled = false;
  } else if(detail) {
    if(editBtn) editBtn.disabled = true;
    detail.innerHTML = '<div class="muted">Seleziona un conto dal registro per vedere la scheda.</div>';
  }

  syncAccountPanels();
}

function renderAccountDetail(acc){
  const last = acc.movimenti?.[0];
  document.getElementById('accountDetailBody').innerHTML = `
    <div class="detail-row"><strong>IBAN:</strong> ${acc.iban}</div>
    <div class="detail-row"><strong>Tipo:</strong> ${labelAccountType(acc.tipo)}</div>
    <div class="detail-row"><strong>Saldo:</strong> ${fmt(acc.saldo)}</div>
    <div class="detail-row"><strong>Stato:</strong> ${acc.status === 'active' ? 'Attivo' : 'Bloccato'}</div>
    <div class="detail-row"><strong>Ultima operazione:</strong> ${last ? `${formatDate(last.dateAcc)} · ${last.desc}` : '—'}</div>
  `;
}

function syncAccountPanels(){
  const detailPanel = document.getElementById('accountDetailPanel');
  const requestPanel = document.getElementById('accountRequestPanel');
  if(!detailPanel || !requestPanel) return;
  requestPanel.classList.toggle('hidden', !accountRequestOpen);
  detailPanel.classList.toggle('hidden', accountRequestOpen);
}

function openAccountRequestPanel(){
  accountRequestOpen = true;
  syncAccountPanels();
}

function closeAccountRequestPanel(){
  accountRequestOpen = false;
  syncAccountPanels();
}

/* =====================
   OPERAZIONI
===================== */
function populateOpAccounts(){
  const accounts = contiUtente();
  const sel = document.getElementById('opAccount');
  const selTarget = document.getElementById('opTargetAccount');
  sel.innerHTML = '';
  selTarget.innerHTML = '';
  accounts.forEach(a=>{
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.nome} — ${abbrevIban(a.iban)}`;
    sel.appendChild(opt);
    const opt2 = opt.cloneNode(true);
    selTarget.appendChild(opt2);
  });
}

function setOperation(type){
  currentOpType = type;
  document.getElementById('opFormTitle').textContent = displayMovementType(type);
  document.getElementById('opDateAcc').value = today();
  document.getElementById('opDateVal').value = today();
  document.getElementById('opAmount').value = '';
  document.getElementById('opDesc').value = '';
  document.getElementById('opTargetWrap').style.display = (type === 'Giroconto') ? 'block' : 'none';
  setOpStep(2);
  setOpStatus('Tipo operazione completata. Inserisci i dati.');
  resetOpVerify();
  updateOpReview();
}

function setOpStep(step){
  document.querySelectorAll('.op-steps .step').forEach(s=>{
    const num = Number(s.dataset.step);
    s.classList.toggle('active', num === step);
    s.classList.toggle('done', num < step);
  });
  const panel = document.getElementById('opFormPanel');
  if(panel) panel.dataset.step = String(step);
}

function setOpStatus(text){
  const el = document.getElementById('opStatus');
  if(!el) return;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

function resetOpVerify(){
  const card = document.getElementById('opVerifyCard');
  const text = document.getElementById('opVerifyText');
  if(!card) return;
  card.classList.remove('verifying','verified');
  if(text) text.textContent = 'Verifica in corso...';
}

function setOpVerifyState(state){
  const card = document.getElementById('opVerifyCard');
  const text = document.getElementById('opVerifyText');
  if(!card) return;
  card.classList.remove('verifying','verified');
  if(state === 'verifying'){
    if(text) text.textContent = 'Verifica in corso...';
    void card.offsetWidth;
    card.classList.add('verifying');
    return;
  }
  if(state === 'verified'){
    card.classList.add('verified');
    if(text) text.textContent = 'Operazione completata';
  }
}

function updateOpReview(){
  const accounts = contiUtente();
  const accId = document.getElementById('opAccount').value;
  const targetId = document.getElementById('opTargetAccount').value;
  const amount = Number(document.getElementById('opAmount').value);
  const typeLabel = displayMovementType(currentOpType || '');
  const desc = document.getElementById('opDesc').value.trim() || typeLabel || '—';

  const acc = accounts.find(a=>a.id===accId);
  const target = accounts.find(a=>a.id===targetId);

  const typeEl = document.getElementById('opReviewType');
  const accEl = document.getElementById('opReviewAccount');
  const amountEl = document.getElementById('opReviewAmount');
  const descEl = document.getElementById('opReviewDesc');
  const targetRow = document.getElementById('opReviewTargetRow');
  const targetEl = document.getElementById('opReviewTarget');

  if(typeEl) typeEl.textContent = typeLabel || '—';
  if(accEl) accEl.textContent = acc ? `${acc.nome} — ${abbrevIban(acc.iban)}` : '—';
  if(amountEl) amountEl.textContent = amount ? fmt(amount) : '—';
  if(descEl) descEl.textContent = desc || '—';

  if(currentOpType === 'Giroconto'){
    if(targetRow) targetRow.style.display = 'flex';
    if(targetEl) targetEl.textContent = target ? `${target.nome} — ${abbrevIban(target.iban)}` : '—';
  } else if(targetRow){
    targetRow.style.display = 'none';
  }
}

function confirmOperation(){
  const accounts = contiUtente();
  if(opPending) return;
  if(!currentOpType) return notify('Seleziona un tipo di operazione');

  const accId = document.getElementById('opAccount').value;
  const targetId = document.getElementById('opTargetAccount').value;
  const amount = Number(document.getElementById('opAmount').value);
  const desc = document.getElementById('opDesc').value.trim() || currentOpType;

  if(!accId) return notify('Seleziona un conto');
  if(amount <= 0) return notify('Inserisci un importo valido');

  const acc = accounts.find(a=>a.id===accId);
  if(!acc) return;

  if(currentOpType === 'Giroconto'){
    if(accId === targetId) return notify('Seleziona un conto diverso');
    const target = accounts.find(a=>a.id===targetId);
    if(!target) return notify('Seleziona il conto di destinazione');
  }

  updateOpReview();
  setOpStep(3);
  setOpStatus('Verifica in corso...');
  setOpVerifyState('verifying');
  const confirmBtn = document.getElementById('opConfirmBtn');
  if(confirmBtn) confirmBtn.disabled = true;
  opPending = true;

  setTimeout(()=>{
    if(currentOpType === 'Giroconto'){
      const target = accounts.find(a=>a.id===targetId);
      if(!target){
        opPending = false;
        if(confirmBtn) confirmBtn.disabled = false;
        return;
      }

      acc.saldo = money(acc.saldo - amount);
      target.saldo = money(target.saldo + amount);

      addMovement(acc, {
        dateAcc: today(),
        dateVal: today(),
        type:'Giroconto',
        desc:`Giroconto verso ${target.nome}`,
        amount:-amount,
        balance: acc.saldo
      });

      addMovement(target, {
        dateAcc: today(),
        dateVal: today(),
        type:'Giroconto',
        desc:`Giroconto da ${acc.nome}`,
        amount: amount,
        balance: target.saldo
      });
    } else {
      const signed = (currentOpType === 'Versamento') ? amount : -amount;
      acc.saldo = money(acc.saldo + signed);
      addMovement(acc, {
        dateAcc: today(),
        dateVal: today(),
        type: currentOpType,
        desc,
        amount: signed,
        balance: acc.saldo
      });
    }

    saveAccounts();
    renderHome();
    renderAccountsSection();
    renderMovementsSection();
    setOpStatus('Operazione completata');
    setOpVerifyState('verified');
    opPending = false;
    if(confirmBtn) confirmBtn.disabled = false;
  }, 1200);
}

/* =====================
   MOVIMENTI
===================== */
const movState = {
  query: '',
  type: '',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  sortKey: 'dateAcc',
  sortDir: 'desc',
  page: 1,
  pageSize: 8
};

function getUserMovements(){
  const accounts = contiUtente();
  const list = [];
  accounts.forEach(a=>{
    (a.movimenti||[]).forEach(m=>{
      list.push({ ...m, accountId: a.id, accountName: a.nome });
    });
  });
  return list.sort((a,b)=>b.dateAcc.localeCompare(a.dateAcc));
}

function applyMovementsFilters(list){
  let out = [...list];
  if(movState.query){
    const q = movState.query.toLowerCase();
    out = out.filter(m => (m.desc||'').toLowerCase().includes(q) || (m.type||'').toLowerCase().includes(q) || displayMovementType(m.type).toLowerCase().includes(q));
  }
  if(movState.type) out = out.filter(m=>m.type===movState.type);
  if(movState.dateFrom) out = out.filter(m=>m.dateAcc>=movState.dateFrom);
  if(movState.dateTo) out = out.filter(m=>m.dateAcc<=movState.dateTo);
  if(movState.amountMin) out = out.filter(m=>Math.abs(m.amount)>=Number(movState.amountMin));
  if(movState.amountMax) out = out.filter(m=>Math.abs(m.amount)<=Number(movState.amountMax));

  const key = movState.sortKey;
  out.sort((a,b)=>{
    let va = a[key], vb = b[key];
    if(typeof va === 'string') { va = va.toUpperCase(); vb = vb.toUpperCase(); }
    if(va < vb) return movState.sortDir==='asc' ? -1 : 1;
    if(va > vb) return movState.sortDir==='asc' ? 1 : -1;
    return 0;
  });

  return out;
}

function renderMovementsSection(){
  const body = document.getElementById('movTableBody');
  if(!body) return;

  const all = getUserMovements();
  const filtered = applyMovementsFilters(all);

  const totalPages = Math.max(1, Math.ceil(filtered.length / movState.pageSize));
  movState.page = Math.min(movState.page, totalPages);

  const start = (movState.page-1)*movState.pageSize;
  const pageItems = filtered.slice(start, start + movState.pageSize);

  body.innerHTML = '';
  if(!pageItems.length){
    body.innerHTML = `
      <tr>
        <td class="mov-empty" colspan="6">Nessun dato trovato</td>
      </tr>
    `;
  }
  pageItems.forEach(m=>{
    body.innerHTML += `
      <tr>
        <td>${formatDate(m.dateAcc)}</td>
        <td>${formatDate(m.dateVal)}</td>
        <td>
          <div class="mov-type">
            <span class="type-icon">${movementIcon(m.type)}</span>
            <span class="badge info">${displayMovementType(m.type)}</span>
          </div>
        </td>
        <td>${m.desc}</td>
        <td class="mov-amount ${m.amount>=0?'pos':'neg'}">${fmt(m.amount)}</td>
        <td>${fmt(m.balance)}</td>
      </tr>
    `;
  });

  document.getElementById('movPageInfo').textContent = `Pagina ${movState.page} di ${totalPages}`;
  document.getElementById('movPrev').disabled = movState.page === 1;
  document.getElementById('movNext').disabled = movState.page === totalPages;
}

function buildMovementsExport(){
  const rows = applyMovementsFilters(getUserMovements());
  const header = ['Data contabile','Data valuta','Tipo','Descrizione','Importo','Saldo'];
  const lines = rows.map(m=>[
    formatDate(m.dateAcc),
    formatDate(m.dateVal),
    displayMovementType(m.type),
    m.desc,
    fmt(m.amount),
    fmt(m.balance)
  ]);
  return { header, lines, rows };
}

function ensureXlsx(){
  if(window.XLSX) return Promise.resolve(true);
  if(xlsxLoadPromise) return xlsxLoadPromise;
  const sources = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js'
  ];
  xlsxLoadPromise = new Promise((resolve)=>{
    const tryLoad = (index)=>{
      if(index >= sources.length) return resolve(false);
      const script = document.createElement('script');
      script.src = sources[index];
      script.async = true;
      script.onload = () => {
        if(window.XLSX) resolve(true);
        else tryLoad(index + 1);
      };
      script.onerror = () => tryLoad(index + 1);
      document.head.appendChild(script);
    };
    tryLoad(0);
  });
  return xlsxLoadPromise;
}

async function saveExportFile(blob, format){
  const extensions = { pdf: '.pdf', docx: '.docx', txt: '.txt', xlsx: '.xlsx' };
  const mimes = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  const fileName = `movimenti-${today()}${extensions[format] || ''}`;

  if(window.showSaveFilePicker){
    const picker = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: format.toUpperCase(), accept: { [mimes[format]]: [extensions[format]] } }]
    });
    const writable = await picker.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportMovements(format){
  const selectedFormat = format || document.getElementById('movExportFormat')?.value || 'pdf';
  const { header, lines, rows } = buildMovementsExport();
  if(!rows.length) return notify('Nessun movimento da esportare');

  try {
    if(selectedFormat === 'txt'){
      const content = [header.join(' | '), ...lines.map(r=>r.join(' | '))].join('\n');
      await saveExportFile(new Blob([content], { type: 'text/plain' }), 'txt');
      notify('Export TXT completato');
      return;
    }

    if(selectedFormat === 'pdf'){
      if(!window.jspdf?.jsPDF){
        notify('Export PDF non disponibile');
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      let y = margin;
      doc.setFontSize(14);
      doc.text('Movimenti', margin, y);
      y += 22;
      doc.setFontSize(10);
      const lineHeight = 14;
      const pageHeight = doc.internal.pageSize.getHeight() - margin;

      const allLines = [header.join(' | '), ...lines.map(r=>r.join(' | '))];
      allLines.forEach(text=>{
        if(y > pageHeight){
          doc.addPage();
          y = margin;
        }
        doc.text(text, margin, y, { maxWidth: 520 });
        y += lineHeight;
      });

      await saveExportFile(doc.output('blob'), 'pdf');
      notify('Export PDF completato');
      return;
    }

    if(selectedFormat === 'docx'){
      if(!window.docx){
        notify('Export DOCX non disponibile');
        return;
      }
      const { Document, Packer, Paragraph, TextRun } = window.docx;
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: 'Movimenti', heading: 'Heading1' }),
              new Paragraph({ text: header.join(' | ') }),
              ...lines.map(r=>new Paragraph({ children: [new TextRun(r.join(' | '))] }))
            ]
          }
        ]
      });
      const blob = await Packer.toBlob(doc);
      await saveExportFile(blob, 'docx');
      notify('Export DOCX completato');
      return;
    }

    if(selectedFormat === 'xlsx'){
      const ok = await ensureXlsx();
      if(!ok || !window.XLSX){
        notify('Export XLSX non disponibile');
        return;
      }
      const wb = window.XLSX.utils.book_new();
      const ws = window.XLSX.utils.aoa_to_sheet([header, ...lines]);
      window.XLSX.utils.book_append_sheet(wb, ws, 'Movimenti');
      const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await saveExportFile(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx');
      notify('Export XLSX completato');
      return;
    }
  } catch (err) {
    console.error('Export error:', err);
    notify('Export annullato o non riuscito');
  }
}

function openExportModal(){
  const modal = document.getElementById('exportModal');
  if(modal) modal.style.display = 'flex';
}

function closeExportModal(){
  const modal = document.getElementById('exportModal');
  if(modal) modal.style.display = 'none';
}

function confirmExportModal(){
  exportMovements();
  closeExportModal();
}

function displayMovementType(type){
  return type === 'Prelevamento' ? 'Prelievo' : type;
}

function movementIcon(type){
  switch(type){
    case 'Versamento': return '↑';
    case 'Prelevamento': return '↓';
    case 'Bonifico': return '⇄';
    case 'Giroconto': return '↻';
    case 'Pagamento': return '€';
    case 'Accredito': return '+';
    case 'Addebito': return '−';
    default: return '•';
  }
}

/* =====================
   CARDS UI
===================== */
function renderPlansBadge(){
  const plan = getUserPlan();
  const badge = document.getElementById('planBadge');
  if(!badge) return;
  badge.textContent = plan;
  badge.classList.toggle('secure', plan !== 'GOLD');
}

async function renderCardsSection(){
  const list = await api.getCards(utenteCorrente.username);

  if(!list.length){
    document.getElementById('cardsList').innerHTML = `<div class="muted">Nessuna carta attiva. Effettua una richiesta.</div>`;
    openCardRequestPanel();
    return;
  }

  renderCardsList(list);

  if(!selectedCardId || !list.find(c=>c.id===selectedCardId)){
    selectedCardId = list[0].id;
  }

  if(selectedCardId !== lastCardId){
    resetCvcState();
    lastCardId = selectedCardId;
  }

  updateCardUI(list.find(c=>c.id===selectedCardId));
  syncCardPanels();
}

function renderCardsList(list){
  const wrap = document.getElementById('cardsList');
  wrap.innerHTML = '';

  list.forEach(c=>{
    const label = c.label || c.id || 'Carta';
    const plan = c.plan || 'BASIC';
    const row = document.createElement('div');
    row.className = 'card-row-item ' + planClass(plan) + (c.id===selectedCardId ? ' active' : '');
    row.dataset.cardId = c.id;
    row.innerHTML = `
      <div>
        <div class="row-name">${label} • ${plan}</div>
        <div class="row-type">${c.cardNumber}</div>
      </div>
      <div class="row-meta">
        <span class="badge">${statusLabel(c.status)}</span>
        <button class="edit-card-btn" type="button" title="Modifica carta" data-card-id="${c.id}">✎</button>
      </div>
    `;
    wrap.appendChild(row);
  });
}

function updateCardUI(card){
  const front = document.getElementById('cardFront');
  front.classList.remove('plan-basic','plan-silver','plan-gold');
  front.classList.add(planClass(card.plan));

  document.getElementById('cardHolder').textContent = (utenteCorrente?.nomeCompleto || 'UTENTE').toUpperCase();
  document.getElementById('cardNumber').textContent = card.cardNumber;

  const expEl = document.getElementById('cardExpiry');
  expEl.textContent = cardExpiryVisible ? card.expiry : '••/••';

  setCardCvc(card, cvcVisible);

  document.getElementById('cardStatusBadge').textContent = statusLabel(card.status);
  document.getElementById('cardStateText').textContent = statusLabel(card.status);

  document.getElementById('freezeBtn').classList.toggle('active', card.status==='frozen');
  document.getElementById('secureOnlineBadge').textContent = card.secureOnline ? 'Attiva' : 'Disattiva';
  document.getElementById('contactlessBadge').textContent = card.contactless ? 'Attivo' : 'Disattivo';
  document.getElementById('virtualLinked').textContent = card.virtualLinked ? 'Attiva' : 'Disattiva';

  const rules = PLAN_RULES[card.plan] || PLAN_RULES.BASIC;
  document.getElementById('limitDay').textContent = fmt(rules.limits.day);
  document.getElementById('limitOnline').textContent = fmt(rules.limits.online);

  document.getElementById('toggleExpiry').classList.toggle('is-hidden', !cardExpiryVisible);
}

function setCardCvc(card, visible){
  cvcVisible = visible;
  const el = document.getElementById('cardCVC');
  if(!el) return;
  el.textContent = visible && card ? (card.cvc || '—') : '•••';
}

function resetCvcState(){
  if(cvcTimer) clearTimeout(cvcTimer);
  if(cvcCountdownTimer) clearInterval(cvcCountdownTimer);
  cvcTimer = null;
  cvcCountdownTimer = null;
  cvcVisible = false;

  const countdown = document.getElementById('cvcCountdown');
  if(countdown) countdown.textContent = '—';

  const card3d = document.getElementById('card3d');
  if(card3d) card3d.classList.remove('flipped');

  const flip = document.getElementById('flipCardBtn');
  if(flip){
    flip.disabled = false;
    flip.textContent = 'Mostra retro';
  }

  const card = carte.find(c=>c.id===selectedCardId);
  if(card) setCardCvc(card, false);
}

function startCvcReveal(){
  const card = carte.find(c=>c.id===selectedCardId);
  const card3d = document.getElementById('card3d');
  const flip = document.getElementById('flipCardBtn');
  const countdown = document.getElementById('cvcCountdown');
  if(!card || !card3d || !flip || !countdown) return;

  if(cvcTimer) clearTimeout(cvcTimer);
  if(cvcCountdownTimer) clearInterval(cvcCountdownTimer);

  setCardCvc(card, true);
  card3d.classList.add('flipped');
  flip.textContent = 'Mostra fronte';
  flip.disabled = true;

  let remaining = 4;
  countdown.textContent = `CVC: ${remaining}s`;
  cvcCountdownTimer = setInterval(()=>{
    remaining -= 1;
    countdown.textContent = remaining > 0 ? `CVC: ${remaining}s` : '—';
  }, 1000);

  cvcTimer = setTimeout(()=>{
    resetCvcState();
  }, 4000);
}

function openCvcAuthModal(){
  const modal = document.getElementById('cvcAuthModal');
  const input = document.getElementById('cvcAuthPass');
  const error = document.getElementById('cvcAuthError');
  if(!modal || !input) return;
  if(error) error.textContent = '';
  input.value = '';
  modal.style.display = 'flex';
  setTimeout(()=>input.focus(), 0);
}

function closeCvcAuthModal(){
  const modal = document.getElementById('cvcAuthModal');
  if(modal) modal.style.display = 'none';
}

function confirmCvcAuth(){
  const input = document.getElementById('cvcAuthPass');
  const error = document.getElementById('cvcAuthError');
  const pass = input ? input.value : '';
  if(!pass){
    if(error) error.textContent = 'Inserisci la password.';
    return;
  }
  if(pass !== utenteCorrente?.password){
    if(error) error.textContent = 'Password non corretta.';
    return;
  }
  closeCvcAuthModal();
  startCvcReveal();
}

function initCvcAuthModal(){
  const modal = document.getElementById('cvcAuthModal');
  const cancel = document.getElementById('cancelCvcAuth');
  const confirm = document.getElementById('confirmCvcAuth');

  if(cancel && cancel.dataset.bound !== '1'){
    cancel.dataset.bound = '1';
    cancel.addEventListener('click', closeCvcAuthModal);
  }
  if(confirm && confirm.dataset.bound !== '1'){
    confirm.dataset.bound = '1';
    confirm.addEventListener('click', confirmCvcAuth);
  }
  if(modal && modal.dataset.bound !== '1'){
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closeCvcAuthModal();
    });
  }
}

function openBlockCardModal(){
  const modal = document.getElementById('blockCardModal');
  if(modal) modal.style.display = 'flex';
}

function closeBlockCardModal(){
  const modal = document.getElementById('blockCardModal');
  if(modal) modal.style.display = 'none';
}

async function confirmBlockCard(){
  if(!selectedCardId) return;
  await api.updateCard(selectedCardId, { status: 'blocked' });
  renderCardsSection();
  notify('Carta bloccata');
  closeBlockCardModal();
}

function initBlockCardModal(){
  const modal = document.getElementById('blockCardModal');
  const cancel = document.getElementById('cancelBlockCard');
  const confirm = document.getElementById('confirmBlockCard');

  if(cancel && cancel.dataset.bound !== '1'){
    cancel.dataset.bound = '1';
    cancel.addEventListener('click', closeBlockCardModal);
  }
  if(confirm && confirm.dataset.bound !== '1'){
    confirm.dataset.bound = '1';
    confirm.addEventListener('click', confirmBlockCard);
  }
  if(modal && modal.dataset.bound !== '1'){
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closeBlockCardModal();
    });
  }
}

/* =====================
   EDIT CARD
===================== */
function openEditCardDialog(cardId){
  const card = carte.find(c=>c.id===cardId);
  if(!card) return;

  editingCardId = cardId;
  const modal = document.getElementById('editCardModal');
  if(!modal) return;
  const label = document.getElementById('editCardLabel');
  const type = document.getElementById('editCardType');
  if(label) label.value = card.label || '';
  if(type) type.value = card.type || 'virtuale';
  modal.style.display = 'flex';
}

function closeEditCardModal(){
  const modal = document.getElementById('editCardModal');
  if(modal) modal.style.display = 'none';
  editingCardId = null;
}

function saveEditCard(){
  if(!editingCardId) return;
  const card = carte.find(c=>c.id===editingCardId);
  if(!card) return;

  const label = document.getElementById('editCardLabel')?.value.trim();
  const type = document.getElementById('editCardType')?.value || 'virtuale';
  const normalizedType = String(type).trim().toLowerCase();
  if(normalizedType !== 'fisica' && normalizedType !== 'virtuale'){
    notify('Tipo non valido (usa "fisica" o "virtuale")');
    return;
  }

  card.label = label || card.label;
  card.type = normalizedType;

  saveCards();
  renderCardsSection();
  notify('Carta aggiornata');
  closeEditCardModal();
}

function initEditCardModal(){
  const modal = document.getElementById('editCardModal');
  const cancel = document.getElementById('cancelEditCard');
  const save = document.getElementById('saveEditCard');

  if(cancel && cancel.dataset.bound !== '1'){
    cancel.dataset.bound = '1';
    cancel.addEventListener('click', closeEditCardModal);
  }
  if(save && save.dataset.bound !== '1'){
    save.dataset.bound = '1';
    save.addEventListener('click', saveEditCard);
  }
  if(modal && modal.dataset.bound !== '1'){
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closeEditCardModal();
    });
  }
}

/* =====================
   PROFILE DROPDOWN + MODAL
===================== */
function initProfileMenu(){
  const btn = document.getElementById('profileBtn');
  const dd = document.getElementById('profileDropdown');
  if(!btn || !dd) return;

  document.getElementById('profileDdName').textContent = utenteCorrente?.nomeCompleto || utenteCorrente?.username || 'Utente';
  const planEl = document.getElementById('profileDdPlan');
  if(planEl) planEl.textContent = getUserPlan();

  const open = ()=>{
    dd.classList.remove('hidden');
    dd.setAttribute('aria-hidden','false');
  };
  const close = ()=>{
    dd.classList.add('hidden');
    dd.setAttribute('aria-hidden','true');
  };
  const toggle = ()=>{
    const isHidden = dd.classList.contains('hidden');
    isHidden ? open() : close();
  };

  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (e)=>{
    if(dd.classList.contains('hidden')) return;
    if(dd.contains(e.target) || btn.contains(e.target)) return;
    close();
  });

  document.getElementById('logoutFromMenuBtn')?.addEventListener('click', ()=>location.reload());
  document.getElementById('openProfileModalBtn')?.addEventListener('click', ()=>{
    close();
    openProfileModal();
  });
}

function initProfileModal(){
  document.getElementById('closeProfile')?.addEventListener('click', closeProfileModal);
  document.getElementById('saveProfile')?.addEventListener('click', saveProfile);
  document.getElementById('deleteAccountBtn')?.addEventListener('click', deleteAccount);

  const email = document.getElementById('profileEmail');
  const phone = document.getElementById('profilePhone');
  const cf = document.getElementById('profileCF');
  [email, phone, cf].forEach(el=>{
    el?.addEventListener('input', updateProfileValidation);
  });
}

function openProfileModal(){
  const m = document.getElementById('profileModal');
  if(!m) return;

  document.getElementById('profileName').value = utenteCorrente?.nomeCompleto || '';
  document.getElementById('profileEmail').value = utenteCorrente?.email || '';
  document.getElementById('profileVia').value = utenteCorrente?.via || '';
  document.getElementById('profilePhone').value = utenteCorrente?.telefono || '';
  document.getElementById('profileCF').value = utenteCorrente?.cf || '';
  document.getElementById('profileUser').value = utenteCorrente?.username || '';

  m.style.display = 'flex';

  updateProfileValidation();
}

function closeProfileModal(){
  const m = document.getElementById('profileModal');
  if(m) m.style.display = 'none';
}

function saveProfile(){
  const email = document.getElementById('profileEmail').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();
  const cf = document.getElementById('profileCF').value.trim().toUpperCase();

  if(email && !validateEmail(email)) return notify('Email non valida');
  if(phone && !validatePhone(phone)) return notify('Telefono non valido');
  if(cf && !validateCF(cf)) return notify('Codice fiscale non valido');

  utenteCorrente.nomeCompleto = document.getElementById('profileName').value.trim();
  utenteCorrente.email = email;
  utenteCorrente.via = document.getElementById('profileVia').value.trim();
  utenteCorrente.telefono = phone;
  utenteCorrente.cf = cf;

  saveUsers();

  document.getElementById('profileDdName').textContent = utenteCorrente.nomeCompleto || utenteCorrente.username;
  notify('Profilo salvato');
  closeProfileModal();
}

function deleteAccount(){
  if(!confirm('Sei sicuro di voler eliminare l’account?')) return;

  utenti = utenti.filter(u=>u.username!==utenteCorrente.username);
  conti = conti.filter(c=>c.proprietario!==utenteCorrente.username);
  carte = carte.filter(c=>c.username!==utenteCorrente.username);
  richieste = richieste.filter(r=>r.username!==utenteCorrente.username);

  saveUsers(); saveAccounts(); saveCards(); saveRequests();

  location.reload();
}

/* =====================
   TOAST
===================== */
function notify(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2200);
}

/* =====================
   VALIDATION LIVE
===================== */
function updateProfileValidation(){
  const email = document.getElementById('profileEmail')?.value.trim();
  const phone = document.getElementById('profilePhone')?.value.trim();
  const cf = document.getElementById('profileCF')?.value.trim().toUpperCase();

  setFieldStatus(document.getElementById('profileEmailStatus'), email?validateEmail(email):null);
  setFieldStatus(document.getElementById('profilePhoneStatus'), phone?validatePhone(phone):null);
  setFieldStatus(document.getElementById('profileCFStatus'), cf?validateCF(cf):null);
}

function updateAuthValidation(){
  const email = document.getElementById('authEmail')?.value.trim();
  const cf = document.getElementById('authCF')?.value.trim().toUpperCase();
  setFieldStatus(document.getElementById('authEmailStatus'), email?validateEmail(email):null);
  setFieldStatus(document.getElementById('authCFStatus'), cf?validateCF(cf):null);
}

/* =====================
   EVENTS & INIT
===================== */
function initClock(){
  const el = document.getElementById('clock');
  if(!el || el.dataset.bound === '1') return;
  el.dataset.bound = '1';
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  };
  tick();
  setInterval(tick, 30000);
}

function initThemeToggle(){
  const btn = document.getElementById('toggleThemeBtn');
  if(!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', ()=>{
    const next = loadTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function initBalanceToggle(){
  const btn = document.getElementById('toggleBalanceBtn');
  if(!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', ()=>{
    saldoVisibile = !saldoVisibile;
    renderHome();
  });
}

function initLogoutButtons(){
  const btn = document.getElementById('logoutBtn');
  if(btn && btn.dataset.bound !== '1'){
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>location.reload());
  }
}

function initNav(){
  const navButtons = document.querySelectorAll('.nav-btn');
  if(!navButtons.length) return;

  navButtons.forEach(btn=>{
    if(btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>{
      const page = btn.dataset.page;
      document.querySelectorAll('.page').forEach(p=>{
        p.classList.toggle('active', p.id === `page-${page}`);
      });
      navButtons.forEach(b=>b.classList.toggle('active', b === btn));
    });
  });
}

function initMovementsFilters(){
  const search = document.getElementById('movSearch');
  const type = document.getElementById('movTypeFilter');
  const from = document.getElementById('movDateFrom');
  const to = document.getElementById('movDateTo');
  const min = document.getElementById('movAmountMin');
  const max = document.getElementById('movAmountMax');
  const clear = document.getElementById('movClearFilters');
  const sortBy = document.getElementById('movSortBy');
  const sortDir = document.getElementById('movSortDir');
  const filtersPanel = document.getElementById('movFiltersPanel');
  const sortPanel = document.getElementById('movSortPanel');
  const toggleFiltersBtn = document.getElementById('movToggleFiltersBtn');
  const toggleSortBtn = document.getElementById('movToggleSortBtn');
  const exportBtn = document.getElementById('movExportBtn');
  const exportModal = document.getElementById('exportModal');
  const cancelExport = document.getElementById('cancelExport');
  const confirmExport = document.getElementById('confirmExport');

  [search, type, from, to, min, max].forEach(el=>{
    if(!el) return;
    if(el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('input', ()=>{
      movState.query = search.value.trim();
      movState.type = type.value;
      movState.dateFrom = from.value;
      movState.dateTo = to.value;
      movState.amountMin = min.value;
      movState.amountMax = max.value;
      movState.page = 1;
      renderMovementsSection();
    });
  });

  // sort select
  if(sortBy && sortBy.dataset.bound !== '1'){
    sortBy.dataset.bound = '1';
    sortBy.addEventListener('change', ()=>{
      movState.sortKey = sortBy.value || 'dateAcc';
      movState.page = 1;
      renderMovementsSection();
    });
  }
  if(sortDir && sortDir.dataset.bound !== '1'){
    sortDir.dataset.bound = '1';
    sortDir.addEventListener('change', ()=>{
      movState.sortDir = sortDir.value || 'desc';
      renderMovementsSection();
    });
  }

  // Toggle panels
  if(toggleFiltersBtn && toggleFiltersBtn.dataset.bound !== '1'){
    toggleFiltersBtn.dataset.bound = '1';
    toggleFiltersBtn.addEventListener('click', ()=>{
      const isHidden = !filtersPanel || filtersPanel.style.display === 'none';
      if(filtersPanel) filtersPanel.style.display = isHidden ? 'flex' : 'none';
      // ensure sort panel closed when opening filters
      if(sortPanel) sortPanel.style.display = 'none';
    });
  }
  if(toggleSortBtn && toggleSortBtn.dataset.bound !== '1'){
    toggleSortBtn.dataset.bound = '1';
    toggleSortBtn.addEventListener('click', ()=>{
      const isHidden = !sortPanel || sortPanel.style.display === 'none';
      if(sortPanel) sortPanel.style.display = isHidden ? 'flex' : 'none';
      if(filtersPanel) filtersPanel.style.display = 'none';
    });
  }

  if(clear && clear.dataset.bound !== '1'){
    clear.dataset.bound = '1';
    clear.addEventListener('click', ()=>{
      search.value = '';
      type.value = '';
      from.value = '';
      to.value = '';
      min.value = '';
      max.value = '';
      movState.query = '';
      movState.type = '';
      movState.dateFrom = '';
      movState.dateTo = '';
      movState.amountMin = '';
      movState.amountMax = '';
      movState.page = 1;
      renderMovementsSection();
    });
  }

  const prev = document.getElementById('movPrev');
  const next = document.getElementById('movNext');
  if(prev && prev.dataset.bound !== '1'){
    prev.dataset.bound = '1';
    prev.addEventListener('click', ()=>{
      movState.page = Math.max(1, movState.page - 1);
      renderMovementsSection();
    });
  }
  if(next && next.dataset.bound !== '1'){
    next.dataset.bound = '1';
    next.addEventListener('click', ()=>{
      movState.page += 1;
      renderMovementsSection();
    });
  }

  if(exportBtn && exportBtn.dataset.bound !== '1'){
    exportBtn.dataset.bound = '1';
    exportBtn.addEventListener('click', openExportModal);
  }

  if(cancelExport && cancelExport.dataset.bound !== '1'){
    cancelExport.dataset.bound = '1';
    cancelExport.addEventListener('click', closeExportModal);
  }
  if(confirmExport && confirmExport.dataset.bound !== '1'){
    confirmExport.dataset.bound = '1';
    confirmExport.addEventListener('click', confirmExportModal);
  }
  if(exportModal && exportModal.dataset.bound !== '1'){
    exportModal.dataset.bound = '1';
    exportModal.addEventListener('click', (e)=>{
      if(e.target === exportModal) closeExportModal();
    });
  }

  document.querySelectorAll('.mov-table thead th').forEach(th=>{
    if(th.dataset.bound === '1') return;
    th.dataset.bound = '1';
    th.addEventListener('click', ()=>{
      const key = th.dataset.sort;
      if(!key) return;
      if(movState.sortKey === key){
        movState.sortDir = movState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        movState.sortKey = key;
        movState.sortDir = 'asc';
      }
      renderMovementsSection();
    });
  });
}

function initCardControls(){
  const flip = document.getElementById('flipCardBtn');
  const card3d = document.getElementById('card3d');
  if(flip && flip.dataset.bound !== '1'){
    flip.dataset.bound = '1';
    flip.addEventListener('click', ()=>{
      if(cvcTimer) return;
      openCvcAuthModal();
    });
  }

  const toggleExpiry = document.getElementById('toggleExpiry');
  if(toggleExpiry && toggleExpiry.dataset.bound !== '1'){
    toggleExpiry.dataset.bound = '1';
    toggleExpiry.addEventListener('click', ()=>{
      cardExpiryVisible = !cardExpiryVisible;
      saveUIPrefs({ showExpiry: cardExpiryVisible });
      renderCardsSection();
    });
  }

  const freeze = document.getElementById('freezeBtn');
  if(freeze && freeze.dataset.bound !== '1'){
    freeze.dataset.bound = '1';
    freeze.addEventListener('click', async ()=>{
      if(!selectedCardId) return;
      const card = carte.find(c=>c.id===selectedCardId);
      if(!card) return;
      const newStatus = card.status === 'frozen' ? 'active' : 'frozen';
      await api.updateCard(card.id, { status: newStatus });
      renderCardsSection();
      notify(newStatus === 'frozen' ? 'Carta congelata' : 'Carta riattivata');
    });
  }

  const block = document.getElementById('blockBtn');
  if(block && block.dataset.bound !== '1'){
    block.dataset.bound = '1';
    block.addEventListener('click', async ()=>{
      if(!selectedCardId) return;
      openBlockCardModal();
    });
  }

  const replace = document.getElementById('replaceBtn');
  if(replace && replace.dataset.bound !== '1'){
    replace.dataset.bound = '1';
    replace.addEventListener('click', async ()=>{
      if(!selectedCardId) return;
      const card = carte.find(c=>c.id===selectedCardId);
      if(!card) return;
      const patch = {
        cardNumber: genCardNumber(),
        expiry: genExpiry(),
        cvc: genCVC(),
        lastReplacedAt: today(),
        status: 'active'
      };
      await api.updateCard(card.id, patch);
      renderCardsSection();
      notify('Sostituzione richiesta');
    });
  }
}

function initCardsListEvents(){
  const list = document.getElementById('cardsList');
  if(!list || list.dataset.bound === '1') return;
  list.dataset.bound = '1';

  list.addEventListener('click', (e)=>{
    const editBtn = e.target.closest('.edit-card-btn');
    if(editBtn){
      openEditCardDialog(editBtn.dataset.cardId);
      return;
    }

    const row = e.target.closest('.card-row-item');
    if(row && row.dataset.cardId){
      selectedCardId = row.dataset.cardId;
      closeCardRequestPanel();
      renderCardsSection();
    }
  });
}

function initRequestAccordion(){
  const btn = document.getElementById('requestAccordionBtn');
  const panel = document.getElementById('requestPanel');
  if(!btn || !panel || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', ()=>{
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isOpen));
    panel.classList.toggle('is-collapsed', isOpen);
    panel.setAttribute('aria-hidden', String(isOpen));
  });
}

function syncCardPanels(){
  const detailPanel = document.getElementById('cardDetailPanel');
  const requestPanel = document.getElementById('cardRequestPanel');
  if(!detailPanel || !requestPanel) return;
  requestPanel.classList.toggle('hidden', !cardRequestOpen);
  detailPanel.classList.toggle('hidden', cardRequestOpen);
}

function resetRequestWizard(){
  selectedPlanForRequest = null;
  requestWizard = { step: 1, fullName: '', cardType: '', shipAddress: '', accountId: '' };

  document.querySelectorAll('.plan-card').forEach(c=>c.classList.remove('selected'));
  const next1 = document.getElementById('reqNext1');
  if(next1) next1.disabled = true;

  const fullName = document.getElementById('reqFullName');
  const cardType = document.getElementById('reqCardType');
  const account = document.getElementById('reqAccount');
  const ship = document.getElementById('reqShipAddress');
  const shipWrap = document.getElementById('reqShipWrap');
  if(fullName) fullName.value = '';
  if(cardType) cardType.value = '';
  if(account) account.value = '';
  if(ship) ship.value = '';
  if(shipWrap) shipWrap.style.display = 'none';

  goToRequestStep(1);
}

function openCardRequestPanel(){
  cardRequestOpen = true;
  resetRequestWizard();
  syncCardPanels();
}

function closeCardRequestPanel(){
  cardRequestOpen = false;
  syncCardPanels();
}

function initCardRequestPanel(){
  const openBtn = document.getElementById('openCardRequestBtn');
  const closeBtn = document.getElementById('closeCardRequestBtn');

  if(openBtn && openBtn.dataset.bound !== '1'){
    openBtn.dataset.bound = '1';
    openBtn.addEventListener('click', openCardRequestPanel);
  }

  if(closeBtn && closeBtn.dataset.bound !== '1'){
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeCardRequestPanel);
  }
}

function initRequestWizard(){
  const planButtons = document.querySelectorAll('.select-plan');
  const next1 = document.getElementById('reqNext1');
  const back2 = document.getElementById('reqBack2');
  const back3 = document.getElementById('reqBack3');
  const form2 = document.getElementById('cardRequestFormStep2');
  const confirmBtn = document.getElementById('reqConfirm');
  const reqType = document.getElementById('reqCardType');
  const shipWrap = document.getElementById('reqShipWrap');
  const reqAccount = document.getElementById('reqAccount');

  planButtons.forEach(btn=>{
    if(btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', ()=>{
      selectedPlanForRequest = btn.dataset.plan;
      document.querySelectorAll('.plan-card').forEach(c=>c.classList.remove('selected'));
      btn.closest('.plan-card')?.classList.add('selected');
      next1.disabled = false;
    });
  });

  if(next1 && next1.dataset.bound !== '1'){
    next1.dataset.bound = '1';
    next1.addEventListener('click', ()=>goToRequestStep(2));
  }
  if(back2 && back2.dataset.bound !== '1'){
    back2.dataset.bound = '1';
    back2.addEventListener('click', ()=>goToRequestStep(1));
  }
  if(back3 && back3.dataset.bound !== '1'){
    back3.dataset.bound = '1';
    back3.addEventListener('click', ()=>goToRequestStep(2));
  }

  if(reqType && reqType.dataset.bound !== '1'){
    reqType.dataset.bound = '1';
    reqType.addEventListener('change', ()=>{
      shipWrap.style.display = reqType.value === 'fisica' ? 'block' : 'none';
    });
  }

  if(form2 && form2.dataset.bound !== '1'){
    form2.dataset.bound = '1';
    form2.addEventListener('submit', (e)=>{
      e.preventDefault();
      const fullName = document.getElementById('reqFullName').value.trim();
      const cardType = document.getElementById('reqCardType').value;
      const accountId = document.getElementById('reqAccount').value;
      const shipAddress = document.getElementById('reqShipAddress').value.trim();

      if(!fullName || !cardType || !accountId) return notify('Compila tutti i campi richiesti');
      if(cardType === 'fisica' && !shipAddress) return notify('Inserisci l’indirizzo di spedizione');

      requestWizard = { step: 2, fullName, cardType, shipAddress, accountId };

      document.getElementById('verifyPlan').textContent = selectedPlanForRequest || 'BASIC';
      document.getElementById('verifyName').textContent = fullName;
      document.getElementById('verifyType').textContent = cardType;
      const account = conti.find(a=>a.id===accountId);
      document.getElementById('verifyAccount').textContent = account ? account.nome : accountId;
      const priceEl = document.getElementById('verifyPrice');
      if(priceEl){
        const price = PLAN_RULES[selectedPlanForRequest || 'BASIC'].price;
        priceEl.textContent = price === 0 ? 'Gratis' : `€ ${price.toFixed(2)}/mese`;
      }

      goToRequestStep(3);
    });
  }

  if(confirmBtn && confirmBtn.dataset.bound !== '1'){
    confirmBtn.dataset.bound = '1';
    confirmBtn.addEventListener('click', async ()=>{
      if(!selectedPlanForRequest) return;

      const emailForCard = utenteCorrente?.email;
      if(!emailForCard || !validateEmail(emailForCard)){
        notify('Email profilo mancante o non valida. Aggiornala nel profilo.');
        return;
      }

      const reqId = `REQ-${String(richieste.length + 1).padStart(3,'0')}`;
      await api.createRequest({
        id: reqId,
        username: utenteCorrente.username,
        plan: selectedPlanForRequest,
        fullName: requestWizard.fullName,
        cardType: requestWizard.cardType,
        shipAddress: requestWizard.shipAddress,
        accountId: requestWizard.accountId,
        status: 'pending',
        createdAt: today()
      });

      const rules = PLAN_RULES[selectedPlanForRequest];
      const newCard = {
        id: `CARD-${String(carte.length + 1).padStart(3,'0')}`,
        username: utenteCorrente.username,
        plan: selectedPlanForRequest,
        cardNumber: genCardNumber(),
        expiry: genExpiry(),
        cvc: genCVC(),
        status: 'active',
        virtualLinked: true,
        secureOnline: true,
        contactless: rules.contactless,
        createdAt: today(),
        lastReplacedAt: null,
        label: `Carta ${selectedPlanForRequest}`,
        type: requestWizard.cardType,
        accountId: requestWizard.accountId
      };

      carte.push(newCard);
      saveCards();

      if(emailForCard){
        sendEmailJs(EMAILJS_CONFIG.templates.card, {
          email_utente: emailForCard,
          nome_utente: (requestWizard.fullName || '').split(' ')[0] || '',
          cognome_utente: (requestWizard.fullName || '').split(' ').slice(1).join(' '),
          tipo_carta: requestWizard.cardType,
          ultime_cifre: newCard.cardNumber.slice(-4),
          scadenza: newCard.expiry,
          data_emissione: today(),
          to_email: emailForCard
        });
      }

      await api.updatePlan(utenteCorrente.username, selectedPlanForRequest);

      renderPlansBadge();
      selectedCardId = newCard.id;
      closeCardRequestPanel();
      renderCardsSection();
      notify('Richiesta inviata. Email in arrivo');
    });
  }

  if(reqAccount) {
    reqAccount.innerHTML = '<option value="">Seleziona conto</option>';
    contiUtente().forEach(a=>{
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.nome} — ${abbrevIban(a.iban)}`;
      reqAccount.appendChild(opt);
    });
  }
}

function goToRequestStep(step){
  document.querySelectorAll('.request-step').forEach(s=>s.classList.remove('active'));
  document.getElementById(`requestStep${step}`).classList.add('active');
  document.querySelectorAll('.request-steps .step').forEach(s=>{
    const num = Number(s.dataset.step);
    s.classList.toggle('active', num === step);
    s.classList.toggle('done', num < step);
  });

  if(step === 3){
    const card = document.getElementById('verifyCard');
    const text = document.getElementById('verifyText');
    if(card){
      card.classList.remove('verifying','verified');
      if(text) text.textContent = 'Verifica in corso...';
      void card.offsetWidth;
      card.classList.add('verifying');
      setTimeout(()=>{
        card.classList.add('verified');
        if(text) text.textContent = 'Verifica completata';
      }, 1200);
    }
  }
}

function setAccountConfirmNote(text, state){
  const el = document.getElementById('accountConfirmNote');
  if(!el) return;
  if(text) el.textContent = text;
  if(state) el.dataset.state = state;
}

function setAccountVerifyState(state, text){
  const card = document.getElementById('accountVerifyCard');
  const textEl = document.getElementById('accountVerifyText');
  if(!card) return;
  card.classList.remove('verifying','verified');
  if(state === 'verifying'){
    if(textEl) textEl.textContent = text || 'Verifica in corso...';
    void card.offsetWidth;
    card.classList.add('verifying');
    return;
  }
  if(state === 'verified'){
    card.classList.add('verified');
    if(textEl) textEl.textContent = text || 'Operazione completata';
  }
}

function goToAccountStep(step){
  document.querySelectorAll('.account-step').forEach(s=>s.classList.remove('active'));
  document.getElementById(`accountStep${step}`).classList.add('active');
  document.querySelectorAll('.account-steps .step').forEach(s=>{
    const num = Number(s.dataset.step);
    s.classList.toggle('active', num === step);
    s.classList.toggle('done', num < step);
  });

  const saveBtn = document.getElementById('saveAccountBtn');
  if(step !== 3 && saveBtn) saveBtn.disabled = false;

  if(step === 3){
    if(saveBtn) saveBtn.disabled = true;
    setAccountConfirmNote('Verifica in corso. Attendi la conferma.', 'pending');
    setAccountVerifyState('verifying');
    setTimeout(()=>{
      setAccountVerifyState('verified', 'Verifica completata');
      if(saveBtn) saveBtn.disabled = false;
      setAccountConfirmNote('Verifica completata. Puoi confermare.', 'ready');
    }, 1200);
  }
}

function initAccountForm(){
  const createBtn = document.getElementById('createAccountBtn');
  const editBtn = document.getElementById('editAccountBtn');
  const wrap = document.getElementById('accountFormWrap');
  const saveBtn = document.getElementById('saveAccountBtn');
  const cancelBtn = document.getElementById('cancelAccountBtn');
  const closePanelBtn = document.getElementById('closeAccountRequestBtn');
  const next1 = document.getElementById('accNext1');
  const back2 = document.getElementById('accBack2');
  const next2 = document.getElementById('accNext2');
  const back3 = document.getElementById('accBack3');
  const accType = document.getElementById('accType');
  const accRateWrap = document.getElementById('accRateWrap');
  const holderCf = document.getElementById('holderCf1');

  if(accType && accType.dataset.bound !== '1'){
    accType.dataset.bound = '1';
    accType.addEventListener('change', ()=>{
      accRateWrap.style.display = accType.value === 'deposito' ? 'block' : 'none';
    });
  }

  if(holderCf && holderCf.dataset.bound !== '1'){
    holderCf.dataset.bound = '1';
    holderCf.addEventListener('input', ()=>{
      const cf = holderCf.value.trim().toUpperCase();
      setFieldStatus(document.getElementById('holderCf1Status'), cf ? validateCF(cf) : null);
    });
  }

  if(createBtn && createBtn.dataset.bound !== '1'){
    createBtn.dataset.bound = '1';
    createBtn.addEventListener('click', ()=>{
      accountFormMode = 'create';
      editingAccountId = null;
      openAccountRequestPanel();
      openAccountForm();
      goToAccountStep(1);
    });
  }

  if(editBtn && editBtn.dataset.bound !== '1'){
    editBtn.dataset.bound = '1';
    editBtn.addEventListener('click', ()=>{
      if(!selectedAccountId) return;
      accountFormMode = 'edit';
      editingAccountId = selectedAccountId;
      openAccountRequestPanel();
      openAccountForm(editingAccountId);
      goToAccountStep(1);
    });
  }

  if(closePanelBtn && closePanelBtn.dataset.bound !== '1'){
    closePanelBtn.dataset.bound = '1';
    closePanelBtn.addEventListener('click', ()=>{
      accountFormMode = 'create';
      editingAccountId = null;
      openAccountForm();
      goToAccountStep(1);
      closeAccountRequestPanel();
    });
  }

  if(cancelBtn && cancelBtn.dataset.bound !== '1'){
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', ()=>{
      accountFormMode = 'create';
      editingAccountId = null;
      openAccountForm();
      goToAccountStep(1);
      closeAccountRequestPanel();
    });
  }

  if(next1 && next1.dataset.bound !== '1'){
    next1.dataset.bound = '1';
    next1.addEventListener('click', ()=>{
      const name = document.getElementById('accName').value.trim();
      if(!name) return notify('Inserisci il nome del conto');
      goToAccountStep(2);
    });
  }

  if(back2 && back2.dataset.bound !== '1'){
    back2.dataset.bound = '1';
    back2.addEventListener('click', ()=>goToAccountStep(1));
  }

  if(next2 && next2.dataset.bound !== '1'){
    next2.dataset.bound = '1';
    next2.addEventListener('click', ()=>{
      const holderName = document.getElementById('holderName1').value.trim();
      const holderLast = document.getElementById('holderLast1').value.trim();
      const holderCfVal = document.getElementById('holderCf1').value.trim().toUpperCase();
      if(!holderName || !holderLast) return notify('Compila i dati del titolare');
      if(holderCfVal && !validateCF(holderCfVal)) return notify('Codice fiscale non valido');

      document.getElementById('accReviewName').textContent = document.getElementById('accName').value.trim();
      document.getElementById('accReviewType').textContent = labelAccountType(document.getElementById('accType').value);
      document.getElementById('accReviewHolder').textContent = `${holderName} ${holderLast}`;
      document.getElementById('accReviewCf').textContent = holderCfVal || '—';

      goToAccountStep(3);
    });
  }

  if(back3 && back3.dataset.bound !== '1'){
    back3.dataset.bound = '1';
    back3.addEventListener('click', ()=>goToAccountStep(2));
  }

  if(saveBtn && saveBtn.dataset.bound !== '1'){
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', ()=>{
      const name = document.getElementById('accName').value.trim();
      const type = document.getElementById('accType').value;
      const rate = Number(document.getElementById('accRate').value || 0);
      const holderName = document.getElementById('holderName1').value.trim();
      const holderLast = document.getElementById('holderLast1').value.trim();
      const holderCfVal = document.getElementById('holderCf1').value.trim().toUpperCase();

      if(!name || !holderName || !holderLast) return notify('Compila tutti i campi richiesti');
      if(holderCfVal && !validateCF(holderCfVal)) return notify('Codice fiscale non valido');

      let createdAccount = null;
      if(accountFormMode === 'create'){
        const id = `ACC-${String(nextAccNum).padStart(3,'0')}`;
        nextAccNum += 1;
        saveNextId();

        createdAccount = {
          id,
          nome: name,
          tipo: type,
          saldo: 0,
          tasso: type === 'deposito' ? rate : null,
          dataApertura: today(),
          ultimoInteresse: null,
          proprietario: utenteCorrente.username,
          titolari: [{ nome: holderName, cognome: holderLast, cf: holderCfVal }],
          movimenti: [],
          iban: generateIban(id, conti.length + 1),
          status: 'active'
        };

        conti.push(createdAccount);
      } else {
        const acc = conti.find(a=>a.id===editingAccountId);
        if(acc){
          acc.nome = name;
          acc.tipo = type;
          acc.tasso = type === 'deposito' ? rate : null;
          acc.titolari = [{ nome: holderName, cognome: holderLast, cf: holderCfVal }];
        }
      }

      saveAccounts();
      renderAccountsSection();
      renderHome();
      populateOpAccounts();
      if(createdAccount && utenteCorrente?.email){
        sendEmailJs(EMAILJS_CONFIG.templates.account, {
          email_utente: utenteCorrente.email,
          nome_utente: (utenteCorrente.nomeCompleto || '').split(' ')[0] || '',
          cognome_utente: (utenteCorrente.nomeCompleto || '').split(' ').slice(1).join(' '),
          numero_conto: createdAccount.id,
          iban: createdAccount.iban,
          tipo_conto: labelAccountType(createdAccount.tipo),
          data_apertura: createdAccount.dataApertura,
          to_email: utenteCorrente.email
        }, EMAILJS_CONFIG.accountServiceId, EMAILJS_CONFIG.accountPublicKey);
      } else if(createdAccount) {
        notify('Email profilo assente: invio non disponibile');
      }
      const successMsg = accountFormMode === 'edit'
        ? 'Modifiche confermate.'
        : 'Operazione completata';
      setAccountVerifyState('verified', successMsg);
      setAccountConfirmNote(successMsg, 'success');
      if(saveBtn) saveBtn.disabled = true;
      notify('Conto salvato');
      setTimeout(()=>{
        accountFormMode = 'create';
        editingAccountId = null;
        openAccountForm();
        goToAccountStep(1);
        closeAccountRequestPanel();
        if(saveBtn) saveBtn.disabled = false;
      }, 1400);
    });
  }

  openAccountForm();
  goToAccountStep(1);
}

function openAccountForm(accountId){
  const wrap = document.getElementById('accountFormWrap');
  const title = document.getElementById('accountFormTitle');
  const saveBtn = document.getElementById('saveAccountBtn');

  if(accountFormMode === 'edit'){
    const acc = conti.find(a=>a.id===accountId);
    if(!acc) return;
    title.textContent = 'Modifica conto';
    saveBtn.textContent = 'Salva';
    document.getElementById('accName').value = acc.nome;
    document.getElementById('accType').value = acc.tipo;
    document.getElementById('accRate').value = acc.tasso ?? 2.5;
    document.getElementById('holderName1').value = acc.titolari?.[0]?.nome || '';
    document.getElementById('holderLast1').value = acc.titolari?.[0]?.cognome || '';
    document.getElementById('holderCf1').value = acc.titolari?.[0]?.cf || '';
    document.getElementById('accRateWrap').style.display = acc.tipo === 'deposito' ? 'block' : 'none';
  } else {
    title.textContent = 'Apertura nuovo conto';
    saveBtn.textContent = 'Crea conto';
    document.getElementById('accName').value = '';
    document.getElementById('accType').value = 'corrente_canone';
    document.getElementById('accRate').value = '2.5';
    document.getElementById('holderName1').value = '';
    document.getElementById('holderLast1').value = '';
    document.getElementById('holderCf1').value = '';
    document.getElementById('accRateWrap').style.display = 'none';
  }

  setAccountConfirmNote("Controlla i dati e conferma l'operazione.", 'ready');
  wrap.classList.remove('hidden');
}

/* =====================
   DOM READY
===================== */
document.addEventListener('DOMContentLoaded', () => {
  initEmailJs();
  initCookieBanner();
  applyTheme(loadTheme());
  updateAuthValidation();
  setOpStep(1);
  setOpStatus('Seleziona un tipo di operazione');

  document.getElementById('authNext1')?.addEventListener('click', ()=>{
    const nome = document.getElementById('authNome').value.trim();
    const cognome = document.getElementById('authCognome').value.trim();
    const email = document.getElementById('authEmail').value.trim();
    if(!nome || !cognome || !email){
      document.getElementById('authError').textContent = 'Compila i dati anagrafici.';
      return;
    }
    if(!validateEmail(email)){
      document.getElementById('authError').textContent = 'Email non valida.';
      return;
    }
    document.getElementById('authError').textContent = '';
    goToAuthStep(2);
  });

  document.getElementById('authBack2')?.addEventListener('click', ()=>goToAuthStep(1));

  document.getElementById('authNext2')?.addEventListener('click', ()=>{
    const cf = document.getElementById('authCF').value.trim().toUpperCase();
    if(cf && !validateCF(cf)){
      document.getElementById('authError').textContent = 'Codice fiscale non valido.';
      return;
    }
    document.getElementById('authError').textContent = '';
    goToAuthStep(3);
  });

  document.getElementById('authBack3')?.addEventListener('click', ()=>goToAuthStep(2));

  const toggleLoginPass = document.getElementById('toggleLoginPass');
  const loginPass = document.getElementById('authPass');
  if(toggleLoginPass && loginPass){
    toggleLoginPass.addEventListener('change', ()=>{
      loginPass.type = toggleLoginPass.checked ? 'text' : 'password';
    });
  }

  document.querySelectorAll('.op-card').forEach(btn=>{
    btn.addEventListener('click', ()=> setOperation(btn.dataset.op));
  });
  document.getElementById('opConfirmBtn')?.addEventListener('click', confirmOperation);

  document.getElementById('authEmail')?.addEventListener('input', updateAuthValidation);
  document.getElementById('authCF')?.addEventListener('input', updateAuthValidation);
});
