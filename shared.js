/* ══════════════════════════════════════════════════
   ypay — shared.js
   Full async/await rewrite.

   Concepts demonstrated:
     ✅ async / await          — every module method
     ✅ new Promise            — simulateDelay utility
     ✅ fetch + real API       — live USD→INR rate
     ✅ try / catch            — all async paths
     ✅ Promise.all            — batch-settle splits
     ✅ Higher-Order Functions — map / filter / find / reduce
     ✅ DOM Events             — driven from HTML pages
   ══════════════════════════════════════════════════ */

const STORAGE_KEY   = 'ypay_v3';
const AVATAR_COLORS = ['#c9a84c','#3db87a','#e05a5a','#6b8fff','#ff8c42','#a855f7','#22d3ee'];

const DEFAULT_STATE = {
  wallet: {
    balance: 284390,
    transactions: [
      { id:'t1',  type:'credit', amount:64200,  description:'Salary Credit',    category:'Income',        date:'01 May 2026' },
      { id:'t2',  type:'debit',  amount:620,    description:'Swiggy',           category:'Food',          date:'10 May 2026' },
      { id:'t3',  type:'debit',  amount:3499,   description:'Amazon',           category:'Shopping',      date:'08 May 2026' },
      { id:'t4',  type:'debit',  amount:840,    description:'Zepto',            category:'Groceries',     date:'07 May 2026' },
      { id:'t5',  type:'debit',  amount:450,    description:'Zomato',           category:'Food',          date:'06 May 2026' },
      { id:'t6',  type:'credit', amount:19999,  description:'Freelance Income', category:'Income',        date:'05 May 2026' },
      { id:'t7',  type:'debit',  amount:649,    description:'Netflix',          category:'Entertainment', date:'04 May 2026' },
      { id:'t8',  type:'debit',  amount:2180,   description:'Electricity Bill', category:'Bills',         date:'03 May 2026' },
      { id:'t9',  type:'debit',  amount:340,    description:'Ola',              category:'Travel',        date:'02 May 2026' },
      { id:'t10', type:'credit', amount:18000,  description:'Rent Received',    category:'Income',        date:'01 May 2026' },
    ]
  },
  friends: [
    { id:'f1', name:'Priya Sharma', initials:'PS', color:'#c9a84c', phone:'9876543210' },
    { id:'f2', name:'Rohit Mehta',  initials:'RM', color:'#3db87a', phone:'9123456789' },
    { id:'f3', name:'Sneha Joshi',  initials:'SJ', color:'#e05a5a', phone:'9988776655' },
    { id:'f4', name:'Karan Bose',   initials:'KB', color:'#6b8fff', phone:'9012345678' },
  ],
  groups: [
    { id:'g1', name:'Goa Trip 🌊',   members:['me','f1','f2','f3'], created:'01 May 2026' },
    { id:'g2', name:'Flat Mates 🏠', members:['me','f1','f2'],       created:'15 Apr 2026' },
  ],
  splits: [
    {
      id:'s1', description:'Dinner at Pebble St.', total:3200, date:'09 May 2026', paidBy:'me',
      participants:[
        { id:'me', amount:800,  settled:true  },
        { id:'f1', amount:800,  settled:false },
        { id:'f2', amount:800,  settled:false },
        { id:'f3', amount:800,  settled:true  },
      ]
    },
    {
      id:'s2', description:'Goa Hotel Booking', total:12000, date:'02 May 2026', paidBy:'f1',
      participants:[
        { id:'me', amount:3000, settled:false },
        { id:'f1', amount:3000, settled:true  },
        { id:'f2', amount:3000, settled:false },
        { id:'f3', amount:3000, settled:true  },
      ]
    }
  ],
  requests: []
};

/* ── State persistence ── */
function _loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function _saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(APP)); }
  catch (err) { console.error('[ypay] persist failed:', err); }
}
function resetToDefaults() { localStorage.removeItem(STORAGE_KEY); location.reload(); }

let APP = _loadState();

/* ── Pure helpers ── */
const formatINR   = n  => '₹' + Number(n).toLocaleString('en-IN');
const genId       = px => px + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const todayStr    = ()  => new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const getInitials = n  => n.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);
const pickColor   = i  => AVATAR_COLORS[i % AVATAR_COLORS.length];

