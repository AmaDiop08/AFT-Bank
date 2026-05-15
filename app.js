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
  THEME: 'aft_theme'
};

const CONFIG = {
  MAX_MOV: 10,
  MAX_HOLDERS: 3,
  API_LATENCY: [500, 1200]
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
  { id:'CARD-001', username:'admin', plan:'BASIC', cardNumber:'5342 1984 7741 4821', expiry:'09/29', cvc:'493', status:'active', virtualLinked:true, secureOnline:true, contactless:false, createdAt:'2025-11-01', lastReplacedAt:null, label:'Carta principale', type:'virtuale' }
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
let selectedAccountId = conti[0]?.id || 'ACC-001';
let selectedCardId = null;

let saldoVisibile = true;

// (2)(3) Default visibile, come richiesto
let cardNumberVisible = true;
let cardExpiryVisible = true;

let cvcTimer = null; // lo lascio, ma ora serve solo per il countdown UI del retro
let cvcCountdown = 0;

let selectedPlanForRequest = null;
let requestWizard = { step: 1, fullName: '', cardType: '', shipAddress: '' };

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

  // (10) compat: aggiungo label/type se mancanti senza rompere dati esistenti
  list.forEach(c=>{
    if(!c.label) c.label = `${c.plan} • ${c.id}`;
    if(!c.type) c.type = 'virtuale';
  });
  return list;
}
function loadRequests(){ const raw = localStorage.getItem(STORAGE_KEYS.REQUESTS); return raw ? JSON.parse(raw) : defaultRequests; }
function loadNextId(){ const raw = localStorage.getItem(STORAGE_KEYS.NEXT_ID); return raw ? parseInt(raw,10) : 2; }
function loadUIPrefs(){
  const raw = localStorage.getItem(STORAGE_KEYS.UI_PREFS);
  // NB: se c'erano vecchie preferenze, le rispetto; altrimenti default visibile
  return raw ? JSON.parse(raw) : { showCardNumber:true, showExpiry:true };
}
function saveUsers(){ localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(utenti)); }
function saveAccounts(){ localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(conti)); }
function saveCards(){ localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(carte)); }
function saveRequests(){ localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(richieste)); }
function saveNextId(){ localStorage.setItem(STORAGE_KEYS.NEXT_ID, String(nextAccNum)); }
function saveUIPrefs(p){ localStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(p)); }

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

    // (1) BUGFIX CRITICO:
    // NON aggiornare più tutte le carte esistenti del cliente al nuovo piano,
    // altrimenti cambiano gradiente/colore "a catena".
    // Ogni carta mantiene il proprio campo plan.
    return u;
  },

  async getCards(username){ await wait(api.delay()); return carte.filter(c=>c.username===username); },
  async updateCard(cardId, patch){ await wait(api.delay()); const c=carte.find(x=>x.id===cardId); Object.assign(c, patch); saveCards(); return c; },
  async createRequest(request){ await wait(api.delay()); richieste.push(request); saveRequests(); return request; },
  async updateRequest(id, patch){ await wait(api.delay()); const r=richieste.find(x=>x.id===id); Object.assign(r, patch); saveRequests(); return r; }
};
const wait = ms => new Promise(r=>setTimeout(r, ms));

/* =====================
   UTILS
===================== */
const maskCardMiddle = (num) => {
  // "5342 1984 7741 4821" -> "5342 •••• •••• 4821"
  const clean = String(num).replace(/\s+/g,'');
  if(clean.length !== 16) return num;
  return `${clean.slice(0,4)} •••• •••• ${clean.slice(12,16)}`;
};

const genCardNumber = () => Array.from({length:16},()=>Math.floor(Math.random()*10)).join('').replace(/(.{4})/g,'$1 ').trim();
const genExpiry = () => `${String(Math.floor(Math.random()*12)+1).padStart(2,'0')}/${String(new Date().getFullYear()+3).slice(2)}`;
const genCVC = () => String(Math.floor(Math.random()*900)+100);
const getUserPlan = () => utenteCorrente?.plan || 'BASIC';

function planClass(plan){
  const p = String(plan || 'BASIC').toLowerCase();
  return p === 'silver' ? 'plan-silver' : p === 'gold' ? 'plan-gold' : 'plan-basic';
}

/* =====================
   TRADUZIONI (7)
===================== */
function statusLabel(st){
  // traduzione completa stati più comuni
  switch(st){
    case 'active': return 'Attiva';
    case 'inactive': return 'Inattiva';
    case 'suspended': return 'Sospesa';
    case 'blocked': return 'Bloccata';
    case 'frozen': return 'Congelata';
    case 'expired': return 'Scaduta';
    default:
      // fallback: capitalizzo
      return String(st || '—').charAt(0).toUpperCase() + String(st || '—').slice(1);
  }
}

