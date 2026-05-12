'use strict';

const CONFIG = {
  MAX_MOV: 10,
  MAX_HOLDERS: 3
};

let utenti = [
  {
    username: 'admin',
    password: 'admin',
    nomeCompleto: 'Amministratore',
    email: '',
    via: '',
    telefono: '',
    cf: ''
  }
];

let utenteCorrente = null;

let conti = [
  {
    id: 'ACC-001',
    nome: 'Conto Principale',
    tipo: 'corrente_canone',
    saldo: 12450.80,
    tasso: null,
    dataApertura: '2023-02-14',
    ultimoInteresse: null,
    proprietario: 'admin',
    titolari: [{ nome: 'Mario', cognome: 'Celeste', cf: 'CLSMRA80A01H501Z' }],
    movimenti: []
  }
];

let authMode = 'login';
let selectedAccountId = 'ACC-001';
let nextAccNum = 2;

let saldoVisibile = true;

const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = n => '€ ' + money(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

function validateCF(cf) {
  if (!cf) return false;
  return /^[A-Z0-9]{16}$/.test(cf);
}

function addMov(conto, tipo, importo, entrata = true) {
  const dataC = today();
  const dataV = new Date();
  dataV.setDate(dataV.getDate() + 1);

  const imp = money(Math.abs(importo)) * (entrata ? 1 : -1);

  const mov = {
    dataContabile: dataC,
    dataValuta: dataV.toISOString().split('T')[0],
    tipo,
    importo: imp
  };

  conto.movimenti.unshift(mov);
  if (conto.movimenti.length > CONFIG.MAX_MOV) {
    conto.movimenti = conto.movimenti.slice(0, CONFIG.MAX_MOV);
  }
}

function contiUtente() {
  return utenteCorrente ? conti.filter(c => c.proprietario === utenteCorrente.username) : [];
}

function applyInterests() {
  const oggi = today();
  conti.forEach(c => {
    if (c.tipo !== 'deposito') return;
    if (!c.ultimoInteresse) c.ultimoInteresse = oggi;
    if (c.ultimoInteresse === oggi) return;

    const giorni = Math.floor((new Date(oggi) - new Date(c.ultimoInteresse)) / 86400000);
    if (giorni <= 0) return;

    const interesse = money(c.saldo * (c.tasso / 100 / 365) * giorni);
    c.saldo = money(c.saldo + interesse);
    c.ultimoInteresse = oggi;
    addMov(c, 'Accredito interessi', interesse, true);
  });
}

window.switchAuthTab = function(mode) {
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

window.handleAuth = function(e) {
  e.preventDefault();
  const err = document.getElementById('authError');

  if (authMode === 'register') {
    const nome = document.getElementById('authNome').value.trim();
    const cognome = document.getElementById('authCognome').value.trim();
    const user = document.getElementById('authUser').value.trim();
    const pass = document.getElementById('authPass').value;
    const cf = document.getElementById('authCF').value.trim().toUpperCase();
    const email = document.getElementById('authEmail').value.trim();
    const via = document.getElementById('authVia').value.trim();

    if (!nome || !cognome || !user || !pass) {
      err.textContent = 'Compila tutti i campi obbligatori.';
      return;
    }
    if (cf && !validateCF(cf)) {
      err.textContent = 'Codice fiscale non valido.';
      return;
    }

    utenti.push({
      username: user,
      password: pass,
      nomeCompleto: nome + ' ' + cognome,
      email,
      via,
      telefono: '',
      cf
    });

    entraNellApp({ username: user, nomeCompleto: nome + ' ' + cognome, email, via, cf });
    return;
  }

  const u = document.getElementById('authUser').value.trim();
  const p = document.getElementById('authPass').value;
  const ut = utenti.find(x => x.username === u && x.password === p);
  if (!ut) {
    err.textContent = 'Credenziali non valide.';
    return;
  }
  entraNellApp(ut);
};

function entraNellApp(utente) {
  utenteCorrente = utente;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  const iniziali = utente.nomeCompleto.split(' ').map(p => p[0]).join('').toUpperCase();
  document.getElementById('avatarInitials').textContent = iniziali;

  renderHome();
}

function renderHome() {
  const ora = new Date().getHours();
  const saluto = ora < 12 ? 'Buongiorno,' : ora < 18 ? 'Buon pomeriggio,' : 'Buonasera,';
  const nomeRaw = (utenteCorrente?.nomeCompleto || 'Utente').split(' ')[0];
  const nome = nomeRaw.charAt(0).toUpperCase() + nomeRaw.slice(1);

  document.getElementById('greetText').textContent = saluto;
  document.getElementById('greetName').textContent = nome;

  const saldo = contiUtente().reduce((s, c) => s + c.saldo, 0);

  const balanceEl = document.getElementById('totalBalance');
  const eyeBtn = document.getElementById('toggleBalanceBtn');

  if (saldoVisibile) {
    balanceEl.textContent = fmt(saldo);
    balanceEl.classList.remove('hidden');
    eyeBtn.classList.remove('is-hidden');
    eyeBtn.setAttribute('aria-label', 'Nascondi saldo');
    eyeBtn.setAttribute('title', 'Nascondi saldo');
  } else {
    balanceEl.textContent = '••••••';
    balanceEl.classList.add('hidden');
    eyeBtn.classList.add('is-hidden');
    eyeBtn.setAttribute('aria-label', 'Mostra saldo');
    eyeBtn.setAttribute('title', 'Mostra saldo');
  }
}

function renderContiPage() {
  applyInterests();
  const list = document.getElementById('accountsList');
  const detail = document.getElementById('accountDetailBody');
  list.innerHTML = '';

  const mieiConti = contiUtente();
  if (!mieiConti.length) {
    list.innerHTML = `<div class="account-row">Nessun conto disponibile</div>`;
    detail.innerHTML = `<div class="detail-body">Seleziona o crea un conto.</div>`;
    return;
  }

  if (!mieiConti.find(c => c.id === selectedAccountId)) {
    selectedAccountId = mieiConti[0].id;
  }

  mieiConti.forEach(c => {
    const row = document.createElement('div');
    row.className = 'account-row' + (c.id === selectedAccountId ? ' active' : '');
    row.innerHTML = `
      <div class="row-main">
        <div class="row-name">${c.nome}</div>
        <div class="row-type">${labelTipo(c.tipo)}</div>
      </div>
      <div class="row-meta">
        <span class="row-id">${c.id}</span>
        <span class="row-balance">${fmt(c.saldo)}</span>
      </div>
    `;
    row.addEventListener('click', () => {
      selectedAccountId = c.id;
      renderContiPage();
    });
    list.appendChild(row);
  });

  const conto = mieiConti.find(c => c.id === selectedAccountId);
  if (!conto) return;

  const titolari = conto.titolari.map(t => `${t.nome} ${t.cognome}`).join(', ');
  const movs = conto.movimenti.length
    ? conto.movimenti.map(m => {
        const segno = m.importo >= 0 ? '+' : '-';
        return `<div class="mov-item"><span>${m.tipo} · ${m.dataContabile}</span><span>${segno}${fmt(Math.abs(m.importo))}</span></div>`;
      }).join('')
    : `<div class="mov-item">Nessun movimento</div>`;

  detail.innerHTML = `
    <div class="detail-row"><strong>ID</strong><span>${conto.id}</span></div>
    <div class="detail-row"><strong>Nome</strong><span>${conto.nome}</span></div>
    <div class="detail-row"><strong>Tipo</strong><span>${labelTipo(conto.tipo)}</span></div>
    <div class="detail-row"><strong>Saldo</strong><span>${fmt(conto.saldo)}</span></div>
    <div class="detail-row"><strong>Intestatari</strong><span>${titolari}</span></div>
    ${conto.tipo === 'deposito' ? `<div class="detail-row"><strong>Tasso</strong><span>${conto.tasso}%</span></div>` : ''}
    <div class="detail-title">Ultimi movimenti</div>
    <div class="mov-list">${movs}</div>
  `;
}

function labelTipo(tipo) {
  if (tipo === 'corrente_canone') return 'Corrente — canone fisso';
  if (tipo === 'corrente_no_canone') return 'Corrente — senza canone';
  return 'Conto deposito';
}

/* NAV */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + btn.dataset.page).classList.add('active');

    if (btn.dataset.page === 'conti') renderContiPage();
    if (btn.dataset.page === 'home') renderHome();
  });
});

