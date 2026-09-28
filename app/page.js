"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const EMPTY_EPI = { nome: "", categoria: "", ca: "", unidade: "UN" };
const EMPTY_FUNC = { nome: "", matricula: "", funcao: "", empresa: "", setor: "", data_admissao: "", assinatura: "" };

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
  const [tab, setTab] = useState("inicio");

  const [login, setLogin] = useState({ email: "", password: "" });
  const [employees, setEmployees] = useState([]);
  const [epis, setEpis] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [observation, setObservation] = useState("");
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [signatureData, setSignatureData] = useState("");
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const [newEmployee, setNewEmployee] = useState(EMPTY_FUNC);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newEpi, setNewEpi] = useState(EMPTY_EPI);
  const [editingEpi, setEditingEpi] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyEpi, setHistoryEpi] = useState("");
  const [printDelivery, setPrintDelivery] = useState(null);
  const [printGroup, setPrintGroup] = useState(null);
  const [selectedPrintItemIds, setSelectedPrintItemIds] = useState([]);
  const [encarregados, setEncarregados] = useState([]);
  const [newEncarregado, setNewEncarregado] = useState({ nome: "", email: "", senha: "", confirmarSenha: "" });
  const [editingEncarregado, setEditingEncarregado] = useState(null);
const [administradores, setAdministradores] = useState([]);
const [newAdministrador, setNewAdministrador] = useState({
  nome: "",
  email: "",
  senha: "",
  confirmarSenha: ""
});
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
    setAdministradores((pr || []).filter((x) => x.role === "admin"));
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

  return groupedHistory.filter((group) => {
    const f = group.funcionarios || {};

    const matchesSearch =
      !q ||
      String(f.nome || "").toLowerCase().includes(q) ||
      String(f.matricula || "").toLowerCase().includes(q);

    const deliveries = group.entregas || [];

    const matchesDate =
      (!historyDateFrom && !historyDateTo) ||
      deliveries.some((delivery) => {
        const date = String(delivery.data_entrega || "");

        if (historyDateFrom && date < historyDateFrom) {
          return false;
        }

        if (historyDateTo && date > historyDateTo) {
          return false;
        }

        return true;
      });

    const matchesEpi =
      !historyEpi ||
      (group.entrega_itens || []).some(
        (item) => String(item.epi_id || "") === String(historyEpi)
      );

    return matchesSearch && matchesDate && matchesEpi;
  });
}, [
  groupedHistory,
  historySearch,
  historyDateFrom,
  historyDateTo,
  historyEpi
]);
  function selectEmployee(employee) {
    setSelectedEmployee(employee);
    setEmployeeSearch(employee.nome);
    setDeliveryItems([]);
    setSignatureData(employee.assinatura || "");
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
    if (!signatureData) return setMessage("Peça ao funcionário para assinar antes de salvar a entrega.");

    setLoading(true);
    const { data: delivery, error } = await supabase.from("entregas").insert({
      funcionario_id: selectedEmployee.id,
      encarregado_id: session.user.id,
      data_entrega: deliveryDate || today(),
      observacao: observation || null,
      assinatura: signatureData
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

    const { error: signatureError } = await supabase
      .from("funcionarios")
      .update({ assinatura: signatureData })
      .eq("id", selectedEmployee.id);

    if (signatureError) {
      console.warn("A entrega foi salva, mas a assinatura do funcionário não pôde ser atualizada no cadastro:", signatureError);
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
    setSignatureData("");
    setShowSignaturePad(false);
    setObservation("");
    setDeliveryDate(today());
    setTab("historico");
    setMessage("Entrega registrada com sucesso.");
    setLoading(false);
  }


  async function saveAdministrador() {
  setMessage("");

  const nome = newAdministrador.nome.trim();
  const email = newAdministrador.email.trim().toLowerCase();
  const senha = newAdministrador.senha;
  const confirmarSenha = newAdministrador.confirmarSenha;

  if (!nome || !email || !senha || !confirmarSenha) {
    setMessage("Preencha todos os campos do administrador.");
    return;
  }

  if (senha !== confirmarSenha) {
    setMessage("As senhas não conferem.");
    return;
  }

  if (senha.length < 6) {
    setMessage("A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  setLoading(true);

  const { data, error } = await supabase.functions.invoke(
    "criar-administrador",
    {
      body: {
        nome,
        email,
        senha
      }
    }
  );

  setLoading(false);

  if (error) {
    setMessage("Erro ao cadastrar administrador: " + error.message);
    return;
  }

  if (data?.error) {
    setMessage("Erro: " + data.error);
    return;
  }

  setNewAdministrador({
    nome: "",
    email: "",
    senha: "",
    confirmarSenha: ""
  });

  setMessage("Administrador cadastrado com sucesso.");

  if (session?.user?.id) {
    loadData(session.user.id);
  }
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
    if (!window.confirm(`Remover definitivamente o acesso de ${x.nome}? O login também será desativado.`)) return;

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("remover-encarregado", {
      body: { userId: x.id }
    });

    setLoading(false);

    if (error) {
      setMessage("Erro ao remover encarregado: " + (error.message || "Não foi possível chamar a função."));
      return;
    }

    if (data?.error) {
      setMessage("Erro ao remover encarregado: " + data.error);
      return;
    }

    setMessage("Encarregado removido com sucesso.");
    await loadData(session.user.id);
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
          <div className="topbar-brand">
            <img src="/afc-logo-oficial.png" alt="AFC Geofísica" className="topbar-logo" />
            <div><strong>Controle EPI</strong><span>{profile?.nome || session.user.email}</span></div>
          </div>
          <button className="ghost" onClick={logout}>Sair</button>
        </header>

        <nav className="tabs modern-tabs">
          <button className={tab === "inicio" ? "active" : ""} onClick={() => setTab("inicio")}>⌂ <span>Início</span></button>
          <button className={tab === "entrega" ? "active" : ""} onClick={() => setTab("entrega")}>＋ <span>Nova entrega</span></button>
          <button className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>▤ <span>Histórico</span></button>
          {isAdmin && <button className={tab === "funcionarios" ? "active" : ""} onClick={() => setTab("funcionarios")}>♙ <span>Funcionários</span></button>}
          {isAdmin && <button className={tab === "epis" ? "active" : ""} onClick={() => setTab("epis")}>◈ <span>EPIs</span></button>}
          {isAdmin && <button className={tab === "encarregados" ? "active" : ""} onClick={() => setTab("encarregados")}><span>Encarregados</span></button>}
          {isAdmin && <button className={tab === "administradores" ? "active" : ""} onClick={() => setTab("administradores")}>👨‍💼 <span>Administradores</span></button>}
        </nav>

        {message && <div className="alert">{message}</div>}

        {tab === "inicio" && (
          <section className="dashboard">
            <div className="dashboard-hero">
              <div>
                <span className="eyebrow">CONTROLE EPI</span>
                <h1>Olá, {profile?.nome || "usuário"} 👋</h1>
                <p>Gerencie entregas, funcionários e equipamentos de forma simples e organizada.</p>
              </div>
              <button className="primary big dashboard-main-action" onClick={() => setTab("entrega")}>
                ＋ Nova entrega
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">♙</span>
                <div><strong>{employees.length}</strong><span>Funcionários ativos</span></div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">◈</span>
                <div><strong>{epis.length}</strong><span>EPIs cadastrados</span></div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">▣</span>
                <div><strong>{deliveries.length}</strong><span>Entregas registradas</span></div>
              </div>
              {isAdmin && (
                <div className="stat-card">
                  <span className="stat-icon">👨‍💼</span>
                  <div><strong>{encarregados.length}</strong><span>Encarregados</span></div>
                </div>
              )}
            </div>

            <div className="dashboard-grid">
              <div className="panel quick-panel">
                <div className="section-head">
                  <div>
                    <h2>Acesso rápido</h2>
                    <p>Escolha uma ação para continuar.</p>
                  </div>
                </div>
                <div className="quick-actions">
                  <button onClick={() => setTab("entrega")}><span>＋</span><strong>Registrar entrega</strong><small>Entregar EPI a um funcionário</small></button>
                  <button onClick={() => setTab("historico")}><span>▤</span><strong>Consultar histórico</strong><small>Pesquisar entregas já registradas</small></button>
                  {isAdmin && <button onClick={() => setTab("funcionarios")}><span>♙</span><strong>Funcionários</strong><small>Cadastrar e atualizar colaboradores</small></button>}
                  {isAdmin && <button onClick={() => setTab("epis")}><span>◈</span><strong>Catálogo de EPIs</strong><small>Gerenciar equipamentos e CAs</small></button>}
                </div>
              </div>

              <div className="panel profile-panel">
                <div className="profile-avatar">{(profile?.nome || "U").charAt(0).toUpperCase()}</div>
                <span className="eyebrow">SEU ACESSO</span>
                <h2>{profile?.nome || session.user.email}</h2>
                <p>{isAdmin ? "Administrador" : "Encarregado"}</p>
                <div className="profile-email">{session.user.email}</div>
                <div className="profile-badge">● Acesso ativo</div>
              </div>
            </div>
          </section>
        )}

        {tab === "entrega" && (
          <section className="panel">
            <div className="section-head"><div><h1>Registrar entrega</h1><p>Pesquise o funcionário e adicione os equipamentos entregues.</p></div></div>
            <label>Funcionário
              <input placeholder="Digite nome ou matrícula..." value={employeeSearch} onChange={(e) => { setEmployeeSearch(e.target.value); setSelectedEmployee(null); }} />
            </label>
            {!selectedEmployee && <div className="suggestions">{filteredEmployees.map((x) => <button key={x.id} onClick={() => selectEmployee(x)}><strong>{x.nome}</strong><span>{x.matricula || "Sem matrícula"} · {x.funcao || "Sem função"}</span></button>)}{!filteredEmployees.length && <div className="muted">Nenhum funcionário encontrado.</div>}</div>}

            {selectedEmployee && (
              <form onSubmit={saveDelivery}>
                <div className="selected-card"><div><strong>{selectedEmployee.nome}</strong><span>Matrícula: {selectedEmployee.matricula || "-"}</span><span>Função: {selectedEmployee.funcao || "-"}</span></div><button type="button" className="ghost" onClick={() => { setSelectedEmployee(null); setEmployeeSearch(""); setSignatureData(""); }}>Trocar</button></div>
                <div className="grid2"><label>Data da entrega<input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label><label>Observação<input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Opcional" /></label></div>

                <div style={{ margin: "18px 0", padding: "16px", border: "1px solid #dbe5df", borderRadius: "14px", background: "#f8fbf9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ display: "block", marginBottom: "4px" }}>Assinatura do funcionário</strong>
                      <span className="muted">A assinatura fica salva no cadastro e poderá ser reutilizada nas próximas entregas.</span>
                    </div>
                    <button type="button" className={signatureData ? "ghost" : "primary"} onClick={() => setShowSignaturePad(true)}>
                      {signatureData ? "Refazer assinatura" : "Assinar na tela"}
                    </button>
                  </div>
                  {signatureData ? (
                    <div style={{ marginTop: "12px", padding: "10px", background: "#fff", border: "1px solid #e2e8e5", borderRadius: "10px" }}>
                      <img src={signatureData} alt="Assinatura cadastrada" style={{ display: "block", width: "220px", maxWidth: "100%", height: "70px", objectFit: "contain", objectPosition: "left center" }} />
                      <small style={{ display: "block", marginTop: "4px", color: "#2f6b4f" }}>✓ Assinatura cadastrada e pronta para esta entrega</small>
                    </div>
                  ) : (
                    <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#fff", color: "#68756e" }}>Nenhuma assinatura cadastrada. O funcionário deverá assinar antes de salvar.</div>
                  )}
                </div>

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

            <div className="history-filter">
  <label>
    Pesquisar no histórico
    <input
      type="search"
      placeholder="Digite nome ou matrícula..."
      value={historySearch}
      onChange={(e) => setHistorySearch(e.target.value)}
    />
  </label>
         <label>
  Data inicial
  <input
    type="date"
    value={historyDateFrom}
    onChange={(e) => setHistoryDateFrom(e.target.value)}
  />
</label>

<label>
  Data final
  <input
    type="date"
    value={historyDateTo}
    onChange={(e) => setHistoryDateTo(e.target.value)}
  />
</label>
         <label>
  Filtrar por EPI
  <select
    value={historyEpi}
    onChange={(e) => setHistoryEpi(e.target.value)}
  >
    <option value="">Todos os EPIs</option>

    {epis
      .filter((epi) => epi.ativo !== false)
      .map((epi) => (
        <option key={epi.id} value={epi.id}>
          {epi.nome}
        </option>
      ))}
  </select>
</label>

  {historySearch.trim() && (
    <button
      type="button"
      className="ghost"
     onClick={() => {
  setHistorySearch("");
  setHistoryDateFrom("");
  setHistoryDateTo("");
}}
    >
      Limpar pesquisa
    </button>
  )}
</div>

<div className="history-result-info">
  {historySearch.trim() || historyDateFrom || historyDateTo
    ? `${filteredHistory.length} funcionário(s) encontrado(s)`
    : `${filteredHistory.length} funcionário(s) no histórico`}
</div>

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
        {isAdmin && tab === "administradores" && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h1>Administradores</h1>
                <p>Gerencie quem terá acesso administrativo ao sistema.</p>
              </div>
            </div>

            <div className="info-box">
              <strong>Cadastrar novo administrador</strong>
              <span>
                Administradores terão acesso completo ao sistema, incluindo funcionários,
                EPIs, encarregados, entregas e histórico.
              </span>
            </div>

            <form
              onSubmit={saveAdministrador}
              className="admin-form"
            >
              <div className="grid2">
                <label>
                  Nome completo*
                  <input
                    required
                    value={newAdministrador.nome}
                    onChange={(e) =>
                      setNewAdministrador({
                        ...newAdministrador,
                        nome: e.target.value
                      })
                    }
                    placeholder="Ex.: João Silva"
                  />
                </label>

                <label>
                  E-mail de acesso*
                  <input
                    type="email"
                    required
                    value={newAdministrador.email}
                    onChange={(e) =>
                      setNewAdministrador({
                        ...newAdministrador,
                        email: e.target.value
                      })
                    }
                    placeholder="joao@empresa.com"
                    autoComplete="off"
                  />
                </label>

                <label>
                  Senha inicial*
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newAdministrador.senha}
                    onChange={(e) =>
                      setNewAdministrador({
                        ...newAdministrador,
                        senha: e.target.value
                      })
                    }
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                </label>

                <label>
                  Confirmar senha*
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newAdministrador.confirmarSenha}
                    onChange={(e) =>
                      setNewAdministrador({
                        ...newAdministrador,
                        confirmarSenha: e.target.value
                      })
                    }
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              <button
                className="primary"
                disabled={loading}
              >
                Cadastrar administrador
              </button>
            </form>

            <div className="admin-list">
              {administradores.map((x) => (
                <div className="admin-row" key={x.id}>
                  <div>
                    <strong>{x.nome || "Sem nome"}</strong>
                    <span>Perfil: administrador</span>
                  </div>
                </div>
              ))}

              {!administradores.length && (
                <div className="muted">
                  Nenhum administrador adicional cadastrado ainda.
                </div>
              )}
            </div>
          </section>
        )}

        {isAdmin && tab === "epis" && (
          <section className="panel"><h1>Catálogo de EPIs</h1><p>Cadastre os equipamentos e seus CAs.</p><form onSubmit={saveEpi} className="admin-form"><div className="grid2"><label>Nome*<input required value={newEpi.nome} onChange={(e) => setNewEpi({ ...newEpi, nome: e.target.value })} /></label><label>Categoria<input value={newEpi.categoria} onChange={(e) => setNewEpi({ ...newEpi, categoria: e.target.value })} /></label><label>CA<input value={newEpi.ca} onChange={(e) => setNewEpi({ ...newEpi, ca: e.target.value })} /></label><label>Unidade<input value={newEpi.unidade} onChange={(e) => setNewEpi({ ...newEpi, unidade: e.target.value })} /></label></div><button className="primary">{editingEpi ? "Salvar alterações" : "Cadastrar EPI"}</button>{editingEpi && <button type="button" className="ghost" onClick={() => { setEditingEpi(null); setNewEpi(EMPTY_EPI); }}>Cancelar edição</button>}</form><div className="admin-list">{epis.map((x) => <div className="admin-row" key={x.id}><div><strong>{x.nome}</strong><span>{x.categoria || "-"} · CA {x.ca || "-"}</span></div><div><button className="ghost" onClick={() => startEditEpi(x)}>Editar</button><button className="danger" onClick={() => deactivateEpi(x)}>Desativar</button></div></div>)}</div></section>
        )}
      </main>

      <style jsx global>{`

        .modern-tabs {
          display: flex;
          gap: 6px;
          padding: 8px;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .modern-tabs button {
          border: 0;
          background: transparent;
          color: #59645e;
          border-radius: 12px;
          padding: 10px 12px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          white-space: nowrap;
          font-weight: 700;
          cursor: pointer;
        }

        .modern-tabs button:hover {
          background: #f0f5f1;
          color: #1f6b43;
        }

        .modern-tabs button.active {
          background: #e6f3ea;
          color: #1f6b43;
          box-shadow: inset 0 0 0 1px #cce5d3;
        }

        .dashboard {
          display: grid;
          gap: 16px;
        }

        .dashboard-hero {
          background: linear-gradient(135deg, #145c38 0%, #2d8756 100%);
          color: white;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          box-shadow: 0 14px 35px rgba(20, 92, 56, .18);
        }

        .dashboard-hero h1 {
          margin: 5px 0 8px;
          font-size: clamp(24px, 4vw, 34px);
        }

        .dashboard-hero p {
          margin: 0;
          max-width: 650px;
          opacity: .88;
          line-height: 1.5;
        }

        .eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .12em;
          opacity: .72;
        }

        .dashboard-main-action {
          flex: 0 0 auto;
          background: white;
          color: #17633c;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .stat-card {
          background: white;
          border: 1px solid #e3eae5;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          box-shadow: 0 5px 18px rgba(20, 40, 25, .05);
        }

        .stat-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #edf7f0;
          color: #1f7045;
          font-size: 20px;
        }

        .stat-card div {
          display: grid;
          gap: 2px;
        }

        .stat-card strong {
          font-size: 24px;
          color: #183b29;
        }

        .stat-card div span {
          font-size: 12px;
          color: #6a756e;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.7fr 1fr;
          gap: 16px;
        }

        .quick-panel,
        .profile-panel {
          margin: 0;
        }

        .quick-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .quick-actions button {
          text-align: left;
          border: 1px solid #e1e9e3;
          background: #fbfdfb;
          border-radius: 14px;
          padding: 15px;
          cursor: pointer;
          display: grid;
          gap: 5px;
          transition: .15s ease;
        }

        .quick-actions button:hover {
          border-color: #afd0bb;
          transform: translateY(-1px);
        }

        .quick-actions button > span {
          color: #1f7045;
          font-size: 22px;
        }

        .quick-actions small {
          color: #748078;
          line-height: 1.35;
        }

        .profile-panel {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .profile-avatar {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: #1f7045;
          color: white;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 14px;
        }

        .profile-panel h2 {
          margin: 5px 0 3px;
        }

        .profile-panel p {
          margin: 0 0 12px;
          color: #66736b;
        }

        .profile-email {
          width: 100%;
          padding: 11px 12px;
          background: #f5f8f6;
          border-radius: 10px;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .profile-badge {
          margin-top: 12px;
          font-size: 12px;
          color: #267548;
          font-weight: 700;
        }

        .info-box {
          display: grid;
          gap: 6px;
          padding: 14px;
          margin: 16px 0;
          border: 1px solid #dbe5dc;
          border-radius: 12px;
          background: #f5f9f5;
        }

        .info-box span {
          font-size: 14px;
          line-height: 1.45;
        }

        .history-filter {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          margin: 16px 0 8px;
        }

        .history-filter label {
          flex: 1;
          display: grid;
          gap: 6px;
          font-weight: 600;
        }

        .history-filter input,
        .history-filter select {
          width: 100%;
          box-sizing: border-box;
        }

        .history-result-info {
          margin: 0 0 12px;
          font-size: 13px;
          color: #66706a;
        }

        @media (max-width: 600px) {
          .history-filter {
            align-items: stretch;
            flex-direction: column;
          }

          .history-filter .ghost {
            width: 100%;
          }
        }

        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .dashboard-hero {
            padding: 20px;
            flex-direction: column;
            align-items: stretch;
          }

          .dashboard-main-action {
            width: 100%;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .quick-actions {
            grid-template-columns: 1fr;
          }

          .modern-tabs {
            margin: 0 -4px;
          }

          .modern-tabs button {
            padding: 9px 10px;
          }
        }

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
        .topbar-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .topbar-logo { width: 118px; max-width: 32vw; height: auto; object-fit: contain; object-position: left center; }

        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { width: 210mm !important; height: 297mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .print-layer, .print-layer * { visibility: visible !important; }
          .print-layer { position: absolute !important; inset: 0 !important; width: 210mm !important; height: 297mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fff !important; }
          .print-actions { display: none !important; }
          .sheet { width: 210mm !important; height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important; box-sizing: border-box !important; margin: 0 !important; padding: 7mm 8mm 5mm !important; overflow: hidden !important; page-break-after: avoid !important; page-break-before: avoid !important; break-after: avoid-page !important; break-before: avoid-page !important; font-size: 7.6pt !important; line-height: 1.08 !important; color: #111 !important; }
          .sheet-head { height: 20mm !important; min-height: 20mm !important; display: flex !important; align-items: center !important; gap: 8mm !important; margin-bottom: 2mm !important; }
          .company-logo { width: 30mm !important; flex: 0 0 30mm !important; }
          .company-logo img { display: block !important; width: 27mm !important; height: 20mm !important; object-fit: contain !important; object-position: left center !important; }
          .sheet-head h1 { flex: 1 !important; margin: 0 !important; text-align: center !important; font-size: 15pt !important; line-height: 1.08 !important; font-weight: 800 !important; }
          .employee-grid { display: grid !important; grid-template-columns: 1.8fr 1fr !important; border: 1px solid #555 !important; margin-bottom: 2mm !important; }
          .employee-grid > div { min-height: 9mm !important; padding: 2mm 2.2mm !important; border-right: 1px solid #777 !important; border-bottom: 1px solid #777 !important; font-size: 8pt !important; }
          .employee-grid > div:nth-child(2n) { border-right: 0 !important; }
          .employee-grid > div:nth-last-child(-n+2) { border-bottom: 0 !important; }
          .term-box { border: 1px solid #555 !important; margin-bottom: 2mm !important; padding: 1.6mm 2.2mm 1.8mm !important; }
          .term-box h2 { margin: 0 0 1mm !important; text-align: center !important; font-size: 9pt !important; }
          .term-box p { margin: 0 0 1mm !important; font-size: 7.25pt !important; line-height: 1.15 !important; }
          .term-box .term-subtitle { margin-bottom: .4mm !important; }
          .employee-signature { min-height: 11mm !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 3mm !important; font-size: 8pt !important; }
          .employee-signature img { width: 42mm !important; height: 10mm !important; object-fit: contain !important; object-position: center !important; }
          .signature-line { width: 85mm !important; border-bottom: 1px solid #222 !important; height: 6mm !important; }
          .epi-print-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; margin: 0 0 2mm !important; font-size: 6.8pt !important; }
          .epi-print-table th, .epi-print-table td { border: 1px solid #666 !important; padding: .7mm .7mm !important; height: 5mm !important; max-height: 5mm !important; vertical-align: middle !important; overflow: hidden !important; line-height: 1.02 !important; word-break: break-word !important; }
          .epi-print-table th { font-size: 6.6pt !important; font-weight: 800 !important; text-align: center !important; }
          .epi-print-table .col-qtd { width: 11mm !important; }
          .epi-print-table .col-epi { width: 48mm !important; }
          .epi-print-table .col-mat { width: 25mm !important; }
          .epi-print-table .col-ca { width: 17mm !important; }
          .epi-print-table .col-data { width: 27mm !important; }
          .epi-print-table .col-devolucao { width: 27mm !important; }
          .epi-print-table .col-assinatura { width: 47mm !important; }
          .epi-print-table td:nth-child(1), .epi-print-table td:nth-child(3), .epi-print-table td:nth-child(4), .epi-print-table td:nth-child(5), .epi-print-table td:nth-child(6) { text-align: center !important; }
          .epi-print-table .signature-cell { padding: .3mm !important; text-align: center !important; }
          .epi-print-table .signature-cell img { display: block !important; width: 39mm !important; height: 4.5mm !important; margin: 0 auto !important; object-fit: contain !important; object-position: center !important; }
          .catalog-title { margin: 1mm 0 0 !important; border: 1px solid #555 !important; border-bottom: 0 !important; text-align: center !important; font-size: 7.8pt !important; padding: 1mm !important; }
          .catalog-afc { border: 1px solid #555 !important; font-size: 6.1pt !important; line-height: 1.08 !important; }
          .catalog-afc > div { padding: 1mm 2mm !important; border-bottom: 1px solid #888 !important; }
          .catalog-afc > div:last-child { border-bottom: 0 !important; }
          .sheet, .sheet * { page-break-inside: avoid !important; break-inside: avoid-page !important; }
        }
      `}</style>

      {showSignaturePad && (
        <SignaturePad
          onClose={() => setShowSignaturePad(false)}
          onSave={(data) => { setSignatureData(data); setShowSignaturePad(false); }}
        />
      )}

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


function SignaturePad({ onSave, onClose, initialSignature = "" }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function point(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = e.touches?.[0] || e;
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(e);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  }

  function end(e) {
    if (e?.preventDefault) e.preventDefault();
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
  }

  function save() {
    if (!hasInkRef.current) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="modal-backdrop no-print">
      <div className="print-select-card" style={{ maxWidth: "720px" }}>
        <div className="section-head">
          <div>
            <h2>Assinatura do funcionário</h2>
            <p>Peça ao funcionário para assinar com o dedo no espaço abaixo.</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Fechar</button>
        </div>

        <div style={{ border: "1px solid #d8e1dc", borderRadius: "12px", background: "#fff", overflow: "hidden", marginTop: "14px" }}>
          <canvas
            ref={canvasRef}
            width={900}
            height={280}
            style={{ display: "block", width: "100%", height: "220px", touchAction: "none", cursor: "crosshair" }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerLeave={end}
          />
        </div>

        <div className="print-select-footer" style={{ marginTop: "14px" }}>
          <button type="button" className="ghost" onClick={clear}>Limpar</button>
          <button type="button" className="primary" disabled={!hasInk} onClick={save}>Usar esta assinatura</button>
        </div>
      </div>
    </div>
  );
}

function Printable({ delivery }) {
  const f = delivery.funcionarios || {};
  const items = delivery.entrega_itens || [];
  const visibleItems = items.slice(0, 16);
  const emptyRows = Math.max(0, 16 - visibleItems.length);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div className="company-logo">
          <img src="/afc-logo-oficial.png" alt="AFC Geofísica" />
        </div>
        <h1>FICHA DE EQUIPAMENTO PROTEÇÃO INDIVIDUAL</h1>
      </div>

      <div className="employee-grid">
        <div><b>NOME:</b> {f.nome || ""}</div>
        <div><b>DATA ADMISSÃO:</b> {formatDate(f.data_admissao)}</div>
        <div><b>FUNÇÃO:</b> {f.funcao || ""}</div>
        <div><b>N° DE REGISTRO:</b> {f.matricula || ""}</div>
      </div>

      <section className="term-box">
        <h2>TERMO DE COMPROMISSO</h2>
        <p>Declaro que recebi orientação sobre o uso correto do EPI fornecido pela empresa e limitações de proteção que o EPI oferece, assim como da obrigatoriedade de seu uso, estando ciente da legislação (Portaria n° 3214 de 08/06/1978, do MTE, NR 06, item 6.6, abaixo descriminada e comprometendo-me a cumpri-la).</p>
        <p className="term-subtitle">Cabe ao empregado:</p>
        <p>a) usar o fornecido pela organização, observado o disposto no item 6.5.2;<br />
        b) utilizar apenas para a finalidade a que se destina;<br />
        c) responsabilizar-se pela limpeza, guarda e conservação;<br />
        d) comunicar à organização quando extraviado, danificado ou qualquer alteração que o torne impróprio para o uso e<br />
        e) cumprir as determinações da organização sobre o uso adequado.</p>
        <p>CLT – Artigo 462, parágrafo 1: Em caso de dano causado pelo empregado, o desconto será lícito desde que esta possibilidade tenha sido acordada, ou na ocorrência de dolo do empregado.</p>
        <div className="employee-signature">
          <span>Assinatura:</span>
          {delivery.assinatura ? <img src={delivery.assinatura} alt="Assinatura do empregado" /> : <span className="signature-line" />}
        </div>
      </section>

      <table className="epi-print-table">
        <colgroup>
          <col className="col-qtd" />
          <col className="col-epi" />
          <col className="col-mat" />
          <col className="col-ca" />
          <col className="col-data" />
          <col className="col-devolucao" />
          <col className="col-assinatura" />
        </colgroup>
        <thead>
          <tr>
            <th>Quantidade</th>
            <th>EPI marca/modelo</th>
            <th>Matrícula</th>
            <th>CA</th>
            <th>Data do<br />Recebimento</th>
            <th>Data da<br />Devolução</th>
            <th>Assinatura do empregado</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, i) => (
            <tr key={item.id || `${item.epi_id || "epi"}-${i}`}>
              <td>{item.quantidade}</td>
              <td>{item.epis?.nome || ""}{item.tamanho ? ` — Tam. ${item.tamanho}` : ""}</td>
              <td>{f.matricula || ""}</td>
              <td>{item.ca || ""}</td>
              <td>{formatDate(item.data_recebimento || delivery.data_entrega)}</td>
              <td>{formatDate(item.data_devolucao)}</td>
              <td className="signature-cell">{delivery.assinatura ? <img src={delivery.assinatura} alt="Assinatura" /> : ""}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`empty-${i}`}><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          ))}
        </tbody>
      </table>

      <h2 className="catalog-title">Catálogo de Descrição dos Equipamentos de Proteção Individual</h2>
      <div className="catalog-afc">
        <div><b>Capacete-</b> Capacete de segurança, classe A, tipo II, com suspensões: Fika Firme (STAZ-ON), Fas-Trac (com catraca) e One Touch. Todas com e sem jugular ou Fas-Trac Force com queixeira.</div>
        <div><b>Luva de malha-</b> Luva de segurança, confeccionada em fios composto por adição, condensação de copolímeros transesterificados elastoméricos, tendo componentes adípico hexametilenodiamina denominados terfitálicos com ésters e fibras orion monoméricas, ligados por cabalência com revestimento de borracha nitrílica na palma.</div>
        <div><b>Protetor auricular-</b> Protetor auditivo tipo plugue, confeccionado em silicone de grau farmacêutico, do tipo inserção, composto de um eixo de três flanges maciço e cônico, todas de dimensões variáveis, contendo um orifício no seu interior, moldável a diferentes canais auditivos.</div>
        <div><b>Botina de Segurança-</b> Confeccionado em vaqueta preta, com elástico nas laterais, dorso acolchoado, palmilha em couro, solado poliuretano (PU) bidensidade.</div>
        <div><b>Óculos de Segurança-</b> Constituídos de armação e visor confeccionado em uma única peça de policarbonato incolor, amarelo, cinza ou verde. As hastes, do tipo espátula, são confeccionadas do mesmo material da armação e são fixas às extremidades do visor através de parafusos metálicos e possuem borracha macia preta nas pontas.</div>
        <div><b>Perneira-</b> Perneira de proteção sem joelheira contra corte e picadas de animais peçonhentos confeccionada em couro sintético.</div>
        <div><b>Luva anti corte -</b> Luva de segurança confeccionada em fibras sintéticas, HPPE (polietileno) 13 gauge, revestida em nitrila tipo sandy (areia) na palma e ponta dos dedos, punho com inserção de fibras elásticas e acabamento em fibras sintéticas.</div>
      </div>
    </div>
  );
}
