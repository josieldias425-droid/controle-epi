"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const EMPTY_EPI = { nome: "", categoria: "", ca: "", unidade: "UN" };
const EMPTY_FUNC = { nome: "", matricula: "", funcao: "", empresa: "", setor: "", data_admissao: "" };

function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("entrega");

  const [login, setLogin] = useState({ email: "", password: "" });
  const [employees, setEmployees] = useState([]);
  const [epis, setEpis] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [observation, setObservation] = useState("");
  const [deliveryItems, setDeliveryItems] = useState([]);

  const [newEmployee, setNewEmployee] = useState(EMPTY_FUNC);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newEpi, setNewEpi] = useState(EMPTY_EPI);
  const [editingEpi, setEditingEpi] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [printDelivery, setPrintDelivery] = useState(null);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) loadData(data.session.user.id);
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadData(next.user.id);
      else {
        setProfile(null);
        setEmployees([]);
        setEpis([]);
        setDeliveries([]);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadData(userId) {
    setLoading(true);
    const [{ data: p, error: pe }, { data: f, error: fe }, { data: e, error: ee }, { data: d, error: de }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("funcionarios").select("*").eq("ativo", true).order("nome"),
      supabase.from("epis").select("*").eq("ativo", true).order("nome"),
      supabase.from("entregas").select(`id, funcionario_id, encarregado_id, data_entrega, observacao, assinatura, created_at, funcionarios(nome, matricula, funcao, empresa), entrega_itens(id, epi_id, quantidade, tamanho, ca, data_recebimento, data_devolucao, observacao, epis(nome, categoria))`).order("created_at", { ascending: false })
    ]);
    if (pe) console.error(pe);
    if (fe) console.error(fe);
    if (ee) console.error(ee);
    if (de) console.error(de);
    setProfile(p || { id: userId, nome: "Usuário", role: "encarregado" });
    setEmployees(f || []);
    setEpis(e || []);
    setDeliveries(d || []);
    setLoading(false);
  }

  async function loginSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(login);
    setLoading(false);
    if (error) setMessage("Não foi possível entrar. Confira e-mail e senha.");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 15);
    return employees.filter((x) =>
      x.nome.toLowerCase().includes(q) || String(x.matricula || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [employees, employeeSearch]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return deliveries;
    return deliveries.filter((d) => {
      const f = d.funcionarios || {};
      return String(f.nome || "").toLowerCase().includes(q) || String(f.matricula || "").toLowerCase().includes(q);
    });
  }, [deliveries, historySearch]);

  function selectEmployee(employee) {
    setSelectedEmployee(employee);
    setEmployeeSearch(employee.nome);
    setDeliveryItems([]);
    setMessage("");
  }

  function addEpiRow(epi) {
    if (deliveryItems.some((x) => x.epi_id === epi.id)) return;
    setDeliveryItems((rows) => [...rows, { epi_id: epi.id, nome: epi.nome, ca: epi.ca || "", quantidade: 1, tamanho: "", data_devolucao: "" }]);
  }

  function updateDeliveryItem(index, field, value) {
    setDeliveryItems((rows) => rows.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function removeDeliveryItem(index) {
    setDeliveryItems((rows) => rows.filter((_, i) => i !== index));
  }

  async function saveDelivery(e) {
    e.preventDefault();
    setMessage("");
    if (!selectedEmployee) return setMessage("Pesquise e selecione um funcionário.");
    if (!deliveryItems.length) return setMessage("Adicione pelo menos um EPI.");

    setLoading(true);
    const { data: delivery, error } = await supabase.from("entregas").insert({
      funcionario_id: selectedEmployee.id,
      encarregado_id: session.user.id,
      data_entrega: deliveryDate || today(),
      observacao: observation || null,
      assinatura: null
    }).select().single();

    if (error) {
      setLoading(false);
      return setMessage("Erro ao salvar a entrega: " + error.message);
    }

    const rows = deliveryItems.map((item) => ({
      entrega_id: delivery.id,
      epi_id: item.epi_id,
      quantidade: Number(item.quantidade) || 1,
      tamanho: item.tamanho || null,
      ca: item.ca || null,
      data_recebimento: deliveryDate || today(),
      data_devolucao: item.data_devolucao || null
    }));

    const { error: itemsError } = await supabase.from("entrega_itens").insert(rows);
    if (itemsError) {
      await supabase.from("entregas").delete().eq("id", delivery.id);
      setLoading(false);
      return setMessage("Erro ao salvar os itens: " + itemsError.message);
    }

    await loadData(session.user.id);
    const full = {
      ...delivery,
      funcionarios: selectedEmployee,
      entrega_itens: deliveryItems.map((item, i) => ({ ...rows[i], epis: { nome: item.nome } }))
    };
    setPrintDelivery(full);
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setDeliveryItems([]);
    setObservation("");
    setDeliveryDate(today());
    setTab("historico");
    setMessage("Entrega registrada com sucesso.");
    setLoading(false);
  }

  async function saveEmployee(e) {
    e.preventDefault();
    if (!newEmployee.nome.trim()) return setMessage("Informe o nome do funcionário.");
    setLoading(true);
    const payload = { ...newEmployee, nome: newEmployee.nome.trim(), matricula: newEmployee.matricula.trim() || null, funcao: newEmployee.funcao.trim() || null, empresa: newEmployee.empresa.trim() || null, setor: newEmployee.setor.trim() || null, data_admissao: newEmployee.data_admissao || null };
    const query = editingEmployee
      ? supabase.from("funcionarios").update(payload).eq("id", editingEmployee.id)
      : supabase.from("funcionarios").insert(payload);
    const { error } = await query;
    if (error) setMessage("Erro: " + error.message);
    else {
      setMessage(editingEmployee ? "Funcionário atualizado." : "Funcionário cadastrado.");
      setNewEmployee(EMPTY_FUNC);
      setEditingEmployee(null);
      await loadData(session.user.id);
    }
    setLoading(false);
  }

  async function deactivateEmployee(employee) {
    if (!window.confirm(`Desativar ${employee.nome}?`)) return;
    const { error } = await supabase.from("funcionarios").update({ ativo: false }).eq("id", employee.id);
    if (error) setMessage(error.message); else await loadData(session.user.id);
  }

  async function saveEpi(e) {
    e.preventDefault();
    if (!newEpi.nome.trim()) return setMessage("Informe o nome do EPI.");
    setLoading(true);
    const payload = { ...newEpi, nome: newEpi.nome.trim(), categoria: newEpi.categoria.trim() || null, ca: newEpi.ca.trim() || null, unidade: newEpi.unidade.trim() || "UN" };
    const query = editingEpi ? supabase.from("epis").update(payload).eq("id", editingEpi.id) : supabase.from("epis").insert(payload);
    const { error } = await query;
    if (error) setMessage("Erro: " + error.message);
    else {
      setMessage(editingEpi ? "EPI atualizado." : "EPI cadastrado.");
      setNewEpi(EMPTY_EPI);
      setEditingEpi(null);
      await loadData(session.user.id);
    }
    setLoading(false);
  }

  async function deactivateEpi(epi) {
    if (!window.confirm(`Desativar ${epi.nome}?`)) return;
    const { error } = await supabase.from("epis").update({ ativo: false }).eq("id", epi.id);
    if (error) setMessage(error.message); else await loadData(session.user.id);
  }

  function startEditEmployee(x) {
    setEditingEmployee(x);
    setNewEmployee({ nome: x.nome || "", matricula: x.matricula || "", funcao: x.funcao || "", empresa: x.empresa || "", setor: x.setor || "", data_admissao: x.data_admissao || "" });
    setTab("funcionarios");
  }

  function startEditEpi(x) {
    setEditingEpi(x);
    setNewEpi({ nome: x.nome || "", categoria: x.categoria || "", ca: x.ca || "", unidade: x.unidade || "UN" });
    setTab("epis");
  }

  function print(d) {
    setPrintDelivery(d);
    setTimeout(() => window.print(), 100);
  }

  if (!session) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={loginSubmit}>
          <div className="brand">EPI</div>
          <h1>Controle EPI</h1>
          <p>Acesso de encarregados e administradores</p>
          <label>E-mail<input type="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label>
          <label>Senha<input type="password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>
          {message && <div className="alert error">{message}</div>}
          <button className="primary big" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
          <small>O usuário precisa estar cadastrado em Supabase Authentication.</small>
        </form>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
        <header className="topbar">
          <div><div className="brand small-brand">EPI</div><div><strong>Controle EPI</strong><span>{profile?.nome || session.user.email}</span></div></div>
          <button className="ghost" onClick={logout}>Sair</button>
        </header>

        <nav className="tabs">
          <button className={tab === "entrega" ? "active" : ""} onClick={() => setTab("entrega")}>Nova entrega</button>
          <button className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>Histórico</button>
          {isAdmin && <button className={tab === "funcionarios" ? "active" : ""} onClick={() => setTab("funcionarios")}>Funcionários</button>}
          {isAdmin && <button className={tab === "epis" ? "active" : ""} onClick={() => setTab("epis")}>EPIs</button>}
        </nav>

        {message && <div className="alert">{message}</div>}

        {tab === "entrega" && (
          <section className="panel">
            <div className="section-head"><div><h1>Registrar entrega</h1><p>Pesquise o funcionário e adicione os equipamentos entregues.</p></div></div>
            <label>Funcionário
              <input placeholder="Digite nome ou matrícula..." value={employeeSearch} onChange={(e) => { setEmployeeSearch(e.target.value); setSelectedEmployee(null); }} />
            </label>
            {!selectedEmployee && <div className="suggestions">{filteredEmployees.map((x) => <button key={x.id} onClick={() => selectEmployee(x)}><strong>{x.nome}</strong><span>{x.matricula || "Sem matrícula"} · {x.funcao || "Sem função"}</span></button>)}{!filteredEmployees.length && <div className="muted">Nenhum funcionário encontrado.</div>}</div>}

            {selectedEmployee && (
              <form onSubmit={saveDelivery}>
                <div className="selected-card"><div><strong>{selectedEmployee.nome}</strong><span>Matrícula: {selectedEmployee.matricula || "-"}</span><span>Função: {selectedEmployee.funcao || "-"}</span></div><button type="button" className="ghost" onClick={() => { setSelectedEmployee(null); setEmployeeSearch(""); }}>Trocar</button></div>
                <div className="grid2"><label>Data da entrega<input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label><label>Observação<input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Opcional" /></label></div>
                <h2>Adicionar EPI</h2>
                <div className="epi-picker">{epis.map((epi) => <button type="button" key={epi.id} onClick={() => addEpiRow(epi)} disabled={deliveryItems.some((x) => x.epi_id === epi.id)}>+ {epi.nome}{epi.ca ? ` · CA ${epi.ca}` : ""}</button>)}</div>
                {deliveryItems.length > 0 && <div className="delivery-list">{deliveryItems.map((item, index) => <div className="delivery-row" key={item.epi_id}><div className="row-title"><strong>{item.nome}</strong><button type="button" className="danger-link" onClick={() => removeDeliveryItem(index)}>remover</button></div><div className="grid3"><label>Qtd.<input type="number" min="1" value={item.quantidade} onChange={(e) => updateDeliveryItem(index, "quantidade", e.target.value)} /></label><label>Tamanho<input value={item.tamanho} onChange={(e) => updateDeliveryItem(index, "tamanho", e.target.value)} placeholder="Ex.: M, 40" /></label><label>CA<input value={item.ca} onChange={(e) => updateDeliveryItem(index, "ca", e.target.value)} /></label></div><label>Data de devolução<input type="date" value={item.data_devolucao} onChange={(e) => updateDeliveryItem(index, "data_devolucao", e.target.value)} /></label></div>)}</div>}
                <button className="primary big" disabled={loading}>{loading ? "Salvando..." : "Salvar entrega"}</button>
              </form>
            )}
          </section>
        )}

        {tab === "historico" && (
          <section className="panel"><div className="section-head"><div><h1>Histórico de entregas</h1><p>Consulte e imprima a ficha A4.</p></div></div><input placeholder="Buscar por funcionário ou matrícula..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} /><div className="history-list">{filteredHistory.map((d) => <article key={d.id} className="history-card"><div><strong>{d.funcionarios?.nome || "Funcionário"}</strong><span>{formatDate(d.data_entrega)} · {d.funcionarios?.matricula || "Sem matrícula"}</span><span>{d.entrega_itens?.length || 0} item(ns)</span></div><button className="primary" onClick={() => print(d)}>Imprimir / PDF</button></article>)}{!filteredHistory.length && <div className="muted">Nenhuma entrega encontrada.</div>}</div></section>
        )}

        {isAdmin && tab === "funcionarios" && (
          <section className="panel"><h1>Funcionários</h1><p>Cadastre e mantenha a lista que os encarregados usarão.</p><form onSubmit={saveEmployee} className="admin-form"><div className="grid2"><label>Nome*<input required value={newEmployee.nome} onChange={(e) => setNewEmployee({ ...newEmployee, nome: e.target.value })} /></label><label>Matrícula<input value={newEmployee.matricula} onChange={(e) => setNewEmployee({ ...newEmployee, matricula: e.target.value })} /></label><label>Função<input value={newEmployee.funcao} onChange={(e) => setNewEmployee({ ...newEmployee, funcao: e.target.value })} /></label><label>Empresa<input value={newEmployee.empresa} onChange={(e) => setNewEmployee({ ...newEmployee, empresa: e.target.value })} /></label><label>Setor<input value={newEmployee.setor} onChange={(e) => setNewEmployee({ ...newEmployee, setor: e.target.value })} /></label><label>Admissão<input type="date" value={newEmployee.data_admissao} onChange={(e) => setNewEmployee({ ...newEmployee, data_admissao: e.target.value })} /></label></div><button className="primary">{editingEmployee ? "Salvar alterações" : "Cadastrar funcionário"}</button>{editingEmployee && <button type="button" className="ghost" onClick={() => { setEditingEmployee(null); setNewEmployee(EMPTY_FUNC); }}>Cancelar edição</button>}</form><div className="admin-list">{employees.map((x) => <div className="admin-row" key={x.id}><div><strong>{x.nome}</strong><span>{x.matricula || "-"} · {x.funcao || "-"}</span></div><div><button className="ghost" onClick={() => startEditEmployee(x)}>Editar</button><button className="danger" onClick={() => deactivateEmployee(x)}>Desativar</button></div></div>)}</div></section>
        )}

        {isAdmin && tab === "epis" && (
          <section className="panel"><h1>Catálogo de EPIs</h1><p>Cadastre os equipamentos e seus CAs.</p><form onSubmit={saveEpi} className="admin-form"><div className="grid2"><label>Nome*<input required value={newEpi.nome} onChange={(e) => setNewEpi({ ...newEpi, nome: e.target.value })} /></label><label>Categoria<input value={newEpi.categoria} onChange={(e) => setNewEpi({ ...newEpi, categoria: e.target.value })} /></label><label>CA<input value={newEpi.ca} onChange={(e) => setNewEpi({ ...newEpi, ca: e.target.value })} /></label><label>Unidade<input value={newEpi.unidade} onChange={(e) => setNewEpi({ ...newEpi, unidade: e.target.value })} /></label></div><button className="primary">{editingEpi ? "Salvar alterações" : "Cadastrar EPI"}</button>{editingEpi && <button type="button" className="ghost" onClick={() => { setEditingEpi(null); setNewEpi(EMPTY_EPI); }}>Cancelar edição</button>}</form><div className="admin-list">{epis.map((x) => <div className="admin-row" key={x.id}><div><strong>{x.nome}</strong><span>{x.categoria || "-"} · CA {x.ca || "-"}</span></div><div><button className="ghost" onClick={() => startEditEpi(x)}>Editar</button><button className="danger" onClick={() => deactivateEpi(x)}>Desativar</button></div></div>)}</div></section>
        )}
      </main>

      {printDelivery && <div className="print-layer"><div className="print-actions no-print"><button className="primary" onClick={() => window.print()}>Imprimir / Salvar PDF</button><button className="ghost" onClick={() => setPrintDelivery(null)}>Fechar</button></div><Printable delivery={printDelivery} /></div>}
    </>
  );
}

