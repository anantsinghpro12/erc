const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');
const DEFAULT_DATA = { students: [], books: [], uniforms: [], bookStock: [], uniformStock: [], settings: {} };

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));
    const parsed = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_DATA)), parsed);
  } catch (e) {
    console.error('Read error', e);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const CLASSES = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const SIZES = ['20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40'];
const CATEGORIES = ['Pants', 'Shirts', 'Skirt', 'Lover', 'T-Shirt', 'Belt', 'Hoody'];
const UNIFORM_CATEGORIES = CATEGORIES.filter(c => c !== 'Belt');
const ACCESSORY_CATEGORIES = ['Belt'];
const LOGIN_PASSWORD = 'ashishashish';

router.post('/api/login', (req, res) => {
  const { password } = req.body;
  res.json({ success: password === LOGIN_PASSWORD });
});

function computeGiven(data, type, matchFn) {
  let given = 0;
  data.students.forEach(s => {
    (s.items || []).forEach(it => {
      if (it.status === 'Completed' && it.type === type && matchFn(it)) given += 1;
    });
  });
  return given;
}

router.get('/', (req, res) => {
  const data = readData();
  const totalStudents = data.students.length;
  const totalBooks = data.books.length;
  const totalUniformItems = data.uniforms.length;
  const totalBookStock = data.bookStock.reduce((a, b) => a + (b.stock || 0), 0);
  const totalUniformStock = data.uniformStock.reduce((a, b) => a + (b.stock || 0), 0);
  let pendingBookAmount = 0, pendingUniformAmount = 0, completedBookAmount = 0, completedUniformAmount = 0;
  data.students.forEach(s => {
    (s.items || []).forEach(it => {
      const amt = Number(it.price) || 0;
      if (it.category) {
        if (it.status === 'Pending') pendingUniformAmount += amt; else completedUniformAmount += amt;
      } else {
        if (it.status === 'Pending') pendingBookAmount += amt; else completedBookAmount += amt;
      }
    });
  });
  const givenBooks = computeGiven(data, 'book', () => true);
  const givenUniforms = computeGiven(data, 'uniform', () => true);
  res.render('admin', {
    data, CLASSES, SIZES, CATEGORIES, UNIFORM_CATEGORIES, ACCESSORY_CATEGORIES,
    dashboard: {
      totalStudents, totalBooks, totalUniformItems, totalBookStock, totalUniformStock,
      pendingBookAmount, pendingUniformAmount,
      remainingBookStock: totalBookStock - givenBooks,
      remainingUniformStock: totalUniformStock - givenUniforms
    }
  });
});

// ---------- STUDENTS ----------
router.get('/api/students', (req, res) => res.json(readData().students));
router.get('/api/state', (req, res) => {
  const data = readData();
  res.json({ students: data.students, books: data.books, uniforms: data.uniforms, bookStock: data.bookStock, uniformStock: data.uniformStock });
});

router.post('/api/students', (req, res) => {
  const { name, mobile, className } = req.body;
  if (!name || !mobile || !className) return res.status(400).json({ error: 'All fields required' });
  if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Invalid class' });
  if (!/^\d{7,15}$/.test(mobile)) return res.status(400).json({ error: 'Invalid mobile number' });
  const data = readData();
  const student = { id: uid(), name: name.trim(), mobile: mobile.trim(), className, items: [] };
  data.students.push(student);
  writeData(data);
  res.json({ success: true, student });
});

router.put('/api/students/:id', (req, res) => {
  const { name, mobile, className } = req.body;
  const data = readData();
  const s = data.students.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Student not found' });
  if (!name || !mobile || !className) return res.status(400).json({ error: 'All fields required' });
  if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Invalid class' });
  if (!/^\d{7,15}$/.test(mobile)) return res.status(400).json({ error: 'Invalid mobile number' });
  s.name = name.trim(); s.mobile = mobile.trim(); s.className = className;
  writeData(data);
  res.json({ success: true, student: s });
});

router.delete('/api/students/:id', (req, res) => {
  const data = readData();
  const idx = data.students.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Student not found' });
  data.students.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// ---------- BOOKS (catalog) ----------
router.post('/api/books', (req, res) => {
  const { className, name, price } = req.body;
  if (!className || !name || price === undefined) return res.status(400).json({ error: 'All fields required' });
  if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Invalid class' });
  const p = Number(price);
  if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Invalid price' });
  const data = readData();
  if (data.books.some(b => b.className === className && b.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Book already exists for this class' });
  }
  const book = { id: uid(), className, name: name.trim(), price: p };
  data.books.push(book);
  writeData(data);
  res.json({ success: true, book });
});

router.post('/api/books/bulk', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No data provided' });
  const data = readData();
  const added = [];
  const errors = [];
  rows.forEach((r, i) => {
    const className = (r.className || '').trim();
    const name = (r.name || '').trim();
    const price = Number(r.price);
    if (!CLASSES.includes(className)) { errors.push(`Row ${i + 1}: invalid class`); return; }
    if (!name) { errors.push(`Row ${i + 1}: missing name`); return; }
    if (isNaN(price) || price < 0) { errors.push(`Row ${i + 1}: invalid price`); return; }
    if (data.books.some(b => b.className === className && b.name.toLowerCase() === name.toLowerCase())) {
      errors.push(`Row ${i + 1}: duplicate (${name})`); return;
    }
    const book = { id: uid(), className, name, price };
    data.books.push(book);
    added.push(book);
  });
  writeData(data);
  res.json({ success: true, added, errors });
});

router.delete('/api/books/:id', (req, res) => {
  const data = readData();
  const idx = data.books.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.books.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// ---------- UNIFORMS (catalog) ----------
router.post('/api/uniforms', (req, res) => {
  const { category, size, price } = req.body;
  if (!category || !size || price === undefined) return res.status(400).json({ error: 'All fields required' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  if (!SIZES.includes(String(size))) return res.status(400).json({ error: 'Invalid size' });
  const p = Number(price);
  if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Invalid price' });
  const data = readData();
  if (data.uniforms.some(u => u.category === category && u.size === String(size))) {
    return res.status(400).json({ error: 'Item already exists for this category/size' });
  }
  const item = { id: uid(), category, size: String(size), price: p };
  data.uniforms.push(item);
  writeData(data);
  res.json({ success: true, item });
});

router.post('/api/uniforms/bulk', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No data provided' });
  const data = readData();
  const added = [];
  const errors = [];
  rows.forEach((r, i) => {
    const category = (r.category || '').trim();
    const size = String(r.size || '').trim();
    const price = Number(r.price);
    if (!CATEGORIES.includes(category)) { errors.push(`Row ${i + 1}: invalid category`); return; }
    if (!SIZES.includes(size)) { errors.push(`Row ${i + 1}: invalid size`); return; }
    if (isNaN(price) || price < 0) { errors.push(`Row ${i + 1}: invalid price`); return; }
    if (data.uniforms.some(u => u.category === category && u.size === size)) {
      errors.push(`Row ${i + 1}: duplicate (${category} ${size})`); return;
    }
    const item = { id: uid(), category, size, price };
    data.uniforms.push(item);
    added.push(item);
  });
  writeData(data);
  res.json({ success: true, added, errors });
});

router.delete('/api/uniforms/:id', (req, res) => {
  const data = readData();
  const idx = data.uniforms.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.uniforms.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// ---------- STOCK ----------
router.post('/api/stock/book/:bookId', (req, res) => {
  const { stock } = req.body;
  const qty = Number(stock);
  if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Invalid stock quantity' });
  const data = readData();
  const book = data.books.find(b => b.id === req.params.bookId);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  let entry = data.bookStock.find(s => s.bookId === req.params.bookId);
  if (entry) entry.stock = qty;
  else data.bookStock.push({ bookId: req.params.bookId, stock: qty });
  writeData(data);
  res.json({ success: true });
});

router.post('/api/stock/uniform/:itemId', (req, res) => {
  const { stock } = req.body;
  const qty = Number(stock);
  if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Invalid stock quantity' });
  const data = readData();
  const item = data.uniforms.find(u => u.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  let entry = data.uniformStock.find(s => s.itemId === req.params.itemId);
  if (entry) entry.stock = qty;
  else data.uniformStock.push({ itemId: req.params.itemId, stock: qty });
  writeData(data);
  res.json({ success: true });
});

// ---------- ASSIGN ITEMS TO STUDENT ----------
// bookIds: array of { id, status } - only non-diary books
router.post('/api/students/:id/books', (req, res) => {
  const { bookIds } = req.body;
  const data = readData();
  const student = data.students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.items = student.items || [];
  const selected = Array.isArray(bookIds) ? bookIds : [];
  const keepIds = new Set(selected.map(b => b.id));
  const statusMap = new Map(selected.map(b => [b.id, b.status === 'Completed' ? 'Completed' : 'Pending']));
  student.items = student.items.filter(it => {
    if (it.type !== 'book' || it.isDiary) return true;
    return keepIds.has(it.refId);
  });
  selected.forEach(sel => {
    const status = statusMap.get(sel.id);
    let existing = student.items.find(it => it.type === 'book' && it.refId === sel.id);
    if (existing) { existing.status = status; return; }
    const book = data.books.find(b => b.id === sel.id && b.className === student.className);
    if (!book) return;
    student.items.push({ id: uid(), type: 'book', refId: book.id, name: book.name, price: book.price, status });
  });
  writeData(data);
  res.json({ success: true, student });
});

// diary: { checked, status }
router.post('/api/students/:id/diary', (req, res) => {
  const { diary } = req.body;
  const data = readData();
  const student = data.students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.items = student.items || [];
  student.items = student.items.filter(it => !it.isDiary);
  if (diary && diary.checked) {
    const status = diary.status === 'Completed' ? 'Completed' : 'Pending';
    student.items.push({ id: uid(), type: 'book', isDiary: true, name: 'Diary', price: 50, status });
  }
  writeData(data);
  res.json({ success: true, student });
});

// itemIds: array of { id, status }; categories: array of category names this save affects (scopes removal so other categories are untouched)
router.post('/api/students/:id/uniforms', (req, res) => {
  const { itemIds, categories } = req.body;
  const data = readData();
  const student = data.students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.items = student.items || [];
  const selected = Array.isArray(itemIds) ? itemIds : [];
  const scope = Array.isArray(categories) && categories.length ? categories : CATEGORIES;
  const keepIds = new Set(selected.map(i => i.id));
  const statusMap = new Map(selected.map(i => [i.id, i.status === 'Completed' ? 'Completed' : 'Pending']));
  student.items = student.items.filter(it => {
    if (it.type !== 'uniform') return true;
    if (!scope.includes(it.category)) return true;
    return keepIds.has(it.refId);
  });
  selected.forEach(sel => {
    const status = statusMap.get(sel.id);
    let existing = student.items.find(it => it.type === 'uniform' && it.refId === sel.id);
    if (existing) { existing.status = status; return; }
    const item = data.uniforms.find(u => u.id === sel.id);
    if (!item) return;
    student.items.push({ id: uid(), type: 'uniform', refId: item.id, name: item.category, category: item.category, size: item.size, price: item.price, status });
  });
  writeData(data);
  res.json({ success: true, student });
});

router.post('/api/students/:sid/items/:itemId/complete', (req, res) => {
  const data = readData();
  const student = data.students.find(s => s.id === req.params.sid);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const item = (student.items || []).find(it => it.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.status === 'Completed') return res.status(400).json({ error: 'Already completed' });
  item.status = 'Completed';
  writeData(data);
  res.json({ success: true });
});

// ---------- REMAINING STOCKS ----------
router.get('/api/remaining/books', (req, res) => {
  const data = readData();
  const result = data.books.map(b => {
    const stockEntry = data.bookStock.find(s => s.bookId === b.id);
    const total = stockEntry ? stockEntry.stock : 0;
    const given = computeGiven(data, 'book', it => it.refId === b.id);
    return { id: b.id, name: b.name, className: b.className, price: b.price, total, given, remaining: total - given };
  });
  res.json(result);
});

router.get('/api/remaining/uniforms/:category', (req, res) => {
  const data = readData();
  const result = data.uniforms.filter(u => u.category === req.params.category).map(u => {
    const stockEntry = data.uniformStock.find(s => s.itemId === u.id);
    const total = stockEntry ? stockEntry.stock : 0;
    const given = computeGiven(data, 'uniform', it => it.refId === u.id);
    return { id: u.id, size: u.size, price: u.price, total, given, remaining: total - given };
  });
  res.json(result);
});

module.exports = router;
