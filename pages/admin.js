import { useState, useEffect } from 'react';
import Head from 'next/head';

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
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>2SA Admin</div>
            <div style={{ fontSize: 12, color: C.muted }}>Management Portal</div>
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
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Upload Orders</h2>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Upload a CSV file with columns: <code style={{ background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>order_code, ref_code, tracking_number, carrier, status</code>
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
          {loading ? 'Uploading...' : 'Upload Orders'}
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
  const [sku,     setSku]     = useState('');
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [searched,setSearched]= useState(false);
  const [total,   setTotal]   = useState(0);
  const [invCurPage, setInvCurPage] = useState(1);
  const PAGE_SIZE = 100;

  const search = async (fetchAll = false) => {
    setLoading(true); setError(''); setInvCurPage(1);
    try {
      const params = new URLSearchParams();
      if (sku.trim()) params.set('sku', sku.trim());
      // ECCANG 全量
      const eccangRes  = await fetch(`/api/warehouse/eccang/inventory?${params}`);
      const eccangJson = await eccangRes.json();
      // JDL 全量
      const jdlRes  = await fetch(`/api/warehouse/jdl/inventory?${params}`);
      const jdlJson = await jdlRes.json();

      // 合并：按 SKU 分组
      const skuMap = {};
      (eccangJson.data || []).forEach(item => {
        if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
        skuMap[item.sku].warehouses['ECCANG'] = item;
      });
      (jdlJson.data || []).forEach(item => {
        if (!skuMap[item.sku]) skuMap[item.sku] = { sku: item.sku, warehouses: {} };
        skuMap[item.sku].warehouses[item.warehouse_code || 'JDL'] = item;
      });

      const combined = Object.values(skuMap);
      setItems(combined);
      setTotal(combined.length);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Inventory — All Warehouses</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={sku} onChange={e => setSku(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by SKU (leave blank for all)..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => search()} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {total} SKUs across all warehouses
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: 14 }}>No inventory found</div>
          ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['SKU', 'Warehouse', 'Sellable', 'Reserved', 'On-way'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.slice((invCurPage-1)*PAGE_SIZE, invCurPage*PAGE_SIZE).flatMap((item, i) => {
                  const whEntries = Object.entries(item.warehouses);
                  return whEntries.map(([wh, data], j) => {
                    const isJDL = !isEccangWarehouse(wh);
                    return (
                      <tr key={`${i}-${j}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, opacity: j === 0 ? 1 : 0.3 }}>
                          {j === 0 ? item.sku : ''}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: isJDL ? C.accentDim : '#F5F3FF', color: isJDL ? C.accent : '#7C3AED', border: `1px solid ${isJDL ? '#BFDBFE' : '#DDD6FE'}` }}>{warehouseLabel(wh)}</span>
                        </td>
                        <td style={{ padding: '8px 14px', fontWeight: 700, color: data.sellable > 0 ? C.success : C.muted }}>{data.sellable || 0}</td>
                        <td style={{ padding: '8px 14px', color: data.reserved > 0 ? C.warning : C.muted }}>{data.reserved || 0}</td>
                        <td style={{ padding: '8px 14px', color: data.onway > 0 ? C.accent : C.muted }}>{data.onway || 0}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
            <Pagination page={invCurPage} total={items.length} pageSize={PAGE_SIZE} onChange={setInvCurPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── JDL Order Search ───────────────────────────────────────────
function JdlOrderSearch({ token }) {
  const [q,         setQ]         = useState('');
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [searched,  setSearched]  = useState(false);
  const [ordCurPage, setOrdCurPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState({});
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
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {orders.length} orders
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
                {orders.slice((ordCurPage-1)*PAGE_SIZE, ordCurPage*PAGE_SIZE).map((o, i) => (
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
  const [q,       setQ]       = useState('');
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error,   setError]   = useState('');
  const [searched,setSearched]= useState(false);
  const [ordCurPage, setOrdCurPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
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
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {totalOrders} orders
          </div>
          {orders.length === 0 ? (
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
                {orders.map((o, i) => (
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
            <Pagination page={ordCurPage} total={totalOrders} pageSize={PAGE_SIZE} onChange={search} />
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── Manual Order Management ────────────────────────────────────
function ManualOrderManage({ token }) {
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [q,         setQ]         = useState('');
  const [searched,  setSearched]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [editData,  setEditData]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [page,      setPage]      = useState(1);
  const [total,     setTotal]     = useState(0);
  const PAGE_SIZE = 50;

  const load = async (p = 1) => {
    setLoading(true); setSearched(true);
    try {
      const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE });
      if (q.trim()) params.set('q', q.trim());
      const res  = await fetch(`/api/orders/manual?${params}`);
      const json = await res.json();
      setOrders(json.data || []);
      setTotal(json.pagination?.total || 0);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (order) => {
    setEditId(order.id);
    setEditData({
      reference_no:    order.reference_no    || '',
      tracking_number: order.tracking_number || '',
      carrier:         order.carrier         || '',
      status:          order.status          || 'pending',
      notes:           order.notes           || '',
    });
    setSaveMsg('');
  };

  const cancelEdit = () => { setEditId(null); setEditData({}); setSaveMsg(''); };

  const save = async (id, pushSS = false) => {
    setSaving(true); setSaveMsg('');
    try {
      const res  = await fetch(`/api/orders/manual?id=${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ...editData, push_to_shipstation: pushSS }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSaveMsg(pushSS
        ? `Saved. ShipStation: ${json.shipstation?.pushed ? '✅ pushed' : `❌ ${json.shipstation?.reason}`}`
        : 'Saved ✅');
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...json.data } : o));
      setEditId(null);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.bg, color: C.text, width: '100%' };
  const statusOpts = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Manual Orders</h2>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
          placeholder="Search order number or reference..."
          style={{ flex: 1, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, background: C.bg, color: C.text }} />
        <button onClick={() => load(1)} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : 'Search'}
        </button>
        <button onClick={async () => {
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
        </button>
      </div>

      {saveMsg && (
        <div style={{ background: saveMsg.includes('Error') ? C.dangerBg : C.successBg, border: `1px solid ${saveMsg.includes('Error') ? '#FECACA' : '#A7F3D0'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: saveMsg.includes('Error') ? C.danger : C.success, marginBottom: 16 }}>
          {saveMsg}
        </div>
      )}

      {searched && !loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
            {total} manual order{total !== 1 ? 's' : ''}
          </div>

          {orders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>No manual orders found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {['Order No.', 'Reference', 'Status', 'Recipient', 'Carrier', 'Tracking', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  editId === order.id ? (
                    // ── Edit row ──
                    <tr key={order.id} style={{ background: '#F0F7FF', borderBottom: `2px solid ${C.accent}` }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12 }}>{order.order_number}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={editData.reference_no} onChange={e => setEditData(p => ({ ...p, reference_no: e.target.value }))} style={inputStyle} placeholder="Reference No." />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select value={editData.status} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle }}>
                          {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', color: C.muted, fontSize: 12 }}>{order.ship_to_name}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={editData.carrier} onChange={e => setEditData(p => ({ ...p, carrier: e.target.value }))} style={inputStyle} placeholder="Carrier" />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={editData.tracking_number} onChange={e => setEditData(p => ({ ...p, tracking_number: e.target.value }))} style={inputStyle} placeholder="Tracking No." />
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 12, color: C.muted }}>{order.created_at?.slice(0,10)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button onClick={() => save(order.id, false)} disabled={saving} style={{ background: C.success, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                            {saving ? '...' : 'Save'}
                          </button>
                          <button onClick={() => save(order.id, true)} disabled={saving} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                            Save + Push SS
                          </button>
                          <button onClick={cancelEdit} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // ── Read row ──
                    <tr key={order.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: C.accent, fontWeight: 600, fontSize: 12 }}>{order.order_number}</td>
                      <td style={{ padding: '10px 12px', color: C.muted, fontSize: 12 }}>{order.reference_no || <span style={{ color: C.border }}>—</span>}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: order.status === 'shipped' ? C.successBg : order.status === 'pending' ? C.warningBg : C.surfaceAlt, color: order.status === 'shipped' ? C.success : order.status === 'pending' ? C.warning : C.muted }}>
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.text }}>{order.ship_to_name}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>{order.carrier || <span style={{ color: C.border }}>—</span>}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', color: C.muted }}>{order.tracking_number || <span style={{ color: C.border }}>—</span>}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>{order.created_at?.slice(0,10)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button onClick={() => startEdit(order)} style={{ background: C.accentDim, color: C.accent, border: `1px solid #BFDBFE`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            ✏️ Edit
                          </button>
                          <button onClick={() => {
                            const tracking = prompt(`Enter tracking number for ${order.order_number}:`);
                            if (!tracking?.trim()) return;
                            const carrier = prompt('Carrier (e.g. AusPost, FedEx):') || '';
                            fetch(`/api/orders/manual?id=${order.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ tracking_number: tracking.trim(), carrier, status: 'shipped' }),
                            }).then(r => r.json()).then(j => {
                              if (j.success) {
                                setSaveMsg(`✅ Tracking updated: ${tracking.trim()}`);
                                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, tracking_number: tracking.trim(), carrier, status: 'shipped' } : o));
                              } else {
                                setSaveMsg(`❌ ${j.error}`);
                              }
                            });
                          }} style={{ background: '#F0FDF4', color: '#059669', border: `1px solid #A7F3D0`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            🚚 Tracking
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${C.border}`, alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: C.muted }}>{((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE, total)} of {total}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => load(page-1)} disabled={page===1} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 12 }}>‹</button>
                <button onClick={() => load(page+1)} disabled={page*PAGE_SIZE>=total} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 12 }}>›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Manual Order Bulk Upload ───────────────────────────────────
function ManualOrderBulkUpload({ token }) {
  const [csvText,   setCsvText]   = useState('');
  const [preview,   setPreview]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');
  const [pushSS,    setPushSS]    = useState(true);

  const REQUIRED_COLS = ['reference_no','ship_to_name','address1','suburb','state','postcode','sku','quantity'];
  const TEMPLATE = 'reference_no,client,ship_to_name,customer_company,customer_phone,customer_email,address1,address2,suburb,state,postcode,country,sku,product_name,quantity,price,notes
' +
    'REF-001,ASL,John Smith,Acme Corp,0400000001,john@example.com,123 Main St,,Sydney,NSW,2000,AU,SKU-001,Product Name,2,9.99,
' +
    'REF-002,ASL,Jane Doe,,0400000002,,456 High St,Unit 1,Melbourne,VIC,3000,AU,SKU-002,Another Product,1,19.99,';

  const parseCSV = (text) => {
    const lines  = text.trim().split('
').filter(l => l.trim());
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
          client:           row.client || 'ASL',
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
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const rows    = parseCSV(text);
      const grouped = groupOrders(rows);
      setPreview(grouped);
      setResult(null);
      setError('');
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!preview.length) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res  = await fetch('/api/orders/manual', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ bulk: true, orders: preview, push_to_shipstation: pushSS }),
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
              <input type="checkbox" checked={pushSS} onChange={e => setPushSS(e.target.checked)} />
              Push to ShipStation
            </label>
          </div>
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
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 12px', color: C.accent, fontWeight: 600 }}>{o.reference_no || <span style={{ color: C.border }}>—</span>}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{o.client}</td>
                  <td style={{ padding: '8px 12px', color: C.text }}>{o.ship_to_name}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{o.ship_to_address?.suburb}, {o.ship_to_address?.state} {o.ship_to_address?.postcode}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{o.items.map(it => `${it.sku}×${it.quantity}`).join(', ')}</td>
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

function ManualOrderCreate({ token }) {
  const emptyItem = { sku: '', product_name: '', quantity: 1, price: '' };
  const [form, setForm] = useState({
    reference_no: '',
    client: 'ASL',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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
      const payload = {
        reference_no: form.reference_no,
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
      setForm(prev => ({ ...prev, reference_no: '', ship_to_name: '', customer_company: '', address1: '', address2: '', suburb: '', state: '', postcode: '', phone: '', email: '', notes: '', items: [{ ...emptyItem }] }));
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
          <input value={form.ship_to_name} onChange={e => setField('ship_to_name', e.target.value)} placeholder="Recipient name *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} placeholder="Reference No." style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.customer_company} onChange={e => setField('customer_company', e.target.value)} placeholder="Company" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <select value={form.client} onChange={e => setField('client', e.target.value)} style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
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
          <input value={form.suburb} onChange={e => setField('suburb', e.target.value)} placeholder="Suburb *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.postcode} onChange={e => setField('postcode', e.target.value)} placeholder="Postcode *" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="Phone" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input value={form.email} onChange={e => setField('email', e.target.value)} placeholder="Email" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
        </div>
        <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Notes" rows={2} style={{ marginTop: 10, width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
        <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
          <input type="checkbox" checked={form.push_to_shipstation} onChange={e => setField('push_to_shipstation', e.target.checked)} />
          Push to ShipStation
        </label>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Order Line Items *</div>
        {form.items.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.6fr 0.7fr 0.4fr', gap: 8, marginBottom: 8 }}>
            <input value={it.sku} onChange={e => setItem(idx, 'sku', e.target.value)} placeholder="SKU *" style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <input value={it.product_name} onChange={e => setItem(idx, 'product_name', e.target.value)} placeholder="Name" style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <input value={it.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="Qty *" style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <input value={it.price} onChange={e => setItem(idx, 'price', e.target.value)} placeholder="Price" style={{ padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            <button onClick={() => removeItem(idx)} disabled={form.items.length === 1} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer' }}>-</button>
          </div>
        ))}
        <button onClick={addItem} style={{ border: `1px solid ${C.accentDim}`, borderRadius: 8, background: '#fff', color: C.accent, padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>+ Add Item</button>
      </div>

      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
      {result && <div style={{ color: C.success, background: C.successBg, border: '1px solid #A7F3D0', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 12 }}>✅ Created {result.data?.order_number}. ShipStation: {result.shipstation?.pushed ? 'pushed' : `not pushed (${result.shipstation?.reason || 'n/a'})`}</div>}

      <button onClick={submit} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        {loading ? 'Creating...' : 'Create Manual Order'}
      </button>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────
export default function AdminPage() {
  const [token,   setToken]   = useState(null);
  const [user,    setUser]    = useState(null);
  const [section, setSection] = useState('orders');

  useEffect(() => {
    const t = localStorage.getItem('2sa_token');
    const u = localStorage.getItem('2sa_user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
  }, []);

  if (!token) return <LoginScreen onLogin={(t, u) => { setToken(t); setUser(u); }} />;

  const logout = () => {
    localStorage.removeItem('2sa_token');
    localStorage.removeItem('2sa_user');
    setToken(null); setUser(null);
  };

  const nav = [
    { key: 'orders',     label: '📦 ECCANG Orders' },
    { key: 'manual_orders', label: '📋 Manual Orders' },
    { key: 'manual_create', label: '📝 Create Order' },
    { key: 'manual_bulk',   label: '📤 Bulk Upload Orders' },
    { key: 'order_type', label: '⚙️ Order Type' },
    { key: 'jdl_orders', label: '🚢 JDL Orders' },
    { key: 'inventory',  label: '📊 Inventory' },
    { key: 'upload',     label: '⬆️ Upload Orders' },
    { key: 'tracking',   label: '🚚 Update Tracking' },
  ];

  return (
    <>
      <Head><title>2SA Admin</title></Head>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: ${C.bg}; color: ${C.text}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`}</style>

      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>2S</div>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>2SA Admin</span>
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>Management Portal</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: C.muted }}>👤 {user?.username}</span>
          <a href="/" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Client Portal →</a>
          <button onClick={logout} style={{ fontSize: 12, color: C.danger, background: 'none', border: `1px solid #FECACA`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
        {/* Sidebar */}
        <nav style={{ width: 220, padding: '24px 16px', borderRight: `1px solid ${C.border}`, minHeight: 'calc(100vh - 56px)' }}>
          {nav.map(({ key, label }) => (
            <button key={key} onClick={() => setSection(key)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: section === key ? 600 : 400, background: section === key ? C.accentDim : 'transparent', color: section === key ? C.accent : C.muted, marginBottom: 4 }}>
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px 32px' }}>
          {section === 'orders'     && <OrderSearch    token={token} />}
          {section === 'manual_orders' && <ManualOrderManage token={token} />}
          {section === 'manual_create' && <ManualOrderCreate token={token} />}
          {section === 'manual_bulk'   && <ManualOrderBulkUpload token={token} />}
          {section === 'order_type' && <OrderTypeUpdate token={token} />}
          {section === 'jdl_orders' && <JdlOrderSearch token={token} />}
          {section === 'inventory'  && <InventoryView  token={token} />}
          {section === 'upload'     && <OrderUpload    token={token} />}
          {section === 'tracking'   && <TrackingUpdate token={token} />}
        </main>
      </div>
    </>
  );
}