function Printable({ delivery }) {
  const f = delivery.funcionarios || {};
  const items = delivery.entrega_itens || [];
  return <div className="sheet"><div className="sheet-head"><div className="company-logo">AFC</div><div><h1>FICHA DE EQUIPAMENTO PROTEÇÃO INDIVIDUAL</h1><p>Controle de entrega e devolução de EPI</p></div></div><div className="employee-box"><div><b>Nome:</b> {f.nome || ""}</div><div><b>Admissão:</b> {formatDate(f.data_admissao)}</div><div><b>Função:</b> {f.funcao || ""}</div><div><b>Registro:</b> {f.matricula || ""}</div><div><b>Empresa:</b> {f.empresa || ""}</div><div><b>Setor:</b> {f.setor || ""}</div></div><h2 className="term-title">TERMO DE COMPROMISSO</h2><p className="term">Declaro ter recebido gratuitamente os Equipamentos de Proteção Individual relacionados nesta ficha, em perfeitas condições de uso. Comprometo-me a utilizá-los corretamente durante as atividades, zelar pela sua conservação e comunicar qualquer dano, perda ou necessidade de substituição, conforme as orientações de segurança da empresa.</p><div className="signature">Assinatura do empregado: ______________________________________________</div><table><thead><tr><th>Quantidade</th><th>EPI marca/modelo</th><th>CA</th><th>Data do Recebimento</th><th>Data da Devolução</th><th>Assinatura</th></tr></thead><tbody>{items.map((item, i) => <tr key={item.id || i}><td>{item.quantidade}</td><td>{item.epis?.nome || ""}{item.tamanho ? ` — Tam. ${item.tamanho}` : ""}</td><td>{item.ca || ""}</td><td>{formatDate(item.data_recebimento || delivery.data_entrega)}</td><td>{formatDate(item.data_devolucao)}</td><td></td></tr>)}{Array.from({ length: Math.max(4, 10 - items.length) }).map((_, i) => <tr key={`empty-${i}`}><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}</tbody></table><h2 className="catalog-title">Catálogo de Descrição dos Equipamentos de Proteção Individual</h2><div className="catalog"><span>Capacete de segurança</span><span>Óculos de proteção</span><span>Protetor auricular</span><span>Luvas de proteção</span><span>Botina de segurança</span><span>Respirador / máscara</span><span>Colete refletivo</span><span>Protetor facial</span></div><div className="sheet-foot">Documento gerado pelo Controle EPI · Data da entrega: {formatDate(delivery.data_entrega)}</div></div>;
}