/* ══════════════════════════════════════════════════
   1. simulateDelay — new Promise wrapping setTimeout
      This converts a callback into something we can await.
   ══════════════════════════════════════════════════ */
function simulateDelay(ms = 600) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ══════════════════════════════════════════════════
   2. fetch + async/await + try/catch
      Live USD→INR rate from a free public API.
   ══════════════════════════════════════════════════ */
async function fetchExchangeRate() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // HOF — find INR entry inside the rates object
    const inrEntry = Object.entries(data.rates).find(([cur]) => cur === 'INR');
    if (!inrEntry) throw new Error('INR not in response');
    return { rate: inrEntry[1], source: 'open.er-api.com', updated: data.time_last_update_utc };
  } catch (err) {
    console.warn('[ypay] fetchExchangeRate failed:', err.message);
    return { rate: null, error: err.message };
  }
}

/* ══════════════════════════════════════════════════
   WALLET MODULE  — every method is async
   ══════════════════════════════════════════════════ */
const Wallet = {
  getBalance()      { return APP.wallet.balance; },
  canAfford(amount) { return APP.wallet.balance >= amount; },

  async addMoney(amount) {
    if (amount <= 0) return { ok:false, error:'Amount must be > 0' };
    await simulateDelay(700);
    APP.wallet.balance += amount;
    APP.wallet.transactions.unshift({ id:genId('t'), type:'credit', amount, description:'Money Added to Wallet', category:'Top-up', date:todayStr() });
    _saveState();
    return { ok:true, newBalance:APP.wallet.balance };
  },

  async debit(amount, description, category='Transfer') {
    if (amount <= 0)            return { ok:false, error:'Amount must be > 0' };
    if (!this.canAfford(amount)) return { ok:false, error:`Insufficient balance. Available: ${formatINR(this.getBalance())}` };
    await simulateDelay(600);
    APP.wallet.balance -= amount;
    APP.wallet.transactions.unshift({ id:genId('t'), type:'debit', amount, description, category, date:todayStr() });
    _saveState();
    return { ok:true, newBalance:APP.wallet.balance };
  },

  async credit(amount, description, category='Transfer') {
    if (amount <= 0) return { ok:false, error:'Amount must be > 0' };
    await simulateDelay(500);
    APP.wallet.balance += amount;
    APP.wallet.transactions.unshift({ id:genId('t'), type:'credit', amount, description, category, date:todayStr() });
    _saveState();
    return { ok:true, newBalance:APP.wallet.balance };
  },

  getTransactions() { return APP.wallet.transactions; },

  // HOF: filter + reduce — no manual for-loops
  getStats() {
    const txs     = APP.wallet.transactions;
    const income  = txs.filter(t => t.type==='credit').reduce((s,t) => s+t.amount, 0);
    const expense = txs.filter(t => t.type==='debit').reduce((s,t) => s+t.amount, 0);
    return { income, expense, balance:APP.wallet.balance };
  }
};

/* ══════════════════════════════════════════════════
   FRIENDS MODULE
   ══════════════════════════════════════════════════ */
const Friends = {
  getAll()    { return APP.friends; },
  getById(id) {
    if (id==='me') return { id:'me', name:'You', initials:'ME', color:'#c9a84c' };
    return APP.friends.find(f => f.id===id) || null;  // HOF: find
  },
  getName(id) {
    if (id==='me') return 'You';
    return APP.friends.find(f => f.id===id)?.name ?? 'Unknown';
  },

  async add(name, phone='') {
    if (!name.trim()) return { ok:false, error:'Name is required' };
    await simulateDelay(400);
    const friend = { id:genId('f'), name:name.trim(), initials:getInitials(name), color:pickColor(APP.friends.length), phone:phone.trim() };
    APP.friends.push(friend);
    _saveState();
    return { ok:true, friend };
  },

  async remove(id) {
    if (!APP.friends.find(f => f.id===id)) return { ok:false, error:'Friend not found' };
    await simulateDelay(300);
    APP.groups.forEach(g => { g.members = g.members.filter(m => m!==id); }); // HOF: filter
    APP.friends = APP.friends.filter(f => f.id!==id);
    _saveState();
    return { ok:true };
  }
};

