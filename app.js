// =============================================
//  MBL PARK — app.js  (v3 com supervisores)
// =============================================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── COLE AQUI AS SUAS CREDENCIAIS DO FIREBASE ───────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC5R7nLSjfRFXAqEYp_81Ok423dYBT_N10",
  apiKey: "AIzaSyC5R7nLSjfRFXAqEYp_81Ok423dYBT_N10",
  projectId: "mblpark-caixa",
  storageBucket: "mblpark-caixa.firebasestorage.app",
  messagingSenderId: "23435855351",
  appId: "1:23435855351:web:6ef7f8f700dc9b38f65af2"
};
// ─────────────────────────────────────────────────────────────────────────────

const fireApp = initializeApp(firebaseConfig);
const db      = getFirestore(fireApp);
const storage = getStorage(fireApp);

// ── estado global ─────────────────────────────────────────────────────────────
let sessao   = null;
let fotoFile = null;
let editandoId = null; // ID do registro sendo editado

// ── utilitários ───────────────────────────────────────────────────────────────
function fmt(val) {
  return "R$ " + parseFloat(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function getNum(id)    { return parseFloat(document.getElementById(id)?.value || 0); }
function getVal(id)    { return document.getElementById(id)?.value?.trim() || ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function show(id)      { const el = document.getElementById(id); if (el) el.style.display = ""; }
function hide(id)      { const el = document.getElementById(id); if (el) el.style.display = "none"; }

// ── calcular total ─────────────────────────────────────────────────────────────
window.calcTotal = function () {
  const dinheiro = getNum("f-dinheiro");
  const digital  = getNum("f-credito") + getNum("f-debito") + getNum("f-pix") +
                   getNum("f-semparar") + getNum("f-faturados") + getNum("f-mensalista");
  document.getElementById("t-dinheiro").textContent = fmt(dinheiro);
  document.getElementById("t-digital").textContent  = fmt(digital);
  document.getElementById("t-total").textContent    = fmt(dinheiro + digital);
  return dinheiro + digital;
};

// ── montar select de login ─────────────────────────────────────────────────────
async function buildLoginSelect() {
  const sel = document.getElementById("login-patio");
  sel.innerHTML = '<option value="">Carregando...</option>';
  try {
    // auditor (buscado do firebase)
    const audSnap = await getDoc(doc(db, "config", "auditor"));
    const audSenha = audSnap.exists() ? audSnap.data().senha : "MBL@audit2024";

    sel.innerHTML = '<option value="">Selecione...</option><option value="__auditor__">🔍 Auditor — acesso completo</option>';

    // supervisores
    const supSnap = await getDocs(collection(db, "supervisores"));
    if (!supSnap.empty) {
      const grpSup = document.createElement("optgroup");
      grpSup.label = "Supervisores";
      supSnap.forEach(d => {
        const s = d.data();
        if (!s.ativo) return;
        const o = document.createElement("option");
        o.value = "__sup__" + d.id;
        o.textContent = "👤 " + s.nome;
        grpSup.appendChild(o);
      });
      if (grpSup.childElementCount > 0) sel.appendChild(grpSup);
    }

    // pátios
    const patSnap = await getDocs(collection(db, "patios"));
    const grpPat = document.createElement("optgroup");
    grpPat.label = "Pátios MBL Park";
    patSnap.forEach(d => {
      const p = d.data();
      if (!p.ativo) return;
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = p.nome;
      grpPat.appendChild(o);
    });
    if (grpPat.childElementCount > 0) sel.appendChild(grpPat);

    // guardar senha do auditor na memoria
    window.__audSenha = audSenha;
  } catch (e) {
    sel.innerHTML = '<option value="">Erro ao carregar</option>';
    console.error(e);
  }
}

// ── login ──────────────────────────────────────────────────────────────────────
async function entrar() {
  const id    = document.getElementById("login-patio").value;
  const senha = document.getElementById("login-senha").value;
  const erro  = document.getElementById("login-erro");
  erro.textContent = "";
  if (!id) { erro.textContent = "Selecione um perfil."; return; }

  // AUDITOR
  if (id === "__auditor__") {
    const audSenha = window.__audSenha || "MBL@audit2024";
    if (senha !== audSenha) { erro.textContent = "Senha incorreta."; return; }
    sessao = { id: "__auditor__", label: "Auditor", tipo: "auditor" };

  // SUPERVISOR
  } else if (id.startsWith("__sup__")) {
    const supId = id.replace("__sup__", "");
    const snap  = await getDoc(doc(db, "supervisores", supId));
    if (!snap.exists() || snap.data().senha !== senha || !snap.data().ativo) {
      erro.textContent = "Usuário ou senha incorretos."; return;
    }
    const s = snap.data();
    sessao = { id: supId, label: s.nome, tipo: "supervisor", patios: s.patios || [] };

  // PÁTIO
  } else {
    const snap = await getDoc(doc(db, "patios", id));
    if (!snap.exists() || snap.data().senha !== senha || !snap.data().ativo) {
      erro.textContent = "Pátio ou senha incorretos."; return;
    }
    sessao = { id, label: snap.data().nome, tipo: "patio" };
  }

  document.getElementById("login-senha").value = "";
  iniciarApp();
}

// ── iniciar app ────────────────────────────────────────────────────────────────
function iniciarApp() {
  hide("screen-login");
  show("screen-app");
  document.getElementById("screen-app").classList.add("active");
  document.getElementById("screen-login").classList.remove("active");
  document.getElementById("topbar-sub").textContent = sessao.label;

  // esconder todas as tabs primeiro
  hide("tabs-operador"); hide("tabs-auditor"); hide("tabs-supervisor");

  if (sessao.tipo === "auditor") {
    document.getElementById("topbar-badge").innerHTML =
      '<span class="badge-auditor"><i class="ti ti-shield"></i> Auditor</span>';
    show("tabs-auditor");
    showPage("auditoria", document.querySelector("#tabs-auditor .tab"));

  } else if (sessao.tipo === "supervisor") {
    document.getElementById("topbar-badge").innerHTML =
      `<span class="badge-supervisor"><i class="ti ti-user-check"></i> Supervisor</span>`;
    show("tabs-supervisor");
    showPage("sup-registros", document.querySelector("#tabs-supervisor .tab"));

  } else {
    document.getElementById("topbar-badge").innerHTML =
      `<span class="badge-patio"><i class="ti ti-building"></i> ${sessao.label}</span>`;
    show("tabs-operador");
    showPage("form", document.querySelector("#tabs-operador .tab"));
    setVal("f-data", new Date().toISOString().split("T")[0]);
  }
}

// ── sair ───────────────────────────────────────────────────────────────────────
function sair() {
  sessao = null; editandoId = null;
  document.getElementById("screen-app").classList.remove("active");
  document.getElementById("screen-login").classList.add("active");
  buildLoginSelect();
}

// ── navegar entre páginas ──────────────────────────────────────────────────────
function showPage(page, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const pg = document.getElementById("page-" + page);
  if (pg) pg.classList.add("active");
  if (btn) {
    btn.closest(".tabs").querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
  }
  if (page === "registros")     renderPatio();
  if (page === "auditoria")     renderAuditoria();
  if (page === "patios")        renderPatios();
  if (page === "supervisores")  renderSupervisores();
  if (page === "config")        renderConfig();
  if (page === "sup-registros") renderSupRegistros();
  if (page === "sup-config")    renderSupConfig();
  if (page === "relatorios")    renderRelatorios();
}

// ── calcular total do form de edição ──────────────────────────────────────────
window.calcTotalEdit = function () {
  const ids = ["e-dinheiro","e-credito","e-debito","e-pix","e-semparar","e-faturados","e-mensalista"];
  const total = ids.reduce((s, id) => s + parseFloat(document.getElementById(id)?.value || 0), 0);
  const el = document.getElementById("e-total");
  if (el) el.textContent = fmt(total);
  return total;
};

// ── salvar registro (novo) ─────────────────────────────────────────────────────
async function salvar() {
  const operador = getVal("f-operador");
  const turno    = getVal("f-turno");
  const data     = getVal("f-data");
  if (!operador || !turno || !data) { alert("Preencha operador, turno e data."); return; }

  const btn = document.getElementById("btn-salvar");
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Salvando...';

  try {
    let fotoURL = null;
    if (fotoFile) {
      const sRef = ref(storage, `fichas/${Date.now()}_${fotoFile.name}`);
      await uploadBytes(sRef, fotoFile);
      fotoURL = await getDownloadURL(sRef);
    }
    await addDoc(collection(db, "registros"), {
      patio: sessao.id, patioLabel: sessao.label,
      operador, supervisor: getVal("f-supervisor"), turno, data,
      valorAbertura: getNum("f-abertura"),
      dinheiro: getNum("f-dinheiro"), credito: getNum("f-credito"),
      debito: getNum("f-debito"), pix: getNum("f-pix"),
      semParar: getNum("f-semparar"), faturados: getNum("f-faturados"),
      mensalista: getNum("f-mensalista"), total: calcTotal(),
      horaFechamento: getVal("f-hora"), opFechamento: getVal("f-op-fechamento"),
      obs: getVal("f-obs"), foto: fotoURL,
      status: "pendente", criadoEm: new Date().toISOString()
    });
    const b = document.getElementById("success-banner");
    b.style.display = "flex"; setTimeout(() => { b.style.display = "none"; }, 3000);
    limpar();
  } catch (e) { alert("Erro ao salvar. Verifique o Firebase."); console.error(e); }

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar registro';
}

// ── limpar formulário ──────────────────────────────────────────────────────────
function limpar() {
  ["f-operador","f-supervisor","f-abertura","f-dinheiro","f-credito","f-debito",
   "f-pix","f-semparar","f-faturados","f-mensalista","f-hora","f-op-fechamento","f-obs"]
    .forEach(id => setVal(id, ""));
  setVal("f-turno",""); setVal("f-data", new Date().toISOString().split("T")[0]);
  fotoFile = null;
  document.getElementById("foto-preview").style.display = "none";
  document.getElementById("upload-area").style.display  = "block";
  calcTotal();
}

// ── render registros do pátio ──────────────────────────────────────────────────
async function renderPatio() {
  const el = document.getElementById("lista-patio");
  el.innerHTML = loading();
  try {
    const snap = await getDocs(query(collection(db, "registros"), orderBy("criadoEm","desc")));
    const lista = [];
    snap.forEach(d => { const r = {id:d.id,...d.data()}; if (r.patio === sessao.id) lista.push(r); });
    el.innerHTML = lista.length ? lista.map(r => regHtml(r,"patio")).join("") : empty();
  } catch(e) { el.innerHTML = erro(); }
}

// ── render auditoria ───────────────────────────────────────────────────────────
async function renderAuditoria() {
  const el = document.getElementById("lista-auditoria");
  el.innerHTML = loading();
  try {
    const fp = document.getElementById("aud-filtro-patio").value.toLowerCase();
    const ft = document.getElementById("aud-filtro-turno").value;
    const fd = document.getElementById("aud-filtro-data").value;
    const fs = document.getElementById("aud-filtro-status").value;
    const snap = await getDocs(query(collection(db,"registros"),orderBy("criadoEm","desc")));
    const lista = [];
    snap.forEach(d => {
      const r = {id:d.id,...d.data()};
      if (fp && !r.patioLabel?.toLowerCase().includes(fp)) return;
      if (ft && r.turno !== ft) return;
      if (fd && r.data !== fd) return;
      if (fs && r.status !== fs) return;
      lista.push(r);
    });
    el.innerHTML = lista.length ? lista.map(r => regHtml(r,"auditor")).join("") : empty();
  } catch(e) { el.innerHTML = erro(); }
}

// ── render registros do supervisor ────────────────────────────────────────────
async function renderSupRegistros() {
  const el = document.getElementById("lista-sup-registros");
  if (!el) return;
  el.innerHTML = loading();
  try {
    const fp = (document.getElementById("sup-filtro-patio")?.value || "").toLowerCase();
    const ft = document.getElementById("sup-filtro-turno")?.value || "";
    const fd = document.getElementById("sup-filtro-data")?.value || "";
    const fs = document.getElementById("sup-filtro-status")?.value || "";
    const snap = await getDocs(query(collection(db,"registros"),orderBy("criadoEm","desc")));
    const lista = [];
    snap.forEach(d => {
      const r = {id:d.id,...d.data()};
      // só pátios do supervisor
      if (!sessao.patios.includes(r.patio)) return;
      if (fp && !r.patioLabel?.toLowerCase().includes(fp)) return;
      if (ft && r.turno !== ft) return;
      if (fd && r.data !== fd) return;
      if (fs && r.status !== fs) return;
      lista.push(r);
    });
    el.innerHTML = lista.length ? lista.map(r => regHtml(r,"supervisor")).join("") : empty();
  } catch(e) { el.innerHTML = erro(); }
}

// ── aprovar / rejeitar ─────────────────────────────────────────────────────────
window.atualizarStatus = async function(id, status) {
  await updateDoc(doc(db,"registros",id), { status });
  if (sessao.tipo === "auditor")     renderAuditoria();
  if (sessao.tipo === "supervisor")  renderSupRegistros();
};

// ── abrir modal de edição ─────────────────────────────────────────────────────
window.abrirEdicao = async function(id) {
  const snap = await getDoc(doc(db,"registros",id));
  if (!snap.exists()) return;
  const r = snap.data();
  editandoId = id;

  setVal("e-operador", r.operador || "");
  setVal("e-supervisor", r.supervisor || "");
  setVal("e-turno", r.turno || "");
  setVal("e-data", r.data || "");
  setVal("e-abertura", r.valorAbertura || "");
  setVal("e-dinheiro", r.dinheiro || "");
  setVal("e-credito", r.credito || "");
  setVal("e-debito", r.debito || "");
  setVal("e-pix", r.pix || "");
  setVal("e-semparar", r.semParar || "");
  setVal("e-faturados", r.faturados || "");
  setVal("e-mensalista", r.mensalista || "");
  setVal("e-hora", r.horaFechamento || "");
  setVal("e-op-fechamento", r.opFechamento || "");
  setVal("e-obs", r.obs || "");
  calcTotalEdit();

  document.getElementById("modal-edicao").style.display = "flex";
};

// ── salvar edição ─────────────────────────────────────────────────────────────
async function salvarEdicao() {
  if (!editandoId) return;
  const btn = document.getElementById("btn-salvar-edicao");
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Salvando...';

  try {
    const ids = ["e-dinheiro","e-credito","e-debito","e-pix","e-semparar","e-faturados","e-mensalista"];
    const total = ids.reduce((s,id) => s + getNum(id), 0);
    await updateDoc(doc(db,"registros",editandoId), {
      operador: getVal("e-operador"), supervisor: getVal("e-supervisor"),
      turno: getVal("e-turno"), data: getVal("e-data"),
      valorAbertura: getNum("e-abertura"),
      dinheiro: getNum("e-dinheiro"), credito: getNum("e-credito"),
      debito: getNum("e-debito"), pix: getNum("e-pix"),
      semParar: getNum("e-semparar"), faturados: getNum("e-faturados"),
      mensalista: getNum("e-mensalista"), total,
      horaFechamento: getVal("e-hora"), opFechamento: getVal("e-op-fechamento"),
      obs: getVal("e-obs"), editadoEm: new Date().toISOString(),
      editadoPor: sessao.label
    });
    document.getElementById("modal-edicao").style.display = "none";
    editandoId = null;
    if (sessao.tipo === "auditor")    renderAuditoria();
    if (sessao.tipo === "supervisor") renderSupRegistros();
  } catch(e) { alert("Erro ao salvar edição."); console.error(e); }

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar alterações';
}

// ── ver foto ──────────────────────────────────────────────────────────────────
window.verFoto = function(url, nome) {
  document.getElementById("modal-img").src = url;
  document.getElementById("modal-titulo").textContent = "Ficha — " + nome;
  document.getElementById("modal-foto").style.display = "flex";
};

// ── HTML de um registro ────────────────────────────────────────────────────────
const tClass = {"1":"t1","2":"t2","3":"t3"};
const tLabel = {"1":"Turno 1","2":"Turno 2","3":"Turno 3"};
const sClass = {pendente:"s-pendente",aprovado:"s-aprovado",rejeitado:"s-rejeitado"};
const sLabel = {pendente:"Pendente",aprovado:"Aprovado",rejeitado:"Rejeitado"};
const sIcon  = {pendente:"ti-clock",aprovado:"ti-circle-check",rejeitado:"ti-circle-x"};

function regHtml(r, perfil) {
  const data = r.data ? new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR") : "—";
  const st   = r.status || "pendente";
  const podeAprovar = (perfil === "auditor" || perfil === "supervisor") && st === "pendente";
  const podeEditar  = (perfil === "auditor" || perfil === "supervisor");
  return `
  <div class="reg-item">
    <div class="reg-header">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:500">${r.patioLabel}</span>
        <span class="turno-badge ${tClass[r.turno]||""}">${tLabel[r.turno]||""}</span>
        <span class="status-reg ${sClass[st]}"><i class="ti ${sIcon[st]}"></i> ${sLabel[st]}</span>
      </div>
      <span style="font-size:12px;color:var(--text2)">${data}</span>
    </div>
    <div class="reg-meta">Operador: ${r.operador}${r.supervisor?" · Supervisor: "+r.supervisor:""}</div>
    <div class="reg-grid">
      <div class="reg-val"><div class="k">Dinheiro</div><div class="v">${fmt(r.dinheiro)}</div></div>
      <div class="reg-val"><div class="k">Crédito</div><div class="v">${fmt(r.credito)}</div></div>
      <div class="reg-val"><div class="k">Débito</div><div class="v">${fmt(r.debito)}</div></div>
      <div class="reg-val"><div class="k">PIX</div><div class="v">${fmt(r.pix)}</div></div>
      <div class="reg-val"><div class="k">Sem Parar</div><div class="v">${fmt(r.semParar)}</div></div>
      <div class="reg-val"><div class="k">Faturados</div><div class="v">${fmt(r.faturados)}</div></div>
      <div class="reg-val"><div class="k">Mensalista</div><div class="v">${fmt(r.mensalista)}</div></div>
    </div>
    <div class="reg-footer">
      <span style="font-size:12px;color:var(--text2)">
        ${r.horaFechamento?"Fechamento: "+r.horaFechamento:""}
        ${r.obs?" · "+r.obs.slice(0,50)+(r.obs.length>50?"…":""):""}
        ${r.editadoPor?`<br><i style="font-size:11px">Editado por ${r.editadoPor}</i>`:""}
      </span>
      <div class="reg-actions">
        ${r.foto?`<button class="btn-ver-foto" onclick="verFoto('${r.foto}','${r.patioLabel}')"><i class="ti ti-photo"></i> Foto</button>`:""}
        ${podeEditar?`<button class="btn-sm" onclick="abrirEdicao('${r.id}')"><i class="ti ti-pencil"></i> Editar</button>`:""}
        ${podeAprovar?`
          <button class="btn-aprovar" onclick="atualizarStatus('${r.id}','aprovado')"><i class="ti ti-check"></i> Aprovar</button>
          <button class="btn-rejeitar" onclick="atualizarStatus('${r.id}','rejeitado')"><i class="ti ti-x"></i> Rejeitar</button>
        `:""}
        <span style="font-size:15px;font-weight:600;color:var(--laranja)">${fmt(r.total)}</span>
      </div>
    </div>
  </div>`;
}

// ── pátios ────────────────────────────────────────────────────────────────────
async function adicionarPatio() {
  const nome  = document.getElementById("np-nome").value.trim();
  const id    = document.getElementById("np-id").value.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
  const senha = document.getElementById("np-senha").value.trim();
  const erro  = document.getElementById("patio-erro");
  if (!nome||!id||!senha) { erro.textContent="Preencha todos os campos."; return; }
  if (senha.length<6)     { erro.textContent="Senha mínima: 6 caracteres."; return; }
  if (id==="auditor")     { erro.textContent="ID reservado."; return; }
  const btn = document.getElementById("btn-add-patio");
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i>';
  try {
    await setDoc(doc(db,"patios",id), { nome, senha, ativo:true, criadoEm:new Date().toISOString() });
    erro.textContent="";
    setVal("np-nome",""); setVal("np-id",""); setVal("np-senha","");
    await renderPatios(); await buildLoginSelect();
  } catch(e) { erro.textContent="Erro ao salvar."; console.error(e); }
  btn.disabled=false; btn.innerHTML='<i class="ti ti-plus"></i> Adicionar';
}

window.togglePatio = async function(docId, ativo) {
  await updateDoc(doc(db,"patios",docId),{ativo:!ativo});
  await renderPatios(); await buildLoginSelect();
};

async function renderPatios() {
  const busca = document.getElementById("busca-patio").value.toLowerCase();
  const tbody = document.getElementById("tabela-patios");
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text2)">Carregando...</td></tr>';
  try {
    const snap = await getDocs(collection(db,"patios"));
    const todos=[]; snap.forEach(d => todos.push({docId:d.id,...d.data()}));
    const lista = todos.filter(p=>!busca||p.nome.toLowerCase().includes(busca)||p.docId.toLowerCase().includes(busca));
    document.getElementById("counter-patios").textContent =
      todos.length+" pátio"+(todos.length!==1?"s":"")+" cadastrado"+(todos.length!==1?"s":"");
    tbody.innerHTML = lista.length ? lista.map(p=>`
      <tr>
        <td style="font-weight:500">${p.nome}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--text2)">${p.docId}</td>
        <td><span class="senha-mask" data-v="0"
          onclick="this.dataset.v==='1'?(this.textContent='••••••',this.dataset.v='0'):(this.textContent='${p.senha}',this.dataset.v='1')">••••••</span></td>
        <td><span class="status-pill ${p.ativo?"status-ativo":"status-inativo"}">${p.ativo?"Ativo":"Inativo"}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="togglePatio('${p.docId}',${p.ativo})">
            <i class="ti ti-${p.ativo?"eye-off":"eye"}"></i> ${p.ativo?"Desativar":"Ativar"}
          </button>
        </div></td>
      </tr>`).join("")
      : '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text2)">Nenhum pátio.</td></tr>';
  } catch(e) { tbody.innerHTML='<tr><td colspan="5" style="color:#DC2626;padding:1rem">Erro ao carregar.</td></tr>'; }
}

// ── supervisores ───────────────────────────────────────────────────────────────
async function adicionarSupervisor() {
  const nome  = document.getElementById("sn-nome").value.trim();
  const id    = document.getElementById("sn-id").value.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
  const senha = document.getElementById("sn-senha").value.trim();
  const erro  = document.getElementById("supervisor-erro");

  // pátios selecionados
  const checkboxes = document.querySelectorAll(".patio-check:checked");
  const patiosSel  = Array.from(checkboxes).map(c => c.value);

  if (!nome||!id||!senha)  { erro.textContent="Preencha todos os campos."; return; }
  if (senha.length<6)       { erro.textContent="Senha mínima: 6 caracteres."; return; }
  if (patiosSel.length===0) { erro.textContent="Selecione ao menos um pátio."; return; }

  const btn = document.getElementById("btn-add-supervisor");
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i>';
  try {
    await setDoc(doc(db,"supervisores",id), {
      nome, senha, ativo:true, patios:patiosSel, criadoEm:new Date().toISOString()
    });
    erro.textContent="";
    setVal("sn-nome",""); setVal("sn-id",""); setVal("sn-senha","");
    document.querySelectorAll(".patio-check").forEach(c => c.checked=false);
    await renderSupervisores(); await buildLoginSelect();
  } catch(e) { erro.textContent="Erro ao salvar."; console.error(e); }
  btn.disabled=false; btn.innerHTML='<i class="ti ti-plus"></i> Adicionar';
}

window.toggleSupervisor = async function(docId, ativo) {
  await updateDoc(doc(db,"supervisores",docId),{ativo:!ativo});
  await renderSupervisores(); await buildLoginSelect();
};

async function renderSupervisores() {
  const tbody = document.getElementById("tabela-supervisores");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text2)">Carregando...</td></tr>';

  // carregar lista de pátios para o form
  const patSnap = await getDocs(collection(db,"patios"));
  const todosPatios = []; patSnap.forEach(d => todosPatios.push({id:d.id,...d.data()}));

  // montar checkboxes de pátios
  const checkWrap = document.getElementById("patios-check-list");
  if (checkWrap) {
    checkWrap.innerHTML = todosPatios.length
      ? todosPatios.map(p=>`
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;cursor:pointer">
          <input type="checkbox" class="patio-check" value="${p.id}"/>
          ${p.nome}
        </label>`).join("")
      : '<span style="font-size:13px;color:var(--text2)">Nenhum pátio cadastrado ainda.</span>';
  }

  try {
    const snap = await getDocs(collection(db,"supervisores"));
    const lista=[]; snap.forEach(d=>lista.push({docId:d.id,...d.data()}));
    document.getElementById("counter-supervisores").textContent =
      lista.length+" supervisor"+(lista.length!==1?"es":"")+" cadastrado"+(lista.length!==1?"s":"");
    tbody.innerHTML = lista.length ? lista.map(s=>`
      <tr>
        <td style="font-weight:500">${s.nome}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--text2)">${s.docId}</td>
        <td><span class="senha-mask" data-v="0"
          onclick="this.dataset.v==='1'?(this.textContent='••••••',this.dataset.v='0'):(this.textContent='${s.senha}',this.dataset.v='1')">••••••</span></td>
        <td><span class="status-pill ${s.ativo?"status-ativo":"status-inativo"}">${s.ativo?"Ativo":"Inativo"}</span></td>
        <td><button class="btn-sm" onclick="toggleSupervisor('${s.docId}',${s.ativo})">
          <i class="ti ti-${s.ativo?"eye-off":"eye"}"></i> ${s.ativo?"Desativar":"Ativar"}
        </button></td>
      </tr>`).join("")
      : '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text2)">Nenhum supervisor cadastrado.</td></tr>';
  } catch(e) { tbody.innerHTML='<tr><td colspan="5" style="color:#DC2626;padding:1rem">Erro ao carregar.</td></tr>'; }
}

// ── config (auditor) — alterar senha ─────────────────────────────────────────
async function renderConfig() {
  // só mostra o campo de senha do auditor
}

async function salvarSenhaAuditor() {
  const atual = document.getElementById("cfg-senha-atual").value;
  const nova  = document.getElementById("cfg-senha-nova").value;
  const conf  = document.getElementById("cfg-senha-conf").value;
  const erro  = document.getElementById("cfg-erro");
  erro.textContent="";

  const audSenha = window.__audSenha || "MBL@audit2024";
  if (atual !== audSenha) { erro.textContent="Senha atual incorreta."; return; }
  if (nova.length < 6)    { erro.textContent="Nova senha mínima: 6 caracteres."; return; }
  if (nova !== conf)      { erro.textContent="Confirmação não confere."; return; }

  try {
    await setDoc(doc(db,"config","auditor"),{senha:nova});
    window.__audSenha = nova;
    setVal("cfg-senha-atual",""); setVal("cfg-senha-nova",""); setVal("cfg-senha-conf","");
    document.getElementById("cfg-sucesso").style.display="flex";
    setTimeout(()=>{ document.getElementById("cfg-sucesso").style.display="none"; },3000);
  } catch(e) { erro.textContent="Erro ao salvar."; console.error(e); }
}

// ── config (supervisor) — alterar senha ───────────────────────────────────────
async function renderSupConfig() {}

async function salvarSenhaSupervisor() {
  const atual = document.getElementById("scfg-senha-atual").value;
  const nova  = document.getElementById("scfg-senha-nova").value;
  const conf  = document.getElementById("scfg-senha-conf").value;
  const erro  = document.getElementById("scfg-erro");
  erro.textContent="";

  const snap = await getDoc(doc(db,"supervisores",sessao.id));
  if (!snap.exists() || snap.data().senha !== atual) { erro.textContent="Senha atual incorreta."; return; }
  if (nova.length<6)  { erro.textContent="Nova senha mínima: 6 caracteres."; return; }
  if (nova !== conf)  { erro.textContent="Confirmação não confere."; return; }

  try {
    await updateDoc(doc(db,"supervisores",sessao.id),{senha:nova});
    setVal("scfg-senha-atual",""); setVal("scfg-senha-nova",""); setVal("scfg-senha-conf","");
    document.getElementById("scfg-sucesso").style.display="flex";
    setTimeout(()=>{ document.getElementById("scfg-sucesso").style.display="none"; },3000);
  } catch(e) { erro.textContent="Erro ao salvar."; console.error(e); }
}

// ── helpers visuais ────────────────────────────────────────────────────────────
function loading() { return '<div class="loading"><div class="spinner"></div>Carregando...</div>'; }
function empty()   { return '<div class="empty"><i class="ti ti-inbox"></i><p>Nenhum registro encontrado.</p></div>'; }
function erro()    { return '<div class="empty"><i class="ti ti-alert-circle"></i><p>Erro ao carregar.</p></div>'; }

// ── foto preview ───────────────────────────────────────────────────────────────
document.getElementById("f-foto").addEventListener("change", function() {
  const file = this.files[0]; if (!file) return;
  fotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("foto-img").src = e.target.result;
    document.getElementById("foto-preview").style.display = "block";
    document.getElementById("upload-area").style.display  = "none";
  };
  reader.readAsDataURL(file);
});
document.getElementById("btn-remover-foto").addEventListener("click", () => {
  fotoFile=null;
  document.getElementById("foto-preview").style.display="none";
  document.getElementById("upload-area").style.display="block";
  document.getElementById("f-foto").value="";
});