/* CONTO */
document.getElementById('createAccountBtn').addEventListener('click', () => {
  document.getElementById('accountFormWrap').classList.remove('hidden');
});
document.getElementById('cancelAccountBtn').addEventListener('click', () => {
  document.getElementById('accountFormWrap').classList.add('hidden');
});
document.getElementById('accType').addEventListener('change', (e) => {
  document.getElementById('accRateWrap').style.display = e.target.value === 'deposito' ? 'block' : 'none';
});
document.getElementById('saveAccountBtn').addEventListener('click', () => {
  const nome = document.getElementById('accName').value.trim() || 'Conto Corrente';
  const tipo = document.getElementById('accType').value;
  const tasso = parseFloat(document.getElementById('accRate').value) || 2.5;

  const n1 = document.getElementById('holderName1').value.trim();
  const c1 = document.getElementById('holderLast1').value.trim();
  const cf1 = document.getElementById('holderCf1').value.trim().toUpperCase();

  if (!n1 || !c1) return alert('Inserisci intestatario principale.');
  if (cf1 && !validateCF(cf1)) return alert('Codice fiscale intestatario non valido.');

  const titolari = [{ nome: n1, cognome: c1, cf: cf1 }];

  const n2 = document.getElementById('holderName2').value.trim();
  const c2 = document.getElementById('holderLast2').value.trim();
  if (n2 && c2) titolari.push({ nome: n2, cognome: c2, cf: '' });

  const n3 = document.getElementById('holderName3').value.trim();
  const c3 = document.getElementById('holderLast3').value.trim();
  if (n3 && c3) titolari.push({ nome: n3, cognome: c3, cf: '' });

  if (titolari.length > CONFIG.MAX_HOLDERS) return alert('Massimo 3 cointestatari.');

  const id = `ACC-${String(nextAccNum).padStart(3, '0')}`;
  nextAccNum++;

  const nuovo = {
    id,
    nome,
    tipo,
    saldo: 0,
    tasso: tipo === 'deposito' ? tasso : null,
    dataApertura: today(),
    ultimoInteresse: tipo === 'deposito' ? today() : null,
    proprietario: utenteCorrente.username,
    titolari,
    movimenti: []
  };

  addMov(nuovo, 'Apertura conto', 0, true);
  conti.push(nuovo);
  selectedAccountId = id;

  document.getElementById('accountFormWrap').classList.add('hidden');
  renderContiPage();
});

