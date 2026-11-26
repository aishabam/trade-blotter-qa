// Mock "Trade Blotter" app — the system under test.
// A deliberately small, in-memory trading-style app: sign in, place orders,
// amend and cancel them. It exists so the Playwright suite has something
// realistic and deterministic to test. Not production code.

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const USERS = { trader1: 'password123', trader2: 'password123' };
const INSTRUMENTS = ['GBPUSD', 'EURUSD', 'USDJPY', 'UK10Y'];
const SIDES = ['BUY', 'SELL'];

let state;
function resetState() {
  state = { sessions: new Map(), orders: new Map(), idempotency: new Map(), nextId: 1 };
}
resetState();

// ---------- auth ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || USERS[username] !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = crypto.randomUUID();
  state.sessions.set(token, username);
  res.json({ token, username });
});

function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token && state.sessions.get(token);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });
  req.user = user;
  next();
}

// ---------- validation ----------
function validateOrderFields({ instrument, side, quantity, price }, { partial = false } = {}) {
  const errors = [];
  if (!partial || instrument !== undefined) {
    if (!INSTRUMENTS.includes(instrument)) errors.push('instrument must be one of ' + INSTRUMENTS.join(', '));
  }
  if (!partial || side !== undefined) {
    if (!SIDES.includes(side)) errors.push('side must be BUY or SELL');
  }
  if (!partial || quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity <= 0) errors.push('quantity must be a positive whole number');
    else if (quantity > 100_000_000) errors.push('quantity exceeds the 100,000,000 limit');
  }
  if (!partial || price !== undefined) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) errors.push('price must be greater than 0');
    else if (Math.round(price * 10000) / 10000 !== price) errors.push('price allows at most 4 decimal places');
  }
  return errors;
}

// ---------- orders ----------
app.get('/api/instruments', (_req, res) => res.json(INSTRUMENTS));

app.get('/api/orders', requireAuth, (req, res) => {
  const mine = [...state.orders.values()].filter((o) => o.owner === req.user);
  res.json(mine);
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const order = state.orders.get(Number(req.params.id));
  if (!order || order.owner !== req.user) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', requireAuth, (req, res) => {
  const key = req.get('Idempotency-Key');
  const scopedKey = key ? `${req.user}:${key}` : null;
  if (scopedKey && state.idempotency.has(scopedKey)) {
    // Same request retried: return the original order, never create a duplicate.
    return res.status(200).json(state.orders.get(state.idempotency.get(scopedKey)));
  }

  const { instrument, side, quantity, price } = req.body || {};
  const errors = validateOrderFields({ instrument, side, quantity, price });
  if (errors.length) return res.status(400).json({ errors });

  const now = new Date().toISOString();
  const order = {
    id: state.nextId++,
    owner: req.user,
    instrument,
    side,
    quantity,
    price,
    status: 'NEW',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  state.orders.set(order.id, order);
  if (scopedKey) state.idempotency.set(scopedKey, order.id);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', requireAuth, (req, res) => {
  const order = state.orders.get(Number(req.params.id));
  if (!order || order.owner !== req.user) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'CANCELLED') return res.status(409).json({ error: 'Cancelled orders cannot be amended' });

  const { quantity, price, version } = req.body || {};
  if (version !== order.version) {
    // Optimistic locking: protects against two amends overwriting each other.
    return res.status(409).json({ error: 'Order has changed since you loaded it', currentVersion: order.version });
  }
  if (quantity === undefined && price === undefined) {
    return res.status(400).json({ errors: ['provide quantity and/or price to amend'] });
  }
  const errors = validateOrderFields({ quantity, price }, { partial: true });
  if (errors.length) return res.status(400).json({ errors });

  if (quantity !== undefined) order.quantity = quantity;
  if (price !== undefined) order.price = price;
  order.status = 'AMENDED';
  order.version += 1;
  order.updatedAt = new Date().toISOString();
  res.json(order);
});

app.post('/api/orders/:id/cancel', requireAuth, (req, res) => {
  const order = state.orders.get(Number(req.params.id));
  if (!order || order.owner !== req.user) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'CANCELLED') return res.status(409).json({ error: 'Order is already cancelled' });
  order.status = 'CANCELLED';
  order.version += 1;
  order.updatedAt = new Date().toISOString();
  res.json(order);
});

// Test-only hook: clears orders but keeps sessions, so saved logins stay valid.
app.post('/api/test/reset', (_req, res) => {
  const sessions = state.sessions;
  resetState();
  state.sessions = sessions;
  res.status(204).end();
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Trade Blotter running on http://localhost:${port}`));
