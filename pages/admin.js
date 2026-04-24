import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

// Global stock cache — SKU → total sellable (summed across warehouses)
let stockCache = {};      // { sku: sellableQty }
let stockCacheLoaded = false;

async function loadStockCache() {
  if (stockCacheLoaded) return stockCache;
  try {
    const res  = await fetch('/api/warehouse/inventory-cached');
    const json = await res.json();
    const cache = {};
    (json.data || []).forEach(item => {
      let total = 0;
      Object.values(item.warehouses || {}).forEach(w => { total += w.sellable || 0; });
      cache[item.sku] = total;
    });
    stockCache = cache;
    stockCacheLoaded = true;
  } catch {}
  return stockCache;
}

async function checkStock(skus) {
  // Returns { sku: sellableQty } for the given SKUs
  await loadStockCache();
  const result = {};
  skus.forEach(s => { result[s] = stockCache[s] ?? null; }); // null = not in cache
  return result;
}

// Global SKU name cache — loaded once, shared across all components
let skuNamesGlobal = {};
let skuNamesLoaded = false;
async function loadSkuNames() {
  if (skuNamesLoaded) return skuNamesGlobal;
  try {
    const res = await fetch('/api/warehouse/sku-names');
    const json = await res.json();
    if (json.success) skuNamesGlobal = json.data || {};
    skuNamesLoaded = true;
  } catch {}
  return skuNamesGlobal;
}

// Global products cache (keyed by project filter string)
let productsCache = {};
async function loadProducts(allowedProjects) {
  // allowedProjects: array of project IDs ([] = no restriction)
  const cacheKey = (allowedProjects || []).sort().join(',') || '__all__';
  if (productsCache[cacheKey]) return productsCache[cacheKey];
  try {
    const params = new URLSearchParams({ limit: '2000' });
    if (allowedProjects && allowedProjects.length > 0) {
      params.set('projects', allowedProjects.join(','));
    }
    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    if (json.success) productsCache[cacheKey] = json.data || [];
  } catch { productsCache[cacheKey] = []; }
  return productsCache[cacheKey] || [];
}

const C = {
  bg: '#F8F9FA', surface: '#FFFFFF', surfaceAlt: '#F1F5F9',
  border: '#E2E8F0', accent: '#2563EB', accentDim: '#DBEAFE',
  text: '#0F172A', muted: '#64748B', success: '#059669',
  successBg: '#ECFDF5', danger: '#DC2626', dangerBg: '#FEF2F2',
  warning: '#D97706', warningBg: '#FFFBEB',
};

const WAREHOUSE_LABELS = {
  C0000001174: 'JD-SYD1',
  C0000001901: 'JD-MEL1',
  ECCANG: '2SA warehouse',
  AUSYD: '2SA warehouse',
  JDL: 'JD warehouse',
};

function warehouseLabel(code) {
  const key = String(code || '').toUpperCase();
  return WAREHOUSE_LABELS[key] || code || '—';
}

function isEccangWarehouse(code) {
  const key = String(code || '').toUpperCase();
  return key === 'ECCANG' || key === 'AUSYD';
}


const C_PAGE = { border: '#E2E8F0', accent: '#2563EB', muted: '#475569', bg: '#fff' };
function Pagination({ page: currentPage, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const pages = [];
  let start = Math.max(1, currentPage - 3);
  let end   = Math.min(totalPages, start + 6);
  if (end - start < 6) start = Math.max(1, end - 6);
  for (let i = start; i <= end; i++) pages.push(i);
  const btn = (active) => ({
    padding: '5px 10px', borderRadius: 6, border: `1px solid ${active ? C_PAGE.accent : C_PAGE.border}`,
    background: active ? C_PAGE.accent : C_PAGE.bg, color: active ? '#fff' : C_PAGE.muted,
    fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${C_PAGE.border}` }}>
      <span style={{ fontSize: 12, color: C_PAGE.muted }}>{((currentPage-1)*pageSize)+1}–{Math.min(currentPage*pageSize,total)} of {total}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        <button onClick={() => onChange(1)}               disabled={currentPage===1}           style={btn(false)}>«</button>
        <button onClick={() => onChange(currentPage-1)}   disabled={currentPage===1}           style={btn(false)}>‹</button>
        {pages.map(p => <button key={p} onClick={() => onChange(p)} style={btn(p===currentPage)}>{p}</button>)}
        <button onClick={() => onChange(currentPage+1)}   disabled={currentPage===totalPages}  style={btn(false)}>›</button>
        <button onClick={() => onChange(totalPages)}      disabled={currentPage===totalPages}  style={btn(false)}>»</button>
      </div>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Login failed');
      localStorage.setItem('2sa_token', json.token);
      localStorage.setItem('2sa_user',  JSON.stringify(json.user));
      onLogin(json.token, json.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: C.accent, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>2S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>CCEP 3PL Portal</div>
            <div style={{ fontSize: 12, color: C.muted }}>Admin Login</div>
          </div>
        </div>

        {error && (
          <div style={{ background: C.dangerBg, border: `1px solid #FECACA`, borderRadius: 8, padding: '10px 14px', color: C.danger, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'block', marginBottom: 6 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.bg, boxSizing: 'border-box' }}
              placeholder="2sa-admin" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'block', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.bg, boxSizing: 'border-box' }}
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Order Upload ───────────────────────────────────────────────
function OrderUpload({ token }) {
  const [csvText,  setCsvText]  = useState('');
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines  = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj  = {};
      header.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    });
  };

  const handleUpload = async () => {
    setLoading(true); setError(''); setResults(null);
    try {
      const rows = parseCSV(csvText);
      if (!rows.length) throw new Error('No data found in CSV');

      const res  = await fetch('/api/orders/eccang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ orders: rows }),
      });
      const json = await res.json();
      setResults(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      'order_code,ref_code,tracking_number,carrier,status',
      'EC20260416001,REF20260416001,TRACK123456,AUPOST,pending',
    ].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order-upload-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Sync ECCANG Orders</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Sync existing ECCANG orders into Supabase. Upload a CSV exported from ECCANG with columns: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>order_code, ref_code, tracking_number, carrier, status</code>
        </p>
        <button
          onClick={downloadTemplate}
          style={{ marginBottom: 12, marginRight: 8, background: '#fff', color: C.accent, border: `1px solid ${C.accentDim}`, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
        >
          Download CSV Template
        </button>
        <input type="file" accept=".csv" onChange={handleFile} style={{ marginBottom: 12, fontSize: 13 }} />
        {csvText && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Preview ({parseCSV(csvText).length} rows):</div>
            <pre style={{ fontSize: 11, background: C.surfaceAlt, padding: 12, borderRadius: 8, maxHeight: 150, overflow: 'auto', color: C.text }}>
              {csvText.split('\n').slice(0, 6).join('\n')}
            </pre>
          </div>
        )}
        {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        <button onClick={handleUpload} disabled={!csvText || loading}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: csvText ? 'pointer' : 'not-allowed', opacity: csvText ? 1 : 0.5 }}>
          {loading ? 'Syncing...' : 'Sync Orders'}
        </button>
      </div>
      {results && (
        <div style={{ background: C.successBg, border: `1px solid #A7F3D0`, borderRadius: 8, padding: 16, fontSize: 13, color: C.success }}>
          ✅ Done: {results.created || 0} created, {results.updated || 0} updated, {results.failed || 0} failed
        </div>
      )}
    </div>
  );
}