/* ══════════════════════════════════════════════════
   GROUPS MODULE
   ══════════════════════════════════════════════════ */
const Groups = {
  getAll()    { return APP.groups; },
  getById(id) { return APP.groups.find(g => g.id===id) ?? null; },

  async create(name, memberIds=[]) {
    if (!name.trim()) return { ok:false, error:'Group name is required' };
    await simulateDelay(400);
    const members = ['me', ...memberIds.filter(id => id!=='me')]; // HOF: filter
    const group   = { id:genId('g'), name:name.trim(), members, created:todayStr() };
    APP.groups.push(group);
    _saveState();
    return { ok:true, group };
  },

  async delete(id) {
    if (!this.getById(id)) return { ok:false, error:'Group not found' };
    await simulateDelay(300);
    APP.groups = APP.groups.filter(g => g.id!==id);
    _saveState();
    return { ok:true };
  },

  async addMember(groupId, friendId) {
    const g = this.getById(groupId);
    if (!g) return { ok:false, error:'Group not found' };
    if (g.members.includes(friendId)) return { ok:false, error:'Already a member' };
    await simulateDelay(300);
    g.members.push(friendId);
    _saveState();
    return { ok:true };
  },

  async removeMember(groupId, friendId) {
    if (friendId==='me') return { ok:false, error:"Can't remove yourself" };
    const g = this.getById(groupId);
    if (!g) return { ok:false, error:'Group not found' };
    await simulateDelay(300);
    g.members = g.members.filter(m => m!==friendId);
    _saveState();
    return { ok:true };
  }
};

/* ══════════════════════════════════════════════════
   SPLITS MODULE
   ══════════════════════════════════════════════════ */
const Splits = {
  getAll()    { return APP.splits; },
  getById(id) { return APP.splits.find(s => s.id===id) ?? null; },

  async createEqual(description, total, participantIds, paidBy='me') {
    if (!description.trim())       return { ok:false, error:'Description is required' };
    if (total <= 0)                return { ok:false, error:'Amount must be positive' };
    if (participantIds.length < 2) return { ok:false, error:'Select at least 2 people' };

    const perPerson = Math.round(total / participantIds.length);

    if (paidBy==='me') {
      const res = await Wallet.debit(total, description, 'Split Payment'); // await
      if (!res.ok) return res;
    }
    // HOF: map to build participant objects
    const participants = participantIds.map(id => ({ id, amount:perPerson, settled:id===paidBy }));
    const split = { id:genId('s'), description, total, date:todayStr(), paidBy, participants };
    APP.splits.unshift(split);
    _saveState();
    return { ok:true, split, perPerson };
  },

  async createCustom(description, participants, paidBy='me') {
    if (!description.trim())     return { ok:false, error:'Description is required' };
    if (participants.length < 2) return { ok:false, error:'Add at least 2 people' };
    const total = participants.reduce((s,p) => s+p.amount, 0); // HOF: reduce
    if (total <= 0) return { ok:false, error:'Total must be positive' };

    if (paidBy==='me') {
      const res = await Wallet.debit(total, description, 'Split Payment');
      if (!res.ok) return res;
    }
    const parts = participants.map(p => ({ ...p, settled:p.id===paidBy })); // HOF: map + spread
    const split = { id:genId('s'), description, total, date:todayStr(), paidBy, participants:parts };
    APP.splits.unshift(split);
    _saveState();
    return { ok:true, split };
  },

  async settle(splitId, participantId) {
    const split = this.getById(splitId);
    if (!split) return { ok:false, error:'Split not found' };
    const part  = split.participants.find(p => p.id===participantId); // HOF: find
    if (!part)      return { ok:false, error:'Participant not found' };
    if (part.settled) return { ok:false, error:'Already settled' };

    if (participantId==='me' && split.paidBy!=='me') {
      const res = await Wallet.debit(part.amount, `Settled: ${split.description}`, 'Settlement');
      if (!res.ok) return res;
    }
    if (participantId!=='me' && split.paidBy==='me') {
      await Wallet.credit(part.amount, `${Friends.getName(participantId)} settled: ${split.description}`, 'Settlement');
    }
    part.settled = true;
    _saveState();
    return { ok:true };
  },

  // Promise.all — settle every unsettled participant concurrently
  async settleAll(splitId) {
    const split = this.getById(splitId);
    if (!split) return { ok:false, error:'Split not found' };
    const unsettled = split.participants.filter(p => !p.settled); // HOF: filter
    const results   = await Promise.all(unsettled.map(p => this.settle(splitId, p.id)));
    const failed    = results.filter(r => !r.ok); // HOF: filter
    return failed.length ? { ok:false, error:`${failed.length} failed` } : { ok:true, count:unsettled.length };
  },

  async delete(id) {
    APP.splits = APP.splits.filter(s => s.id!==id);
    _saveState();
    return { ok:true };
  },

  getIOwed() {
    return APP.splits.reduce((sum, split) => {
      if (split.paidBy==='me') return sum;
      const me = split.participants.find(p => p.id==='me');
      return sum + (me && !me.settled ? me.amount : 0);
    }, 0);
  },

  getOwedToMe() {
    return APP.splits.reduce((sum, split) => {
      if (split.paidBy!=='me') return sum;
      return sum + split.participants
        .filter(p => !p.settled && p.id!=='me')
        .reduce((s,p) => s+p.amount, 0);
    }, 0);
  }
};