/* =====================
   THEME (9)
===================== */
function loadTheme(){
  return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
}
function applyTheme(theme){
  const html = document.documentElement;
  html.classList.toggle('light', theme === 'light');
  localStorage.setItem(STORAGE_KEYS.THEME, theme);

  // label (italiano)
  const label = document.getElementById('themeLabel');
  if(label) label.textContent = theme === 'light' ? 'Chiaro' : 'Scuro';
}

/* =====================
   COOKIE (8)
===================== */
function initCookieBanner(){
  const banner = document.getElementById('cookieBanner');
  const btn = document.getElementById('acceptCookiesBtn');
  if(!banner || !btn) return;

  const already = localStorage.getItem('cookieAccettati') === 'true';
  if(already){
    banner.remove();
    return;
  }

  btn.addEventListener('click', ()=>{
    // salva preferenza richiesta
    localStorage.setItem('cookieAccettati', 'true');

    // animazione + rimozione DOM
    banner.classList.add('is-closing');
    setTimeout(()=>banner.remove(), 360);
  }, { once:true });
}

/* =====================
   AUTH
===================== */
window.switchAuthTab = function(mode){
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('fieldNome').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('fieldCognome').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('fieldNascita').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('fieldEmail').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('fieldVia').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('fieldCF').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('authHint').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authSubmitLabel').textContent = mode === 'login' ? 'Accedi' : 'Registrati';
  document.getElementById('authError').textContent = '';
};

window.handleAuth = function(e){
  e.preventDefault();
  const err = document.getElementById('authError');

  if(authMode==='register'){
    const nome = document.getElementById('authNome').value.trim();
    const cognome = document.getElementById('authCognome').value.trim();
    const user = document.getElementById('authUser').value.trim();
    const pass = document.getElementById('authPass').value;

    const cf = document.getElementById('authCF').value.trim().toUpperCase();
    const email = document.getElementById('authEmail').value.trim();
    const via = document.getElementById('authVia').value.trim();

    if(!nome || !cognome || !user || !pass){ err.textContent='Compila tutti i campi obbligatori.'; return; }

    utenti.push({ username:user, password:pass, nomeCompleto: nome+' '+cognome, email, via, telefono:'', cf, plan:'BASIC' });
    saveUsers();
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

  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  // (9) tema: applico subito
  applyTheme(loadTheme());

  // (8) cookie: init subito, funziona anche a refresh
  initCookieBanner();

  // avatar
  const iniziali = utente.nomeCompleto.split(' ').map(p=>p[0]).join('').toUpperCase();
  document.getElementById('avatarInitials').textContent = iniziali;

  // prefs PAN/scadenza
  const prefs = loadUIPrefs();
  cardNumberVisible = prefs.showCardNumber ?? true;
  cardExpiryVisible = prefs.showExpiry ?? true;

  // (11) dropdown profilo
  initProfileMenu();

  // (6) accordion request
  initRequestAccordion();
  initRequestWizard();

  renderHome();
  renderPlansBadge();
  renderCardsSection();
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
  } else {
    balanceEl.textContent = '••••••';
    balanceEl.classList.add('hidden');
    eyeBtn.classList.add('is-hidden');
  }
}

/* =====================
   CONTI
===================== */
const contiUtente = () => utenteCorrente ? conti.filter(c=>c.proprietario===utenteCorrente.username) : [];

/* =====================
   CARDS UI
===================== */
function renderPlansBadge(){
  const plan = getUserPlan();
  const badge = document.getElementById('planBadge');
  badge.textContent = plan;
  badge.classList.toggle('secure', plan !== 'GOLD');
}

async function renderCardsSection(){
  showCardSkeleton(true);
  const list = await api.getCards(utenteCorrente.username);
  showCardSkeleton(false);

  if(!list.length){
    document.getElementById('cardsList').innerHTML = `<div class="muted">Nessuna carta attiva. Effettua una richiesta.</div>`;
    document.getElementById('cardDetail').style.display = 'none';
    return;
  }

  document.getElementById('cardDetail').style.display = 'grid';
  renderCardsList(list);

  if(!selectedCardId || !list.find(c=>c.id===selectedCardId)){
    selectedCardId = list[0].id;
  }

  updateCardUI(list.find(c=>c.id===selectedCardId));
}