// ── Bulk Tracking Update ───────────────────────────────────────
function TrackingUpdate({ token }) {
  const [csvText,  setCsvText]  = useState('');
  const [results,  setResults]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines  = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj  = {};
      header.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    });
  };

  const handleUpdate = async () => {
    setLoading(true); setError(''); setResults(null);
    try {
      const rows  = parseCSV(csvText);
      const items = rows.map(r => ({
        order_code:       r.order_code || r.order_number,
        tracking_number:  r.tracking_number || r.tracking,
        carrier:          r.carrier || r.logistics_name || '',
      })).filter(r => r.order_code && r.tracking_number);

      if (!items.length) throw new Error('No valid rows (need order_code and tracking_number)');

      const res  = await fetch('/api/orders/update-tracking', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ items }),
      });
      const json = await res.json();
      setResults(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Bulk Update Tracking</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          CSV columns required: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>order_code, tracking_number</code> &nbsp;
          Optional: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>carrier</code>
        </p>
        <input type="file" accept=".csv" onChange={handleFile} style={{ marginBottom: 12, fontSize: 13 }} />
        {csvText && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              {parseCSV(csvText).filter(r => (r.order_code || r.order_number) && (r.tracking_number || r.tracking)).length} valid rows
            </div>
            <pre style={{ fontSize: 11, background: C.surfaceAlt, padding: 12, borderRadius: 8, maxHeight: 120, overflow: 'auto', color: C.text }}>
              {csvText.split('\n').slice(0, 4).join('\n')}
            </pre>
          </div>
        )}
        {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        <button onClick={handleUpdate} disabled={!csvText || loading}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: csvText ? 'pointer' : 'not-allowed', opacity: csvText ? 1 : 0.5 }}>
          {loading ? 'Updating...' : 'Update Tracking'}
        </button>
      </div>
      {results && (
        <div>
          <div style={{ background: results.failed === 0 ? C.successBg : C.warningBg, border: `1px solid ${results.failed === 0 ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 8, padding: 12, fontSize: 13, color: results.failed === 0 ? C.success : C.warning, marginBottom: 12 }}>
            ✅ Updated: {results.updated} &nbsp;|&nbsp; ❌ Failed: {results.failed}
          </div>
          {results.results?.filter(r => !r.success).map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: C.danger, padding: '4px 0' }}>
              ✗ {r.order_code}: {r.error || r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Order Type Update ───────────────────────────────────────────
function OrderTypeUpdate({ token }) {
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState({});
  const [bulkType, setBulkType] = useState('standard');
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const loadOrders = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        all: '1',
        allLimit: '20000',
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/orders?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load orders');
      setOrders(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSingle = async (orderNumber, orderType) => {
    setSaving(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/orders/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ order_numbers: [orderNumber], order_type: orderType }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Update failed');
      setOrders(prev => prev.map(o => o.order_number === orderNumber ? { ...o, order_type: orderType } : o));
      setResult({ updated: json.updated, missed: json.missed || [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const parseCsvOrderNumbers = (text) => {
    const lines = text.trim().split('\n').filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const idx = header.findIndex(h => ['order_number', 'order_no', 'order_code'].includes(h));
    if (idx === -1) return [];
    return Array.from(new Set(
      lines.slice(1)
        .map(line => (line.split(',')[idx] || '').trim().replace(/"/g, ''))
        .filter(Boolean)
    ));
  };

  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result || '');
    reader.readAsText(file);
  };

  const saveBulk = async () => {
    setSaving(true); setError(''); setResult(null);
    try {
      const checked = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
      const fromCsv = parseCsvOrderNumbers(csvText);
      const targets = Array.from(new Set([...checked, ...fromCsv]));
      if (!targets.length) throw new Error('Select orders or upload CSV with order_number/order_code');

      const res = await fetch('/api/orders/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ order_numbers: targets, order_type: bulkType }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Bulk update failed');

      setOrders(prev => prev.map(o => targets.includes(o.order_number) ? { ...o, order_type: bulkType } : o));
      setResult({ updated: json.updated, missed: json.missed || [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Order Type (Kitting / Standard)</h2>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search local order by order number / ref..."
            style={{ flex: 1, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={loadOrders} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Loading...' : 'Search'}
          </button>
          <select value={`${sortBy}:${sortDir}`} onChange={(e) => {
            const [sb, sd] = e.target.value.split(':');
            setSortBy(sb); setSortDir(sd);
          }} style={{ padding: '10px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
            <option value="created_at:desc">Time ↓</option>
            <option value="created_at:asc">Time ↑</option>
            <option value="order_number:asc">Order No. ↑</option>
            <option value="order_number:desc">Order No. ↓</option>
            <option value="reference_no:asc">Reference ↑</option>
            <option value="reference_no:desc">Reference ↓</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <select value={bulkType} onChange={e => setBulkType(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
            <option value="standard">standard</option>
            <option value="kitting">kitting</option>
          </select>
          <input type="file" accept=".csv" onChange={handleCsvFile} style={{ fontSize: 12 }} />
          <button onClick={saveBulk} style={{ background: '#fff', color: C.accent, border: `1px solid ${C.accentDim}`, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Bulk Update Type'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Bulk update supports: checked rows + CSV column <code style={{ background: C.surfaceAlt, padding: '1px 6px', borderRadius: 4 }}>order_number</code> (or <code style={{ background: C.surfaceAlt, padding: '1px 6px', borderRadius: 4 }}>order_code</code>).
        </div>
      </div>

      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {result && (
        <div style={{ background: result.missed?.length ? C.warningBg : C.successBg, border: `1px solid ${result.missed?.length ? '#FDE68A' : '#A7F3D0'}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: result.missed?.length ? C.warning : C.success }}>
          ✅ Updated: {result.updated} {result.missed?.length ? `| Missing: ${result.missed.join(', ')}` : ''}
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.surfaceAlt }}>
              {['Select', 'Order No.', 'Ref', 'Current Type', 'Quick Update'].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 14px' }}>
                  <input
                    type="checkbox"
                    checked={!!selected[o.order_number]}
                    onChange={e => setSelected(prev => ({ ...prev, [o.order_number]: e.target.checked }))}
                  />
                </td>
                <td style={{ padding: '8px 14px', color: C.accent, fontWeight: 600 }}>{o.order_number}</td>
                <td style={{ padding: '8px 14px', color: C.muted }}>{o.reference_no || '—'}</td>
                <td style={{ padding: '8px 14px', textTransform: 'lowercase' }}>{o.order_type || 'standard'}</td>
                <td style={{ padding: '8px 14px', display: 'flex', gap: 6 }}>
                  <button onClick={() => saveSingle(o.order_number, 'standard')} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>standard</button>
                  <button onClick={() => saveSingle(o.order_number, 'kitting')} style={{ border: `1px solid ${C.border}`, background: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>kitting</button>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: C.muted }}>No local orders loaded yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── Inventory View ─────────────────────────────────────────────
function InventoryView({ token }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [error,      setError]      = useState('');
  const [searched,   setSearched]   = useState(false);
  const [invCurPage, setInvCurPage] = useState(1);
  const [invFilter,  setInvFilter]  = useState('all');
  const [hideZero,   setHideZero]   = useState(false);
  const [invSearch,  setInvSearch]  = useState('');
  const [invSortBy,  setInvSortBy]  = useState('sku_asc');
  const [invSearchMode, setInvSearchMode] = useState('both'); // 'sku' | 'name' | 'both'
  const [skuNames,   setSkuNames]   = useState({});
  const [lastSync,   setLastSync]   = useState(null);   // { synced_at, sku_count, status }
  const [fromCache,  setFromCache]  = useState(false);
  const PAGE_SIZE = 100;

  // Load SKU names (uses global cache)
  useEffect(() => {
    loadSkuNames().then(names => setSkuNames(names));
  }, []);

  // Auto-load from cache on mount
  useEffect(() => {
    loadFromCache();
  }, []);

  const loadFromCache = async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/warehouse/inventory-cached', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) {
        // 表不存在或 Supabase 报错，显示明确错误
        setError(`Cache error: ${json.error}`);
        return;
      }
      // 有数据就显示
      if (json.data?.length > 0) {
        setItems(json.data);
        setSearched(true);
        setFromCache(json.from_cache);
        setLastSync(json.last_sync);
        setInvCurPage(1);
      }
      // 缓存为空也要 setSearched(false) 以显示空状态提示
    } catch (e) {
      setError(`Failed to load cache: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 手动触发 cron 同步（刷新缓存）
  const triggerSync = async () => {
    if (!confirm('Manually sync inventory from warehouses? This may take 30–60 seconds.')) return;
    setSyncing(true); setError('');
    try {
      const res  = await fetch('/api/cron/sync-inventory', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      console.log('[Sync result]', json);
      // 同步完成后重新读缓存，并显示结果摘要
      await loadFromCache();
      const eccangInfo = json.eccang?.error ? `ECCANG error: ${json.eccang.error}` : `ECCANG: ${json.eccang?.count ?? 0} items`;
      const jdlInfo    = json.jdl?.error    ? `JDL error: ${json.jdl.error}`       : `JDL: ${json.jdl?.count ?? 0} items`;
      if (json.eccang?.error || json.jdl?.error) {
        setError(`Sync partial — ${eccangInfo} | ${jdlInfo}`);
      }
    } catch (e) {
      setError('Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };



  const exportCsv = () => {
    const qSku = invSearch.trim().toLowerCase();
    const filteredItems = items.filter(item => {
      if (!qSku) return true;
      const skuMatch  = (item.sku || '').toLowerCase().includes(qSku);
      const nameMatch = (skuNames[item.sku] || '').toLowerCase().includes(qSku);
      if (invSearchMode === 'sku')  return skuMatch;
      if (invSearchMode === 'name') return nameMatch;
      return skuMatch || nameMatch;
    });

    const rows = [];
    filteredItems.forEach(item => {
      Object.entries(item.warehouses).forEach(([wh, data]) => {
        if (invFilter !== 'all' && wh !== invFilter) return;
        if (hideZero && !data.sellable) return;
        rows.push({ sku: item.sku, wh, data, name: skuNames[item.sku] || '' });
      });
    });

    rows.sort((a, b) => {
      if (invSortBy === 'sku_asc')       return String(a.sku).localeCompare(String(b.sku));
      if (invSortBy === 'sku_desc')      return String(b.sku).localeCompare(String(a.sku));
      if (invSortBy === 'sellable_desc') return (b.data.sellable||0) - (a.data.sellable||0);
      if (invSortBy === 'sellable_asc')  return (a.data.sellable||0) - (b.data.sellable||0);
      return 0;
    });

    const WLABELS = { ECCANG: '2SA Warehouse', C0000001174: 'JD-SYD1', C0000001901: 'JD-MEL1' };
    const header = ['SKU', 'Product Name', 'Warehouse', 'Sellable'];
    const csvRows = [header, ...rows.map(r => [
      r.sku,
      r.name,
      WLABELS[r.wh] || r.wh,
      r.data.sellable || 0,
    ])];

    const csvContent = csvRows.map(row =>
      row.map(v => (String(v).includes(',') || String(v).includes('"') || String(v).includes('\n'))
        ? `"${String(v).replace(/"/g, '""')}"` : v
      ).join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `inventory-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format sync time for display
  const fmtSync = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      {/* Header row: title + sync status + sync button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Inventory — All Warehouses</h2>
        {lastSync && (
          <span style={{ fontSize: 12, color: C.muted, background: C.surfaceAlt, padding: '3px 10px', borderRadius: 20 }}>
            🕐 Last synced: {fmtSync(lastSync.synced_at)} · {lastSync.sku_count} SKUs
            {lastSync.status !== 'success' && <span style={{ color: C.warning }}> · {lastSync.status}</span>}
          </span>
        )}
        {fromCache && (
          <span style={{ fontSize: 11, color: C.muted, marginRight: 4 }}>Auto-refreshes nightly at 2 AM AEST</span>
        )}
        <button onClick={triggerSync} disabled={syncing} style={{
          marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, cursor: syncing ? 'not-allowed' : 'pointer',
          fontSize: 13, border: `1px solid ${C.border}`, background: C.surface, color: C.text,
          fontWeight: 600, opacity: syncing ? 0.6 : 1,
        }}>
          {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
        </button>
      </div>

      {/* Filter bar — always visible, instant filter on loaded data */}
      {searched && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input value={invSearch} onChange={e => { setInvSearch(e.target.value); setInvCurPage(1); }}
            autoFocus
            placeholder={invSearchMode === 'sku' ? 'Search by SKU...' : invSearchMode === 'name' ? 'Search by product name...' : 'Search by SKU or name...'}
            style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.accent}`, fontSize: 14, background: C.bg, color: C.text, width: 240, outline: 'none' }} />
          {[['both','SKU + Name'],['sku','SKU only'],['name','Name only']].map(([v, l]) => (
            <button key={v} onClick={() => { setInvSearchMode(v); setInvCurPage(1); }} style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              border: `1px solid ${invSearchMode === v ? C.accent : C.border}`,
              background: invSearchMode === v ? C.accentDim : C.surface,
              color: invSearchMode === v ? C.accent : C.muted,
              fontWeight: invSearchMode === v ? 600 : 400,
            }}>{l}</button>
          ))}
          {[['all','All Warehouses'],['ECCANG','2SA Warehouse'],['C0000001174','JD-SYD1'],['C0000001901','JD-MEL1']].map(([v, l]) => (
            <button key={v} onClick={() => { setInvFilter(v); setInvCurPage(1); }} style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              border: `1px solid ${invFilter === v ? C.accent : C.border}`,
              background: invFilter === v ? C.accentDim : C.surface,
              color: invFilter === v ? C.accent : C.muted,
              fontWeight: invFilter === v ? 600 : 400,
            }}>{l}</button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideZero} onChange={e => { setHideZero(e.target.checked); setInvCurPage(1); }} />
            Hide zero stock
          </label>
          <select value={invSortBy} onChange={e => { setInvSortBy(e.target.value); setInvCurPage(1); }}
            style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.bg, color: C.muted }}>
            <option value="sku_asc">SKU A-Z</option>
            <option value="sku_desc">SKU Z-A</option>
            <option value="sellable_desc">Sellable High-Low</option>
            <option value="sellable_asc">Sellable Low-High</option>
          </select>
          <button onClick={exportCsv} style={{
            marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ⬇️ Export CSV
          </button>
        </div>
      )}

      {loading && <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>⏳ Loading inventory...</div>}

      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

      {!searched && !loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
          <div>No inventory data yet.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Click <strong>🔄 Sync Now</strong> to load inventory from the warehouses.</div>
        </div>
      )}

      {searched && !loading && (() => {
        // Apply filters
        const qSku = invSearch.trim().toLowerCase();
        const filteredItems = items.filter(item => {
          if (!qSku) return true;
          const skuMatch  = (item.sku || '').toLowerCase().includes(qSku);
          const nameMatch = (skuNames[item.sku] || '').toLowerCase().includes(qSku);
          if (invSearchMode === 'sku')  return skuMatch;
          if (invSearchMode === 'name') return nameMatch;
          return skuMatch || nameMatch; // 'both'
        });

        // Build flat rows with warehouse filter + hide zero
        const rows = [];
        filteredItems.forEach(item => {
          Object.entries(item.warehouses).forEach(([wh, data]) => {
            if (invFilter !== 'all' && wh !== invFilter) return;
            if (hideZero && !data.sellable) return;
            rows.push({ sku: item.sku, wh, data });
          });
        });

        // Sort
        rows.sort((a, b) => {
          if (invSortBy === 'sku_asc')       return String(a.sku).localeCompare(String(b.sku));
          if (invSortBy === 'sku_desc')      return String(b.sku).localeCompare(String(a.sku));
          if (invSortBy === 'sellable_desc') return (b.data.sellable||0) - (a.data.sellable||0);
          if (invSortBy === 'sellable_asc')  return (a.data.sellable||0) - (b.data.sellable||0);
          return 0;
        });

        const pagedRows = rows.slice((invCurPage-1)*PAGE_SIZE, invCurPage*PAGE_SIZE);

        return (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
              {rows.length} rows · {filteredItems.length} SKUs
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No inventory found</div>
            ) : (
              <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surfaceAlt }}>
                    {['SKU', 'Name', 'Warehouse', 'Sellable'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, i) => {
                    const isJDL  = !isEccangWarehouse(row.wh);
                    const prev   = pagedRows[i-1];
                    const isFirst = !prev || prev.sku !== row.sku;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, borderTop: isFirst && i > 0 ? `2px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12, opacity: isFirst ? 1 : 0.3 }}>
                          {isFirst ? row.sku : ''}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: C.muted, opacity: isFirst ? 1 : 0 }}>
                          {isFirst ? (skuNames[row.sku] || '') : ''}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: isJDL ? C.accentDim : '#F5F3FF', color: isJDL ? C.accent : '#7C3AED', border: `1px solid ${isJDL ? '#BFDBFE' : '#DDD6FE'}` }}>
                            {warehouseLabel(row.wh)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', fontWeight: 700, color: row.data.sellable > 0 ? C.success : C.muted }}>{row.data.sellable || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={invCurPage} total={rows.length} pageSize={PAGE_SIZE} onChange={setInvCurPage} />
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}


// ── JDL Order Search ───────────────────────────────────────────
function JdlOrderSearch({ token }) {
  const [q,           setQ]           = useState('');
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [searched,    setSearched]    = useState(false);
  const [ordCurPage,  setOrdCurPage]  = useState(1);
  const [expandedItems, setExpandedItems] = useState({});
  const [localFilter, setLocalFilter] = useState('');
  const PAGE_SIZE = 100;

  const search = async () => {
    setLoading(true); setError(''); setSearched(true); setOrdCurPage(1);
    try {
      const params = new URLSearchParams(q.trim() ? { q: q.trim() } : { all: '1' });
      const res  = await fetch(`/api/orders/jdl?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || JSON.stringify(json.raw || {}));
      setOrders(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s) => {
    const n = String(s || '').toLowerCase();
    if (n.includes('sign') || n.includes('完成') || n.includes('delivered')) return C.success;
    if (n.includes('out') || n.includes('出库') || n.includes('shipped')) return C.accent;
    if (n.includes('fail') || n.includes('失败') || n.includes('cancel')) return C.danger;
    return C.warning;
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>JDL Outbound Orders</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Customer order no. / reference (blank = all)..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={search} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && (
        <div style={{ background: C.dangerBg, border: `1px solid #FECACA`, borderRadius: 8, padding: '10px 14px', color: C.danger, fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{orders.length} orders</span>
            <input value={localFilter} onChange={e => { setLocalFilter(e.target.value); setOrdCurPage(1); }}
              placeholder="Filter by recipient / SKU name..."
              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.bg, color: C.text, width: 240 }} />
          </div>
          {orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No JDL orders found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['JDL Bill Code', 'Customer Order No.', 'Warehouse', 'Status', 'Carrier', 'Tracking', 'Items', 'Outbound'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(localFilter.trim()
                    ? orders.filter(o =>
                        (o.ship_to_name || '').toLowerCase().includes(localFilter.toLowerCase()) ||
                        (o.order_number || '').toLowerCase().includes(localFilter.toLowerCase()) ||
                        (o.reference_no || '').toLowerCase().includes(localFilter.toLowerCase()) ||
                        (o.order_items || []).some(it =>
                          (it.product_name || skuNamesGlobal[it.sku] || '').toLowerCase().includes(localFilter.toLowerCase()) ||
                          (it.sku || '').toLowerCase().includes(localFilter.toLowerCase())
                        )
                      )
                    : orders
                  ).slice((ordCurPage-1)*PAGE_SIZE, ordCurPage*PAGE_SIZE).map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', color: C.accent, fontWeight: 600, fontFamily: 'monospace', fontSize: 12, width: '16%' }}>{o.order_number || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12, width: '14%' }}>{o.reference_no || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, width: '10%' }}>{warehouseLabel(o.warehouse)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: `${statusColor(o.status)}22`, color: statusColor(o.status), display: 'inline-block', maxWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>
                        {o.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, width: '8%' }}>{o.carrier || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: C.muted, width: '10%' }}>{o.tracking_number || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, width: '22%', wordBreak: 'break-word', lineHeight: 1.3 }}>
                      {(() => {
                        const key = o.order_number || o.id || i;
                        const itemsText = o.order_items?.map(it => `${it.sku}×${it.qty_actual||it.quantity}`).join(', ') || '';
                        if (!itemsText) return '—';
                        if (expandedItems[key]) {
                          return (
                            <>
                              <div>{itemsText}</div>
                              <button onClick={() => setExpandedItems(prev => ({ ...prev, [key]: false }))} style={{ marginTop: 4, border: 'none', background: 'none', color: C.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>
                                collapse
                              </button>
                            </>
                          );
                        }
                        const shortText = itemsText.length > 50 ? `${itemsText.slice(0, 50)}...` : itemsText;
                        return (
                          <>
                            <div>{shortText}</div>
                            {itemsText.length > 50 && (
                              <button onClick={() => setExpandedItems(prev => ({ ...prev, [key]: true }))} style={{ marginTop: 4, border: 'none', background: 'none', color: C.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>
                                view all
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, width: '8%' }}>
                      {o.outbound_at ? String(o.outbound_at).slice(0,10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={ordCurPage} total={orders.length} pageSize={PAGE_SIZE} onChange={setOrdCurPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Order Search ───────────────────────────────────────────────
function OrderSearch({ token }) {
  const [q,           setQ]           = useState('');
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState('');
  const [searched,    setSearched]    = useState(false);
  const [ordCurPage,  setOrdCurPage]  = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [sortBy,      setSortBy]      = useState('created_at');
  const [sortDir,     setSortDir]     = useState('desc');
  const [localFilter, setLocalFilter] = useState('');
  const PAGE_SIZE = 100;

  const search = async (targetPage = 1) => {
    setLoading(true); setError(''); setSearched(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (q.trim()) params.set('q', q.trim());
      const res  = await fetch(`/api/orders?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load orders');
      setOrders(json.data || []);
      setTotalOrders(json.pagination?.total || 0);
      setOrdCurPage(targetPage);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const syncFromEccang = async () => {
    setSyncing(true); setError('');
    try {
      let res = await fetch('/api/orders/sync-eccang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pageSize: 100, maxPages: 500 }),
      });
      if (res.status === 405) {
        // Fallback for platforms that accidentally treat sync route as GET-only.
        res = await fetch('/api/orders/sync-eccang?pageSize=100&maxPages=500', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync failed');
      await search(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Order Search (Admin Managed)</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search(1)}
          placeholder="Order number or reference..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => search(1)} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
        <select value={`${sortBy}:${sortDir}`} onChange={(e) => {
          const [sb, sd] = e.target.value.split(':');
          setSortBy(sb); setSortDir(sd);
        }} style={{ padding: '10px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
          <option value="created_at:desc">Time ↓</option>
          <option value="created_at:asc">Time ↑</option>
          <option value="order_number:asc">Order No. ↑</option>
          <option value="order_number:desc">Order No. ↓</option>
          <option value="reference_no:asc">Reference ↑</option>
          <option value="reference_no:desc">Reference ↓</option>
        </select>
        <button onClick={syncFromEccang} style={{ background: '#fff', color: C.accent, border: `1px solid ${C.accentDim}`, borderRadius: 8, padding: '10px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {syncing ? 'Syncing...' : 'Sync ECCANG -> DB'}
        </button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {(() => {
            const lf = localFilter.trim().toLowerCase();
            const filtered = lf ? orders.filter(o =>
              (o.ship_to_name || '').toLowerCase().includes(lf) ||
              (o.order_number || '').toLowerCase().includes(lf) ||
              (o.reference_no || '').toLowerCase().includes(lf) ||
              (o.order_items || []).some(it =>
                (it.product_name || skuNamesGlobal[it.sku] || '').toLowerCase().includes(lf) ||
                (it.sku || '').toLowerCase().includes(lf)
              )
            ) : orders;
            return (
            <>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{filtered.length !== orders.length ? `${filtered.length} / ` : ''}{totalOrders} orders</span>
            <input value={localFilter} onChange={e => { setLocalFilter(e.target.value); setOrdCurPage(1); }}
              placeholder="Filter by recipient / SKU name..."
              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.bg, color: C.text, width: 240 }} />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No orders found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['Order No.', 'Ref', 'Status', 'Carrier', 'Tracking', 'Ship To', 'Created'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((ordCurPage-1)*PAGE_SIZE, ordCurPage*PAGE_SIZE).map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', color: C.accent, fontWeight: 600 }}>{o.order_number}</td>
                    <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12 }}>{o.reference_no || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: C.surfaceAlt, color: C.text }}>{o.status || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.carrier || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: C.muted }}>{o.tracking_number || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.ship_to_name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{o.created_at?.slice(0,10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={ordCurPage} total={filtered.length} pageSize={PAGE_SIZE} onChange={setOrdCurPage} />
            </>
          )}
            </>
          );
          })()}
        </div>
      )}
    </div>
  );
}



// ── Carrier tracking URL map ───────────────────────────────────
const CARRIER_TRACKING_URLS = {
  // AusPost variants
  'auspost':    'http://auspost.com.au/track/track.html?id=',
  'aupost':     'http://auspost.com.au/track/track.html?id=',
  'ap std':     'http://auspost.com.au/track/track.html?id=',
  'ap exp':     'http://auspost.com.au/track/track.html?id=',
  'ap int':     'http://auspost.com.au/track/track.html?id=',
  'australia post': 'http://auspost.com.au/track/track.html?id=',
  // DHL
  'dhl':        'https://www.dhl.com/au-en/home/tracking.html?tracking-id=',
  // Toll
  'toll':       'https://www.mytoll.com/?externalSearchQuery=',
  // Direct Freight / DFE
  'dfe':        'https://www.directfreight.com.au/ConsignmentStatus.aspx?lookuptype=0&consignment_no=',
  'df-':        'https://www.directfreight.com.au/ConsignmentStatus.aspx?lookuptype=0&consignment_no=',
  'direct freight': 'https://www.directfreight.com.au/ConsignmentStatus.aspx?lookuptype=0&consignment_no=',
  // TNT
  'tnt':        'https://www.tnt.com/express/en_au/site/shipping-tools/tracking.html?searchType=con&cons=',
  // Sendle
  'sendle':     'https://track.sendle.com/tracking?ref=',
  // NZ Post
  'nz post':    'https://www.nzpost.co.nz/tools/tracking',
  'nzpost':     'https://www.nzpost.co.nz/tools/tracking',
  // SG Post
  'sg post':    'https://www.singpost.com/track-items?ti=',
  'sgpost':     'https://www.singpost.com/track-items?ti=',
  // FedEx
  'fedex':      'https://www.fedex.com/fedextrack/?trknbr=',
  // Capital Transport
  'capital':    'https://capitaltransport.com.au/',
  // Asendia
  'asendia':    'https://tracking.asendia.com/',
};

function getTrackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const key = carrier.toLowerCase().trim();
  // exact match먼저
  if (CARRIER_TRACKING_URLS[key]) return CARRIER_TRACKING_URLS[key] + trackingNumber;
  // startsWith match (df- 등)
  for (const [k, url] of Object.entries(CARRIER_TRACKING_URLS)) {
    if (key.startsWith(k) || key.includes(k)) return url + trackingNumber;
  }
  return null;
}

// ── Manual Order Management ────────────────────────────────────
function ManualOrderManage({ token, userPerms, isSuperAdmin, allowedProjects }) {
  const canDo = (perm) => isSuperAdmin || (userPerms || []).includes(perm);
  const [orders,    setOrders]    = useState([]);
  const [allOrders, setAllOrders] = useState([]); // 全量，用于本地 fuzzy filter
  const [loading,   setLoading]   = useState(false);
  const [q,         setQ]         = useState('');
  const [localQ,    setLocalQ]    = useState('');  // 本地即时过滤词
  const [searchMode, setSearchMode] = useState('all'); // 'all' | 'sku' | 'name' | 'recipient'
  const [searched,  setSearched]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [skuNames,  setSkuNames]  = useState({});
  const PAGE_SIZE = 50;

  useEffect(() => { loadSkuNames().then(n => setSkuNames(n)); }, []);

  // ── Modal state ───────────────────────────────────────────────
  const [modalOrder, setModalOrder] = useState(null); // full order object
  const [modalData,  setModalData]  = useState({});   // editable fields
  const [projects,   setProjects]   = useState([]);
  const emptyItem = { sku: '', product_name: '', quantity: 1 };
  useEffect(() => {
    fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(j => setProjects((j.data || []).filter(p => p.active)));
  }, []);

  const load = async (p = 1) => {
    setLoading(true); setSearched(true);
    try {
      // 拉全量数据（pageSize 500），本地做 fuzzy filter，不依赖服务端分页
      const params = new URLSearchParams({ page: 1, pageSize: 500 });
      if (q.trim()) params.set('q', q.trim());
      const res  = await fetch(`/api/orders/manual?${params}`);
      const json = await res.json();
      const data = json.data || [];
      setAllOrders(data);
      setOrders(data);
      setTotal(json.pagination?.total || data.length);
      setPage(1);
      setLocalQ(''); // 重置本地过滤
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 本地 fuzzy filter（对已加载数据实时过滤）
  const filteredOrders = React.useMemo(() => {
    const ql = localQ.trim().toLowerCase();
    if (!ql) return allOrders;
    return allOrders.filter(order => {
      const inOrderNo  = (order.order_number  || '').toLowerCase().includes(ql);
      const inRef      = (order.reference_no  || '').toLowerCase().includes(ql);
      const inName     = (order.ship_to_name  || '').toLowerCase().includes(ql);
      const inItems    = (order.order_items   || []).some(it =>
        (it.sku          || '').toLowerCase().includes(ql) ||
        (it.product_name || '').toLowerCase().includes(ql) ||
        (skuNames[it.sku]|| '').toLowerCase().includes(ql)
      );
      if (searchMode === 'sku')       return inItems && (order.order_items||[]).some(it => (it.sku||'').toLowerCase().includes(ql));
      if (searchMode === 'name')      return inItems && (order.order_items||[]).some(it => ((it.product_name||'')+(skuNames[it.sku]||'')).toLowerCase().includes(ql));
      if (searchMode === 'recipient') return inName;
      return inOrderNo || inRef || inName || inItems;
    });
  }, [localQ, allOrders, searchMode, skuNames]);

  // Open modal with full order data
  const openModal = (order) => {
    const addr = order.ship_to_address || {};
    setModalOrder(order);
    setModalData({
      reference_no:     order.reference_no     || '',
      status:           order.status           || 'pending',
      tracking_number:  order.tracking_number  || '',
      carrier:          order.carrier          || '',
      notes:            order.notes            || '',
      project_id:       order.project_id       || '',
      billing_group:    order.billing_group    || '',
      ship_to_name:     order.ship_to_name     || '',
      customer_company: order.customer_company || '',
      customer_phone:   order.customer_phone   || '',
      customer_email:   order.customer_email   || '',
      address1:  addr.address1 || addr.street1 || '',
      address2:  addr.address2 || addr.street2 || '',
      suburb:    addr.suburb   || addr.city    || '',
      state:     addr.state    || '',
      postcode:  addr.postcode || addr.postalCode || '',
      country:   addr.country  || 'AU',
      items: (order.order_items || []).map(it => ({
        sku:          it.sku          || '',
        product_name: it.product_name || '',
        quantity:     it.quantity     || 1,
      })),
    });
    setSaveMsg('');
  };

  const closeModal = () => { setModalOrder(null); setModalData({}); setSaveMsg(''); };

  const setField = (k, v) => setModalData(p => ({ ...p, [k]: v }));

  const setItem = (i, k, v) => setModalData(p => {
    const items = [...p.items];
    items[i] = { ...items[i], [k]: v };
    return { ...p, items };
  });

  const addItem = () => setModalData(p => ({ ...p, items: [...p.items, { ...emptyItem }] }));

  const removeItem = (i) => setModalData(p => ({
    ...p,
    items: p.items.filter((_, idx) => idx !== i),
  }));

  const save = async (pushSS = false) => {
    setSaving(true); setSaveMsg('');
    try {
      const payload = {
        reference_no:    modalData.reference_no,
        status:          modalData.status,
        project_id:      modalData.project_id   || null,
        billing_group:   modalData.billing_group || null,
        tracking_number: modalData.tracking_number,
        carrier:         modalData.carrier,
        notes:           modalData.notes,
        ship_to_name:    modalData.ship_to_name,
        customer_company: modalData.customer_company,
        customer_phone:  modalData.customer_phone,
        customer_email:  modalData.customer_email,
        ship_to_address: {
          address1: modalData.address1,
          address2: modalData.address2,
          suburb:   modalData.suburb,
          state:    modalData.state,
          postcode: modalData.postcode,
          country:  modalData.country || 'AU',
        },
        items: modalData.items.filter(it => it.sku && Number(it.quantity) > 0),
        push_to_shipstation: pushSS,
      };
      const res  = await fetch(`/api/orders/manual?id=${modalOrder.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSaveMsg(pushSS
        ? `Saved. ShipStation: ${json.shipstation?.pushed ? '✅ pushed' : `❌ ${json.shipstation?.reason}`}`
        : '✅ Saved');
      // Update local list — 完整替换，确保 order_items 也更新
      const updated = json.data;
      setOrders(prev => prev.map(o => o.id === modalOrder.id ? updated : o));
      // 同步更新 modal 里的数据，让 save 后继续编辑时看到最新状态
      setModalOrder(updated);
      if (!pushSS) closeModal();
    } catch (e) {
      setSaveMsg(`❌ Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inp = { padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.bg, color: C.text, width: '100%', boxSizing: 'border-box' };
  const statusOpts = ['pending', 'backorder', 'processing', 'shipped', 'delivered', 'cancelled'];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Orders</h2>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: searched ? 10 : 20, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
          placeholder="Order no. / reference (blank = load all)..."
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => load(1)} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Load'}
        </button>
        {canDo('manual_sync_ss') && <button onClick={async () => {
          setSaveMsg('Syncing from ShipStation...');
          try {
            const r = await fetch('/api/shipstation/sync-tracking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ syncAll: true }),
            });
            const j = await r.json();
            setSaveMsg(`SS Sync: ${j.updated} updated out of ${j.synced} orders`);
            load(page);
          } catch(e) { setSaveMsg(`Sync error: ${e.message}`); }
        }} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          🔄 Sync from SS
        </button>}
        {canDo('manual_sync_eccang') && <button onClick={async () => {
          setSaveMsg('Previewing ECCANG matches...');
          try {
            const r = await fetch('/api/orders/sync-from-eccang', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ dryRun: true }),
            });
            const j = await r.json();
            const matches = (j.results || []).filter(r => r.status === 'preview');
            if (matches.length === 0) { setSaveMsg('No matching ECCANG orders found for any manual order without tracking.'); return; }
            const preview = matches.map(m => `${m.order_number} (${m.reference_no}) → ${m.tracking_number} via ${m.carrier}`).join('\n');
            if (!confirm(`Found ${matches.length} matches:\n\n${preview}\n\nConfirm sync?`)) { setSaveMsg('Sync cancelled.'); return; }
            const r2 = await fetch('/api/orders/sync-from-eccang', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ dryRun: false }),
            });
            const j2 = await r2.json();
            setSaveMsg(`ECCANG Sync: ${j2.summary?.synced || 0} synced, ${j2.summary?.no_match || 0} no match, ${j2.summary?.errors || 0} errors`);
            load(page);
          } catch(e) { setSaveMsg(`Sync error: ${e.message}`); }
        }} style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          📦 Sync from ECCANG
        </button>}
      </div>

      {saveMsg && !modalOrder && (
        <div style={{ background: saveMsg.includes('❌') ? C.dangerBg : C.successBg, border: `1px solid ${saveMsg.includes('❌') ? '#FECACA' : '#A7F3D0'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: saveMsg.includes('❌') ? C.danger : C.success, marginBottom: 16 }}>
          {saveMsg}
        </div>
      )}

      {searched && !loading && (
        <>
        {/* Fuzzy filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input
            value={localQ}
            onChange={e => setLocalQ(e.target.value)}
            placeholder={searchMode === 'sku' ? 'Filter by SKU...' : searchMode === 'name' ? 'Filter by product name...' : searchMode === 'recipient' ? 'Filter by recipient name...' : 'Filter by SKU, name, recipient, ref...'}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.accent}`, fontSize: 14, background: C.bg, color: C.text, width: 280, outline: 'none' }}
          />
          {[['all','All fields'],['sku','SKU'],['name','Product name'],['recipient','Recipient']].map(([v, l]) => (
            <button key={v} onClick={() => setSearchMode(v)} style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              border: `1px solid ${searchMode === v ? C.accent : C.border}`,
              background: searchMode === v ? C.accentDim : C.surface,
              color: searchMode === v ? C.accent : C.muted,
              fontWeight: searchMode === v ? 600 : 400,
            }}>{l}</button>
          ))}
          <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>
            {filteredOrders.length} / {allOrders.length} orders
            {localQ && <span style={{ color: C.accent }}> — "{localQ}"</span>}
          </span>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {allOrders.length} order{allOrders.length !== 1 ? 's' : ''} loaded
            {q && <span style={{ marginLeft: 8, color: C.accent }}>— server filter: "{q}"</span>}
          </div>

          {filteredOrders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>No orders match "{localQ}"</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['Order No.', 'Reference', 'Status', 'Recipient', 'Products', 'Tracking', 'Created', ...(isSuperAdmin ? ['Placed By'] : []), 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12 }}>{order.order_number}</td>
                    <td style={{ padding: '10px 12px', color: C.muted, fontSize: 12 }}>{order.reference_no || <span style={{ color: C.border }}>—</span>}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: order.status === 'shipped' ? C.successBg : order.status === 'backorder' ? '#FEF3C7' : order.status === 'pending' ? C.warningBg : C.surfaceAlt, color: order.status === 'shipped' ? C.success : order.status === 'backorder' ? '#92400E' : order.status === 'pending' ? C.warning : C.muted }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: C.text }}>{order.ship_to_name}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: C.muted, maxWidth: 160 }}>
                      {(order.order_items || []).slice(0, 2).map((it, i) => (
                        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ fontFamily: 'monospace', color: C.accent }}>{it.sku}</span> ×{it.quantity}
                        </div>
                      ))}
                      {(order.order_items || []).length > 2 && (
                        <div style={{ color: C.muted }}>+{(order.order_items || []).length - 2} more</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'monospace' }}>
                      {order.tracking_number ? (() => {
                        const url = getTrackingUrl(order.carrier, order.tracking_number);
                        return url
                          ? <a href={url} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: 'none', fontWeight: 500 }}>{order.tracking_number} ↗</a>
                          : <span style={{ color: C.muted }}>{order.tracking_number}</span>;
                      })() : <span style={{ color: C.border }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>{order.created_at?.slice(0,10)}</td>
                    {isSuperAdmin && (
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{order.created_by_username || '—'}</td>
                    )}
                    <td style={{ padding: '10px 12px' }}>
                      {canDo('manual_edit') && (
                        <button onClick={() => openModal(order)} style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          ✏️ Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
        </>
      )}

      {/* ── Edit Modal ───────────────────────────────────────── */}
      {modalOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, paddingBottom: 40, overflowY: 'auto' }}>
          {/* backdrop */}
          <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

          <div style={{ position: 'relative', zIndex: 1001, background: C.bg, borderRadius: 14, width: '100%', maxWidth: 720, margin: '0 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit Order</div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace', marginTop: 2 }}>{modalOrder.order_number}</div>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>

              {/* ── Section: Order Info ── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Order Info</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Reference No.</span>
                    <input value={modalData.reference_no} onChange={e => setField('reference_no', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Status</span>
                    <select value={modalData.status} onChange={e => setField('status', e.target.value)} style={inp}>
                      {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Project</span>
                    <select value={modalData.project_id || ''} onChange={e => setField('project_id', e.target.value)} style={inp}>
                      <option value="">— No project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Billing Group</span>
                    <input value={modalData.billing_group || ''} onChange={e => setField('billing_group', e.target.value)} placeholder="e.g. CCEP-AU, ASL-2026..." style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Carrier</span>
                    <input value={modalData.carrier} onChange={e => setField('carrier', e.target.value)} style={inp} placeholder="e.g. AusPost, FedEx" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Tracking Number</span>
                    <input value={modalData.tracking_number} onChange={e => setField('tracking_number', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Notes</span>
                    <textarea value={modalData.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
                  </label>
                </div>
              </div>

              {/* ── Section: Recipient ── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Recipient</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Name *</span>
                    <input value={modalData.ship_to_name} onChange={e => setField('ship_to_name', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Company</span>
                    <input value={modalData.customer_company} onChange={e => setField('customer_company', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Phone</span>
                    <input value={modalData.customer_phone} onChange={e => setField('customer_phone', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Email</span>
                    <input value={modalData.customer_email} onChange={e => setField('customer_email', e.target.value)} style={inp} />
                  </label>
                </div>
              </div>

              {/* ── Section: Address ── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Delivery Address</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Address Line 1 *</span>
                    <input value={modalData.address1} onChange={e => setField('address1', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Address Line 2</span>
                    <input value={modalData.address2} onChange={e => setField('address2', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Suburb *</span>
                    <input value={modalData.suburb} onChange={e => setField('suburb', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>State *</span>
                    <input value={modalData.state} onChange={e => setField('state', e.target.value)} style={inp} placeholder="e.g. NSW" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Postcode *</span>
                    <input value={modalData.postcode} onChange={e => setField('postcode', e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Country</span>
                    <input value={modalData.country} onChange={e => setField('country', e.target.value)} style={inp} placeholder="AU" />
                  </label>
                </div>
              </div>

              {/* ── Section: Products ── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Products</div>
                  <button onClick={addItem} style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    + Add Item
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {modalData.items?.map((item, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 32px', gap: 8, alignItems: 'center', background: C.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>SKU</div>
                        <SkuDropdown
                          sku={item.sku}
                          productName={item.product_name}
                          allowedProjects={allowedProjects}
                          onChange={(sku, name) => {
                            setItem(i, 'sku', sku);
                            if (name) setItem(i, 'product_name', name);
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>Product Name</div>
                        <input value={item.product_name} onChange={e => setItem(i, 'product_name', e.target.value)}
                          style={{ ...inp, fontSize: 12 }} placeholder="Product name" />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>Qty</div>
                        <input type="number" min={1} value={item.quantity} onChange={e => setItem(i, 'quantity', parseInt(e.target.value) || 1)}
                          style={{ ...inp, fontSize: 13, textAlign: 'center' }} />
                      </div>
                      <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: C.danger, fontSize: 16, cursor: 'pointer', padding: 4, marginTop: 16 }}>✕</button>
                    </div>
                  ))}
                  {(!modalData.items || modalData.items.length === 0) && (
                    <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: '20px 0' }}>No items — click + Add Item</div>
                  )}
                </div>
              </div>

              {/* ── Save message ── */}
              {saveMsg && (
                <div style={{ background: saveMsg.includes('❌') ? C.dangerBg : C.successBg, border: `1px solid ${saveMsg.includes('❌') ? '#FECACA' : '#A7F3D0'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: saveMsg.includes('❌') ? C.danger : C.success, marginBottom: 16 }}>
                  {saveMsg}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: 8, padding: '16px 24px', borderTop: `1px solid ${C.border}`, background: C.surface, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', color: C.muted }}>
                Cancel
              </button>
              {canDo('manual_push_ss') && (
                <button onClick={() => save(true)} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '...' : 'Save + Push SS'}
                </button>
              )}
              <button onClick={() => save(false)} disabled={saving} style={{ background: C.success, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : '✓ Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Manual Order Bulk Upload ───────────────────────────────────
function ManualOrderBulkUpload({ token, userPerms, isSuperAdmin, allowedProjects }) {
  const canPushSS = isSuperAdmin || (userPerms || []).includes('manual_push_ss');
  const [csvText,   setCsvText]   = useState('');
  const [preview,       setPreview]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState(null);
  const [error,         setError]         = useState('');
  const [pushSS,        setPushSS]        = useState(true);
  const [stockWarnings, setStockWarnings] = useState({}); // sku → { available, needed }

  const REQUIRED_COLS = ['reference_no','ship_to_name','address1','suburb','state','postcode','sku','quantity'];
  const TEMPLATE = [
    'reference_no,client,ship_to_name,customer_company,customer_phone,customer_email,address1,address2,suburb,state,postcode,country,sku,product_name,quantity,price,notes',
    'REF-001,Project,John Smith,Acme Corp,0400000001,john@example.com,123 Main St,,Sydney,NSW,2000,AU,SKU-001,Product Name,2,9.99,',
    'REF-002,Project,Jane Doe,,0400000002,,456 High St,Unit 1,Melbourne,VIC,3000,AU,SKU-002,Another Product,1,19.99,',
  ].join('\n');

  const parseCSV = (text) => {
    const lines  = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    const rows   = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row  = {};
      header.forEach((h, j) => row[h] = vals[j] || '');
      rows.push(row);
    }
    return rows;
  };

  // Group rows by reference_no — multiple rows = multiple SKUs for same order
  const groupOrders = (rows) => {
    const map = {};
    rows.forEach(row => {
      const key = row.reference_no || `_noref_${Math.random()}`;
      if (!map[key]) {
        map[key] = {
          reference_no:     row.reference_no,
          client:           row.client || 'Project',
          ship_to_name:     row.ship_to_name,
          customer_company: row.customer_company || '',
          customer_phone:   row.customer_phone   || '',
          customer_email:   row.customer_email   || '',
          ship_to_address: {
            address1: row.address1,
            address2: row.address2 || '',
            suburb:   row.suburb,
            state:    row.state,
            postcode: row.postcode,
            country:  row.country || 'AU',
          },
          notes: row.notes || '',
          items: [],
        };
      }
      if (row.sku && Number(row.quantity) > 0) {
        map[key].items.push({
          sku:          row.sku,
          product_name: row.product_name || '',
          quantity:     Number(row.quantity),
          price:        row.price !== '' ? Number(row.price) : null,
        });
      }
    });
    return Object.values(map);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const rows    = parseCSV(text);
      const grouped = groupOrders(rows);
      setPreview(grouped);
      setResult(null);
      setError('');
      setStockWarnings({});

      // 查所有 SKU 的库存
      const allSkus = [...new Set(grouped.flatMap(o => o.items.map(it => it.sku).filter(Boolean)))];
      if (allSkus.length > 0) {
        const stock = await checkStock(allSkus);
        // 计算每个 SKU 的总需求量
        const needed = {};
        grouped.forEach(o => o.items.forEach(it => {
          if (it.sku) needed[it.sku] = (needed[it.sku] || 0) + Number(it.quantity);
        }));
        const warnings = {};
        allSkus.forEach(sku => {
          const avail = stock[sku] ?? null;
          const need  = needed[sku] || 0;
          if (avail !== null && avail < need) {
            warnings[sku] = { available: avail, needed: need };
          }
        });
        setStockWarnings(warnings);
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!preview.length) return;
    setLoading(true); setError(''); setResult(null);
    try {
      // 标记库存不足的订单为 backorder
      const ordersWithStatus = preview.map(order => ({
        ...order,
        status: order.items.some(it =>
          it.sku && stockWarnings[it.sku]
        ) ? 'backorder' : undefined,
      }));
      const res  = await fetch('/api/orders/manual', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ bulk: true, orders: ordersWithStatus, push_to_shipstation: pushSS }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setResult(json);
      setPreview([]);
      setCsvText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'manual_order_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Bulk Upload Orders</h2>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
        Upload a CSV to create multiple manual orders at once. Multiple rows with the same reference_no will be grouped as one order with multiple items.
      </p>

      {/* Template download */}
      <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>CSV Template</div>
          <div style={{ fontSize: 12, color: C.muted }}>Required columns: {REQUIRED_COLS.join(', ')}</div>
        </div>
        <button onClick={downloadTemplate} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.accent }}>
          ⬇️ Download Template
        </button>
      </div>

      {/* File upload */}
      <div style={{ background: C.surface, border: `2px dashed ${C.border}`, borderRadius: 10, padding: '24px', marginBottom: 16, textAlign: 'center' }}>
        <input type="file" accept=".csv" onChange={handleFile} id="bulk-csv-input" style={{ display: 'none' }} />
        <label htmlFor="bulk-csv-input" style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Click to select CSV file</div>
          <div style={{ fontSize: 12, color: C.muted }}>or drag and drop</div>
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{preview.length} orders ready to create</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={pushSS && canPushSS} disabled={!canPushSS} onChange={e => setPushSS(e.target.checked)} />
              Push to ShipStation {!canPushSS && <span style={{fontSize:11,color:C.muted}}>(no permission)</span>}
            </label>
          </div>
          {Object.keys(stockWarnings).length > 0 && (
            <div style={{ padding: '10px 16px', background: '#FFF7ED', borderBottom: `1px solid #FED7AA` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                ⚠️ Stock shortage detected — affected orders will be marked as <strong>Backorder</strong>
              </div>
              {Object.entries(stockWarnings).map(([sku, w]) => (
                <div key={sku} style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>
                  • <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sku}</span>: need {w.needed}, only {w.available} available ({w.needed - w.available} short)
                </div>
              ))}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                {['Reference', 'Client', 'Ship To', 'Address', 'Items'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((o, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: o.items.some(it => stockWarnings[it.sku]) ? '#FFFBEB' : '' }}>
                  <td style={{ padding: '8px 12px', color: C.accent, fontWeight: 600 }}>
                    {o.reference_no || <span style={{ color: C.border }}>—</span>}
                    {o.items.some(it => stockWarnings[it.sku]) && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>BACKORDER</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{o.client}</td>
                  <td style={{ padding: '8px 12px', color: C.text }}>{o.ship_to_name}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{o.ship_to_address?.suburb}, {o.ship_to_address?.state} {o.ship_to_address?.postcode}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>
                    {o.items.map(it => (
                      <span key={it.sku} style={{ display: 'inline-block', marginRight: 6, color: stockWarnings[it.sku] ? '#B45309' : C.muted }}>
                        {it.sku}×{it.quantity}{stockWarnings[it.sku] ? ' ⚠' : ''}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div style={{ color: C.danger, background: C.dangerBg, border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

      {result && (
        <div style={{ background: C.successBg, border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.success, marginBottom: 8 }}>
            ✅ Created {result.created} orders {result.failed > 0 ? `(${result.failed} failed)` : ''}
          </div>
          {result.results?.filter(r => !r.success).map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: C.danger }}>✗ {r.reference_no}: {r.error}</div>
          ))}
          {result.results?.filter(r => r.success && r.shipstation && !r.shipstation.pushed).map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: C.warning }}>⚠️ {r.order_number}: SS not pushed — {r.shipstation.reason}</div>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <button onClick={handleUpload} disabled={loading} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          {loading ? 'Creating...' : `Create ${preview.length} Orders`}
        </button>
      )}
    </div>
  );
}


// ── SKU Dropdown — searchable product selector ─────────────────
function SkuDropdown({ sku, productName, onChange, allowedProjects, onStockInfo }) {
  const [query,    setQuery]    = useState(sku || '');
  const [options,  setOptions]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [allProds, setAllProds] = useState(null);
  const [stock,    setStock]    = useState({}); // sku → sellable qty
  const inputRef = React.useRef(null);

  // Load products + stock cache
  useEffect(() => {
    loadProducts(allowedProjects || []).then(prods => {
      setAllProds(prods);
      // Pre-load stock for visible products
      const skus = prods.map(p => p.sku);
      checkStock(skus).then(s => setStock(s));
    });
  }, [JSON.stringify(allowedProjects)]);

  // 검색어 변경 시 필터링
  useEffect(() => {
    if (!allProds) return;
    if (!query.trim()) {
      setOptions(allProds.slice(0, 50));
      return;
    }
    const q = query.toLowerCase();
    const filtered = allProds.filter(p =>
      p.sku.toLowerCase().includes(q) ||
      (p.product_name || '').toLowerCase().includes(q)
    ).slice(0, 50);
    setOptions(filtered);
  }, [query, allProds]);

  // sku prop이 변경되면 query도 업데이트
  useEffect(() => { setQuery(sku || ''); }, [sku]);

  const select = (p) => {
    onChange(p.sku, p.product_name);
    setQuery(p.sku);
    setOpen(false);
  };

  const handleBlur = () => {
    // 약간 딜레이 — 클릭 이벤트가 먼저 실행되도록
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value, productName);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder="SKU — type to search *"
        style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: '100%' }}
      />
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
          marginTop: 2,
        }}>
          {options.map(p => {
            const qty = stock[p.sku];
            const inStock = qty === null || qty === undefined || qty > 0;
            return (
            <div key={p.sku}
              onMouseDown={() => {
                select(p);
                if (onStockInfo) onStockInfo(p.sku, qty ?? 0);
              }}
              style={{
                padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                display: 'flex', gap: 10, alignItems: 'center',
                background: inStock ? '' : '#FFF7ED',
              }}
              onMouseEnter={e => e.currentTarget.style.background = inStock ? C.accentDim : '#FED7AA'}
              onMouseLeave={e => e.currentTarget.style.background = inStock ? '' : '#FFF7ED'}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.accent, fontWeight: 600, minWidth: 120 }}>{p.sku}</span>
              <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{p.product_name}</span>
              {qty !== null && qty !== undefined && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                  background: qty > 0 ? '#D1FAE5' : '#FEE2E2',
                  color: qty > 0 ? '#065F46' : '#991B1B',
                  whiteSpace: 'nowrap',
                }}>
                  {qty > 0 ? `${qty} in stock` : 'Out of stock'}
                </span>
              )}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

function ManualOrderCreate({ token, userPerms, isSuperAdmin, allowedProjects }) {
  const canPushSS = isSuperAdmin || (userPerms || []).includes('manual_push_ss');
  const emptyItem = { sku: '', product_name: '', quantity: 1, price: '' };
  const [form, setForm] = useState({
    reference_no: '',
    client: 'ASL',
    project_id: '',
    billing_group: '',
    ship_to_name: '',
    customer_company: '',
    country: 'AU',
    address1: '',
    address2: '',
    suburb: '',
    state: '',
    postcode: '',
    phone: '',
    email: '',
    notes: '',
    items: [{ ...emptyItem }],
    push_to_shipstation: true,
  });
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(j => setProjects((j.data || []).filter(p => p.active)));
  }, []);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [result,    setResult]    = useState(null);
  const [itemStock, setItemStock] = useState({}); // sku → sellable qty

  // 当 SKU 变化时查询库存
  const updateStockForItem = async (sku) => {
    if (!sku) return;
    const s = await checkStock([sku]);
    setItemStock(prev => ({ ...prev, ...s }));
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const setItem = (idx, k, v) => setForm(prev => ({
    ...prev,
    items: prev.items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)),
  }));
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const submit = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      // ── 库存检查 ──────────────────────────────────────────
      const skus = [...new Set(form.items.map(it => it.sku).filter(Boolean))];
      const latestStock = skus.length > 0 ? await checkStock(skus) : {};
      setItemStock(latestStock);

      // 判断是否有缺货 SKU
      const outOfStock = form.items.filter(it =>
        it.sku && latestStock[it.sku] !== undefined && latestStock[it.sku] !== null &&
        latestStock[it.sku] < Number(it.quantity)
      );
      const isBackorder = outOfStock.length > 0;

      const payload = {
        reference_no: form.reference_no,
        ...(isBackorder ? { status: 'backorder' } : {}),
        client: form.client,
        ship_to_name: form.ship_to_name,
        customer_company: form.customer_company,
        customer_phone: form.phone,
        customer_email: form.email,
        ship_to_address: {
          country: form.country,
          address1: form.address1,
          address2: form.address2,
          suburb: form.suburb,
          state: form.state,
          postcode: form.postcode,
        },
        notes: form.notes,
        push_to_shipstation: form.push_to_shipstation,
        ...(form.project_id    ? { project_id:    form.project_id }    : {}),
        ...(form.billing_group ? { billing_group: form.billing_group } : {}),
        items: form.items.map(it => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: Number(it.quantity),
          price: it.price === '' ? null : Number(it.price),
        })),
      };
      const res = await fetch('/api/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Create manual order failed');
      setResult(json);
      setForm(prev => ({ ...prev, reference_no: '', project_id: '', billing_group: '', ship_to_name: '', customer_company: '', address1: '', address2: '', suburb: '', state: '', postcode: '', phone: '', email: '', notes: '', items: [{ ...emptyItem }] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Create Manual Order</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <LocationDropdown
              token={token}
              value={form.ship_to_name}
              placeholder="Recipient name * — type to search"
              onChange={(loc) => {
                setField('ship_to_name', loc.name || '');
                if (!loc._freeInput) {
                  // 从下拉选中 → 自动填所有字段
                  setField('customer_company', loc.company  || '');
                  setField('address1',         loc.address1 || '');
                  setField('address2',         loc.address2 || '');
                  setField('suburb',           loc.suburb   || '');
                  setField('state',            loc.state    || '');
                  setField('postcode',         loc.postcode || '');
                  setField('country',          loc.country  || 'AU');
                  setField('phone',            loc.phone    || '');
                  setField('email',            loc.email    || '');
                }
              }}
            />
          <input value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} placeholder="Reference No." style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <select value={form.project_id} onChange={e => setField('project_id', e.target.value)}
            style={{ padding: '10px 12px', border: `1px solid ${form.project_id ? C.accent : C.border}`, borderRadius: 8, fontSize: 13, background: '#fff', color: form.project_id ? C.text : C.muted }}>
            <option value="">— Select Project (optional) —</option>
            {(allowedProjects.length > 0
              ? projects.filter(p => allowedProjects.includes(p.id))
              : projects
            ).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={form.billing_group || ''} onChange={e => setField('billing_group', e.target.value)} placeholder="Billing Group (optional)" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.customer_company} onChange={e => setField('customer_company', e.target.value)} placeholder="Company" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <select value={form.client} onChange={e => setField('client', e.target.value)} style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: '#fff', color: C.text }}>
            <option value="ASL">ASL</option>
            <option value="CCEP">CCEP</option>
          </select>
          <select value={form.country} onChange={e => setField('country', e.target.value)} style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: '#fff', color: C.text }}>
            <option value="AU">AU — Australia</option>
            <option value="US">US — United States</option>
            <option value="GB">GB — United Kingdom</option>
            <option value="NZ">NZ — New Zealand</option>
            <option value="CA">CA — Canada</option>
            <option value="SG">SG — Singapore</option>
            <option value="JP">JP — Japan</option>
            <option value="CN">CN — China</option>
            <option value="HK">HK — Hong Kong</option>
            <option value="DE">DE — Germany</option>
            <option value="FR">FR — France</option>
          </select>
          <input value={form.state} onChange={e => setField('state', e.target.value)} placeholder="State *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.address1} onChange={e => setField('address1', e.target.value)} placeholder="Address line 1 *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.address2} onChange={e => setField('address2', e.target.value)} placeholder="Address line 2" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <LocationDropdown
              token={token}
              value={form.suburb}
              placeholder="Suburb * — type to search"
              searchField="suburb"
              onChange={(loc) => {
                if (loc._freeInput) {
                  setField('suburb', loc.suburb || '');
                } else {
                  // 从下拉选中 → 自动填所有字段
                  setField('ship_to_name',     loc.name     || form.ship_to_name);
                  setField('customer_company', loc.company  || '');
                  setField('address1',         loc.address1 || '');
                  setField('address2',         loc.address2 || '');
                  setField('suburb',           loc.suburb   || '');
                  setField('state',            loc.state    || '');
                  setField('postcode',         loc.postcode || '');
                  setField('country',          loc.country  || 'AU');
                  setField('phone',            loc.phone    || '');
                  setField('email',            loc.email    || '');
                }
              }}
            />
          <input value={form.postcode} onChange={e => setField('postcode', e.target.value)} placeholder="Postcode *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="Phone" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.email} onChange={e => setField('email', e.target.value)} placeholder="Email" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
        </div>
        <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Notes" rows={2} style={{ marginTop: 10, width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
        <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
          <input type="checkbox" checked={form.push_to_shipstation && canPushSS} disabled={!canPushSS} onChange={e => setField('push_to_shipstation', e.target.checked)} />
          Push to ShipStation {!canPushSS && <span style={{fontSize:11,color:C.muted}}>(no permission)</span>}
        </label>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Order Line Items *</div>
        {form.items.map((it, idx) => (
          <div key={idx} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.4fr', gap: 8 }}>
              <SkuDropdown
                sku={it.sku}
                productName={it.product_name}
                allowedProjects={allowedProjects}
                onChange={(sku, name) => {
                  setItem(idx, 'sku', sku);
                  setItem(idx, 'product_name', name);
                  updateStockForItem(sku);
                }}
                onStockInfo={(sku, qty) => setItemStock(prev => ({ ...prev, [sku]: qty }))}
              />
              <input value={it.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="Qty *" style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
              <button onClick={() => removeItem(idx)} disabled={form.items.length === 1} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer' }}>-</button>
            </div>
            {it.sku && itemStock[it.sku] !== undefined && itemStock[it.sku] !== null && (() => {
              const qty = itemStock[it.sku];
              const need = Number(it.quantity) || 0;
              const ok = qty >= need;
              return (
                <div style={{ fontSize: 11, marginTop: 3, marginLeft: 2, color: ok ? '#065F46' : '#991B1B', fontWeight: 500 }}>
                  {ok
                    ? `✓ ${qty} in stock`
                    : `⚠ Only ${qty} in stock — need ${need}, ${need - qty} short → will be marked as backorder`}
                </div>
              );
            })()}
          </div>
        ))}
        <button onClick={addItem} style={{ border: `1px solid ${C.accentDim}`, borderRadius: 8, background: '#fff', color: C.accent, padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Item</button>
      </div>

      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {result && (
        <div style={{ color: C.success, background: C.successBg, border: '1px solid #A7F3D0', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 12 }}>
          ✅ Created {result.data?.order_number}
          {result.data?.status === 'backorder' && <span style={{ marginLeft: 8, background: '#FEF3C7', color: '#92400E', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>📦 BACKORDER</span>}
          {' · '}ShipStation: {result.shipstation?.pushed ? 'pushed' : `not pushed (${result.shipstation?.reason || 'n/a'})`}
        </div>
      )}

      <button onClick={submit} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        {loading ? 'Creating...' : 'Create Manual Order'}
      </button>
    </div>
  );
}




// ── Location Dropdown — searchable address book ────────────────
function LocationDropdown({ token, value, onChange, placeholder, searchField }) {
  // searchField: 'name'(default) 或 'suburb' — 控制输入框显示的字段和搜索词
  const [query,   setQuery]   = useState(value || '');
  const [options, setOptions] = useState([]);
  const [open,    setOpen]    = useState(false);
  const inputRef = useRef(null);

  const search = async (q) => {
    if (!q.trim()) { setOptions([]); return; }
    try {
      const res  = await fetch(`/api/locations?dropdown=1&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setOptions(json.data || []);
    } catch { setOptions([]); }
  };

  useEffect(() => { setQuery(value || ''); }, [value]);

  const handleChange = (e) => {
    setQuery(e.target.value);
    // 自由输入时只更新对应字段，不覆盖其他字段
    if (searchField === 'suburb') {
      onChange({ suburb: e.target.value, _freeInput: true });
    } else {
      onChange({ name: e.target.value, _freeInput: true });
    }
    search(e.target.value);
    setOpen(true);
  };

  const handleSelect = (loc) => {
    onChange(loc); // 选中时传完整 location 对象，自动填所有字段
    setQuery(searchField === 'suburb' ? (loc.suburb || '') : (loc.name || ''));
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={() => { if (query) search(query); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Recipient name * — type to search locations'}
        style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: '100%' }}
      />
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto', marginTop: 2,
        }}>
          {options.map(loc => (
            <div key={loc.id}
              onMouseDown={() => handleSelect(loc)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = C.accentDim}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{loc.name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {[loc.company, loc.address1, loc.suburb, loc.state, loc.postcode].filter(Boolean).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Location Management ────────────────────────────────────────
function LocationManagement({ token }) {
  const [locations, setLocations] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [q,         setQ]         = useState('');
  const [msg,       setMsg]       = useState('');
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const PAGE_SIZE = 50;

  const emptyForm = { name: '', company: '', address1: '', address2: '', suburb: '', state: '', postcode: '', country: 'AU', phone: '', email: '', notes: '', special_instruction: '' };
  const [form, setForm] = useState(emptyForm);
  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE });
      if (q.trim()) params.set('q', q.trim());
      const res  = await fetch(`/api/locations?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setLocations(json.data || []);
      setTotal(json.count || 0);
      setTotalPages(json.totalPages || 1);
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const save = async () => {
    if (!form.name.trim()) { setMsg('❌ Name is required'); return; }
    setSaving(true);
    try {
      const url    = editId ? `/api/locations?id=${editId}` : '/api/locations';
      const method = editId ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg(editId ? '✅ Updated' : '✅ Location added');
      setShowForm(false); setEditId(null); setForm(emptyForm);
      load(page);
    } catch(e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const remove = async (id, name) => {
    if (!confirm(`Remove location "${name}"?`)) return;
    await fetch(`/api/locations?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setMsg(`✅ "${name}" removed`);
    load(page);
  };

  const startEdit = (loc) => {
    setForm({ name: loc.name, company: loc.company||'', address1: loc.address1||'', address2: loc.address2||'',
      suburb: loc.suburb||'', state: loc.state||'', postcode: loc.postcode||'', country: loc.country||'AU',
      phone: loc.phone||'', email: loc.email||'', notes: loc.notes||'', special_instruction: loc.special_instruction||'' });
    setEditId(loc.id);
    setShowForm(true);
    setMsg('');
  };

  const iStyle = { padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.bg, color: C.text, width: '100%' };

  const COUNTRIES = [
    ['AU','AU — Australia'],['NZ','NZ — New Zealand'],['US','US — United States'],
    ['GB','GB — United Kingdom'],['SG','SG — Singapore'],['JP','JP — Japan'],
    ['CN','CN — China'],['HK','HK — Hong Kong'],['CA','CA — Canada'],
    ['DE','DE — Germany'],['FR','FR — France'],
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Locations (Address Book)</h2>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); setMsg(''); }}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Add Location
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? C.successBg : C.dangerBg, border: `1px solid ${msg.startsWith('✅') ? '#A7F3D0' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.startsWith('✅') ? C.success : C.danger, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ background: C.surface, border: `2px solid ${C.accent}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>{editId ? 'Edit Location' : 'New Location'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>NAME *</label><input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Recipient name" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>COMPANY</label><input value={form.company} onChange={e => setField('company', e.target.value)} placeholder="Company" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>PHONE</label><input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="Phone" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>ADDRESS LINE 1 *</label><input value={form.address1} onChange={e => setField('address1', e.target.value)} placeholder="Street address" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>ADDRESS LINE 2</label><input value={form.address2} onChange={e => setField('address2', e.target.value)} placeholder="Unit / Floor" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>EMAIL</label><input value={form.email} onChange={e => setField('email', e.target.value)} placeholder="Email" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>SUBURB *</label><input value={form.suburb} onChange={e => setField('suburb', e.target.value)} placeholder="Suburb / City" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>STATE *</label><input value={form.state} onChange={e => setField('state', e.target.value)} placeholder="NSW / VIC..." style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>POSTCODE *</label><input value={form.postcode} onChange={e => setField('postcode', e.target.value)} placeholder="Postcode" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>COUNTRY</label>
              <select value={form.country} onChange={e => setField('country', e.target.value)} style={{ ...iStyle, marginTop: 4 }}>
                {COUNTRIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>NOTES</label><input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Notes" style={{ ...iStyle, marginTop: 4 }} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>SPECIAL INSTRUCTION</label><input value={form.special_instruction || ''} onChange={e => setField('special_instruction', e.target.value)} placeholder="e.g. Leave at reception, call before delivery..." style={{ ...iStyle, marginTop: 4 }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Add Location'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setMsg(''); }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
          placeholder="Search by name or company..."
          style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => load(1)} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Search</button>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
          {total} locations · page {page} of {totalPages}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
        ) : locations.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>No locations yet. Add one to get started.</div>
        ) : (
          <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                {['Name', 'Company', 'Address', 'Suburb', 'State', 'Postcode', 'Special Instruction', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locations.map(loc => (
                <tr key={loc.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: C.text }}>{loc.name}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{loc.company || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{loc.address1}{loc.address2 ? `, ${loc.address2}` : ''}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{loc.suburb}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{loc.state}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{loc.postcode}</td>
                  <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.special_instruction || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(loc)} style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => remove(loc.id, loc.name)} style={{ background: C.dangerBg, color: C.danger, border: `1px solid #FECACA`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => load(p)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Product Management ─────────────────────────────────────────
function ProductManagement({ token, userPerms, isSuperAdmin }) {
  const canDo = (perm) => isSuperAdmin || (userPerms || []).includes(perm);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [q,         setQ]         = useState('');
  const [msg,       setMsg]       = useState('');
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showNew,   setShowNew]   = useState(false);
  const [newProd,   setNewProd]   = useState({ sku: '', product_name: '', description: '' });
  const [saving,    setSaving]    = useState(false);
  const PAGE_SIZE = 100;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE });
      if (q.trim()) params.set('q', q.trim());
      const res  = await fetch(`/api/products?${params}`);
      const json = await res.json();
      setProducts(json.data || []);
      setTotal(json.count || 0);
      setTotalPages(json.totalPages || 1);
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const create = async () => {
    if (!newProd.sku.trim() || !newProd.product_name.trim()) { setMsg('❌ SKU and name required'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newProd, source: 'MANUAL' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Product added');
      setShowNew(false);
      setNewProd({ sku: '', product_name: '', description: '' });
      productsLoaded = false;
      load(1);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const iStyle = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.bg, color: C.text };

  const sourceTag = (source) => {
    if (!source) return null;
    const s = (source || '').toUpperCase();
    const isEccang = s.includes('ECCANG') || s === '2SA';
    const isJdl    = s.includes('JDL');
    const isManual = s === 'MANUAL';
    if (isEccang && isJdl) return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#F0FDF4', color: '#059669', border: '1px solid #A7F3D0' }}>2SA + JDL</span>
    );
    if (isEccang) return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>2SA</span>
    );
    if (isJdl) return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: C.accentDim, color: C.accent, border: '1px solid #BFDBFE' }}>JDL</span>
    );
    if (isManual) return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: C.surfaceAlt, color: C.muted, border: `1px solid ${C.border}` }}>Manual</span>
    );
    return <span style={{ fontSize: 11, color: C.muted }}>{source}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Product Management</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {canDo('products_import') && <button onClick={async () => {
            setMsg('Fetching from ECCANG...');
            try {
              const r = await fetch('/api/products/import-from-eccang', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dryRun: true }),
              });
              const j = await r.json();
              if (!j.success) throw new Error(j.error || j.message || JSON.stringify(j));
              const preview = (j.sample || []).map(p => `${p.sku}: ${p.product_name || '(no name)'}`).join('\n');
              if (!confirm(`Found ${j.count} products from ECCANG:\n\n${preview}\n\nImport all?`)) { setMsg('Cancelled.'); return; }
              const r2 = await fetch('/api/products/import-from-eccang', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dryRun: false }),
              });
              const j2 = await r2.json();
              if (!j2.success) throw new Error(j2.error || j2.message || JSON.stringify(j2));
              setMsg(`✅ ${j2.message}`);
              productsLoaded = false; load(1);
            } catch(e) { setMsg(`❌ ${e.message}`); }
          }} style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            📦 Import ECCANG
          </button>}
          {canDo('products_import') && <button onClick={async () => {
            setMsg('Fetching from JDL...');
            try {
              const r = await fetch('/api/products/import-from-jdl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dryRun: true }),
              });
              const j = await r.json();
              if (!j.success) throw new Error(j.error || j.message || JSON.stringify(j));
              const preview = (j.sample || []).map(p => `${p.sku}: ${p.product_name || '(no name)'}`).join('\n');
              if (!confirm(`Found ${j.count} products from JDL:\n\n${preview}\n\nImport all?`)) { setMsg('Cancelled.'); return; }
              const r2 = await fetch('/api/products/import-from-jdl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dryRun: false }),
              });
              const j2 = await r2.json();
              if (!j2.success) throw new Error(j2.error || j2.message || JSON.stringify(j2));
              setMsg(`✅ ${j2.message}`);
              productsLoaded = false; load(1);
            } catch(e) { setMsg(`❌ ${e.message}`); }
          }} style={{ background: '#0369A1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            🚢 Import JDL
          </button>}
          {canDo('products_add') && <button onClick={() => { setShowNew(true); setMsg(''); }}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            + Add Product
          </button>}
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? C.successBg : C.dangerBg, border: `1px solid ${msg.startsWith('✅') ? '#A7F3D0' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.startsWith('✅') ? C.success : C.danger, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
          placeholder="Search SKU or name..."
          style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => load(1)} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Search</button>
      </div>

      {/* New product form */}
      {showNew && canDo('products_add') && (
        <div style={{ background: C.surface, border: `2px solid ${C.accent}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Add Product</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: 10, marginBottom: 12 }}>
            <input value={newProd.sku} onChange={e => setNewProd(p => ({ ...p, sku: e.target.value }))} placeholder="SKU *" style={iStyle} />
            <input value={newProd.product_name} onChange={e => setNewProd(p => ({ ...p, product_name: e.target.value }))} placeholder="Product Name *" style={iStyle} />
            <input value={newProd.description} onChange={e => setNewProd(p => ({ ...p, description: e.target.value }))} placeholder="Description" style={iStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={create} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Add'}
            </button>
            <button onClick={() => { setShowNew(false); setMsg(''); }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Products table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
          {total} products · page {page} of {totalPages}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
        ) : products.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>No products found. Import from ECCANG or JDL to get started.</div>
        ) : (
          <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                {['SKU', 'Product Name', 'Billing Group', 'Description', 'Location'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12 }}>{p.sku}</td>
                  <td style={{ padding: '9px 14px', color: C.text }}>{p.product_name}</td>
                  <td style={{ padding: '9px 14px', color: C.muted, fontSize: 12 }}>{p.billing_group || '—'}</td>
                  <td style={{ padding: '9px 14px', color: C.muted, fontSize: 12 }}>{p.description || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>{sourceTag(p.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => load(p)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Project Management ─────────────────────────────────────────
function ProjectManagement({ token }) {
  const [projects,   setProjects]   = useState([]);
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState('');
  const [showNew,    setShowNew]    = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [editId,     setEditId]     = useState(null);
  const [editData,   setEditData]   = useState({});
  const [saving,     setSaving]     = useState(false);
  // 哪个 project 展开显示 SKU 列表
  const [expandedId, setExpandedId] = useState(null);
  // SKU 分配：拖拉选择
  const [assigningId, setAssigningId] = useState(null);
  const [skuSearch,   setSkuSearch]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, prodRes] = await Promise.all([
        fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/products?limit=2000&all=1', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pJson    = await pRes.json();
      const prodJson = await prodRes.json();
      setProjects(pJson.data || []);
      setProducts(prodJson.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createProject = async () => {
    if (!newProject.name.trim()) { setMsg('❌ Project name required'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newProject),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Project created');
      setShowNew(false);
      setNewProject({ name: '', description: '' });
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res  = await fetch(`/api/projects?id=${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Saved');
      setEditId(null);
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  // Assign/unassign a SKU to a project
  const toggleSkuProject = async (sku_id, currentProjectId, targetProjectId) => {
    const newProjectId = currentProjectId === targetProjectId ? null : targetProjectId;
    try {
      await fetch(`/api/products?id=${sku_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: newProjectId }),
      });
      // update local state instantly
      setProducts(prev => prev.map(p => p.id === sku_id ? { ...p, project_id: newProjectId } : p));
      setProjects(prev => prev.map(proj => {
        if (proj.id === currentProjectId && currentProjectId !== targetProjectId) return { ...proj, sku_count: Math.max(0, (proj.sku_count || 0) - 1) };
        if (proj.id === targetProjectId  && currentProjectId !== targetProjectId) return { ...proj, sku_count: (proj.sku_count || 0) + 1 };
        if (proj.id === targetProjectId  && currentProjectId === targetProjectId) return { ...proj, sku_count: Math.max(0, (proj.sku_count || 0) - 1) };
        return proj;
      }));
    } catch (e) { setMsg(`❌ ${e.message}`); }
  };

  const [showInactive, setShowInactive] = useState(false);

  const deleteProject = async (proj) => {
    if (proj.sku_count > 0) {
      if (!confirm(`"${proj.name}" has ${proj.sku_count} SKU(s) assigned. Deleting will unassign all SKUs. Continue?`)) return;
    } else {
      if (!confirm(`Delete project "${proj.name}"? This cannot be undone.`)) return;
    }
    try {
      const res  = await fetch(`/api/projects?id=${proj.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Project deleted');
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
  };

  const toggleActive = async (proj) => {
    try {
      const res  = await fetch(`/api/projects?id=${proj.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !proj.active }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg(proj.active ? '✅ Project hidden' : '✅ Project shown');
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
  };

  const inp = { padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, width: '100%', boxSizing: 'border-box' };

  // SKUs currently assigned to a project
  const projectSkus = (projectId) => products.filter(p => p.project_id === projectId);
  // Unassigned SKUs
  const unassigned  = products.filter(p => !p.project_id);

  const filteredUnassigned = unassigned.filter(p =>
    !skuSearch.trim() ||
    p.sku.toLowerCase().includes(skuSearch.toLowerCase()) ||
    (p.product_name || '').toLowerCase().includes(skuSearch.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Project Management</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowInactive(v => !v)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: showInactive ? C.accent : C.muted, fontWeight: showInactive ? 600 : 400 }}>
            {showInactive ? '👁 Showing all' : '👁 Show hidden'}
          </button>
          <button onClick={() => { setShowNew(true); setMsg(''); }} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + New Project
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? C.successBg : C.dangerBg, border: `1px solid ${msg.startsWith('✅') ? '#A7F3D0' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.startsWith('✅') ? C.success : C.danger, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* New project form */}
      {showNew && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New Project</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Project Name *</div>
              <input value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} placeholder="e.g. CCEP Campaign 2026" style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Description</div>
              <input value={newProject.description} onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createProject} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? '...' : 'Create'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: C.muted }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.filter(p => showInactive ? true : p.active).map(proj => (
            <div key={proj.id} style={{ background: C.surface, border: `1px solid ${proj.active ? C.border : '#E5E7EB'}`, borderRadius: 12, overflow: 'hidden', opacity: proj.active ? 1 : 0.6 }}>
              {/* Project header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                {editId === proj.id ? (
                  <>
                    <input value={editData.name || ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                      style={{ ...inp, width: 200 }} />
                    <input value={editData.description || ''} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                      placeholder="Description" style={{ ...inp, flex: 1 }} />
                    <button onClick={saveEdit} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditId(null)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: C.muted }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{proj.name}</span>
                      {proj.description && <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>{proj.description}</span>}
                    </div>
                    <span style={{ fontSize: 12, color: C.muted, background: C.surfaceAlt, padding: '2px 10px', borderRadius: 20 }}>
                      {proj.sku_count || 0} SKUs
                    </span>
                    <button onClick={() => { setEditData({ name: proj.name, description: proj.description || '' }); setEditId(proj.id); }}
                      style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => { setAssigningId(assigningId === proj.id ? null : proj.id); setExpandedId(null); setSkuSearch(''); }}
                      style={{ background: assigningId === proj.id ? C.accent : C.surface, color: assigningId === proj.id ? '#fff' : C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {assigningId === proj.id ? 'Done' : '+ Assign SKUs'}
                    </button>
                    <button onClick={() => setExpandedId(expandedId === proj.id ? null : proj.id)}
                      style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: C.muted }}>
                      {expandedId === proj.id ? '▲ Hide' : '▼ View SKUs'}
                    </button>
                    <button onClick={() => toggleActive(proj)}
                      title={proj.active ? 'Hide this project from users' : 'Show this project to users'}
                      style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: proj.active ? C.muted : C.warning }}>
                      {proj.active ? '🙈 Hide' : '👁 Show'}
                    </button>
                    <button onClick={() => deleteProject(proj)}
                      style={{ background: 'none', border: `1px solid #FECACA`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: C.danger }}>
                      🗑 Delete
                    </button>
                  </>
                )}
              </div>

              {/* Assign SKUs panel */}
              {assigningId === proj.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 16, background: C.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 10 }}>
                    Assign SKUs to "{proj.name}" — click to toggle
                  </div>
                  <input value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                    placeholder="Search SKU or product name..."
                    style={{ ...inp, marginBottom: 12, width: 300 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                    {/* Already in this project */}
                    {projectSkus(proj.id).filter(p =>
                      !skuSearch.trim() ||
                      p.sku.toLowerCase().includes(skuSearch.toLowerCase()) ||
                      (p.product_name||'').toLowerCase().includes(skuSearch.toLowerCase())
                    ).map(p => (
                      <div key={p.id} onClick={() => toggleSkuProject(p.id, proj.id, proj.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: '#D1FAE5', border: '1px solid #A7F3D0' }}>
                        <span style={{ color: C.success, fontWeight: 700, fontSize: 13 }}>✓</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.sku}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{p.product_name}</div>
                        </div>
                      </div>
                    ))}
                    {/* Unassigned */}
                    {filteredUnassigned.map(p => (
                      <div key={p.id} onClick={() => toggleSkuProject(p.id, null, proj.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted, fontSize: 13 }}>○</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.sku}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{p.product_name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View SKUs panel */}
              {expandedId === proj.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 16 }}>
                  {projectSkus(proj.id).length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 13 }}>No SKUs assigned yet. Click "+ Assign SKUs" to add.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                      {projectSkus(proj.id).map(p => (
                        <div key={p.id} style={{ padding: '6px 10px', borderRadius: 8, background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, fontFamily: 'monospace' }}>{p.sku}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{p.product_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {projects.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No projects yet. Create one to start grouping SKUs.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── User Management ────────────────────────────────────────────
const ALL_PERMISSIONS = [
  // Manual Orders
  { key: 'manual_orders',       label: 'View Orders',                 group: 'Orders' },
  { key: 'manual_create',       label: 'Create Order',               group: 'Orders' },
  { key: 'manual_bulk',         label: 'Bulk Upload',                group: 'Orders' },
  { key: 'manual_edit',         label: 'Edit / Update Tracking',     group: 'Orders' },
  { key: 'manual_sync_ss',      label: 'Sync from ShipStation',      group: 'Orders' },
  { key: 'manual_sync_eccang',  label: 'Sync Tracking from ECCANG',  group: 'Orders' },
  { key: 'manual_push_ss',      label: 'Push Orders to ShipStation', group: 'Orders' },
  // Standard Orders
  { key: 'eccang_orders',       label: 'View ECCANG Orders',          group: 'Standard Orders' },
  { key: 'jdl_orders',          label: 'View JDL Orders',             group: 'Standard Orders' },
  { key: 'order_type',          label: 'Order Type Settings',         group: 'Standard Orders' },
  { key: 'sync_eccang',         label: 'Sync ECCANG Orders (import)', group: 'Standard Orders' },
  { key: 'tracking',            label: 'Bulk Update Tracking',        group: 'Standard Orders' },
  // Inventory
  { key: 'inventory',           label: 'View Inventory',              group: 'Inventory' },
  // Settings (super admin only by default)
  { key: 'products_view',       label: 'View Products',               group: 'Settings' },
  { key: 'products_import',     label: 'Import Products (ECCANG/JDL)', group: 'Settings' },
  { key: 'products_add',        label: 'Add Product Manually',        group: 'Settings' },
  { key: 'user_management',     label: 'User Management',             group: 'Settings' },
  { key: 'locations',           label: 'Manage Locations (Address Book)', group: 'Settings' },
];

function UserManagement({ token, user: currentUser }) {
  const [users,    setUsers]    = useState([]);
  const [projects, setProjects] = useState([]); // for allowed_projects picker
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [editId,   setEditId]   = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const [editActive, setEditActive] = useState(true);
  const [editNotes, setEditNotes] = useState('');
  const [editAllowedProjects, setEditAllowedProjects] = useState([]); // [] = no restriction
  const [newUser,  setNewUser]  = useState({ username: '', password: '', permissions: [], notes: '', allowed_projects: [] });
  const [showNew,  setShowNew]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        fetch('/api/auth/users',  { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects',    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const uJson = await uRes.json();
      const pJson = await pRes.json();
      setUsers(uJson.data    || []);
      setProjects(pJson.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (u) => {
    setEditId(u.id);
    setEditPerms(u.permissions || []);
    setEditActive(u.active !== false);
    setEditNotes(u.notes || '');
    setEditAllowedProjects(u.allowed_projects || []);
    setMsg('');
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const res  = await fetch(`/api/auth/users?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: editPerms, active: editActive, notes: editNotes, allowed_projects: editAllowedProjects }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Saved');
      setEditId(null);
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const createUser = async () => {
    if (!newUser.username || !newUser.password) { setMsg('❌ Username and password required'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newUser }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ User created');
      setShowNew(false);
      setNewUser({ username: '', password: '', permissions: [], notes: '' });
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const deactivate = async (id, username) => {
    if (!confirm(`Deactivate user "${username}"?`)) return;
    await fetch(`/api/auth/users?id=${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setMsg('✅ User deactivated');
    load();
  };

  const togglePerm = (perm, list, setList) => {
    setList(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const PermGrid = ({ perms, setPerms, disabled }) => {
    const groups = [...new Set(ALL_PERMISSIONS.map(p => p.group))];
    return (
      <div style={{ marginTop: 8 }}>
        {groups.map(group => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>{group}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', paddingLeft: 8 }}>
              {ALL_PERMISSIONS.filter(p => p.group === group).map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text, cursor: disabled ? 'default' : 'pointer' }}>
                  <input type="checkbox"
                    checked={perms.includes(key)}
                    disabled={disabled}
                    onChange={() => !disabled && togglePerm(key, perms, setPerms)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>User Management</h2>
        <button onClick={() => { setShowNew(true); setMsg(''); }} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + New User
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✅') ? C.successBg : C.dangerBg, border: `1px solid ${msg.startsWith('✅') ? '#A7F3D0' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.startsWith('✅') ? C.success : C.danger, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Create new user form */}
      {showNew && (
        <div style={{ background: C.surface, border: `2px solid ${C.accent}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Create New User</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
              placeholder="Username *" style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
              placeholder="Password *" style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <input value={newUser.notes} onChange={e => setNewUser(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (e.g. ASL client)" style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Permissions:</div>
          <PermGrid perms={newUser.permissions} setPerms={(fn) => setNewUser(p => ({ ...p, permissions: typeof fn === 'function' ? fn(p.permissions) : fn }))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={createUser} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Creating...' : 'Create User'}
            </button>
            <button onClick={() => { setShowNew(false); setMsg(''); }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Super admin row */}
      <div style={{ background: '#FEF9EC', border: `1px solid #FDE68A`, borderRadius: 10, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{currentUser?.username || '2sa-admin'}</span>
          <span style={{ marginLeft: 8, fontSize: 11, background: '#FDE68A', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Super Admin</span>
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>All permissions · Configured via environment variables</span>
      </div>

      {/* Sub-admin users */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading...</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 14 }}>No sub-admin users yet. Create one above.</div>
      ) : (
        users.map(u => (
          <div key={u.id} style={{ background: C.surface, border: `1px solid ${editId === u.id ? C.accent : C.border}`, borderRadius: 10, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editId === u.id ? 12 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: u.active !== false ? C.text : C.muted }}>{u.username}</span>
                {u.active === false && <span style={{ fontSize: 11, background: C.dangerBg, color: C.danger, padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Inactive</span>}
                {u.notes && <span style={{ fontSize: 12, color: C.muted }}>— {u.notes}</span>}
                {editId !== u.id && (
                  <span style={{ fontSize: 11, color: C.muted }}>
                    {(u.permissions || []).length} permissions
                  </span>
                )}
              </div>
              {editId !== u.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(u)} style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Edit
                  </button>
                  {u.active !== false && (
                    <button onClick={() => deactivate(u.id, u.username)} style={{ background: C.dangerBg, color: C.danger, border: `1px solid #FECACA`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Deactivate
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => saveEdit(u.id)} disabled={saving} style={{ background: C.success, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {saving ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditId(null)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {editId === u.id && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: C.text }}>
                    <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} />
                    Active
                  </label>
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    placeholder="Notes" style={{ flex: 1, padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Permissions:</div>
                <PermGrid perms={editPerms} setPerms={setEditPerms} />

                {/* Project access restriction */}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
                    PROJECT ACCESS
                    <span style={{ fontWeight: 400, marginLeft: 8, color: C.muted }}>
                      {editAllowedProjects.length === 0 ? '(No restriction — can see all SKUs)' : `(Restricted to ${editAllowedProjects.length} project${editAllowedProjects.length>1?'s':''})`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {projects.filter(p => p.active).map(proj => {
                      const isAllowed = editAllowedProjects.includes(proj.id);
                      return (
                        <button key={proj.id}
                          onClick={() => setEditAllowedProjects(prev =>
                            prev.includes(proj.id) ? prev.filter(id => id !== proj.id) : [...prev, proj.id]
                          )}
                          style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: isAllowed ? 600 : 400,
                            border: `1px solid ${isAllowed ? C.accent : C.border}`,
                            background: isAllowed ? C.accentDim : C.surface,
                            color: isAllowed ? C.accent : C.muted,
                          }}>
                          {isAllowed ? '✓ ' : ''}{proj.name}
                          <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{proj.sku_count || 0} SKUs</span>
                        </button>
                      );
                    })}
                    {editAllowedProjects.length > 0 && (
                      <button onClick={() => setEditAllowedProjects([])}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'none', color: C.danger }}>
                        ✕ Clear all
                      </button>
                    )}
                    {projects.filter(p => p.active).length === 0 && (
                      <span style={{ fontSize: 12, color: C.muted }}>No projects yet. Create projects first in Project Management.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────
export default function AdminPage() {
  const [token,   setToken]   = useState(null);
  const [user,    setUser]    = useState(null);
  const [section, setSection] = useState('manual_orders');

  useEffect(() => {
    const t = localStorage.getItem('2sa_token');
    const u = localStorage.getItem('2sa_user');
    if (t && u) {
      setToken(t);
      const parsed = JSON.parse(u);
      setUser(parsed);
      // Default section: first permitted section
      const perms = parsed.permissions || [];
      const isSuperAdmin = parsed.role === 'super_admin';
      if (isSuperAdmin || perms.includes('manual_orders')) setSection('manual_orders');
      else if (perms.includes('eccang_orders')) setSection('orders');
      else if (perms.includes('inventory')) setSection('inventory');
    }
  }, []);

  const can = (perm) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return (user.permissions || []).includes(perm);
  };

  if (!token) return <LoginScreen onLogin={(t, u) => { setToken(t); setUser(u); }} />;

  const logout = () => {
    localStorage.removeItem('2sa_token');
    localStorage.removeItem('2sa_user');
    setToken(null); setUser(null);
  };

  const navGroups = [
    {
      group: 'Orders',
      icon: '📝',
      items: [
        { key: 'manual_orders', label: 'View Orders',   perm: 'manual_orders' },
        { key: 'manual_create', label: 'Create Order',  perm: 'manual_create' },
        { key: 'manual_bulk',   label: 'Bulk Upload',   perm: 'manual_bulk' },
      ],
    },
    {
      group: 'Standard Orders',
      icon: '📦',
      items: [
        { key: 'orders',     label: 'ECCANG Orders',    perm: 'eccang_orders' },
        { key: 'jdl_orders', label: 'JDL Orders',       perm: 'jdl_orders' },
        { key: 'order_type', label: 'Order Type',       perm: 'order_type' },
        { key: 'upload',     label: 'Sync ECCANG',      perm: 'sync_eccang' },
        { key: 'tracking',   label: 'Update Tracking',  perm: 'tracking' },
      ],
    },
    {
      group: 'Inventory',
      icon: '📊',
      items: [
        { key: 'inventory', label: 'View Inventory', perm: 'inventory' },
      ],
    },
    ...((can('locations') || can('products_view') || can('user_management')) ? [{
      group: 'Settings',
      icon: '⚙️',
      items: [
        { key: 'locations',    label: 'Locations',          perm: 'locations' },
        { key: 'products',     label: 'Products',           perm: 'products_view' },
        { key: 'project_mgmt', label: 'Project Management', perm: 'user_management' },
        { key: 'users',        label: 'User Management',    perm: 'user_management' },
      ],
    }] : []),
  ].map(group => ({
    ...group,
    items: group.items.filter(item => !item.perm || can(item.perm)),
  })).filter(group => group.items.length > 0);

  return (
    <>
      <Head><title>CCEP 3PL Portal</title></Head>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: ${C.bg}; color: ${C.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`}</style>

      <header style={{ background: '#F4010A', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        {/* Left: username */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 200 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>👤 {user?.username}</span>
        </div>
        {/* Centre: Logo + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 2 }}>
          <img src="/ccep-logo.png" alt="CCEP 3PL Portal" style={{ height: 32, objectFit: 'contain' }}
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <span style={{ display: 'none', color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>CCEP 3PL Portal</span>

        </div>
        {/* Right: links + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 200, justifyContent: 'flex-end' }}>
          <a href="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>Client Portal →</a>
          <button onClick={logout} style={{ fontSize: 12, color: '#fff', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        {/* Sidebar */}
        <nav style={{ width: 220, padding: '16px 12px', borderRight: `1px solid ${C.border}`, minHeight: 'calc(100vh - 56px)' }}>
          {navGroups.map(({ group, icon, items }) => (
            <div key={group} style={{ marginBottom: 8 }}>
              {/* Group header */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '8px 10px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{icon}</span>{group}
              </div>
              {/* Sub-items */}
              {items.map(({ key, label, perm }) => (
                <button key={key} onClick={() => setSection(key)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 10px 7px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: section === key ? 600 : 400,
                  background: section === key ? C.accentDim : 'transparent',
                  color: section === key ? C.accent : C.muted,
                  marginBottom: 2,
                }}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px 32px' }}>
          {section === 'orders'        && can('eccang_orders')   && <OrderSearch          token={token} />}
          {section === 'manual_orders'  && can('manual_orders')   && <ManualOrderManage    token={token} userPerms={user?.permissions} isSuperAdmin={user?.role === 'super_admin'} allowedProjects={user?.allowed_projects || []} />}
          {section === 'manual_create'  && can('manual_create')   && <ManualOrderCreate    token={token} userPerms={user?.permissions} isSuperAdmin={user?.role === 'super_admin'} allowedProjects={user?.allowed_projects || []} />}
          {section === 'manual_bulk'    && can('manual_bulk')     && <ManualOrderBulkUpload token={token} userPerms={user?.permissions} isSuperAdmin={user?.role === 'super_admin'} allowedProjects={user?.allowed_projects || []} />}
          {section === 'order_type'     && can('order_type')      && <OrderTypeUpdate      token={token} />}
          {section === 'jdl_orders'     && can('jdl_orders')      && <JdlOrderSearch       token={token} />}
          {section === 'inventory'      && can('inventory')       && <InventoryView        token={token} />}
          {section === 'upload'         && can('sync_eccang')     && <OrderUpload          token={token} />}
          {section === 'tracking'       && can('tracking')        && <TrackingUpdate       token={token} />}
          {section === 'locations'      && can('locations')         && <LocationManagement   token={token} />}
          {section === 'products'       && can('products_view')    && <ProductManagement    token={token} userPerms={user?.permissions} isSuperAdmin={user?.role === 'super_admin'} />}
          {section === 'project_mgmt'  && can('user_management') && <ProjectManagement    token={token} />}
          {section === 'users'          && can('user_management') && <UserManagement       token={token} user={user} />}
        </main>
      </div>
    </>
  );
}
