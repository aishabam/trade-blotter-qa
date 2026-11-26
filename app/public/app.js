// Front end for the mock Trade Blotter. Plain JS, no framework, on purpose.
const $ = (sel) => document.querySelector(sel);
const TOKEN_KEY = 'tb.token';
const USER_KEY = 'tb.user';

const loginView = $('#login-view');
const blotterView = $('#blotter-view');
let editing = null; // order currently being amended

function token() { return localStorage.getItem(TOKEN_KEY); }

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (res.status === 401 && url !== '/api/login') signOut();
  return { ok: res.ok, status: res.status, data };
}

function errorText(data) {
  if (!data) return 'Something went wrong';
  if (Array.isArray(data.errors)) return data.errors.join('; ');
  return data.error || 'Something went wrong';
}

function toNumber(value) {
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function showMessage(el, text, kind) {
  el.textContent = text;
  el.className = kind;
}

// ---------- views ----------
function showLogin() {
  blotterView.hidden = true;
  loginView.hidden = false;
}

async function showBlotter() {
  loginView.hidden = true;
  blotterView.hidden = false;
  $('[data-testid="current-user"]').textContent = localStorage.getItem(USER_KEY);
  const select = $('#order-form [name="instrument"]');
  if (!select.options.length) {
    const res = await fetch('/api/instruments');
    for (const symbol of await res.json()) select.add(new Option(symbol, symbol));
  }
  await loadOrders();
}

async function loadOrders() {
  const { ok, data } = await api('GET', '/api/orders');
  if (!ok) return;
  const body = $('#orders-body');
  body.replaceChildren(
    ...data.sort((a, b) => b.id - a.id).map((o) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-testid', `order-row-${o.id}`);
      tr.innerHTML = `
        <td data-testid="order-id">${o.id}</td>
        <td data-testid="order-instrument">${o.instrument}</td>
        <td data-testid="order-side">${o.side}</td>
        <td data-testid="order-quantity">${o.quantity.toLocaleString('en-GB')}</td>
        <td data-testid="order-price">${o.price.toFixed(4)}</td>
        <td data-testid="order-status">${o.status}</td>
        <td></td>`;
      const actions = tr.lastElementChild;
      if (o.status !== 'CANCELLED') {
        const amend = document.createElement('button');
        amend.textContent = 'Amend';
        amend.addEventListener('click', () => openAmend(o));
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => cancelOrder(o));
        actions.append(amend, cancel);
      }
      return tr;
    }),
  );
}

// ---------- login ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
  });
  const data = await res.json();
  if (!res.ok) return showMessage($('#login-message'), data.error, 'error');
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, data.username);
  showMessage($('#login-message'), '', 'error');
  showBlotter();
});

function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  showLogin();
}
$('#sign-out').addEventListener('click', signOut);

// ---------- place order ----------
$('#order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const order = {
    instrument: form.get('instrument'),
    side: form.get('side'),
    quantity: toNumber(form.get('quantity')),
    price: toNumber(form.get('price')),
  };
  const { ok, data } = await api('POST', '/api/orders', order);
  const msg = $('#order-message');
  if (!ok) return showMessage(msg, errorText(data), 'error');
  showMessage(msg, `Order ${data.id} placed`, 'ok');
  e.target.reset();
  loadOrders();
});

// ---------- amend ----------
function openAmend(order) {
  editing = order;
  const form = $('#amend-form');
  form.quantity.value = order.quantity;
  form.price.value = order.price;
  $('#amend-message').textContent = '';
  $('#amend-dialog').showModal();
}

$('#amend-close').addEventListener('click', () => $('#amend-dialog').close());

$('#amend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const { ok, data } = await api('PATCH', `/api/orders/${editing.id}`, {
    quantity: toNumber(form.quantity.value),
    price: toNumber(form.price.value),
    version: editing.version,
  });
  if (!ok) return showMessage($('#amend-message'), errorText(data), 'error');
  $('#amend-dialog').close();
  showMessage($('#order-message'), `Order ${data.id} amended`, 'ok');
  loadOrders();
});

// ---------- cancel ----------
async function cancelOrder(order) {
  const { ok, data } = await api('POST', `/api/orders/${order.id}/cancel`);
  const msg = $('#order-message');
  if (!ok) return showMessage(msg, errorText(data), 'error');
  showMessage(msg, `Order ${data.id} cancelled`, 'ok');
  loadOrders();
}

// ---------- boot ----------
if (token()) showBlotter(); else showLogin();