function renderCardsList(list){
  const wrap = document.getElementById('cardsList');
  wrap.innerHTML = '';

  list.forEach(c=>{
    const row = document.createElement('div');
    row.className = 'card-row-item ' + planClass(c.plan) + (c.id===selectedCardId ? ' active' : '');

    // (10) aggiungo matita. NOTA: non stravolgo layout, la metto in row-meta.
    row.innerHTML = `
      <div>
        <div class="row-name">${escapeHtml(c.label)} • ${c.plan}</div>
        <div class="row-type">${maskCardMiddle(c.cardNumber)}</div>
      </div>
      <div class="row-meta">
        <span class="badge">${statusLabel(c.status)}</span>
        <button class="edit-card-btn" type="button" title="Modifica carta" data-card-id="${c.id}">✎</button>
      </div>
    `;

    row.addEventListener('click', (ev)=>{
      // se clicchi la matita non cambio selezione due volte
      if(ev.target && ev.target.classList.contains('edit-card-btn')) return;
      selectedCardId=c.id;
      renderCardsSection();
    });

    wrap.appendChild(row);
  });

  // listener matite (delegazione semplice post-render)
  wrap.querySelectorAll('.edit-card-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = btn.dataset.cardId;
      openEditCardDialog(id);
    });
  });
}

function updateCardUI(card){
  const front = document.getElementById('cardFront');
  front.classList.remove('plan-basic','plan-silver','plan-gold');
  front.classList.add(planClass(card.plan)); // (1) singola carta renderizzata per il SUO plan

  document.getElementById('cardHolder').textContent = (utenteCorrente?.nomeCompleto || 'UTENTE').toUpperCase();

  // (2) PAN toggle (default visibile)
  const panEl = document.getElementById('cardNumber');
  panEl.textContent = cardNumberVisible ? card.cardNumber : maskCardMiddle(card.cardNumber);
  document.getElementById('toggleCardNumber').classList.toggle('is-hidden', !cardNumberVisible);

  // (3) expiry toggle
  const expEl = document.getElementById('cardExpiry');
  expEl.textContent = cardExpiryVisible ? card.expiry : '••/••';
  document.getElementById('toggleExpiry').classList.toggle('is-hidden', !cardExpiryVisible);

  // (4) CVC sempre visibile
  document.getElementById('cardCVC').textContent = card.cvc;

  document.getElementById('cardStatusBadge').textContent = statusLabel(card.status);
  document.getElementById('cardStateText').textContent = statusLabel(card.status);

  document.getElementById('freezeBtn').classList.toggle('active', card.status==='frozen');
  document.getElementById('secureOnlineBadge').textContent = card.secureOnline ? 'Attiva' : 'Disattiva';
  document.getElementById('contactlessBadge').textContent = card.contactless ? 'Attivo' : 'Disattivo';
  document.getElementById('virtualLinked').textContent = card.virtualLinked ? 'Attiva' : 'Disattiva';

  const rules = PLAN_RULES[card.plan] || PLAN_RULES.BASIC;
  document.getElementById('limitDay').textContent = fmt(rules.limits.day);
  document.getElementById('limitOnline').textContent = fmt(rules.limits.online);
}

const showCardSkeleton = on => document.getElementById('cardsSkeleton').style.display = on ? 'block' : 'none';

/* =====================
   CARD ACTIONS
===================== */
async function toggleFreeze(){
  const card = carte.find(c=>c.id===selectedCardId);
  if(!card || card.status==='blocked' || card.status==='expired') return notify('Carta non modificabile');
  const newStatus = card.status==='frozen' ? 'active' : 'frozen';
  await api.updateCard(card.id, { status:newStatus });
  renderCardsSection();
}

async function blockCard(){
  const card = carte.find(c=>c.id===selectedCardId);
  if(!card || card.status==='blocked') return;
  if(!confirm('Bloccare definitivamente la carta?')) return;
  await api.updateCard(card.id, { status:'blocked' });
  renderCardsSection();
}

async function replaceCard(){
  const card = carte.find(c=>c.id===selectedCardId);
  if(!card) return;
  if(!confirm('Richiedere una sostituzione?')) return;

  await api.updateCard(card.id, { status:'suspended', lastReplacedAt: today() });

  setTimeout(()=>{
    const newCard = {
      id:'CARD-'+String(carte.length+1).padStart(3,'0'),
      username:utenteCorrente.username,
      plan:card.plan, // sostituzione mantiene piano della carta, non quello dell'utente
      cardNumber:genCardNumber(),
      expiry:genExpiry(),
      cvc:genCVC(),
      status:'active',
      virtualLinked:true,
      secureOnline:true,
      contactless:PLAN_RULES[card.plan]?.contactless ?? false,
      createdAt:today(),
      lastReplacedAt:null,
      label: card.label || `Carta ${card.plan}`,
      type: card.type || 'virtuale'
    };
    carte.push(newCard);
    saveCards();
    selectedCardId=newCard.id;
    renderCardsSection();
  }, 1200);
}