// ── modais ─────────────────────────────────────────────────────────────────────
["modal-close","modal-backdrop"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => { document.getElementById("modal-foto").style.display="none"; });
});
["modal-edicao-close","modal-edicao-backdrop"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => {
    document.getElementById("modal-edicao").style.display="none"; editandoId=null;
  });
});
document.getElementById("btn-salvar-edicao")?.addEventListener("click", salvarEdicao);

// ── eventos ────────────────────────────────────────────────────────────────────
document.getElementById("btn-entrar").addEventListener("click", entrar);
document.getElementById("login-senha").addEventListener("keydown", e => { if(e.key==="Enter") entrar(); });
document.getElementById("btn-sair").addEventListener("click", sair);
document.getElementById("btn-salvar").addEventListener("click", salvar);
document.getElementById("btn-limpar").addEventListener("click", limpar);
document.getElementById("btn-add-patio")?.addEventListener("click", adicionarPatio);
document.getElementById("btn-add-supervisor")?.addEventListener("click", adicionarSupervisor);
document.getElementById("btn-salvar-senha-auditor")?.addEventListener("click", salvarSenhaAuditor);
document.getElementById("btn-salvar-senha-sup")?.addEventListener("click", salvarSenhaSupervisor);

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page, btn));
});
["aud-filtro-patio","aud-filtro-turno","aud-filtro-data","aud-filtro-status"].forEach(id => {
  document.getElementById(id)?.addEventListener("input",  renderAuditoria);
  document.getElementById(id)?.addEventListener("change", renderAuditoria);
});
["sup-filtro-patio","sup-filtro-turno","sup-filtro-data","sup-filtro-status"].forEach(id => {
  document.getElementById(id)?.addEventListener("input",  renderSupRegistros);
  document.getElementById(id)?.addEventListener("change", renderSupRegistros);
});
document.getElementById("busca-patio")?.addEventListener("input", renderPatios);