/* ══════════════════════════════════════════════════
   PAYMENTS MODULE
   ══════════════════════════════════════════════════ */
const Payments = {
  async send(friendId, amount, note='') {
    if (amount <= 0) return { ok:false, error:'Amount must be positive' };
    if (!Wallet.canAfford(amount)) return { ok:false, error:`Insufficient balance. You have ${formatINR(Wallet.getBalance())}` };
    const name = Friends.getName(friendId);
    const desc = note ? `Sent to ${name} · ${note}` : `Sent to ${name}`;
    return await Wallet.debit(amount, desc, 'Transfer');
  },

  async createRequest(friendId, amount, note='') {
    if (amount <= 0) return { ok:false, error:'Amount must be positive' };
    await simulateDelay(300);
    const req = { id:genId('r'), fromId:friendId, amount, note, status:'pending', date:todayStr() };
    APP.requests.push(req);
    _saveState();
    return { ok:true, request:req };
  },

  async acceptRequest(requestId) {
    const req = APP.requests.find(r => r.id===requestId);
    if (!req || req.status!=='pending') return { ok:false, error:'Request not found' };
    const res = await Wallet.credit(req.amount, `${Friends.getName(req.fromId)} paid your request`, 'Request');
    if (!res.ok) return res;
    req.status = 'accepted';
    _saveState();
    return { ok:true };
  },

  async declineRequest(requestId) {
    const req = APP.requests.find(r => r.id===requestId);
    if (!req) return { ok:false, error:'Request not found' };
    await simulateDelay(200);
    req.status = 'declined';
    _saveState();
    return { ok:true };
  },

  getPendingRequests() { return APP.requests.filter(r => r.status==='pending'); },
  getAllRequests()      { return APP.requests; }
};

/* ══════════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════════ */

// Button loading state
function setLoading(btn, on) {
  if (!btn) return;
  if (on) { btn.disabled=true; btn.dataset.orig=btn.textContent; btn.innerHTML=`<span style="opacity:.6">Processing…</span>`; }
  else    { btn.disabled=false; btn.textContent=btn.dataset.orig||btn.textContent; }
}

// Toast
function showToast(msg, type='success') {
  let t = document.getElementById('_toast');
  if (!t) { t=Object.assign(document.createElement('div'),{id:'_toast'}); document.body.appendChild(t); }
  t.textContent=msg; t.className=`toast toast-${type} toast-show`;
  clearTimeout(t._tid); t._tid=setTimeout(()=>t.classList.remove('toast-show'),3200);
}