/* =====================
   (6) ACCORDION REQUEST PANEL
===================== */
function initRequestAccordion(){
  const btn = document.getElementById('requestAccordionBtn');
  const panel = document.getElementById('requestPanel');
  if(!btn || !panel) return;

  // default chiuso
  panel.classList.add('is-collapsed');
  panel.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', ()=>{
    const willCollapse = !panel.classList.contains('is-collapsed') ? true : false;
    panel.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!willCollapse));
    panel.setAttribute('aria-hidden', String(willCollapse));
  });
}

/* =====================
   (6) REQUEST WIZARD (come round1, resta valido)
===================== */
function initRequestWizard(){
  const next1 = document.getElementById('reqNext1');
  if(!next1) return;

  next1.disabled = true;

  document.querySelectorAll('.select-plan').forEach(planBtn=>{
    planBtn.addEventListener('click', ()=>{
      selectedPlanForRequest = planBtn.dataset.plan;
      document.querySelectorAll('.select-plan').forEach(b=>b.classList.remove('active'));
      planBtn.classList.add('active');
      next1.disabled = !selectedPlanForRequest;
    });
  });

  next1.addEventListener('click', ()=>{ if(selectedPlanForRequest) setWizardStep(2); });

  document.getElementById('reqBack2').addEventListener('click', ()=> setWizardStep(1));
  document.getElementById('reqBack3').addEventListener('click', ()=> setWizardStep(2));

  document.getElementById('reqCardType').addEventListener('change', ()=>{
    const v = document.getElementById('reqCardType').value;
    document.getElementById('reqShipWrap').style.display = (v === 'fisica') ? 'block' : 'none';
  });

  document.getElementById('cardRequestFormStep2').addEventListener('submit', (e)=>{
    e.preventDefault();
    const fullName = document.getElementById('reqFullName').value.trim();
    const cardType = document.getElementById('reqCardType').value;
    const shipAddress = document.getElementById('reqShipAddress').value.trim();

    if(!fullName) return notify('Inserisci il nome del titolare');
    if(!cardType) return notify('Seleziona il tipo di carta');
    if(cardType === 'fisica' && !shipAddress) return notify('Inserisci indirizzo di spedizione');

    requestWizard.fullName = fullName;
    requestWizard.cardType = cardType;
    requestWizard.shipAddress = shipAddress;

    fillVerifySummary();
    setWizardStep(3);
  });

  document.getElementById('reqConfirm').addEventListener('click', async ()=>{
    if(!selectedPlanForRequest) return;

    const newCard = {
      id:'CARD-'+String(carte.length+1).padStart(3,'0'),
      username:utenteCorrente.username,
      plan:selectedPlanForRequest,
      cardNumber:genCardNumber(),
      expiry:genExpiry(),
      cvc:genCVC(),
      status:'active',
      virtualLinked:true,
      secureOnline:true,
      contactless:PLAN_RULES[selectedPlanForRequest].contactless,
      createdAt:today(),
      lastReplacedAt:null,
      label: `Carta ${selectedPlanForRequest}`,
      type: requestWizard.cardType || 'virtuale'
    };
    carte.push(newCard);
    saveCards();

    // Aggiorno solo il piano utente (non le carte!) - vedi fix #1
    await api.updatePlan(utenteCorrente.username, selectedPlanForRequest);

    renderPlansBadge();
    selectedCardId = newCard.id;
    renderCardsSection();

    const msg = document.getElementById('verifyDoneMsg');
    msg.classList.remove('hidden');

    setTimeout(()=>{
      msg.classList.add('hidden');
      resetWizard();
    }, 2000);
  });

  resetWizard();
}

