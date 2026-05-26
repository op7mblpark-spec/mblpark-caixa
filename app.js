// =============================================
//  MBL PARK — app.js
//  Substitua os valores abaixo pelas suas
//  credenciais do Firebase após criar o projeto
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── COLE AQUI AS SUAS CREDENCIAIS DO FIREBASE ───────────────────────────────
const firebaseConfig = {
  apiKey:            "COLE_AQUI",
  authDomain:        "COLE_AQUI",
  projectId:         "COLE_AQUI",
  storageBucket:     "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId:             "COLE_AQUI"
};
// ─────────────────────────────────────────────────────────────────────────────

const app     = initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);

// ── credencial fixa do auditor ──────────────────────────────────────────────
const AUDITOR = { id: "auditor", label: "Auditor", senha: "MBL@audit2024", tipo: "auditor" };

// ── estado global ────────────────────────────────────────────────────────────
let sessao   = null;
let fotoFile = null;

// ── utilitários ─────────────────────────────────────────────────────────────
function fmt(v) {
  return "R$ " + parseFloat(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function n(id) { return parseFloat(document.getElementById(id)?.value || 0); }
function v(id) { return document.getElementById(id)?.value?.trim() || ""; }

// ── calcular total ────────────────────────────────────────────────────────────
window.calcTotal = function () {
  const dinheiro = n("f-dinheiro");
  const digital  = n("f-credito") + n("f-debito") + n("f-pix") + n("f-semparar") + n("f-faturados") + n("f-mensalista");
  document.getElementById("t-dinheiro").textContent = fmt(dinheiro);
  document.getElementById("t-digital").textContent  = fmt(digital);
  document.getElementById("t-total").textContent    = fmt(dinheiro + digital);
  return dinheiro + digital;
};

// ── build select de login ────────────────────────────────────────────────────
async function buildLoginSelect() {
  const sel = document.getElementById("login-patio");
  sel.innerHTML = '<option value="">Selecione...</option><option value="auditor">🔍 Auditor — acesso completo</option>';
  const snap = await getDocs(collection(db, "patios"));
  const grp  = document.createElement("optgroup");
  grp.label  = "Pátios MBL Park";
  snap.forEach(d => {
    const p = d.data();
    if (!p.ativo) return;
    const o = document.createElement("option");
    o.value = d.id; o.textContent = p.nome;
    grp.appendChild(o);
  });
  if (grp.childElementCount) sel.appendChild(grp);
}

// ── login ────────────────────────────────────────────────────────────────────
async function entrar() {
  const id    = document.getElementById("login-patio").value;
  const senha = document.getElementById("login-senha").value;
  const erro  = document.getElementById("login-erro");
  erro.textContent = "";

  if (!id) { erro.textContent = "Selecione um pátio."; return; }

  if (id === "auditor") {
    if (senha !== AUDITOR.senha) { erro.textContent = "Senha incorreta."; return; }
    sessao = AUDITOR;
  } else {
    const snap = await getDocs(collection(db, "patios"));
    let found  = null;
    snap.forEach(d => { if (d.id === id) found = { id: d.id, ...d.data() }; });
    if (!found || found.senha !== senha || !found.ativo) {
      erro.textContent = "Pátio ou senha incorretos."; return;
    }
    sessao = { id: found.id, label: found.nome, tipo: "patio" };
  }

  document.getElementById("login-senha").value = "";
  iniciarApp();
}

// ── iniciar app ───────────────────────────────────────────────────────────────
function iniciarApp() {
  document.getElementById("screen-login").classList.remove("active");
  document.getElementById("screen-app").classList.add("active");
  document.getElementById("topbar-sub").textContent = sessao.label;

  if (sessao.tipo === "auditor") {
    document.getElementById("topbar-badge").innerHTML =
      '<span class="badge-auditor"><i class="ti ti-eye"></i> Auditoria</span>';
    document.getElementById("tabs-auditor").style.display = "flex";
    document.getElementById("tabs-operador").style.display = "none";
    showPage("auditoria", document.querySelector("#tabs-auditor .tab"));
  } else {
    document.getElementById("topbar-badge").innerHTML =
      `<span class="badge-patio"><i class="ti ti-building"></i> ${sessao.label}</span>`;
    document.getElementById("tabs-operador").style.display = "flex";
    document.getElementById("tabs-auditor").style.display  = "none";
    showPage("form", document.querySelector("#tabs-operador .tab"));
    document.getElementById("f-data").value = new Date().toISOString().split("T")[0];
  }
}

// ── sair ─────────────────────────────────────────────────────────────────────
function sair() {
  sessao = null;
  document.getElementById("screen-app").classList.remove("active");
  document.getElementById("screen-login").classList.add("active");
  buildLoginSelect();
}

// ── navegar entre páginas ────────────────────────────────────────────────────
function showPage(page, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  if (btn) {
    btn.closest(".tabs").querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
  }
  if (page === "registros")  renderPatio();
  if (page === "auditoria")  renderAuditoria();
  if (page === "patios")     renderPatios();
}

// ── salvar registro ───────────────────────────────────────────────────────────
async function salvar() {
  const operador = v("f-operador");
  const turno    = v("f-turno");
  const data     = v("f-data");
  if (!operador || !turno || !data) { alert("Preencha operador, turno e data."); return; }

  const btn = document.getElementById("btn-salvar");
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Salvando...';

  let fotoURL = null;
  if (fotoFile) {
    const storageRef = ref(storage, `fichas/${Date.now()}_${fotoFile.name}`);
    await uploadBytes(storageRef, fotoFile);
    fotoURL = await getDownloadURL(storageRef);
  }

  const reg = {
    patio: sessao.id, patioLabel: sessao.label,
    operador, supervisor: v("f-supervisor"),
    turno, data,
    valorAbertura: n("f-abertura"),
    dinheiro:   n("f-dinheiro"),
    credito:    n("f-credito"),
    debito:     n("f-debito"),
    pix:        n("f-pix"),
    semParar:   n("f-semparar"),
    faturados:  n("f-faturados"),
    mensalista: n("f-mensalista"),
    total: calcTotal(),
    horaFechamento: v("f-hora"),
    opFechamento:   v("f-op-fechamento"),
    obs:   v("f-obs"),
    foto:  fotoURL,
    status: "pendente",
    criadoEm: new Date().toISOString()
  };

  await addDoc(collection(db, "registros"), reg);

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar registro';

  const banner = document.getElementById("success-banner");
  banner.style.display = "flex";
  setTimeout(() => { banner.style.display = "none"; }, 3000);
  limpar();
}

// ── limpar formulário ─────────────────────────────────────────────────────────
function limpar() {
  ["f-operador","f-supervisor","f-abertura","f-dinheiro","f-credito","f-debito",
   "f-pix","f-semparar","f-faturados","f-mensalista","f-hora","f-op-fechamento","f-obs"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("f-turno").value = "";
  document.getElementById("f-data").value  = new Date().toISOString().split("T")[0];
  fotoFile = null;
  document.getElementById("foto-preview").style.display = "none";
  document.getElementById("upload-area").style.display  = "block";
  calcTotal();
}

// ── render registros do pátio ─────────────────────────────────────────────────
async function renderPatio() {
  const el = document.getElementById("lista-patio");
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>';
  const q    = query(collection(db, "registros"), orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach(d => { const r = { id: d.id, ...d.data() }; if (r.patio === sessao.id) lista.push(r); });
  el.innerHTML = lista.length ? lista.map(regHtml).join("") :
    '<div class="empty"><i class="ti ti-inbox"></i><p>Nenhum registro ainda.</p></div>';
}

// ── render auditoria ──────────────────────────────────────────────────────────
async function renderAuditoria() {
  const el = document.getElementById("lista-auditoria");
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>';

  const fp = document.getElementById("aud-filtro-patio").value.toLowerCase();
  const ft = document.getElementById("aud-filtro-turno").value;
  const fd = document.getElementById("aud-filtro-data").value;
  const fs = document.getElementById("aud-filtro-status").value;

  const q    = query(collection(db, "registros"), orderBy("criadoEm", "desc"));
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach(d => {
    const r = { id: d.id, ...d.data() };
    if (fp && !r.patioLabel?.toLowerCase().includes(fp)) return;
    if (ft && r.turno !== ft) return;
    if (fd && r.data !== fd) return;
    if (fs && r.status !== fs) return;
    lista.push(r);
  });
  el.innerHTML = lista.length ? lista.map(r => regHtml(r, true)).join("") :
    '<div class="empty"><i class="ti ti-inbox"></i><p>Nenhum registro encontrado.</p></div>';
}

// ── aprovar / rejeitar ────────────────────────────────────────────────────────
window.atualizarStatus = async function (id, status) {
  await updateDoc(doc(db, "registros", id), { status });
  renderAuditoria();
};

// ── modal foto ────────────────────────────────────────────────────────────────
window.verFoto = function (url, nome) {
  document.getElementById("modal-img").src     = url;
  document.getElementById("modal-titulo").textContent = "Ficha — " + nome;
  document.getElementById("modal-foto").style.display = "flex";
};

// ── render de um registro ─────────────────────────────────────────────────────
const tClass = { "1": "t1", "2": "t2", "3": "t3" };
const tLabel = { "1": "Turno 1", "2": "Turno 2", "3": "Turno 3" };
const sClass = { pendente: "s-pendente", aprovado: "s-aprovado", rejeitado: "s-rejeitado" };
const sLabel = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };
const sIcon  = { pendente: "ti-clock", aprovado: "ti-circle-check", rejeitado: "ti-circle-x" };

function regHtml(r, isAuditor = false) {
  const data = r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const st   = r.status || "pendente";
  return `
  <div class="reg-item">
    <div class="reg-header">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:500">${r.patioLabel}</span>
        <span class="turno-badge ${tClass[r.turno] || ""}">${tLabel[r.turno] || ""}</span>
        <span class="status-reg ${sClass[st]}"><i class="ti ${sIcon[st]}"></i> ${sLabel[st]}</span>
      </div>
      <span style="font-size:12px;color:var(--text2)">${data}</span>
    </div>
    <div class="reg-meta">Operador: ${r.operador}${r.supervisor ? " · Supervisor: " + r.supervisor : ""}</div>
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
      <span style="font-size:12px;color:var(--text2)">${r.horaFechamento ? "Fechamento: " + r.horaFechamento : ""}${r.obs ? " · " + r.obs.slice(0, 50) + (r.obs.length > 50 ? "…" : "") : ""}</span>
      <div class="reg-actions">
        ${r.foto ? `<button class="btn-ver-foto" onclick="verFoto('${r.foto}','${r.patioLabel}')"><i class="ti ti-photo"></i> Ver foto</button>` : ""}
        ${isAuditor && st === "pendente" ? `
          <button class="btn-aprovar" onclick="atualizarStatus('${r.id}','aprovado')"><i class="ti ti-check"></i> Aprovar</button>
          <button class="btn-rejeitar" onclick="atualizarStatus('${r.id}','rejeitado')"><i class="ti ti-x"></i> Rejeitar</button>
        ` : ""}
        <span style="font-size:15px;font-weight:600;color:var(--laranja)">${fmt(r.total)}</span>
      </div>
    </div>
  </div>`;
}

// ── pátios ────────────────────────────────────────────────────────────────────
async function adicionarPatio() {
  const nome  = document.getElementById("np-nome").value.trim();
  const id    = document.getElementById("np-id").value.trim().toLowerCase().replace(/\s+/g, "-");
  const senha = document.getElementById("np-senha").value.trim();
  const erro  = document.getElementById("patio-erro");
  if (!nome || !id || !senha)   { erro.textContent = "Preencha todos os campos."; return; }
  if (senha.length < 6)          { erro.textContent = "Senha mínima: 6 caracteres."; return; }
  if (id === "auditor")          { erro.textContent = "ID reservado."; return; }

  await addDoc(collection(db, "patios"), { nome, senha, ativo: true, criadoEm: new Date().toISOString() });
  erro.textContent = "";
  document.getElementById("np-nome").value  = "";
  document.getElementById("np-id").value    = "";
  document.getElementById("np-senha").value = "";
  renderPatios();
}

async function togglePatio(docId, ativo) {
  await updateDoc(doc(db, "patios", docId), { ativo: !ativo });
  renderPatios();
}

async function renderPatios() {
  const busca = document.getElementById("busca-patio").value.toLowerCase();
  const snap  = await getDocs(collection(db, "patios"));
  const todos = [];
  snap.forEach(d => todos.push({ docId: d.id, ...d.data() }));
  const lista = todos.filter(p => !busca || p.nome.toLowerCase().includes(busca) || p.docId.toLowerCase().includes(busca));

  document.getElementById("counter-patios").textContent =
    todos.length + " pátio" + (todos.length !== 1 ? "s" : "") + " cadastrado" + (todos.length !== 1 ? "s" : "");

  document.getElementById("tabela-patios").innerHTML = lista.length
    ? lista.map(p => `
      <tr>
        <td style="font-weight:500">${p.nome}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--text2)">${p.docId}</td>
        <td><span class="senha-mask" data-v="0" onclick="this.dataset.v==='1'?(this.textContent='••••••',this.dataset.v='0'):(this.textContent='${p.senha}',this.dataset.v='1')">••••••</span></td>
        <td><span class="status-pill ${p.ativo ? "status-ativo" : "status-inativo"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="togglePatio('${p.docId}',${p.ativo})">
            <i class="ti ti-${p.ativo ? "eye-off" : "eye"}"></i> ${p.ativo ? "Desativar" : "Ativar"}
          </button>
        </div></td>
      </tr>`) .join("")
    : '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text2)">Nenhum pátio encontrado.</td></tr>';
}

// expor para HTML inline
window.togglePatio  = togglePatio;

// ── FOTO preview ──────────────────────────────────────────────────────────────
document.getElementById("f-foto").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  fotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("foto-img").src        = e.target.result;
    document.getElementById("foto-preview").style.display = "block";
    document.getElementById("upload-area").style.display  = "none";
  };
  reader.readAsDataURL(file);
});