// Modal
function openModal(title, bodyHTML, { confirmLabel='Confirm', onConfirm, cancelLabel='Cancel', danger=false }={}) {
  let overlay=document.getElementById('_modal');
  if (!overlay) {
    overlay=document.createElement('div'); overlay.id='_modal';
    overlay.innerHTML=`<div class="modal-box"><div class="modal-head"><div class="modal-title" id="_modal-title"></div><button class="icon-btn" id="_modal-close"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="modal-body" id="_modal-body"></div><div class="modal-foot" id="_modal-foot"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
    document.getElementById('_modal-close').addEventListener('click', closeModal);
  }
  document.getElementById('_modal-title').textContent=title;
  document.getElementById('_modal-body').innerHTML=bodyHTML;
  const foot=document.getElementById('_modal-foot'); foot.innerHTML='';
  if (cancelLabel) {
    const cb=document.createElement('button'); cb.className='modal-cancel-btn'; cb.textContent=cancelLabel; cb.onclick=closeModal; foot.appendChild(cb);
  }
  if (onConfirm) {
    const ob=document.createElement('button'); ob.id='_modal-confirm';
    ob.className=danger?'send-btn danger-btn':'send-btn';
    ob.style.cssText='width:auto;padding:11px 24px;margin-top:0;flex-shrink:0';
    ob.textContent=confirmLabel; ob.onclick=onConfirm; foot.appendChild(ob);
  }
  overlay.classList.add('modal-open');
}
function closeModal() { document.getElementById('_modal')?.classList.remove('modal-open'); }

// Transaction row
const CAT_ICONS = { Food:'🍜',Income:'💼',Shopping:'📦',Groceries:'🛒',Entertainment:'🎬',Bills:'⚡',Travel:'🚗',Transfer:'💸','Top-up':'💳',Settlement:'🤝','Split Payment':'🧾',Request:'📨' };
function renderTxItem(tx) {
  const isCr=tx.type==='credit';
  return `<div class="tx-item">
    <div class="tx-icon" style="background:${isCr?'rgba(61,184,122,0.1)':'rgba(201,168,76,0.08)'}">${CAT_ICONS[tx.category]??'💰'}</div>
    <div class="tx-info"><div class="tx-name">${tx.description}</div><div class="tx-date">${tx.date} · ${tx.category}</div></div>
    <div class="tx-amount-col"><div class="tx-amount ${isCr?'credit':'debit'}">${isCr?'+':'−'}${formatINR(tx.amount)}</div></div>
  </div>`;
}

// Avatar
function renderAvatar(person, size=36) {
  const f=typeof person==='string'?Friends.getById(person):person;
  if(!f) return '';
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${f.color};font-size:${Math.round(size*.35)}px">${f.initials}</div>`;
}

// Sidebar
function buildSidebar(activePage) {
  const NAV=[
    {id:'dashboard',    label:'Dashboard',    href:'index.html',        icon:`<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`},
    {id:'wallet',       label:'Wallet',       href:'wallet.html',       icon:`<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5" fill="currentColor"/>`},
    {id:'split',        label:'Split',        href:'split.html',        icon:`<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m10 0h3a2 2 0 0 0 2-2v-3"/><path d="M7 12h10M12 7v10"/>`},
    {id:'transactions', label:'Transactions', href:'transactions.html', icon:`<path d="M5 12h14M15 7l5 5-5 5"/>`},
  ];
  const TOOLS=[
    {id:'friends',label:'Friends',href:'friends.html',icon:`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`},
    {id:'groups', label:'Groups', href:'groups.html', icon:`<circle cx="9" cy="7" r="4"/><circle cx="17" cy="7" r="3"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M1 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>`},
    {id:'history',label:'History',href:'history.html',icon:`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`},
  ];
  const BOTTOM=[
    {id:'settings',label:'Settings',href:'settings.html',icon:`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`},
  ];
  const ni = item => `<a class="nav-item${item.id===activePage?' active':''}" href="${item.href}"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.6">${item.icon}</svg><span class="nav-label">${item.label}</span></a>`;
  return `
    <div class="sidebar-logo">ypay<div class="sidebar-logo-dot"></div></div>
    <div class="sidebar-section-label">Main</div>
    <nav class="nav">${NAV.map(ni).join('')}</nav>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section-label">Social</div>
    <nav class="nav">${TOOLS.map(ni).join('')}</nav>
    <div class="sidebar-divider"></div>
    <nav class="nav">${BOTTOM.map(ni).join('')}</nav>
    <div class="sidebar-bottom">
      <div class="user-row">
        <div class="user-avatar">AK</div>
        <div><div class="user-name">Arjun Kapoor</div><div class="user-role">Obsidian Reserve</div></div>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebar=document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML=buildSidebar(sidebar.dataset.page||'dashboard');
});