/* SALDO NASCOSTO */
document.getElementById('toggleBalanceBtn').addEventListener('click', () => {
  saldoVisibile = !saldoVisibile;
  sessionStorage.setItem('balanceHidden', saldoVisibile ? '0' : '1');
  renderHome();
});

/* CLOCK */
function startClock() {
  const el = document.getElementById('clock');
  const tick = () => el.textContent = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  tick();
  setInterval(tick, 1000);
}

/* TEMA */
document.getElementById('toggleThemeBtn').addEventListener('click', () => {
  const isLight = document.documentElement.classList.toggle('light');
  document.getElementById('themeLabel').textContent = isLight ? 'Chiaro' : 'Scuro';
});

/* COOKIE */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  const stored = sessionStorage.getItem('balanceHidden');
  saldoVisibile = stored !== '1';
  document.getElementById('cookieBanner').style.display = 'flex';
  renderHome();
});

document.getElementById('acceptCookiesBtn').addEventListener('click', () => {
  document.getElementById('cookieBanner').style.display = 'none';
});

/* PROFILO */
document.getElementById('profileBtn').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'flex';
  document.getElementById('profileName').value = utenteCorrente?.nomeCompleto || '';
  document.getElementById('profileEmail').value = utenteCorrente?.email || '';
  document.getElementById('profileVia').value = utenteCorrente?.via || '';
  document.getElementById('profilePhone').value = utenteCorrente?.telefono || '';
  document.getElementById('profileCF').value = utenteCorrente?.cf || '';
  document.getElementById('profileUser').value = utenteCorrente?.username || '';
});

document.getElementById('closeProfile').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'none';
});

document.getElementById('saveProfile').addEventListener('click', () => {
  const cf = document.getElementById('profileCF').value.trim().toUpperCase();
  if (cf && !validateCF(cf)) return alert('Codice fiscale non valido.');

  utenteCorrente.nomeCompleto = document.getElementById('profileName').value.trim();
  utenteCorrente.email = document.getElementById('profileEmail').value.trim();
  utenteCorrente.via = document.getElementById('profileVia').value.trim();
  utenteCorrente.telefono = document.getElementById('profilePhone').value.trim();
  utenteCorrente.cf = cf;

  document.getElementById('profileModal').style.display = 'none';
  entraNellApp(utenteCorrente);
});

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  const ok = confirm('Sei sicuro di voler eliminare l’account? Tutti i dati verranno rimossi.');
  if (!ok) return;

  utenti = utenti.filter(u => u.username !== utenteCorrente.username);
  conti = conti.filter(c => c.proprietario !== utenteCorrente.username);

  utenteCorrente = null;
  location.reload();
});

/* LOGOUT */
document.getElementById('logoutBtn').addEventListener('click', () => location.reload());