function setWizardStep(step){
  requestWizard.step = step;
  document.querySelectorAll('.request-steps .step').forEach(s=>{
    s.classList.toggle('active', Number(s.dataset.step) === step);
  });
  document.querySelectorAll('.request-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('requestStep'+step).classList.add('active');
}

function fillVerifySummary(){
  const plan = selectedPlanForRequest || '—';
  const rules = PLAN_RULES[plan] || PLAN_RULES.BASIC;
  const price = rules.price ? `€ ${rules.price.toFixed(2)}/mese` : 'Gratis';

  document.getElementById('verifyPlan').textContent = plan;
  document.getElementById('verifyName').textContent = requestWizard.fullName || '—';
  document.getElementById('verifyType').textContent = requestWizard.cardType ? (requestWizard.cardType === 'fisica' ? 'Fisica' : 'Virtuale') : '—';
  document.getElementById('verifyPrice').textContent = price;
}

function resetWizard(){
  selectedPlanForRequest = null;
  requestWizard = { step: 1, fullName: '', cardType: '', shipAddress: '' };

  document.querySelectorAll('.select-plan').forEach(b=>b.classList.remove('active'));
  document.getElementById('reqNext1').disabled = true;
  document.getElementById('reqFullName').value = '';
  document.getElementById('reqCardType').value = '';
  document.getElementById('reqShipAddress').value = '';
  document.getElementById('reqShipWrap').style.display = 'none';

  fillVerifySummary();
  setWizardStep(1);
}

/* =====================
   (10) EDIT CARD (prompt chirurgico)
===================== */
function openEditCardDialog(cardId){
  const card = carte.find(c=>c.id===cardId);
  if(!card) return;

  const newLabel = prompt('Nome/etichetta carta:', card.label || '');
  if(newLabel === null) return;

  const newType = prompt('Tipo carta (fisica/virtuale):', card.type || 'virtuale');
  if(newType === null) return;

  const normalizedType = String(newType).trim().toLowerCase();
  if(normalizedType !== 'fisica' && normalizedType !== 'virtuale'){
    notify('Tipo non valido (usa "fisica" o "virtuale")');
    return;
  }

  card.label = newLabel.trim() || card.label;
  card.type = normalizedType;

  saveCards();
  renderCardsSection();
  notify('Carta aggiornata');
}

/* =====================
   (11) PROFILE DROPDOWN
===================== */
function initProfileMenu(){
  const btn = document.getElementById('profileBtn');
  const dd = document.getElementById('profileDropdown');
  if(!btn || !dd) return;

  document.getElementById('profileDdName').textContent = utenteCorrente?.nomeCompleto || utenteCorrente?.username || 'Utente';
  document.getElementById('profileDdPlan').textContent = getUserPlan();

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
    document.getElementById('profileModal').style.display = 'flex';
  });
}

/* =====================
   TOAST
===================== */
function notify(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2200);
}

/* basic escape for labels in list */
function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

/* =====================
   EVENTS
===================== */
document.addEventListener('DOMContentLoaded', () => {
  startClock();

  // (8) cookie: deve funzionare anche prima del login? qui almeno attacchiamo listener.
  initCookieBanner();

  // (9) tema: se stai già in app, si applicherà in entraNellApp; qui lo applichiamo comunque per coerenza UI.
  applyTheme(loadTheme());

  // PAN/scadenza toggle (funziona quando card UI esiste)
  document.getElementById('toggleCardNumber')?.addEventListener('click', ()=>{
    cardNumberVisible = !cardNumberVisible;
    saveUIPrefs({ showCardNumber: cardNumberVisible, showExpiry: cardExpiryVisible });
    const btn = document.getElementById('toggleCardNumber');
    btn.classList.toggle('is-hidden', !cardNumberVisible);
    renderCardsSection();
  });

  document.getElementById('toggleExpiry')?.addEventListener('click', ()=>{
    cardExpiryVisible = !cardExpiryVisible;
    saveUIPrefs({ showCardNumber: cardNumberVisible, showExpiry: cardExpiryVisible });
    const btn = document.getElementById('toggleExpiry');
    btn.classList.toggle('is-hidden', !cardExpiryVisible);
    renderCardsSection();
  });

  // toggle tema
  document.getElementById('toggleThemeBtn')?.addEventListener('click', ()=>{
    const current = loadTheme();
    applyTheme(current === 'light' ? 'dark' : 'light');
  });

  // flip retro (solo visual)
  document.getElementById('flipCardBtn')?.addEventListener('click', ()=>{
    const card=document.getElementById('card3d');
    card.classList.toggle('flipped');
  });

  document.getElementById('toggleBalanceBtn')?.addEventListener('click', ()=>{
    saldoVisibile=!saldoVisibile;
    renderHome();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', ()=>location.reload());

  // nav
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-'+btn.dataset.page).classList.add('active');
      if(btn.dataset.page==='carte') renderCardsSection();
    });
  });

  // azioni carta
  document.getElementById('freezeBtn')?.addEventListener('click', toggleFreeze);
  document.getElementById('blockBtn')?.addEventListener('click', blockCard);
  document.getElementById('replaceBtn')?.addEventListener('click', replaceCard);
});

function startClock(){
  const el=document.getElementById('clock');
  const tick=()=>el.textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  tick(); setInterval(tick,1000);
}
