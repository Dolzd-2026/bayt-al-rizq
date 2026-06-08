import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase, isConfigured } from './supabase';

/* ═══════════════════════════════════════════════════════════════════
   BAYT AL-RIZQ  V2  ·  OmoD's Household Pantry
   All Phase 1 + 2 + 3 fixes applied. Rebuilt UI/UX.
   ═══════════════════════════════════════════════════════════════════ */

const CATS = [
  { id:'dry',         label:'Dry Foods',             icon:'🌾', color:'#B87333' },
  { id:'wet',         label:'Wet Foods',             icon:'🫙', color:'#2E7D5A' },
  { id:'frozen',      label:'Frozen Foods',          icon:'❄️', color:'#3A7ABF' },
  { id:'cereal',      label:'Cereals & Grains',      icon:'🥣', color:'#8B5E3C' },
  { id:'protein',     label:'Proteins',              icon:'🥩', color:'#A63220' },
  { id:'staples',     label:'Staples & Condiments',  icon:'🫒', color:'#6B4C11' },
  { id:'produce',     label:'Fruits & Vegetables',   icon:'🥬', color:'#3D7A35' },
  { id:'dairy',       label:'Dairy & Alternatives',  icon:'🥛', color:'#4A6FA0' },
  { id:'snacks',      label:'Snacks & Beverages',    icon:'☕', color:'#7B4F2E' },
  { id:'spices',      label:'Spices & Seasonings',   icon:'🌶️', color:'#963220' },
  { id:'bakery',      label:'Bakery & Baking',       icon:'🍞', color:'#B08050' },
  { id:'hygiene',     label:'Personal Hygiene',      icon:'🧴', color:'#3A5FA0' },
  { id:'household',   label:'Household & Cleaning',  icon:'🧹', color:'#4A5560' },
  { id:'supplements', label:'Supplements',           icon:'💊', color:'#5B4A90' },
];

const UNITS = ['kg','g','litres','ml','pcs','packs','cans','bags','bottles','boxes','loaves','bunches','cups','sachets','trays','rolls','dozen'];

const USER_COLORS = ['#C8860A','#2E7D5A','#3A7ABF','#8B5E3C','#5B4A90','#963220','#4A5560','#3D7A35'];

const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const fmtD  = d => { try { return d ? new Date(d).toISOString().split('T')[0] : ''; } catch { return ''; } };
const dL    = n => fmtD(new Date(today().getTime() + n*864e5));
const nowISO= () => new Date().toISOString();
const dateStr=()=> new Date().toLocaleDateString('en-NG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

const mapItem = r => ({
  id:            r.id,
  name:          r.name,
  category:      r.category || 'dry',
  qty:           Number(r.qty) || 0,
  unit:          r.unit || 'pcs',
  restockAt:     Number(r.restock_at) || 1,
  restockDate:   fmtD(r.restock_date),
  lastRestocked: fmtD(r.last_restocked),
  notes:         r.notes || '',
  halal:         Boolean(r.halal),
  store:         r.store || 'Any Store',
});

const toRow = (item, extraUpdatedAt = true) => ({
  name:           item.name.trim(),
  category:       item.category,
  qty:            Number(item.qty) || 0,
  unit:           item.unit,
  restock_at:     Number(item.restockAt) || 1,
  restock_date:   item.restockDate || null,
  last_restocked: item.lastRestocked || null,
  notes:          item.notes || '',
  halal:          Boolean(item.halal),
  store:          item.store || 'Any Store',
  ...(extraUpdatedAt ? { updated_at: nowISO() } : {}),
});

// FIX #4: safe status — handles null/invalid restockDate
const itemStatus = item => {
  if (item.qty <= item.restockAt) return 'critical';
  if (!item.restockDate) return 'low'; // no date = treat as low
  const d = Math.ceil((new Date(item.restockDate) - today()) / 864e5);
  if (isNaN(d) || d <= 7 || item.qty <= item.restockAt * 1.5) return 'low';
  return 'good';
};
const SC = { good:'#2E7D5A', low:'#D97706', critical:'#DC2626' };
const SB = { good:'#F0FDF4', low:'#FFFBEB', critical:'#FEF2F2' };
const SL = { good:'Stocked', low:'Low', critical:'Critical' };

// FIX: smart restock interval based on item's own cycle
const smartRestockDays = item => {
  if (!item.lastRestocked || !item.restockDate) return 21;
  const cycle = Math.ceil((new Date(item.restockDate) - new Date(item.lastRestocked)) / 864e5);
  return Math.max(7, Math.min(90, cycle || 21));
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText='position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta); return ok;
  } catch { return false; }
}

function buildListText(critItems, lowItems, storeLabel) {
  const lines = ['🏡 BAYT AL-RIZQ — SHOPPING LIST', `📅 ${dateStr()}`, `🏪 ${storeLabel}`, '─────────────────────'];
  if (critItems.length) {
    lines.push('', '🔴 RESTOCK NOW:');
    critItems.forEach(i => lines.push(`  • ${i.name} (${i.qty} ${i.unit}) → ${i.store}`));
  }
  if (lowItems.length) {
    lines.push('', '🟡 RUNNING LOW:');
    lowItems.forEach(i => {
      const d = i.restockDate ? Math.ceil((new Date(i.restockDate)-today())/864e5) : 0;
      lines.push(`  • ${i.name} (${i.qty} ${i.unit}${d>0?`, ${d}d`:''}) → ${i.store}`);
    });
  }
  lines.push('','─────────────────────', `${critItems.length+lowItems.length} items · Bayt Al-Rizq`);
  return lines.join('\n');
}

function buildFullText(allItems, storeLabel) {
  const lines = ['🏡 BAYT AL-RIZQ — FULL PANTRY', `📅 ${dateStr()}`, `🏪 ${storeLabel}`, '─────────────────────'];
  CATS.forEach(cat => {
    const ci = allItems.filter(i => i.category === cat.id);
    if (!ci.length) return;
    lines.push('', `${cat.icon} ${cat.label.toUpperCase()}`);
    ci.forEach(i => {
      const s = itemStatus(i);
      lines.push(`  ${s==='critical'?'🔴':s==='low'?'🟡':'✅'} ${i.name} — ${i.qty} ${i.unit} → ${i.store}`);
    });
  });
  lines.push('','─────────────────────', `${allItems.length} items`);
  return lines.join('\n');
}

const BLANK_ITEM = { name:'', category:'dry', qty:1, unit:'kg', restockAt:0.5, restockDate:dL(14), lastRestocked:fmtD(today()), notes:'', halal:true, store:'Any Store' };

/* ════════════════════════════════════════════════════════
   SETUP SCREEN — shown when Supabase is not configured
   ════════════════════════════════════════════════════════ */
