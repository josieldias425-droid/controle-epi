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
  const [printGroup, setPrintGroup] = useState(null);
  const [selectedPrintItemIds, setSelectedPrintItemIds] = useState([]);
  const [encarregados, setEncarregados] = useState([]);
  const [newEncarregado, setNewEncarregado] = useState({ nome: "", email: "", senha: "", confirmarSenha: "" });
  const [editingEncarregado, setEditingEncarregado] = useState(null);

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
    const [{ data: p, error: pe }, { data: f, error: fe }, { data: e, error: ee }, { data: d, error: de }, { data: pr, error: pre }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("funcionarios").select("*").eq("ativo", true).order("nome"),
      supabase.from("epis").select("*").eq("ativo", true).order("nome"),
      supabase.from("entregas").select(`id, funcionario_id, encarregado_id, data_entrega, observacao, assinatura, created_at, funcionarios(nome, matricula, funcao, empresa), entrega_itens(id, epi_id, quantidade, tamanho, ca, data_recebimento, data_devolucao, observacao, epis(nome, categoria))`).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("nome")
    ]);
    if (pe) { console.error(pe); setMessage("Erro no perfil: " + pe.message); }
    if (fe) console.error(fe);
    if (ee) console.error(ee);
    if (de) console.error(de);
    if (pre) console.error(pre);
    setProfile(p || { id: userId, nome: "Administrador", role: "admin" });
    setEmployees(f || []);
    setEpis(e || []);
    setDeliveries(d || []);
    setEncarregados((pr || []).filter((x) => x.role === "encarregado"));
    setLoading(false);
  }

  async function loginSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(login);
    setLoading(false);
    if (error) setMessage("Erro do Supabase: " + error.message);
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

  const groupedHistory = useMemo(() => {
    const groups = new Map();

    deliveries.forEach((delivery) => {
      const employee = delivery.funcionarios || {};
      const key = delivery.funcionario_id || employee.matricula || employee.nome || delivery.id;

      if (!groups.has(key)) {
        groups.set(key, {
          funcionario_id: delivery.funcionario_id,
          funcionarios: employee,
          entrega_itens: [],
          entregas: [],
          ultima_entrega: delivery.data_entrega,
          ultima_criacao: delivery.created_at
        });
      }

      const group = groups.get(key);
      group.entregas.push(delivery);
      group.entrega_itens.push(...(delivery.entrega_itens || []));

      if (new Date(delivery.created_at || delivery.data_entrega) > new Date(group.ultima_criacao || group.ultima_entrega)) {
        group.ultima_entrega = delivery.data_entrega;
        group.ultima_criacao = delivery.created_at;
      }
    });

    return Array.from(groups.values());
  }, [deliveries]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return groupedHistory;

    return groupedHistory.filter((group) => {
      const f = group.funcionarios || {};
      return String(f.nome || "").toLowerCase().includes(q) || String(f.matricula || "").toLowerCase().includes(q);
    });
  }, [groupedHistory, historySearch]);

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


  async function saveEncarregado(e) {
    e.preventDefault();
    setMessage("");

    const nome = newEncarregado.nome.trim();
    const email = newEncarregado.email.trim().toLowerCase();
    const senha = newEncarregado.senha;
    const confirmarSenha = newEncarregado.confirmarSenha;

    if (!nome) return setMessage("Informe o nome do encarregado.");

    if (editingEncarregado) {
      setLoading(true);
      const { error } = await supabase
        .from("profiles")
        .update({ nome })
        .eq("id", editingEncarregado.id);

      if (error) {
        setMessage("Erro ao atualizar encarregado: " + error.message);
      } else {
        setMessage("Encarregado atualizado com sucesso.");
        setNewEncarregado({ nome: "", email: "", senha: "", confirmarSenha: "" });
        setEditingEncarregado(null);
        await loadData(session.user.id);
      }
      setLoading(false);
      return;
    }

    if (!email) return setMessage("Informe o e-mail do encarregado.");
    if (!senha) return setMessage("Informe uma senha inicial.");
    if (senha.length < 6) return setMessage("A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== confirmarSenha) return setMessage("As senhas não conferem.");

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("criar-encarregado", {
      body: { nome, email, senha }
    });

    if (error) {
      setMessage("Erro ao cadastrar encarregado: " + (error.message || "Não foi possível chamar a função."));
    } else if (data?.error) {
      setMessage("Erro ao cadastrar encarregado: " + data.error);
    } else {
      setMessage("Encarregado cadastrado com sucesso.");
      setNewEncarregado({ nome: "", email: "", senha: "", confirmarSenha: "" });
      await loadData(session.user.id);
    }

    setLoading(false);
  }

  function startEditEncarregado(x) {
    setEditingEncarregado(x);
    setNewEncarregado({ nome: x.nome || "", email: "", senha: "", confirmarSenha: "" });
    setTab("encarregados");
  }

  async function removeEncarregado(x) {
    if (!window.confirm(`Remover o perfil de ${x.nome}? Isso não exclui o usuário do Authentication.`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", x.id);
    if (error) setMessage("Erro: " + error.message);
    else await loadData(session.user.id);
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

  function openPrintSelection(group) {
    setPrintGroup(group);
    setSelectedPrintItemIds(
      group.entrega_itens.map((item, index) => item.id || `${item.epi_id || "epi"}-${index}`)
    );
  }

  function togglePrintItem(item, index) {
    const key = item.id || `${item.epi_id || "epi"}-${index}`;
    setSelectedPrintItemIds((ids) =>
      ids.includes(key)
        ? ids.filter((id) => id !== key)
        : [...ids, key]
    );
  }

  function printEmployeeHistory(group, selectedIds = null) {
    const latestDelivery = group.entregas[0] || {};
    const allItems = group.entrega_itens || [];
    const ids = selectedIds || allItems.map((item, index) => item.id || `${item.epi_id || "epi"}-${index}`);
    const selectedItems = allItems.filter((item, index) =>
      ids.includes(item.id || `${item.epi_id || "epi"}-${index}`)
    );

    if (!selectedItems.length) {
      setMessage("Selecione pelo menos um EPI para imprimir.");
      return;
    }

    if (selectedItems.length > 16) {
      setMessage("A ficha comporta no máximo 16 EPIs. Selecione até 16 itens.");
      return;
    }

    const full = {
      ...latestDelivery,
      funcionario_id: group.funcionario_id,
      funcionarios: group.funcionarios,
      entrega_itens: selectedItems
    };

    setPrintGroup(null);
    setSelectedPrintItemIds([]);
    setPrintDelivery(full);
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
          {isAdmin && <button className={tab === "encarregados" ? "active" : ""} onClick={() => setTab("encarregados")}>Encarregados</button>}
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
          <section className="panel">
            <div className="section-head">
              <div>
                <h1>Histórico de entregas</h1>
                <p>Agora as entregas ficam agrupadas por funcionário.</p>
              </div>
            </div>

            <input
              placeholder="Buscar por funcionário ou matrícula..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />

            <div className="history-list">
              {filteredHistory.map((group) => (
                <article
                  key={group.funcionario_id || group.funcionarios?.matricula || group.funcionarios?.nome}
                  className="history-card"
                >
                  <div>
                    <strong>{group.funcionarios?.nome || "Funcionário"}</strong>
                    <span>Matrícula: {group.funcionarios?.matricula || "Sem matrícula"}</span>
                    <span>{group.entrega_itens.length} EPI(s) registrado(s)</span>
                    <span>Última entrega: {formatDate(group.ultima_entrega)}</span>
                  </div>

                  <button
                    className="primary"
                    onClick={() => openPrintSelection(group)}
                  >
                    Imprimir ficha
                  </button>
                </article>
              ))}

              {!filteredHistory.length && (
                <div className="muted">
                  Nenhuma entrega encontrada.
                </div>
              )}
            </div>
          </section>
        )}

        {isAdmin && tab === "funcionarios" && (
          <section className="panel"><h1>Funcionários</h1><p>Cadastre e mantenha a lista que os encarregados usarão.</p><form onSubmit={saveEmployee} className="admin-form"><div className="grid2"><label>Nome*<input required value={newEmployee.nome} onChange={(e) => setNewEmployee({ ...newEmployee, nome: e.target.value })} /></label><label>Matrícula<input value={newEmployee.matricula} onChange={(e) => setNewEmployee({ ...newEmployee, matricula: e.target.value })} /></label><label>Função<input value={newEmployee.funcao} onChange={(e) => setNewEmployee({ ...newEmployee, funcao: e.target.value })} /></label><label>Empresa<input value={newEmployee.empresa} onChange={(e) => setNewEmployee({ ...newEmployee, empresa: e.target.value })} /></label><label>Setor<input value={newEmployee.setor} onChange={(e) => setNewEmployee({ ...newEmployee, setor: e.target.value })} /></label><label>Admissão<input type="date" value={newEmployee.data_admissao} onChange={(e) => setNewEmployee({ ...newEmployee, data_admissao: e.target.value })} /></label></div><button className="primary">{editingEmployee ? "Salvar alterações" : "Cadastrar funcionário"}</button>{editingEmployee && <button type="button" className="ghost" onClick={() => { setEditingEmployee(null); setNewEmployee(EMPTY_FUNC); }}>Cancelar edição</button>}</form><div className="admin-list">{employees.map((x) => <div className="admin-row" key={x.id}><div><strong>{x.nome}</strong><span>{x.matricula || "-"} · {x.funcao || "-"}</span></div><div><button className="ghost" onClick={() => startEditEmployee(x)}>Editar</button><button className="danger" onClick={() => deactivateEmployee(x)}>Desativar</button></div></div>)}</div></section>
        )}


        {isAdmin && tab === "encarregados" && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h1>Encarregados</h1>
                <p>Gerencie quem poderá registrar entregas e consultar o histórico.</p>
              </div>
            </div>

            <div className="info-box">
              <strong>{editingEncarregado ? "Editar encarregado" : "Cadastrar novo encarregado"}</strong>
              <span>{editingEncarregado ? "Altere o nome do encarregado. O acesso de login continua o mesmo." : "Cadastre o acesso diretamente pelo sistema. Não é mais necessário copiar UUID do Supabase."}</span>
            </div>

            <form onSubmit={saveEncarregado} className="admin-form">
              <div className="grid2">
                <label>Nome completo*
                  <input required value={newEncarregado.nome} onChange={(e) => setNewEncarregado({ ...newEncarregado, nome: e.target.value })} placeholder="Ex.: João Silva" />
                </label>

                {!editingEncarregado && (
                  <>
                    <label>E-mail de acesso*
                      <input type="email" required value={newEncarregado.email} onChange={(e) => setNewEncarregado({ ...newEncarregado, email: e.target.value })} placeholder="joao@empresa.com" autoComplete="off" />
                    </label>
                    <label>Senha inicial*
                      <input type="password" required minLength={6} value={newEncarregado.senha} onChange={(e) => setNewEncarregado({ ...newEncarregado, senha: e.target.value })} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
                    </label>
                    <label>Confirmar senha*
                      <input type="password" required minLength={6} value={newEncarregado.confirmarSenha} onChange={(e) => setNewEncarregado({ ...newEncarregado, confirmarSenha: e.target.value })} placeholder="Repita a senha" autoComplete="new-password" />
                    </label>
                  </>
                )}
              </div>
              <button className="primary" disabled={loading}>{editingEncarregado ? "Salvar alterações" : "Cadastrar encarregado"}</button>
              {editingEncarregado && <button type="button" className="ghost" onClick={() => { setEditingEncarregado(null); setNewEncarregado({ nome: "", email: "", senha: "", confirmarSenha: "" }); }}>Cancelar edição</button>}
            </form>

            <div className="admin-list">
              {encarregados.map((x) => (
                <div className="admin-row" key={x.id}>
                  <div><strong>{x.nome || "Sem nome"}</strong><span>Perfil: encarregado</span></div>
                  <div><button className="ghost" onClick={() => startEditEncarregado(x)}>Editar</button><button className="danger" onClick={() => removeEncarregado(x)}>Remover perfil</button></div>
                </div>
              ))}
              {!encarregados.length && <div className="muted">Nenhum encarregado vinculado ainda.</div>}
            </div>
          </section>
        )}

        {isAdmin && tab === "epis" && (
          <section className="panel"><h1>Catálogo de EPIs</h1><p>Cadastre os equipamentos e seus CAs.</p><form onSubmit={saveEpi} className="admin-form"><div className="grid2"><label>Nome*<input required value={newEpi.nome} onChange={(e) => setNewEpi({ ...newEpi, nome: e.target.value })} /></label><label>Categoria<input value={newEpi.categoria} onChange={(e) => setNewEpi({ ...newEpi, categoria: e.target.value })} /></label><label>CA<input value={newEpi.ca} onChange={(e) => setNewEpi({ ...newEpi, ca: e.target.value })} /></label><label>Unidade<input value={newEpi.unidade} onChange={(e) => setNewEpi({ ...newEpi, unidade: e.target.value })} /></label></div><button className="primary">{editingEpi ? "Salvar alterações" : "Cadastrar EPI"}</button>{editingEpi && <button type="button" className="ghost" onClick={() => { setEditingEpi(null); setNewEpi(EMPTY_EPI); }}>Cancelar edição</button>}</form><div className="admin-list">{epis.map((x) => <div className="admin-row" key={x.id}><div><strong>{x.nome}</strong><span>{x.categoria || "-"} · CA {x.ca || "-"}</span></div><div><button className="ghost" onClick={() => startEditEpi(x)}>Editar</button><button className="danger" onClick={() => deactivateEpi(x)}>Desativar</button></div></div>)}</div></section>
        )}
      </main>

      <style jsx global>{`

        .info-box {
          display: grid;
          gap: 6px;
          padding: 14px;
          margin: 16px 0;
          border: 1px solid #dbe5dc;
          border-radius: 12px;
          background: #f5f9f5;
        }
        .info-box span { font-size: 14px; line-height: 1.45; }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .print-select-card {
          width: min(720px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: #fff;
          border-radius: 16px;
          padding: 22px;
          box-shadow: 0 20px 60px rgba(0,0,0,.25);
        }
        .print-select-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 12px 0;
        }
        .print-item-list {
          display: grid;
          gap: 8px;
          margin: 14px 0;
        }
        .print-item-option {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 10px;
          cursor: pointer;
          background: #fafafa;
        }
        .print-item-option input {
          width: 20px;
          height: 20px;
          margin-top: 2px;
        }
        .print-item-option div {
          display: grid;
          gap: 3px;
        }
        .print-item-option span {
          font-size: 13px;
          opacity: .75;
        }
        .print-select-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 12px;
          border-top: 1px solid #eee;
        }
        @media (max-width: 600px) {
          .print-select-footer {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      {printGroup && (
        <div className="modal-backdrop no-print">
          <div className="print-select-card">
            <div className="section-head">
              <div>
                <h2>Escolher EPIs para imprimir</h2>
                <p>
                  {printGroup.funcionarios?.nome || "Funcionário"} · {printGroup.entrega_itens.length} item(ns) registrados. A ficha comporta até 16 linhas.
                </p>
              </div>
              <button className="ghost" onClick={() => setPrintGroup(null)}>Fechar</button>
            </div>

            <div className="print-select-actions">
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setSelectedPrintItemIds(
                    printGroup.entrega_itens.map((item, index) => item.id || `${item.epi_id || "epi"}-${index}`)
                  )
                }
              >
                Selecionar todos
              </button>

              <button
                type="button"
                className="ghost"
                onClick={() => setSelectedPrintItemIds([])}
              >
                Limpar seleção
              </button>
            </div>

            <div className="print-item-list">
              {printGroup.entrega_itens.map((item, index) => {
                const key = item.id || `${item.epi_id || "epi"}-${index}`;
                const checked = selectedPrintItemIds.includes(key);

                return (
                  <label className="print-item-option" key={key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePrintItem(item, index)}
                    />
                    <div>
                      <strong>{item.epis?.nome || "EPI"}</strong>
                      <span>
                        Qtd.: {item.quantidade || 1} · CA: {item.ca || "-"} · Recebimento: {formatDate(item.data_recebimento)}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="print-select-footer">
              <span>{selectedPrintItemIds.length} selecionado(s)</span>
              <button
                type="button"
                className="primary big"
                onClick={() => printEmployeeHistory(printGroup, selectedPrintItemIds)}
              >
                Imprimir selecionados
              </button>
            </div>
          </div>
        </div>
      )}

      {printDelivery && <div className="print-layer"><div className="print-actions no-print"><button className="primary" onClick={() => window.print()}>Imprimir / Salvar PDF</button><button className="ghost" onClick={() => setPrintDelivery(null)}>Fechar</button></div><Printable delivery={printDelivery} /></div>}
    </>
  );
}

function Printable({ delivery }) {
  const f = delivery.funcionarios || {};
  const items = delivery.entrega_itens || [];

  const visibleItems = items.slice(0, 16);
  const emptyRows = Math.max(0, 16 - visibleItems.length);

  return (
    <div className="sheet">
      <div className="sheet-head" style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div className="company-logo" style={{ flex: "0 0 auto", width: "105px" }}>
          <img
            src="/afc-logo.png"
            alt="AFC Geofísica"
            style={{ width: "100%", height: "auto", maxHeight: "72px", objectFit: "contain", objectPosition: "left top" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <h1>FICHA DE EQUIPAMENTO PROTEÇÃO INDIVIDUAL</h1>
          <p>Controle de entrega e devolução de EPI</p>
        </div>
      </div>

      <div className="employee-box">
        <div><b>Nome:</b> {f.nome || ""}</div>
        <div><b>Admissão:</b> {formatDate(f.data_admissao)}</div>
        <div><b>Função:</b> {f.funcao || ""}</div>
        <div><b>Registro:</b> {f.matricula || ""}</div>
        <div><b>Empresa:</b> {f.empresa || ""}</div>
        <div><b>Setor:</b> {f.setor || ""}</div>
      </div>

      <h2 className="term-title">TERMO DE COMPROMISSO</h2>

      <p className="term">
        Declaro ter recebido gratuitamente os Equipamentos de Proteção Individual relacionados nesta ficha, em perfeitas condições de uso. Comprometo-me a utilizá-los corretamente durante as atividades, zelar pela sua conservação e comunicar qualquer dano, perda ou necessidade de substituição, conforme as orientações de segurança da empresa.
      </p>

      <div className="signature">
        Assinatura do empregado: ______________________________________________
      </div>

      <table>
        <thead>
          <tr>
            <th>Quantidade</th>
            <th>EPI marca/modelo</th>
            <th>CA</th>
            <th>Data do Recebimento</th>
            <th>Data da Devolução</th>
            <th>Assinatura</th>
          </tr>
        </thead>

        <tbody>
          {visibleItems.map((item, i) => (
            <tr key={item.id || `${item.epi_id || "epi"}-${i}`}>
              <td>{item.quantidade}</td>
              <td>
                {item.epis?.nome || ""}
                {item.tamanho ? ` — Tam. ${item.tamanho}` : ""}
              </td>
              <td>{item.ca || ""}</td>
              <td>{formatDate(item.data_recebimento || delivery.data_entrega)}</td>
              <td>{formatDate(item.data_devolucao)}</td>
              <td></td>
            </tr>
          ))}

          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="catalog-title">
        Catálogo de Descrição dos Equipamentos de Proteção Individual
      </h2>

      <div className="catalog" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 14px" }}>
        <span><b>Capacete de segurança:</b> protege a cabeça contra impactos e queda de objetos.</span>
        <span><b>Luva de proteção:</b> protege as mãos contra abrasão, sujeira e outros riscos da atividade.</span>
        <span><b>Proteção auricular:</b> reduz a exposição ao ruído e ajuda a preservar a audição.</span>
        <span><b>Botina de segurança:</b> protege os pés contra impactos, perfurações e outros riscos.</span>
        <span><b>Óculos de segurança:</b> protegem os olhos contra poeira, partículas e respingos.</span>
        <span><b>Perneira:</b> protege pernas e tornozelos contra cortes, impactos e outros riscos.</span>
        <span><b>Luva anticorte:</b> protege as mãos durante atividades com materiais ou ferramentas cortantes.</span>
      </div>

      <div className="sheet-foot">
        Documento gerado pelo Controle EPI · Data da última entrega: {formatDate(delivery.data_entrega)}
      </div>
    </div>
  );
}