// ── init ───────────────────────────────────────────────────────────────────────
buildLoginSelect();

// ═══════════════════════════════════════════════════════════
//  MÓDULO DE RELATÓRIOS — PDF e Excel
// ═══════════════════════════════════════════════════════════

// ── carregar bibliotecas externas ─────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── buscar todos os registros para o relatório ─────────────
async function buscarRegistrosRelatorio(patioFiltro) {
  const snap = await getDocs(query(collection(db, "registros"), orderBy("criadoEm", "desc")));
  const lista = [];
  snap.forEach(d => {
    const r = { id: d.id, ...d.data() };
    if (patioFiltro && r.patio !== patioFiltro) return;
    lista.push(r);
  });
  return lista;
}

// ── montar resumo por pátio ────────────────────────────────
function montarResumo(registros) {
  const map = {};
  registros.forEach(r => {
    const key = r.patioLabel || r.patio;
    if (!map[key]) map[key] = { patio: key, total: 0, dinheiro: 0, credito: 0, debito: 0, pix: 0, semParar: 0, faturados: 0, mensalista: 0, count: 0, aprovados: 0, pendentes: 0, rejeitados: 0 };
    const m = map[key];
    m.total      += parseFloat(r.total || 0);
    m.dinheiro   += parseFloat(r.dinheiro || 0);
    m.credito    += parseFloat(r.credito || 0);
    m.debito     += parseFloat(r.debito || 0);
    m.pix        += parseFloat(r.pix || 0);
    m.semParar   += parseFloat(r.semParar || 0);
    m.faturados  += parseFloat(r.faturados || 0);
    m.mensalista += parseFloat(r.mensalista || 0);
    m.count++;
    if (r.status === "aprovado")   m.aprovados++;
    else if (r.status === "rejeitado") m.rejeitados++;
    else m.pendentes++;
  });
  return Object.values(map).sort((a, b) => a.patio.localeCompare(b.patio));
}