function SetupScreen() {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      if (res.ok || res.status === 404) {
        setTestResult('success');
      } else {
        setTestResult('fail_' + res.status);
      }
    } catch { setTestResult('fail_network'); }
    setTesting(false);
  };

  const s = { fontFamily:'Inter,sans-serif' };
  const card = { background:'white', borderRadius:16, padding:24, marginBottom:16, border:'1px solid #E8E0D8' };

  return (
    <div style={{...s, background:'linear-gradient(160deg,#1A0F0A 0%,#3D2010 60%,#5C3820 100%)', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
      <div style={{maxWidth:480, width:'100%'}}>
        <div style={{textAlign:'center', marginBottom:32}}>
          <div style={{fontSize:56, marginBottom:12}}>🏡</div>
          <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:28, color:'white', marginBottom:6}}>Bayt Al-Rizq</h1>
          <p style={{color:'#C4A882', fontSize:13}}>One-time setup — connect your database</p>
        </div>

        {/* Step indicator */}
        <div style={{display:'flex', gap:8, marginBottom:24}}>
          {[1,2,3].map(n => (
            <div key={n} style={{flex:1, height:4, borderRadius:2, background:n<=step?'#C8860A':'rgba(255,255,255,.2)'}}/>
          ))}
        </div>

        {step===1 && (
          <div style={card}>
            <h2 style={{fontSize:17, fontWeight:700, marginBottom:8, color:'#1A0F0A'}}>Step 1 — Create your Supabase project</h2>
            <ol style={{fontSize:13, color:'#6B5B4E', lineHeight:2, paddingLeft:18}}>
              <li>Go to <strong>supabase.com</strong> and sign up free</li>
              <li>Click <strong>New project</strong></li>
              <li>Name it <strong>bayt-al-rizq</strong>, choose any password</li>
              <li>Region: <strong>West EU (Ireland)</strong> — closest to Nigeria</li>
              <li>Wait ~2 minutes for it to set up</li>
              <li>Go to <strong>SQL Editor → New Query</strong></li>
              <li>Paste the entire <strong>schema.sql</strong> file from the zip</li>
              <li>Click <strong>Run</strong> — you'll see "Success"</li>
            </ol>
            <button onClick={()=>setStep(2)} style={{marginTop:16, width:'100%', background:'#C8860A', color:'white', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer'}}>
              Done — Get my credentials →
            </button>
          </div>
        )}

        {step===2 && (
          <div style={card}>
            <h2 style={{fontSize:17, fontWeight:700, marginBottom:8, color:'#1A0F0A'}}>Step 2 — Enter your Supabase credentials</h2>
            <p style={{fontSize:12, color:'#8B6B4A', marginBottom:16, lineHeight:1.6}}>
              In Supabase: <strong>Settings → API</strong> — copy both values below
            </p>
            <label style={{fontSize:11, fontWeight:600, color:'#6B5B4E', textTransform:'uppercase', letterSpacing:'.06em'}}>Project URL</label>
            <input value={url} onChange={e=>setUrl(e.target.value.trim())} placeholder="https://abcdefghij.supabase.co"
              style={{display:'block', width:'100%', margin:'6px 0 14px', padding:'10px 12px', border:'1.5px solid #D4C8B8', borderRadius:8, fontSize:13, fontFamily:'monospace'}}/>
            <label style={{fontSize:11, fontWeight:600, color:'#6B5B4E', textTransform:'uppercase', letterSpacing:'.06em'}}>Anon Public Key</label>
            <input value={key} onChange={e=>setKey(e.target.value.trim())} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              style={{display:'block', width:'100%', margin:'6px 0 14px', padding:'10px 12px', border:'1.5px solid #D4C8B8', borderRadius:8, fontSize:11, fontFamily:'monospace'}}/>
            <button onClick={testConnection} disabled={!url||!key||testing}
              style={{width:'100%', background:testing?'#8B6B4A':'#2E7D5A', color:'white', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:10}}>
              {testing ? '🔄 Testing connection…' : '🔗 Test Connection'}
            </button>
            {testResult==='success' && (
              <div style={{background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#166534', marginBottom:12}}>
                ✅ Connected! Click below to save and continue.
              </div>
            )}
            {testResult && testResult!=='success' && (
              <div style={{background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991B1B', marginBottom:12}}>
                ❌ {testResult==='fail_network' ? 'Network error — check the URL is exactly as shown in Supabase' : `Error ${testResult.replace('fail_','')} — check your anon key`}
              </div>
            )}
            {testResult==='success' && (
              <button onClick={()=>setStep(3)} style={{width:'100%', background:'#C8860A', color:'white', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer'}}>
                Save & continue →
              </button>
            )}
            <button onClick={()=>setStep(1)} style={{width:'100%', background:'none', border:'none', color:'#8B6B4A', fontSize:12, cursor:'pointer', marginTop:8}}>← Back</button>
          </div>
        )}

        {step===3 && (
          <div style={card}>
            <h2 style={{fontSize:17, fontWeight:700, marginBottom:8, color:'#1A0F0A'}}>Step 3 — Save credentials to your site</h2>
            <p style={{fontSize:13, color:'#6B5B4E', lineHeight:1.7, marginBottom:16}}>
              Copy the code below, then open <strong>public/config.js</strong> in your GitHub repo and paste it in, replacing what's there. Commit → Netlify redeploys automatically.
            </p>
            <div style={{background:'#1C1C1E', borderRadius:8, padding:'12px 14px', fontFamily:'monospace', fontSize:11, color:'#E5E5EA', lineHeight:1.8, marginBottom:16, userSelect:'text', WebkitUserSelect:'text', overflowX:'auto'}}>
              {`window.__BRQ_CONFIG__ = {\n  url: '${url}',\n  key: '${key}'\n};`}
            </div>
            <button onClick={async()=>{ const ok=await copyText(`window.__BRQ_CONFIG__ = {\n  url: '${url}',\n  key: '${key}'\n};`); alert(ok?'Copied! Now paste into public/config.js on GitHub':'Select and copy the text above manually'); }}
              style={{width:'100%', background:'#C8860A', color:'white', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:10}}>
              📋 Copy config code
            </button>
            <div style={{background:'#FFF8EC', border:'1px solid #F0D080', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#78501A', lineHeight:1.6}}>
              <strong>After pasting and committing:</strong> wait 2 min for Netlify to redeploy, then refresh this page — it will load normally.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════ */
export default function App() {
  if (!isConfigured) return <SetupScreen />;

  const [items,   setItems]   = useState([]);
  const [users,   setUsers]   = useState([]);
  const [stores,  setStores]  = useState([]);
  const [audit,   setAudit]   = useState([]);
  const [session, setSession] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('brq_v2_session'));
      return s?.id ? s : null;
    } catch { return null; }
  });
  const [dbReady,  setDbReady]  = useState(false);
  const [tab,      setTab]      = useState('overview');
  const [catF,     setCatF]     = useState('all');
  const [storeF,   setStoreF]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('status');
  const [modal,    setModal]    = useState(null); // 'add'|'edit'|'share'|'users'|'audit'|'meals'|'restock-confirm'|'delete-confirm'|'consume'|'store-trip'
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({...BLANK_ITEM});
  const [dupWarn,  setDupWarn]  = useState(null);
  const [shareMode,setShareMode]= useState('shopping');
  const [shareSt,  setShareSt]  = useState('all');
  const [aiMeals,  setAiMeals]  = useState(null);
  const [aiLoad,   setAiLoad]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [restockQty, setRestockQty] = useState('');
  const [consumeItem, setConsumeItem] = useState(null);
  const [consumeAmt, setConsumeAmt] = useState(1);
  const [newStore, setNewStore] = useState('');
  const [addUOpen, setAddUOpen] = useState(false);
  const [newUser, setNewUser]   = useState({name:'',emoji:'👤',role:'family'});
  const [auditFilter, setAuditFilter] = useState('all');
  const [tripStore, setTripStore] = useState(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const notify = useCallback((msg, type='success') => {
    setToast({msg,type});
    setTimeout(()=>setToast(null), 3200);
  },[]);

  // FIX #2: log always reads from ref so it's never stale
  const log = useCallback(async (action, detail) => {
    if (!supabase) return;
    const u = sessionRef.current;
    const entry = { user_id: u?.id||'unknown', user_name: u?.name||'Unknown', action, detail };
    try {
      const { data } = await supabase.from('brq_audit').insert(entry).select().single();
      if (data) setAudit(prev => [data, ...prev].slice(0, 500));
    } catch {}
  },[]);

  // Initial load
  useEffect(()=>{
    if (!supabase) return;
    (async()=>{
      try {
        const [iR, uR, sR, aR] = await Promise.all([
          supabase.from('brq_items').select('*').order('name'),
          supabase.from('brq_users').select('*').order('created_at'),
          supabase.from('brq_stores').select('*').order('name'),
          supabase.from('brq_audit').select('*').order('created_at',{ascending:false}).limit(500),
        ]);
        if (iR.error) throw iR.error;
        setItems((iR.data||[]).map(mapItem));
        setUsers(uR.data||[]);
        setStores((sR.data||[]).map(s=>s.name));
        setAudit(aR.data||[]);
        setDbReady(true);
      } catch(e) {
        notify('Could not load data: '+e.message,'error');
      }
    })();
  },[notify]);

  // Sync session with latest user data (FIX #13)
  useEffect(()=>{
    if (!session || !users.length) return;
    const fresh = users.find(u=>u.id===session.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(session)) {
      setSession(fresh);
      localStorage.setItem('brq_v2_session', JSON.stringify(fresh));
    }
  },[users, session]);

  // Realtime (FIX #2: starts only after dbReady)
  useEffect(()=>{
    if (!supabase || !dbReady) return;
    const ch = supabase.channel('brq_v2_rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'brq_items'}, p=>{
        if (p.eventType==='INSERT') setItems(prev=>[...prev,mapItem(p.new)].sort((a,b)=>a.name.localeCompare(b.name)));
        else if (p.eventType==='UPDATE') setItems(prev=>prev.map(i=>i.id===p.new.id?mapItem(p.new):i));
        else if (p.eventType==='DELETE') setItems(prev=>prev.filter(i=>i.id!==p.old.id));
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'brq_stores'},()=>{
        supabase.from('brq_stores').select('*').order('name').then(({data})=>{ if(data) setStores(data.map(s=>s.name)); });
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'brq_users'},()=>{
        supabase.from('brq_users').select('*').order('created_at').then(({data})=>{ if(data) setUsers(data); });
      })
      .subscribe();
    return ()=>supabase.removeChannel(ch);
  },[dbReady]);

  // Derived
  const critical = useMemo(()=>items.filter(i=>itemStatus(i)==='critical'),[items]);
  const low      = useMemo(()=>items.filter(i=>itemStatus(i)==='low'),[items]);

  const visCrit = useMemo(()=>storeF==='all'?critical:critical.filter(i=>i.store===storeF),[critical,storeF]);
  const visLow  = useMemo(()=>storeF==='all'?low:low.filter(i=>i.store===storeF),[low,storeF]);

  // FIX #18: overview respects store filter
  const filteredForOverview = useMemo(()=>storeF==='all'?items:items.filter(i=>i.store===storeF),[items,storeF]);

  const filtered = useMemo(()=>{
    let l = [...items];
    if (catF!=='all')   l=l.filter(i=>i.category===catF);
    if (storeF!=='all') l=l.filter(i=>i.store===storeF);
    if (search)         l=l.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.notes.toLowerCase().includes(search.toLowerCase()));
    const ord={critical:0,low:1,good:2};
    if (sortBy==='status')  l.sort((a,b)=>ord[itemStatus(a)]-ord[itemStatus(b)]);
    if (sortBy==='name')    l.sort((a,b)=>a.name.localeCompare(b.name));
    if (sortBy==='restock') l.sort((a,b)=>new Date(a.restockDate||'2099')-new Date(b.restockDate||'2099'));
    if (sortBy==='store')   l.sort((a,b)=>(a.store||'').localeCompare(b.store||''));
    return l;
  },[items,catF,storeF,search,sortBy]);

  const isAdmin = session?.role==='admin';
  const canEdit = session?.role==='admin' || session?.role==='chef';

  // Duplicate check
  const checkDup = (name, excludeId=null) =>
    items.find(i=>i.name.trim().toLowerCase()===name.trim().toLowerCase()&&i.id!==excludeId);

  // Save item
  const saveItem = async()=>{
    if (!formData.name.trim()) { notify('Item name is required','error'); return; }
    const dup = checkDup(formData.name, editItem?.id);
    if (dup) { setDupWarn(dup); return; }
    setSaving(true);
    try {
      if (editItem) {
        const old = items.find(i=>i.id===editItem.id);
        const {error}=await supabase.from('brq_items').update(toRow(formData)).eq('id',editItem.id);
        if (error) throw error;
        log('EDIT',`"${formData.name}" qty ${old?.qty}→${formData.qty} ${formData.unit}`);
        notify('Updated ✓');
      } else {
        const {error}=await supabase.from('brq_items').insert(toRow(formData));
        if (error) throw error;
        log('ADD',`"${formData.name}" ${formData.qty} ${formData.unit} @ ${formData.store}`);
        notify('Added ✓');
      }
      setModal(null); setEditItem(null); setFormData({...BLANK_ITEM}); setDupWarn(null);
    } catch(e) { notify(e.message||'Save failed','error'); }
    setSaving(false);
  };

  // FIX #6: delete with confirmation
  const confirmDelete = item => { setPendingAction({type:'delete',item}); setModal('delete-confirm'); };
  const doDelete = async()=>{
    const item = pendingAction.item;
    const {error}=await supabase.from('brq_items').delete().eq('id',item.id);
    if (error) { notify('Delete failed','error'); return; }
    log('DELETE',`"${item.name}"`);
    notify('Removed','info');
    setModal(null); setPendingAction(null);
  };

  // FIX #16 + #8: restock with qty input + smart date
  const openRestock = item => { setPendingAction({type:'restock',item}); setRestockQty(String(item.restockAt*5)); setModal('restock-confirm'); };
  const doRestock = async()=>{
    const item = pendingAction.item;
    const qty = parseFloat(restockQty);
    if (!qty || qty <= 0) { notify('Enter a valid quantity','error'); return; }
    const days = smartRestockDays(item);
    const {error}=await supabase.from('brq_items').update({
      qty, last_restocked: fmtD(today()), restock_date: dL(days), updated_at: nowISO()
    }).eq('id',item.id);
    if (error) { notify('Update failed','error'); return; }
    log('RESTOCK',`"${item.name}" → ${qty} ${item.unit}`);
    notify('Restocked ✓');
    setModal(null); setPendingAction(null);
  };

  // FIX #17: quick consume (−1 or custom)
  const openConsume = item => { setConsumeItem(item); setConsumeAmt(1); setModal('consume'); };
  const doConsume = async()=>{
    const newQty = Math.max(0, consumeItem.qty - consumeAmt);
    const {error}=await supabase.from('brq_items').update({qty:newQty, updated_at:nowISO()}).eq('id',consumeItem.id);
    if (error) { notify('Update failed','error'); return; }
    log('CONSUME',`"${consumeItem.name}" −${consumeAmt} → ${newQty} ${consumeItem.unit}`);
    notify(`−${consumeAmt} recorded`);
    setModal(null); setConsumeItem(null);
  };

  // FIX #22: mark all from store as restocked
  const openStoreTrip = store => { setTripStore(store); setModal('store-trip'); };
  const doStoreTrip = async items2restock => {
    for (const item of items2restock) {
      const days = smartRestockDays(item);
      await supabase.from('brq_items').update({
        qty: item.restockAt*5, last_restocked: fmtD(today()), restock_date: dL(days), updated_at: nowISO()
      }).eq('id',item.id);
    }
    log('STORE_TRIP',`${tripStore} — ${items2restock.length} items restocked`);
    notify(`${items2restock.length} items marked restocked ✓`);
    setModal(null); setTripStore(null);
  };

  // Store add
  const addStore = async()=>{
    const s = newStore.trim();
    if (!s || stores.includes(s)) { notify(stores.includes(s)?'Store exists':'Enter a name','error'); return; }
    const {error}=await supabase.from('brq_stores').insert({name:s});
    if (error) { notify('Failed','error'); return; }
    setNewStore(''); notify(`"${s}" added ✓`); log('ADD_STORE',s);
  };

  // User add / remove
  const addUser = async()=>{
    if (!newUser.name.trim()) return;
    const colorIdx = users.length % USER_COLORS.length;
    const u = {...newUser, id:Date.now().toString(), color:USER_COLORS[colorIdx]};
    const {error}=await supabase.from('brq_users').insert(u);
    if (error) { notify('Failed','error'); return; }
    setNewUser({name:'',emoji:'👤',role:'family'}); setAddUOpen(false);
    notify('Member added ✓'); log('ADD_USER',u.name);
  };
  const removeUser = async id=>{
    const u=users.find(x=>x.id===id);
    const {error}=await supabase.from('brq_users').delete().eq('id',id);
    if (error) { notify('Failed','error'); return; }
    notify('Removed','info'); log('REMOVE_USER',u?.name);
  };

  // Share text
  const shareCrit = useMemo(()=>shareSt==='all'?critical:critical.filter(i=>i.store===shareSt),[critical,shareSt]);
  const shareLow  = useMemo(()=>shareSt==='all'?low:low.filter(i=>i.store===shareSt),[low,shareSt]);
  const shareAllItems = useMemo(()=>shareSt==='all'?items:items.filter(i=>i.store===shareSt),[items,shareSt]);
  const shareText = useMemo(()=>
    shareMode==='shopping' ? buildListText(shareCrit,shareLow,shareSt==='all'?'All Stores':shareSt)
                           : buildFullText(shareAllItems,shareSt==='all'?'All Stores':shareSt),
  [shareMode,shareCrit,shareLow,shareAllItems,shareSt]);

  const doCopy = async()=>{
    const ok = await copyText(shareText);
    notify(ok?'📋 Copied! Paste into WhatsApp or Notes':'Long-press text above to copy manually', ok?'success':'info');
    if (ok) log('SHARE_COPY', shareSt==='all'?'All':shareSt);
  };

  // AI Meal Suggestions — with correct anthropic-version header
  const getAIMeals = async()=>{
    setAiLoad(true);
    try {
      const stocked = items.filter(i=>itemStatus(i)!=='critical').map(i=>i.name).join(', ');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true',
        },
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          messages:[{
            role:'user',
            content:`Nigerian Muslim woman. Pantry available: ${stocked}. Give 4 halal Nigerian meal ideas using these ingredients. Return ONLY a JSON array, no markdown, no explanation: [{"name":"","ingredients":[],"steps":"","time":""}]`
          }]
        })
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const txt = (data.content||[]).map(c=>c.text||'').join('').replace(/```json|```/g,'').trim();
      setAiMeals(JSON.parse(txt));
    } catch(e) {
      notify('Meal suggestions unavailable — '+e.message,'error');
    }
    setAiLoad(false);
  };

  // Audit filter
  const filteredAudit = useMemo(()=>
    auditFilter==='all' ? audit : audit.filter(a=>a.action===auditFilter||a.user_name===auditFilter),
  [audit,auditFilter]);

  // Loading / not-ready states
  if (!dbReady && isConfigured) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'linear-gradient(160deg,#1A0F0A,#3D2010)',flexDirection:'column',gap:14}}>
      <div style={{fontSize:52,animation:'p 1.2s ease-in-out infinite'}}>🏡</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:'#D4B896'}}>Loading pantry…</div>
      <div style={{fontFamily:'Inter,sans-serif',fontSize:12,color:'#8B6B4A'}}>Connecting to database</div>
      <style>{`@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );

  // Login screen
  if (!session) return (
    <div style={{fontFamily:'Inter,sans-serif',background:'linear-gradient(160deg,#1A0F0A 0%,#3D2010 55%,#6B3C18 100%)',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{background:'#FAF7F4',borderRadius:24,padding:'32px 24px',maxWidth:400,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,.4)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:52,marginBottom:10}}>🏡</div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:'#1A0F0A',marginBottom:4}}>Bayt Al-Rizq</h1>
          <p style={{fontSize:12,color:'#8B6B4A',letterSpacing:'.08em',textTransform:'uppercase'}}>Household Pantry Tracker</p>
        </div>
        <div style={{background:'#FFFBF5',border:'1px solid #E8D8B8',borderRadius:12,padding:'10px 14px',marginBottom:20,fontSize:12,color:'#6B4C18',lineHeight:1.6}}>
          <strong>📱 Multi-device:</strong> Select your name. Changes sync live to every device in the household.
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {users.map(u=>(
            <button key={u.id} onClick={()=>{ const fresh=users.find(x=>x.id===u.id)||u; setSession(fresh); localStorage.setItem('brq_v2_session',JSON.stringify(fresh)); log('LOGIN',fresh.name); }}
              style={{background:'white',border:`2px solid ${u.color||'#D4C4A8'}`,borderRadius:14,padding:'14px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:14,transition:'all .15s',WebkitTapHighlightColor:'transparent'}}>
              <div style={{width:44,height:44,borderRadius:22,background:`${u.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{u.emoji}</div>
              <div style={{textAlign:'left',flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:'#1A0F0A'}}>{u.name}</div>
                <div style={{fontSize:12,color:'#8B6B4A',marginTop:1}}>{u.role==='admin'?'Admin · Full access':u.role==='chef'?'Chef · View, restock & consume':'Family · View & restock'}</div>
              </div>
              <div style={{width:28,height:28,borderRadius:14,background:u.color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:14,flexShrink:0}}>→</div>
            </button>
          ))}
        </div>
        <p style={{fontSize:11,color:'#B0906A',marginTop:18,textAlign:'center'}}>Ask OmoD to add you if you're not listed</p>
      </div>
    </div>
  );

  // Category stats (FIX #18 — respects store filter)
  const catStats = CATS.map(c=>({
    ...c,
    total:filteredForOverview.filter(i=>i.category===c.id).length,
    crit:filteredForOverview.filter(i=>i.category===c.id&&itemStatus(i)==='critical').length,
    low:filteredForOverview.filter(i=>i.category===c.id&&itemStatus(i)==='low').length,
  })).filter(c=>c.total>0);

  const storeStats = stores.map(s=>({
    name:s,
    its:items.filter(i=>i.store===s),
    crit:items.filter(i=>i.store===s&&itemStatus(i)==='critical'),
    low:items.filter(i=>i.store===s&&itemStatus(i)==='low'),
  })).filter(s=>s.its.length>0);

  // FIX #19: shopping badge count
  const shoppingBadge = critical.length + low.length;

  const T = { fontFamily:'Inter,sans-serif' }; // base text style
  const PD = { fontFamily:"'Playfair Display',serif" };

  /* ── TABS CONFIG ── */
  const TABS = [
    {id:'overview', label:'Overview',  icon:'◉'},
    {id:'inventory',label:'Inventory', icon:'▤'},
    {id:'shopping', label:`Shop${shoppingBadge?` (${shoppingBadge})`:''}`, icon:'◎'},
    {id:'stores',   label:'By Store',  icon:'◈'},
    {id:'timeline', label:'Timeline',  icon:'◷'},
  ];

  return (
    <div style={{...T, background:'#FAF7F4', minHeight:'100vh', color:'#1A0F0A', paddingBottom:80}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        input,select{font-family:Inter,sans-serif;border:1.5px solid #E0D4C4;border-radius:10px;padding:10px 12px;font-size:14px;color:#1A0F0A;background:white;outline:none;width:100%;-webkit-appearance:none}
        input:focus,select:focus{border-color:#C8860A;box-shadow:0 0 0 3px #C8860A20}
        button{cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:Inter,sans-serif}
        button:active{opacity:.75;transform:scale(.98)}
        .mo{background:#FAF7F4;border-radius:24px 24px 0 0;padding:20px 18px 48px;width:100%;max-width:580px;max-height:92vh;overflow-y:auto}
        .ov{position:fixed;inset:0;background:rgba(15,10,5,.6);z-index:200;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)}
        .pill{padding:6px 14px;border-radius:20px;border:1.5px solid #E0D4C4;background:white;font-size:12px;font-weight:600;color:#6B5B4E;white-space:nowrap}
        .pill.on{background:#C8860A;color:white;border-color:#C8860A}
        .pill:active{opacity:.7}
        .irow{background:white;border-radius:16px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #F0E8DC}
        .btn-p{background:#C8860A;color:white;border:none;border-radius:12px;padding:11px 18px;font-size:14px;font-weight:600}
        .btn-g{background:#2E7D5A;color:white;border:none;border-radius:12px;padding:11px 18px;font-size:14px;font-weight:600}
        .btn-r{background:#DC2626;color:white;border:none;border-radius:12px;padding:11px 18px;font-size:14px;font-weight:600}
        .btn-ghost{background:none;border:1.5px solid #E0D4C4;color:#6B5B4E;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:600}
        .btn-sm{padding:6px 12px;border-radius:8px;border:none;font-size:11px;font-weight:600}
        .sx{overflow-x:auto;display:flex;gap:7px;padding-bottom:4px;scrollbar-width:none}
        .sx::-webkit-scrollbar{display:none}
        .fl{font-size:11px;font-weight:600;color:#8B6B4A;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px;margin-top:14px}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#C8860A40;border-radius:2px}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{background:'linear-gradient(135deg,#1A0F0A 0%,#3D2010 100%)',padding:'env(safe-area-inset-top,12px) 14px 12px',position:'sticky',top:0,zIndex:100}}>
        <div style={{maxWidth:940,margin:'0 auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:18,background:'rgba(200,134,10,.25)',border:'1.5px solid #C8860A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🏡</div>
              <div>
                <div style={{...PD,fontSize:16,fontWeight:700,color:'white',lineHeight:1}}>Bayt Al-Rizq</div>
                <div style={{fontSize:10,color:'#B09070',marginTop:2,letterSpacing:'.06em'}}>
                  {session.name} · <span style={{color:'#4ADE80'}}>● LIVE</span>
                </div>
              </div>
            </div>
            {/* FIX #15: compact action bar */}
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>setModal('share')} style={{background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.18)',color:'white',borderRadius:9,padding:'6px 10px',fontSize:11,fontWeight:600}}>📤</button>

              {isAdmin && (
                <button onClick={()=>setModal('settings')} style={{background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.18)',color:'white',borderRadius:9,padding:'6px 10px',fontSize:11,fontWeight:600}}>⚙️</button>
              )}
              {isAdmin && <button onClick={()=>{ setEditItem(null); setFormData({...BLANK_ITEM}); setDupWarn(null); setModal('add'); }} className="btn-p" style={{padding:'6px 12px',fontSize:11,borderRadius:9}}>+ Add</button>}
              <button onClick={()=>{setSession(null);localStorage.removeItem('brq_v2_session');}} style={{background:'none',border:'none',color:'#8B6B4A',fontSize:18,padding:'4px 6px'}}>↩</button>
            </div>
          </div>
          {/* Critical alert banner */}
          {critical.length>0 && (
            <div onClick={()=>setTab('shopping')} style={{marginTop:10,background:'rgba(220,38,38,.2)',border:'1px solid rgba(220,38,38,.4)',borderRadius:10,padding:'8px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <span style={{fontSize:14}}>🔴</span>
              <span style={{fontSize:12,color:'#FECACA',fontWeight:500}}>
                <strong>{critical.length} items need restocking now</strong> — tap to view shopping list
              </span>
              <span style={{marginLeft:'auto',color:'#FECACA',fontSize:14}}>›</span>
            </div>
          )}
        </div>
      </div>

      {/* ── STORE FILTER ── */}
      <div style={{background:'white',borderBottom:'1px solid #F0E8DC',padding:'8px 16px'}}>
        <div className="sx" style={{maxWidth:940,margin:'0 auto'}}>
          <button className={`pill ${storeF==='all'?'on':''}`} onClick={()=>setStoreF('all')}>All Stores</button>
          {stores.map(s=><button key={s} className={`pill ${storeF===s?'on':''}`} onClick={()=>setStoreF(s)}>{s}</button>)}
        </div>
      </div>

      {/* ── BOTTOM TAB BAR ── */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:'white',borderTop:'1px solid #F0E8DC',display:'flex',padding:'8px 0 env(safe-area-inset-bottom,8px)',boxShadow:'0 -4px 20px rgba(0,0,0,.08)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,background:'none',border:'none',display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'4px 2px',
              color:tab===t.id?'#C8860A':'#8B6B4A'}}>
            <span style={{fontSize:16}}>{t.icon}</span>
            <span style={{fontSize:9,fontWeight:tab===t.id?700:500,letterSpacing:'.03em'}}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{maxWidth:940,margin:'0 auto',padding:'16px 14px'}}>

        {/* ══ OVERVIEW ══ */}
        {tab==='overview' && (
          <div>
            {/* Summary cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
              {[
                {l:'Total',v:filteredForOverview.length,c:'#B87333',bg:'#FFF8F0'},
                {l:'Stocked',v:filteredForOverview.filter(i=>itemStatus(i)==='good').length,c:'#2E7D5A',bg:'#F0FDF4'},
                {l:'Low',v:filteredForOverview.filter(i=>itemStatus(i)==='low').length,c:'#D97706',bg:'#FFFBEB'},
                {l:'Critical',v:filteredForOverview.filter(i=>itemStatus(i)==='critical').length,c:'#DC2626',bg:'#FEF2F2'},
              ].map(s=>(
                <div key={s.l} style={{background:s.bg,borderRadius:14,padding:'12px 10px',border:`1.5px solid ${s.c}30`,textAlign:'center'}}>
                  <div style={{...PD,fontSize:24,fontWeight:700,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:10,color:s.c,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{...PD,fontSize:17,fontWeight:700,marginBottom:12}}>Categories {storeF!=='all'?`· ${storeF}`:''}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
              {catStats.map(cat=>(
                <div key={cat.id} onClick={()=>{setCatF(cat.id);setTab('inventory');}}
                  style={{background:'white',borderRadius:14,padding:'14px',cursor:'pointer',border:`1.5px solid ${cat.crit>0?'#FECACA':cat.low>0?'#FEF3C7':'#F0E8DC'}`,
                    boxShadow:'0 1px 4px rgba(0,0,0,.05)',transition:'all .15s'}}>
                  <div style={{fontSize:24,marginBottom:8}}>{cat.icon}</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1A0F0A',lineHeight:1.3,marginBottom:6}}>{cat.label}</div>
                  <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:'#8B6B4A'}}>{cat.total}</span>
                    {cat.crit>0&&<span style={{background:'#DC2626',color:'white',borderRadius:6,padding:'1px 6px',fontSize:10,fontWeight:700}}>{cat.crit} critical</span>}
                    {cat.crit===0&&cat.low>0&&<span style={{background:'#D97706',color:'white',borderRadius:6,padding:'1px 6px',fontSize:10,fontWeight:700}}>{cat.low} low</span>}
                  </div>
                  <div style={{height:4,background:'#F0E8DC',borderRadius:2,marginTop:8,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:2,
                      background:cat.crit>0?'#DC2626':cat.low>0?'#D97706':cat.color,
                      width:`${Math.max(6,100-((cat.crit+cat.low)/cat.total)*100)}%`}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ INVENTORY ══ */}
        {tab==='inventory' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
              <div style={{flex:1,minWidth:160,position:'relative'}}>
                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:15}}>🔍</span>
                <input placeholder="Search items or notes…" value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:34}}/>
              </div>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{width:'auto',minWidth:130}}>
                <option value="status">Sort: Status</option>
                <option value="name">Sort: A–Z</option>
                <option value="restock">Sort: Restock Date</option>
                <option value="store">Sort: Store</option>
              </select>
            </div>
            <div className="sx" style={{marginBottom:12}}>
              <button className={`pill ${catF==='all'?'on':''}`} onClick={()=>setCatF('all')}>All ({items.filter(i=>storeF==='all'||i.store===storeF).length})</button>
              {CATS.map(c=>{const n=items.filter(i=>i.category===c.id&&(storeF==='all'||i.store===storeF)).length;if(!n)return null;return(
                <button key={c.id} className={`pill ${catF===c.id?'on':''}`} onClick={()=>setCatF(c.id)}>{c.icon} {c.label}</button>
              );})}
            </div>
            <div style={{fontSize:11,color:'#8B6B4A',marginBottom:10,fontWeight:500}}>{filtered.length} items shown</div>

            {filtered.map(item=>{
              const s=itemStatus(item);
              const cat=CATS.find(c=>c.id===item.category);
              const dl=item.restockDate?Math.ceil((new Date(item.restockDate)-today())/864e5):null;
              const pct=Math.min(100,Math.max(4,(item.qty/(Math.max(item.restockAt*5,item.qty+1)))*100));
              return (
                <div key={item.id} className="irow" style={{borderLeft:`4px solid ${SC[s]}`}}>
                  <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`${SC[s]}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{cat?.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:2}}>
                        <span style={{...PD,fontSize:15,fontWeight:700}}>{item.name}</span>
                        {item.halal&&<span style={{fontSize:9,background:'#F0FDF4',color:'#166534',border:'1px solid #86EFAC',borderRadius:5,padding:'1px 5px',fontWeight:700}}>HALAL</span>}
                        <span style={{fontSize:10,background:SB[s],color:SC[s],borderRadius:6,padding:'1px 7px',fontWeight:700,marginLeft:'auto'}}>{SL[s]}</span>
                      </div>
                      <div style={{fontSize:11,color:'#8B6B4A',marginBottom:6}}>
                        🏪 {item.store}{item.notes?` · ${item.notes}`:''}
                        {dl!==null&&<span style={{marginLeft:8,color:dl<=3?'#DC2626':'#8B6B4A'}}>{dl<=0?'⚠️ Overdue':`· ${dl}d`}</span>}
                      </div>
                      <div style={{height:4,background:'#F0E8DC',borderRadius:2,marginBottom:8}}>
                        <div style={{height:'100%',borderRadius:2,background:SC[s],width:`${pct}%`,transition:'width .4s'}}/>
                      </div>
                      {/* Action row */}
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                          <span style={{...PD,fontSize:18,fontWeight:700,color:SC[s]}}>{item.qty}</span>
                          <span style={{fontSize:11,color:'#8B6B4A'}}>{item.unit}</span>
                        </div>
                        {/* FIX #17: consume stepper */}
                        {canEdit&&(
                          <button onClick={()=>openConsume(item)} className="btn-sm" style={{background:'#F5F0EA',color:'#6B5B4E',border:'1px solid #E0D4C4'}}>−use</button>
                        )}
                        {canEdit&&(
                          <button onClick={()=>openRestock(item)} className="btn-sm" style={{background:SC[s],color:'white'}}>✓ Restock</button>
                        )}
                        {isAdmin&&(
                          <button onClick={()=>{setEditItem(item);setFormData({...item});setDupWarn(null);setModal('add');}} className="btn-sm" style={{background:'#F5F0EA',color:'#6B5B4E',border:'1px solid #E0D4C4'}}>Edit</button>
                        )}
                        {isAdmin&&(
                          <button onClick={()=>confirmDelete(item)} className="btn-sm" style={{background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA'}}>Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!filtered.length&&<div style={{textAlign:'center',padding:'48px 20px',color:'#8B6B4A'}}>
              <div style={{fontSize:36,marginBottom:8}}>📭</div>
              <div style={{fontWeight:600}}>No items match your filters</div>
            </div>}
          </div>
        )}

        {/* ══ SHOPPING ══ */}
        {tab==='shopping' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{...PD,fontSize:19,fontWeight:700}}>Shopping List</div>
                <div style={{fontSize:12,color:'#8B6B4A'}}>{storeF!=='all'?storeF:'All stores'} · {visCrit.length+visLow.length} items</div>
              </div>
              <button onClick={()=>setModal('share')} className="btn-p" style={{padding:'9px 16px',fontSize:13}}>📤 Share</button>
            </div>

            {['critical','low'].map(level=>{
              const its = level==='critical'?visCrit:visLow;
              if (!its.length) return null;
              const grouped = {};
              CATS.forEach(c=>{ const ci=its.filter(i=>i.category===c.id); if(ci.length) grouped[c.id]={cat:c,items:ci}; });
              return (
                <div key={level} style={{marginBottom:16}}>
                  <div style={{background:level==='critical'?'#FEF2F2':'#FFFBEB',border:`1.5px solid ${level==='critical'?'#FECACA':'#FDE68A'}`,borderRadius:16,padding:16}}>
                    <div style={{...PD,fontSize:15,fontWeight:700,color:level==='critical'?'#991B1B':'#92400E',marginBottom:12}}>
                      {level==='critical'?'🔴 Restock Immediately':'🟡 Order Soon'} ({its.length})
                    </div>
                    {Object.values(grouped).map(({cat,items:ci})=>(
                      <div key={cat.id} style={{marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'#8B6B4A',marginBottom:6}}>{cat.icon} {cat.label}</div>
                        {ci.map(item=>{
                          const dl=item.restockDate?Math.ceil((new Date(item.restockDate)-today())/864e5):null;
                          return (
                            <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${level==='critical'?'#FECACA':'#FDE68A'}`,gap:8,flexWrap:'wrap'}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600}}>{item.name}</div>
                                <div style={{fontSize:11,color:'#8B6B4A'}}>🏪 {item.store}{dl!==null&&dl<=7?` · ${dl<=0?'overdue':`${dl}d`}`:''}</div>
                              </div>
                              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                <span style={{fontSize:11,color:level==='critical'?'#991B1B':'#92400E',fontWeight:600}}>{item.qty} {item.unit}</span>
                                {canEdit&&<button onClick={()=>openRestock(item)} className="btn-sm" style={{background:'#2E7D5A',color:'white'}}>✓ Done</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!visCrit.length&&!visLow.length&&(
              <div style={{textAlign:'center',padding:'56px 20px',color:'#2E7D5A'}}>
                <div style={{fontSize:44,marginBottom:12}}>✅</div>
                <div style={{...PD,fontSize:20,marginBottom:6}}>All stocked up!</div>
                <div style={{fontSize:13,color:'#8B6B4A'}}>Alhamdulillah — no urgent restocks needed{storeF!=='all'?` at ${storeF}`:''}</div>
              </div>
            )}
          </div>
        )}

        {/* ══ BY STORE ══ */}
        {tab==='stores' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
              <div style={{...PD,fontSize:19,fontWeight:700}}>By Store</div>
              {isAdmin&&(
                <div style={{display:'flex',gap:6}}>
                  <input value={newStore} onChange={e=>setNewStore(e.target.value)} placeholder="New store…" style={{maxWidth:150,fontSize:13}} onKeyDown={e=>e.key==='Enter'&&addStore()}/>
                  <button onClick={addStore} className="btn-g" style={{padding:'9px 14px',fontSize:13}}>+ Add</button>
                </div>
              )}
            </div>
            {storeStats.map(s=>(
              <div key={s.name} style={{background:'white',borderRadius:16,padding:16,marginBottom:12,border:`1.5px solid ${s.crit.length?'#FECACA':s.low.length?'#FDE68A':'#F0E8DC'}`,boxShadow:'0 1px 4px rgba(0,0,0,.05)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10,flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{...PD,fontSize:16,fontWeight:700}}>🏪 {s.name}</div>
                    <div style={{fontSize:11,color:'#8B6B4A',marginTop:2}}>{s.its.length} items assigned</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {s.crit.length>0&&<span style={{background:'#FEF2F2',color:'#DC2626',padding:'3px 9px',borderRadius:8,fontSize:11,fontWeight:700}}>🔴 {s.crit.length}</span>}
                    {s.low.length>0&&<span style={{background:'#FFFBEB',color:'#D97706',padding:'3px 9px',borderRadius:8,fontSize:11,fontWeight:700}}>🟡 {s.low.length}</span>}
                    <button onClick={async()=>{const ok=await copyText(buildListText(s.crit,s.low,s.name));notify(ok?'📋 Copied!':'Try again','success');}} className="btn-sm" style={{background:'#F5F0EA',color:'#6B5B4E',border:'1px solid #E0D4C4'}}>📋 Copy</button>
                    {canEdit&&s.its.length>0&&(
                      <button onClick={()=>openStoreTrip(s.name)} className="btn-sm" style={{background:'#2E7D5A',color:'white'}}>✓ Trip done</button>
                    )}
                  </div>
                </div>
                {[...s.crit,...s.low].length>0&&(
                  <div style={{background:'#FAF7F4',borderRadius:10,padding:'8px 12px'}}>
                    {[...s.crit,...s.low].map(item=>(
                      <div key={item.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid #F0E8DC'}}>
                        <span>{item.name}</span>
                        <span style={{color:SC[itemStatus(item)],fontWeight:600}}>{item.qty} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ TIMELINE ══ */}
        {tab==='timeline' && (
          <div>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:4}}>Restock Timeline</div>
            <div style={{fontSize:12,color:'#8B6B4A',marginBottom:16}}>Plan your shopping trips ahead</div>
            {['This Week','Next Week','This Month','Later'].map(period=>{
              const ranges={'This Week':[0,7],'Next Week':[7,14],'This Month':[14,30],'Later':[30,999]};
              const [mn,mx]=ranges[period];
              // FIX #11: include items with no restockDate in the 'This Week' bucket
              const pi=items.filter(i=>{
                if (!i.restockDate) return period==='This Week'; // no date = treat as urgent
                const d=Math.ceil((new Date(i.restockDate)-today())/864e5);
                return !isNaN(d)&&d>=mn&&d<mx&&(storeF==='all'||i.store===storeF);
              }).sort((a,b)=>new Date(a.restockDate||'2000')-new Date(b.restockDate||'2000'));
              if (!pi.length) return null;
              return (
                <div key={period} style={{marginBottom:20}}>
                  <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#C8860A',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                    {period} <span style={{background:'#C8860A20',color:'#C8860A',borderRadius:10,padding:'1px 8px'}}>{pi.length}</span>
                  </div>
                  {pi.map(item=>{
                    const cat=CATS.find(c=>c.id===item.category);
                    const s=itemStatus(item);
                    const dl=item.restockDate?Math.ceil((new Date(item.restockDate)-today())/864e5):0;
                    return (
                      <div key={item.id} style={{background:'white',borderRadius:12,padding:'12px 14px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,border:'1px solid #F0E8DC',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:20}}>{cat?.icon}</span>
                          <div>
                            <div style={{fontSize:13,fontWeight:600}}>{item.name}</div>
                            <div style={{fontSize:11,color:'#8B6B4A'}}>{item.qty} {item.unit} · {item.store}</div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <span style={{fontSize:12,color:dl<=3?'#DC2626':'#8B6B4A',fontWeight:500}}>{dl<=0?'Overdue':dl===1?'Tomorrow':`In ${dl}d`}</span>
                          <span style={{background:SB[s],color:SC[s],padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700}}>{SL[s]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* SHARE MODAL */}
      {modal==='share'&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:20,fontWeight:700,marginBottom:14}}>📤 Share & Export</div>
            {/* Mode toggle */}
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              <button onClick={()=>setShareMode('shopping')} style={{flex:1,padding:'9px',borderRadius:10,border:`2px solid ${shareMode==='shopping'?'#C8860A':'#E0D4C4'}`,background:shareMode==='shopping'?'#FFF8EC':'white',color:shareMode==='shopping'?'#C8860A':'#6B5B4E',fontSize:13,fontWeight:600}}>🛒 Shopping List</button>
              <button onClick={()=>setShareMode('full')} style={{flex:1,padding:'9px',borderRadius:10,border:`2px solid ${shareMode==='full'?'#C8860A':'#E0D4C4'}`,background:shareMode==='full'?'#FFF8EC':'white',color:shareMode==='full'?'#C8860A':'#6B5B4E',fontSize:13,fontWeight:600}}>📦 Full Inventory</button>
            </div>
            <span className="fl" style={{marginTop:0}}>Filter by store</span>
            <div className="sx" style={{marginBottom:12}}>
              <button className={`pill ${shareSt==='all'?'on':''}`} onClick={()=>setShareSt('all')} style={{fontSize:11}}>All</button>
              {stores.map(s=><button key={s} className={`pill ${shareSt===s?'on':''}`} onClick={()=>setShareSt(s)} style={{fontSize:11}}>{s}</button>)}
            </div>
            {/* Preview */}
            <div style={{background:'#1C1C1E',borderRadius:12,padding:'12px 14px',marginBottom:14,fontFamily:'monospace',fontSize:10,color:'#E5E5EA',lineHeight:1.8,whiteSpace:'pre-wrap',maxHeight:140,overflowY:'auto',userSelect:'text',WebkitUserSelect:'text'}}>
              {shareText}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={doCopy} className="btn-g" style={{padding:'14px',fontSize:15,borderRadius:14}}>
                <div>📋 Copy to Clipboard</div>
                <div style={{fontSize:11,opacity:.8,marginTop:3}}>Paste into WhatsApp, iMessage, Notes or Email</div>
              </button>
              <button onClick={()=>{ setModal('pdf-view'); }} className="btn-p" style={{padding:'14px',fontSize:15,borderRadius:14}}>
                <div>📄 View Formatted Report</div>
                <div style={{fontSize:11,opacity:.8,marginTop:3}}>Screenshot or print from browser</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF VIEW */}
      {modal==='pdf-view'&&(
        <div style={{position:'fixed',inset:0,background:'#FAF7F4',zIndex:300,overflowY:'auto'}}>
          <div style={{background:'#1A0F0A',padding:'12px 16px',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0}}>
            <button onClick={()=>setModal(null)} className="btn-p" style={{padding:'7px 14px',fontSize:12}}>← Back</button>
            <span style={{color:'#D4B896',fontSize:12,flex:1}}>Formatted Report · {shareSt==='all'?'All Stores':shareSt}</span>
            <button onClick={async()=>{const ok=await copyText(shareText);notify(ok?'📋 Copied!':'Try again');}} style={{background:'#C8860A',color:'white',border:'none',borderRadius:8,padding:'7px 12px',fontSize:12,fontWeight:600}}>📋 Copy</button>
            <button onClick={()=>window.print()} style={{background:'rgba(255,255,255,.15)',color:'white',border:'none',borderRadius:8,padding:'7px 10px',fontSize:12}}>🖨️</button>
          </div>
          <div style={{maxWidth:640,margin:'0 auto',padding:'20px 16px 60px'}}>
            <div style={{...PD,fontSize:22,marginBottom:4}}>🏡 Bayt Al-Rizq</div>
            <div style={{fontSize:11,color:'#8B6B4A',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:20}}>{shareMode==='full'?'Full Inventory':'Restock Report'} · {shareSt==='all'?'All Stores':shareSt} · {dateStr()}</div>
            {shareMode==='shopping'&&['critical','low'].map(level=>{
              const its=level==='critical'?shareCrit:shareLow;
              if (!its.length) return null;
              return (
                <div key={level} style={{background:'white',borderRadius:14,padding:16,marginBottom:14,borderLeft:`5px solid ${level==='critical'?'#DC2626':'#D97706'}`}}>
                  <div style={{...PD,fontSize:15,fontWeight:700,color:level==='critical'?'#991B1B':'#92400E',marginBottom:12}}>{level==='critical'?'🔴 Restock Now':'🟡 Order Soon'} ({its.length})</div>
                  {CATS.map(cat=>{const ci=its.filter(i=>i.category===cat.id);if(!ci.length)return null;return(
                    <div key={cat.id} style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:'#8B6B4A',marginBottom:5}}>{cat.icon} {cat.label}</div>
                      {ci.map(i=><div key={i.id} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid #F0E8DC'}}><span>{i.name}</span><span style={{color:SC[itemStatus(i)],fontWeight:700}}>{i.qty} {i.unit}</span></div>)}
                    </div>
                  );})}
                </div>
              );
            })}
            {shareMode==='full'&&CATS.map(cat=>{
              const ci=shareAllItems.filter(i=>i.category===cat.id);if(!ci.length)return null;
              return (
                <div key={cat.id} style={{background:'white',borderRadius:14,padding:16,marginBottom:14,borderLeft:`5px solid ${cat.color}`}}>
                  <div style={{...PD,fontSize:15,fontWeight:700,color:cat.color,marginBottom:10}}>{cat.icon} {cat.label} ({ci.length})</div>
                  {ci.map(i=>{const s=itemStatus(i);return(
                    <div key={i.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid #F0E8DC',alignItems:'center'}}>
                      <span>{s==='critical'?'🔴':s==='low'?'🟡':'✅'} {i.name}{i.store?<span style={{color:'#8B6B4A',fontSize:10}}> · {i.store}</span>:''}</span>
                      <span style={{color:SC[s],fontWeight:700,marginLeft:8}}>{i.qty} {i.unit}</span>
                    </div>
                  );})}
                </div>
              );
            })}
            <div style={{background:'white',borderRadius:14,padding:16,borderLeft:'5px solid #2E7D5A'}}>
              <div style={{...PD,fontSize:15,fontWeight:700,color:'#2E7D5A',marginBottom:8}}>✅ Summary</div>
              <div style={{fontSize:13}}>Total: <strong>{shareAllItems.length}</strong> &nbsp;·&nbsp; Critical: <strong style={{color:'#DC2626'}}>{shareCrit.length}</strong> &nbsp;·&nbsp; Low: <strong style={{color:'#D97706'}}>{shareLow.length}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT FORM */}
      {modal==='add'&&(
        <div className="ov" onClick={()=>{setModal(null);setEditItem(null);setFormData({...BLANK_ITEM});setDupWarn(null);}}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:14}}>{editItem?'Edit Item':'Add New Item'}</div>
            {dupWarn&&(
              <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:12,padding:12,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:'#92400E',marginBottom:4}}>⚠️ "{dupWarn.name}" already exists</div>
                <div style={{fontSize:12,color:'#78350F',marginBottom:10}}>Currently {dupWarn.qty} {dupWarn.unit}. Edit the existing item instead?</div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setEditItem(dupWarn);setFormData({...dupWarn});setDupWarn(null);}} className="btn-p" style={{padding:'8px 14px',fontSize:12}}>Edit Existing</button>
                  <button onClick={()=>setDupWarn(null)} className="btn-ghost" style={{padding:'8px 14px',fontSize:12}}>Change Name</button>
                </div>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="fl" style={{marginTop:0}}>Item Name *</label>
                <input value={formData.name} onChange={e=>{setFormData({...formData,name:e.target.value});setDupWarn(null);}} placeholder="e.g. Basmati Rice" autoFocus/>
              </div>
              <div>
                <label className="fl">Category</label>
                <select value={formData.category} onChange={e=>setFormData({...formData,category:e.target.value})}>
                  {CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Store to Buy</label>
                <select value={formData.store} onChange={e=>setFormData({...formData,store:e.target.value})}>
                  {stores.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Unit</label>
                <select value={formData.unit} onChange={e=>setFormData({...formData,unit:e.target.value})}>
                  {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Current Qty</label>
                <input type="number" value={formData.qty} onChange={e=>setFormData({...formData,qty:parseFloat(e.target.value)||0})} step="0.5" min="0"/>
              </div>
              <div>
                <label className="fl">Restock When Below</label>
                <input type="number" value={formData.restockAt} onChange={e=>setFormData({...formData,restockAt:parseFloat(e.target.value)||0})} step="0.5" min="0"/>
              </div>
              <div>
                <label className="fl">Restock By</label>
                <input type="date" value={formData.restockDate} onChange={e=>setFormData({...formData,restockDate:e.target.value})}/>
              </div>
              <div>
                <label className="fl">Last Restocked</label>
                <input type="date" value={formData.lastRestocked} onChange={e=>setFormData({...formData,lastRestocked:e.target.value})}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="fl">Notes / Brand</label>
                <input value={formData.notes} onChange={e=>setFormData({...formData,notes:e.target.value})} placeholder="Brand preference, supplier…"/>
              </div>
              <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:10,background:'#F0FDF4',borderRadius:10,padding:'10px 14px'}}>
                <input type="checkbox" id="hc" checked={formData.halal} onChange={e=>setFormData({...formData,halal:e.target.checked})} style={{width:'auto',accentColor:'#2E7D5A'}}/>
                <label htmlFor="hc" style={{fontSize:13,color:'#166534',fontWeight:600,cursor:'pointer'}}>✅ Halal Certified / Food Item</label>
              </div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:18,justifyContent:'flex-end'}}>
              <button onClick={()=>{setModal(null);setEditItem(null);setFormData({...BLANK_ITEM});setDupWarn(null);}} className="btn-ghost">Cancel</button>
              <button onClick={saveItem} disabled={saving} className="btn-p" style={{minWidth:120}}>{saving?'Saving…':editItem?'Save Changes':'Add Item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* RESTOCK CONFIRM — FIX #16 qty input */}
      {modal==='restock-confirm'&&pendingAction&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()} style={{maxHeight:'auto',padding:'20px 20px 40px'}}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:4}}>✓ Restock Item</div>
            <div style={{fontSize:13,color:'#6B5B4E',marginBottom:20}}>{pendingAction.item.name}</div>
            <label className="fl" style={{marginTop:0}}>How much did you buy?</label>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:6}}>
              <button onClick={()=>setRestockQty(String(Math.max(0,(parseFloat(restockQty)||0)-1)))} style={{width:44,height:44,borderRadius:22,border:'1.5px solid #E0D4C4',background:'white',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
              <input type="number" value={restockQty} onChange={e=>setRestockQty(e.target.value)} style={{textAlign:'center',fontSize:24,fontWeight:700}} min="0" step="0.5"/>
              <button onClick={()=>setRestockQty(String((parseFloat(restockQty)||0)+1))} style={{width:44,height:44,borderRadius:22,border:'1.5px solid #E0D4C4',background:'white',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
              <span style={{fontSize:14,color:'#8B6B4A'}}>{pendingAction.item.unit}</span>
            </div>
            <div style={{fontSize:11,color:'#8B6B4A',marginBottom:20}}>Current stock: {pendingAction.item.qty} {pendingAction.item.unit}</div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setModal(null)} className="btn-ghost" style={{flex:1}}>Cancel</button>
              <button onClick={doRestock} className="btn-g" style={{flex:2}}>✓ Confirm Restock</button>
            </div>
          </div>
        </div>
      )}

      {/* CONSUME MODAL — FIX #17 */}
      {modal==='consume'&&consumeItem&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()} style={{padding:'20px 20px 40px'}}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:4}}>− Record Usage</div>
            <div style={{fontSize:13,color:'#6B5B4E',marginBottom:20}}>{consumeItem.name} · currently {consumeItem.qty} {consumeItem.unit}</div>
            <label className="fl" style={{marginTop:0}}>How much was used?</label>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20}}>
              <button onClick={()=>setConsumeAmt(a=>Math.max(0.5,a-0.5))} style={{width:44,height:44,borderRadius:22,border:'1.5px solid #E0D4C4',background:'white',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
              <input type="number" value={consumeAmt} onChange={e=>setConsumeAmt(parseFloat(e.target.value)||0)} style={{textAlign:'center',fontSize:24,fontWeight:700}} min="0" step="0.5"/>
              <button onClick={()=>setConsumeAmt(a=>a+0.5)} style={{width:44,height:44,borderRadius:22,border:'1.5px solid #E0D4C4',background:'white',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
              <span style={{fontSize:14,color:'#8B6B4A'}}>{consumeItem.unit}</span>
            </div>
            <div style={{background:'#FFFBEB',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#92400E'}}>
              New stock after: <strong>{Math.max(0,consumeItem.qty-consumeAmt)} {consumeItem.unit}</strong>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setModal(null)} className="btn-ghost" style={{flex:1}}>Cancel</button>
              <button onClick={doConsume} className="btn-p" style={{flex:2}}>Record Usage</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM — FIX #6 */}
      {modal==='delete-confirm'&&pendingAction&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()} style={{padding:'24px 20px 40px'}}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:44,marginBottom:12}}>🗑️</div>
              <div style={{...PD,fontSize:18,fontWeight:700,marginBottom:8}}>Delete "{pendingAction.item.name}"?</div>
              <div style={{fontSize:13,color:'#6B5B4E',lineHeight:1.6}}>This is permanent and cannot be undone. The action will be recorded in the audit log.</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setModal(null)} className="btn-ghost" style={{flex:1}}>Cancel</button>
              <button onClick={doDelete} className="btn-r" style={{flex:1}}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* STORE TRIP — FIX #22 */}
      {modal==='store-trip'&&tripStore&&(()=>{
        const tripItems=[...items.filter(i=>i.store===tripStore&&itemStatus(i)==='critical'),...items.filter(i=>i.store===tripStore&&itemStatus(i)==='low')];
        return (
          <div className="ov" onClick={()=>setModal(null)}>
            <div className="mo" onClick={e=>e.stopPropagation()}>
              <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
              <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:4}}>🛒 Shopping Trip Done</div>
              <div style={{fontSize:13,color:'#6B5B4E',marginBottom:16}}>Mark all {tripStore} items as restocked?</div>
              <div style={{background:'#FAF7F4',borderRadius:10,padding:'10px 12px',marginBottom:16,maxHeight:200,overflowY:'auto'}}>
                {tripItems.map(i=><div key={i.id} style={{fontSize:12,padding:'4px 0',borderBottom:'1px solid #F0E8DC',display:'flex',justifyContent:'space-between'}}>
                  <span>{i.name}</span><span style={{color:'#8B6B4A'}}>{i.qty}→{i.restockAt*5} {i.unit}</span>
                </div>)}
              </div>
              <div style={{background:'#FFF8EC',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#78501A'}}>
                Each item will be set to 5× its restock threshold. You can adjust individually in Inventory.
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setModal(null)} className="btn-ghost" style={{flex:1}}>Cancel</button>
                <button onClick={()=>doStoreTrip(tripItems)} className="btn-g" style={{flex:2}}>✓ Mark All Restocked</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MEALS */}
      {modal==='meals'&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()} style={{maxHeight:'88vh'}}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:6}}>✨ Meal Suggestions</div>
            <div style={{fontSize:12,color:'#8B6B4A',marginBottom:14}}>Based on what's in your pantry right now</div>
            <button onClick={getAIMeals} disabled={aiLoad} className="btn-p" style={{width:'100%',padding:'12px',fontSize:14,marginBottom:14}}>
              {aiLoad?'🤖 Generating halal meal ideas…':'🤖 Get AI Halal Meal Ideas'}
            </button>
            {/* FIX #1: AI meals note */}
            {!aiMeals&&!aiLoad&&<div style={{background:'#FFF8EC',borderRadius:10,padding:'10px 14px',fontSize:12,color:'#78501A',marginBottom:14}}>
              Note: AI meal suggestions require an internet connection and may take a few seconds.
            </div>}
            {aiMeals&&aiMeals.map((meal,i)=>(
              <div key={i} style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:12,padding:14,marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{...PD,fontSize:15,fontWeight:700}}>{meal.name}</span>
                  <span style={{fontSize:11,color:'#2E7D5A',fontWeight:500}}>⏱ {meal.time}</span>
                </div>
                <p style={{fontSize:12,color:'#374151',lineHeight:1.7,marginBottom:8}}>{meal.steps}</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {(meal.ingredients||[]).map(ing=><span key={ing} style={{background:'#D1FAE5',color:'#065F46',padding:'2px 7px',borderRadius:5,fontSize:10,fontWeight:500}}>{ing}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS (admin: users + stores + audit) */}
      {modal==='settings'&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()} style={{maxHeight:'90vh'}}>
            <div style={{width:36,height:4,background:'#E0D4C4',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{...PD,fontSize:19,fontWeight:700,marginBottom:16}}>⚙️ Settings</div>
            <button onClick={()=>setModal('meals')} style={{width:'100%',background:'#FFF8EC',border:'1.5px solid #F0D080',borderRadius:12,padding:'11px 16px',textAlign:'left',marginBottom:16,fontSize:13,fontWeight:600,color:'#78501A',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>✨</span>
              <span>Meal Suggestions — based on current pantry stock</span>
              <span style={{marginLeft:'auto'}}>›</span>
            </button>

            {/* Users */}
            <div style={{fontSize:13,fontWeight:700,color:'#1A0F0A',marginBottom:10}}>👥 Household Members</div>
            <div style={{background:'#FFF8EC',border:'1px solid #F0D080',borderRadius:10,padding:'9px 12px',marginBottom:12,fontSize:12,color:'#6B4C18',lineHeight:1.6}}>
              Each person logs in from their own device. Changes sync instantly across all devices. Role controls permissions.
            </div>
            {users.map(u=>(
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid #F0E8DC'}}>
                <div style={{width:36,height:36,borderRadius:18,background:`${u.color||'#C8860A'}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{u.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{u.name}</div>
                  <div style={{fontSize:11,color:'#8B6B4A',textTransform:'capitalize'}}>{u.role}</div>
                </div>
                {u.id!=='omod'&&<button onClick={()=>removeUser(u.id)} className="btn-sm" style={{background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA'}}>Remove</button>}
              </div>
            ))}
            {!addUOpen&&<button onClick={()=>setAddUOpen(true)} className="btn-g" style={{width:'100%',marginTop:12,padding:'10px'}}>+ Add Family Member / Chef</button>}
            {addUOpen&&(
              <div style={{marginTop:12,background:'#F5F0EA',borderRadius:12,padding:14}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div style={{gridColumn:'1/-1'}}>
                    <label className="fl" style={{marginTop:0}}>Name</label>
                    <input value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} placeholder="e.g. Aisha"/>
                  </div>
                  <div><label className="fl">Emoji</label><input value={newUser.emoji} onChange={e=>setNewUser({...newUser,emoji:e.target.value})} placeholder="👤"/></div>
                  <div><label className="fl">Role</label>
                    <select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}>
                      <option value="family">Family — view & restock</option>
                      <option value="chef">Chef — view, restock & consume</option>
                      <option value="admin">Admin — full access</option>
                    </select>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginTop:10}}>
                  <button onClick={addUser} className="btn-p" style={{padding:'9px 16px',fontSize:13}}>Add</button>
                  <button onClick={()=>setAddUOpen(false)} className="btn-ghost" style={{padding:'9px 16px',fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Audit — FIX #23 with filters */}
            <div style={{fontSize:13,fontWeight:700,color:'#1A0F0A',marginTop:24,marginBottom:10}}>📋 Audit Trail</div>
            <div style={{fontSize:11,color:'#8B6B4A',marginBottom:10,lineHeight:1.6}}>Permanent record of every change. Cannot be edited or deleted from the app.</div>
            {/* Filter */}
            <div className="sx" style={{marginBottom:12}}>
              <button className={`pill ${auditFilter==='all'?'on':''}`} onClick={()=>setAuditFilter('all')} style={{fontSize:10}}>All</button>
              {['ADD','EDIT','DELETE','RESTOCK','CONSUME','LOGIN'].map(a=>(
                <button key={a} className={`pill ${auditFilter===a?'on':''}`} onClick={()=>setAuditFilter(a)} style={{fontSize:10}}>{a}</button>
              ))}
              {[...new Set(audit.map(a=>a.user_name))].map(n=>(
                <button key={n} className={`pill ${auditFilter===n?'on':''}`} onClick={()=>setAuditFilter(n)} style={{fontSize:10}}>👤{n}</button>
              ))}
            </div>
            <div style={{maxHeight:280,overflowY:'auto'}}>
              {!filteredAudit.length&&<div style={{textAlign:'center',color:'#8B6B4A',padding:16,fontSize:12}}>No entries match filter</div>}
              {filteredAudit.map((e,i)=>(
                <div key={i} style={{display:'flex',gap:8,padding:'8px 0',borderBottom:'1px solid #F0E8DC',alignItems:'flex-start'}}>
                  <span style={{fontSize:14,flexShrink:0}}>{e.action==='ADD'?'➕':e.action==='EDIT'?'✏️':e.action==='DELETE'?'🗑️':e.action==='RESTOCK'?'✅':e.action==='CONSUME'?'🍽️':e.action==='LOGIN'?'👤':'📝'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:'#1A0F0A'}}>{e.action} — {e.detail}</div>
                    <div style={{fontSize:10,color:'#8B6B4A'}}>{e.user_name} · {new Date(e.created_at).toLocaleString('en-NG',{dateStyle:'short',timeStyle:'short'})}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div style={{position:'fixed',bottom:90,left:'50%',transform:'translateX(-50%)',
          background:toast.type==='error'?'#DC2626':toast.type==='info'?'#374151':'#2E7D5A',
          color:'white',padding:'10px 20px',borderRadius:24,fontSize:13,fontWeight:600,
          zIndex:400,boxShadow:'0 4px 20px rgba(0,0,0,.25)',whiteSpace:'nowrap',maxWidth:'88vw',textAlign:'center'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