document.getElementById("btn-remover-foto").addEventListener("click", () => {
  fotoFile = null;
  document.getElementById("foto-preview").style.display = "none";
  document.getElementById("upload-area").style.display  = "block";
  document.getElementById("f-foto").value = "";
});

// ── modal ─────────────────────────────────────────────────────────────────────
document.getElementById("modal-close").addEventListener("click",    () => { document.getElementById("modal-foto").style.display = "none"; });
document.getElementById("modal-backdrop").addEventListener("click", () => { document.getElementById("modal-foto").style.display = "none"; });

// ── events ────────────────────────────────────────────────────────────────────
document.getElementById("btn-entrar").addEventListener("click", entrar);
document.getElementById("login-senha").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
document.getElementById("btn-sair").addEventListener("click", sair);
document.getElementById("btn-salvar").addEventListener("click", salvar);
document.getElementById("btn-limpar").addEventListener("click", limpar);
document.getElementById("btn-add-patio").addEventListener("click", adicionarPatio);

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page, btn));
});

["aud-filtro-patio","aud-filtro-turno","aud-filtro-data","aud-filtro-status"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", renderAuditoria);
  document.getElementById(id)?.addEventListener("change", renderAuditoria);
});

document.getElementById("busca-patio").addEventListener("input", renderPatios);

// ── init ──────────────────────────────────────────────────────────────────────
buildLoginSelect();