// ── gerar EXCEL ────────────────────────────────────────────
window.gerarExcel = async function(patioFiltro) {
  const btn = document.getElementById("btn-excel");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Gerando...'; }

  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const registros = await buscarRegistrosRelatorio(patioFiltro);
    if (!registros.length) { alert("Nenhum registro encontrado."); return; }

    const wb = XLSX.utils.book_new();
    const dataGeracao = new Date().toLocaleString("pt-BR");

    // ── aba 1: RESUMO POR PÁTIO ──────────────────────────
    const resumo = montarResumo(registros);
    const totalGeral = resumo.reduce((s, r) => s + r.total, 0);

    const resumoData = [
      ["MBL PARK — RELATÓRIO DE FECHAMENTO DE CAIXA"],
      [`Gerado em: ${dataGeracao}`],
      [],
      ["RESUMO POR PÁTIO"],
      ["Pátio", "Fechamentos", "Aprovados", "Pendentes", "Rejeitados", "Dinheiro", "Crédito", "Débito", "PIX", "Sem Parar", "Faturados", "Mensalista", "TOTAL"],
      ...resumo.map(r => [
        r.patio, r.count, r.aprovados, r.pendentes, r.rejeitados,
        r.dinheiro, r.credito, r.debito, r.pix, r.semParar, r.faturados, r.mensalista, r.total
      ]),
      [],
      ["", "", "", "", "TOTAL GERAL", "", "", "", "", "", "", "", totalGeral]
    ];

    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);

    // larguras das colunas
    wsResumo["!cols"] = [
      {wch:22},{wch:12},{wch:11},{wch:11},{wch:11},
      {wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:14}
    ];

    // formatar células de valor como moeda
    const moedaFmt = 'R$ #,##0.00';
    const colsMoeda = [5,6,7,8,9,10,11,12];
    resumo.forEach((_, rowIdx) => {
      const row = rowIdx + 5;
      colsMoeda.forEach(col => {
        const cell = XLSX.utils.encode_cell({ r: row, c: col });
        if (wsResumo[cell]) wsResumo[cell].z = moedaFmt;
      });
    });

    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo por Pátio");

    // ── aba 2: DETALHADO ─────────────────────────────────
    const detalheData = [
      ["MBL PARK — FECHAMENTOS DETALHADOS"],
      [`Gerado em: ${dataGeracao}  |  Total de registros: ${registros.length}`],
      [],
      ["Data", "Pátio", "Turno", "Operador", "Supervisor", "Status",
       "Abertura", "Dinheiro", "Crédito", "Débito", "PIX", "Sem Parar", "Faturados", "Mensalista", "TOTAL",
       "Hora Fechamento", "Op. Fechamento", "Observações"],
      ...registros.map(r => [
        r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "",
        r.patioLabel || r.patio,
        r.turno === "1" ? "Turno 1" : r.turno === "2" ? "Turno 2" : "Turno 3",
        r.operador || "",
        r.supervisor || "",
        r.status === "aprovado" ? "Aprovado" : r.status === "rejeitado" ? "Rejeitado" : "Pendente",
        parseFloat(r.valorAbertura || 0),
        parseFloat(r.dinheiro || 0),
        parseFloat(r.credito || 0),
        parseFloat(r.debito || 0),
        parseFloat(r.pix || 0),
        parseFloat(r.semParar || 0),
        parseFloat(r.faturados || 0),
        parseFloat(r.mensalista || 0),
        parseFloat(r.total || 0),
        r.horaFechamento || "",
        r.opFechamento || "",
        r.obs || ""
      ])
    ];

    const wsDetalhe = XLSX.utils.aoa_to_sheet(detalheData);
    wsDetalhe["!cols"] = [
      {wch:12},{wch:22},{wch:9},{wch:20},{wch:20},{wch:11},
      {wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},
      {wch:14},{wch:20},{wch:30}
    ];

    XLSX.utils.book_append_sheet(wb, wsDetalhe, "Detalhado");

    // download
    const nomeArquivo = `MBLPark_Relatorio_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);

  } catch(e) {
    alert("Erro ao gerar Excel: " + e.message);
    console.error(e);
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-spreadsheet"></i> Baixar Excel'; }
};

// ── gerar PDF ──────────────────────────────────────────────
window.gerarPDF = async function(patioFiltro) {
  const btn = document.getElementById("btn-pdf");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Gerando...'; }

  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");

    const { jsPDF } = window.jspdf;
    const registros  = await buscarRegistrosRelatorio(patioFiltro);
    if (!registros.length) { alert("Nenhum registro encontrado."); return; }

    const resumo     = montarResumo(registros);
    const totalGeral = resumo.reduce((s, r) => s + r.total, 0);
    const dataGeracao = new Date().toLocaleString("pt-BR");

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W   = pdf.internal.pageSize.getWidth();

    const laranja = [232, 98, 10];
    const preto   = [26, 26, 26];
    const branco  = [255, 255, 255];
    const cinzaClaro = [248, 247, 244];

    function cabecalho(titulo) {
      // fundo preto topo
      pdf.setFillColor(...preto);
      pdf.rect(0, 0, W, 18, "F");
      pdf.setTextColor(...branco);
      pdf.setFontSize(13); pdf.setFont("helvetica","bold");
      pdf.text("MBL PARK — ESTACIONAMENTOS", 14, 8);
      pdf.setFontSize(8); pdf.setFont("helvetica","normal");
      pdf.text(titulo, 14, 13);
      pdf.text(`Gerado em: ${dataGeracao}`, W - 14, 13, { align: "right" });
      pdf.setTextColor(0, 0, 0);
    }

    // ── PÁGINA 1: RESUMO ──────────────────────────────────
    cabecalho("RELATÓRIO DE FECHAMENTO DE CAIXA — RESUMO POR PÁTIO");

    pdf.setFontSize(10); pdf.setFont("helvetica","bold");
    pdf.setTextColor(...laranja);
    pdf.text("RESUMO POR PÁTIO", 14, 26);
    pdf.setTextColor(0,0,0);

    pdf.autoTable({
      startY: 30,
      head: [["Pátio", "Fechamentos", "Aprovados", "Pendentes", "Dinheiro", "Crédito", "Débito", "PIX", "Sem Parar", "Faturados", "Mensalista", "TOTAL"]],
      body: [
        ...resumo.map(r => [
          r.patio, r.count, r.aprovados, r.pendentes,
          fmt(r.dinheiro), fmt(r.credito), fmt(r.debito), fmt(r.pix),
          fmt(r.semParar), fmt(r.faturados), fmt(r.mensalista), fmt(r.total)
        ]),
        ["", "", "", "TOTAL GERAL", "", "", "", "", "", "", "", { content: fmt(totalGeral), styles: { fontStyle: "bold", textColor: laranja } }]
      ],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: preto, textColor: branco, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: cinzaClaro },
      columnStyles: {
        0: { cellWidth: 40 },
        11: { fontStyle: "bold" }
      },
      margin: { left: 14, right: 14 }
    });

    // totalizador no fim
    const finalY = pdf.lastAutoTable.finalY + 6;
    pdf.setFillColor(...laranja);
    pdf.roundedRect(14, finalY, W - 28, 12, 2, 2, "F");
    pdf.setTextColor(...branco);
    pdf.setFont("helvetica","bold"); pdf.setFontSize(9);
    pdf.text(`Total de registros: ${registros.length}     |     Pátios: ${resumo.length}     |     Valor total geral: ${fmt(totalGeral)}`, W / 2, finalY + 7.5, { align: "center" });
    pdf.setTextColor(0,0,0);

    // ── PÁGINA 2+: DETALHADO ──────────────────────────────
    pdf.addPage();
    cabecalho("FECHAMENTOS DETALHADOS");

    pdf.setFontSize(10); pdf.setFont("helvetica","bold");
    pdf.setTextColor(...laranja);
    pdf.text("FECHAMENTOS DETALHADOS", 14, 26);
    pdf.setTextColor(0,0,0);

    pdf.autoTable({
      startY: 30,
      head: [["Data", "Pátio", "Turno", "Operador", "Status", "Dinheiro", "Crédito", "Débito", "PIX", "Sem Parar", "Fat.", "Mensal.", "TOTAL", "Obs."]],
      body: registros.map(r => [
        r.data ? new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR") : "",
        r.patioLabel || r.patio,
        r.turno === "1" ? "T1" : r.turno === "2" ? "T2" : "T3",
        r.operador || "",
        r.status === "aprovado" ? "✓ Aprov." : r.status === "rejeitado" ? "✗ Rejeit." : "⏳ Pend.",
        fmt(r.dinheiro), fmt(r.credito), fmt(r.debito), fmt(r.pix),
        fmt(r.semParar), fmt(r.faturados), fmt(r.mensalista), fmt(r.total),
        (r.obs || "").slice(0, 30)
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: preto, textColor: branco, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: cinzaClaro },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 32 },
        2: { cellWidth: 10 },
        3: { cellWidth: 28 },
        4: { cellWidth: 18 },
        12: { fontStyle: "bold" },
        13: { cellWidth: 30 }
      },
      margin: { left: 14, right: 14 }
    });

    // rodapé em todas as páginas
    const totalPags = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPags; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7); pdf.setFont("helvetica","normal");
      pdf.setTextColor(150,150,150);
      pdf.text(`MBL Park Estacionamentos — Página ${i} de ${totalPags}`, W / 2, pdf.internal.pageSize.getHeight() - 5, { align: "center" });
    }

    const nomeArquivo = `MBLPark_Relatorio_${new Date().toISOString().split("T")[0]}.pdf`;
    pdf.save(nomeArquivo);

  } catch(e) {
    alert("Erro ao gerar PDF: " + e.message);
    console.error(e);
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-type-pdf"></i> Baixar PDF'; }
};

// ── render página de relatórios ────────────────────────────
window.renderRelatorios = async function() {
  const el = document.getElementById("lista-patios-rel");
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando pátios...</div>';
  try {
    const snap = await getDocs(collection(db, "patios"));
    const patios = []; snap.forEach(d => patios.push({ id: d.id, ...d.data() }));
    el.innerHTML = patios.map(p => `
      <div class="rel-patio-item">
        <div>
          <div style="font-size:14px;font-weight:500">${p.nome}</div>
          <div style="font-size:12px;color:var(--text2)">${p.id}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-sm" onclick="gerarExcel('${p.id}')"><i class="ti ti-file-spreadsheet"></i> Excel</button>
          <button class="btn-sm" onclick="gerarPDF('${p.id}')"><i class="ti ti-file-type-pdf"></i> PDF</button>
        </div>
      </div>`).join("") || '<div class="empty"><i class="ti ti-inbox"></i><p>Nenhum pátio cadastrado.</p></div>';
  } catch(e) { el.innerHTML = '<div class="empty"><p>Erro ao carregar pátios.</p></div>'; }
};
