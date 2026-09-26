"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const EMPTY_EPI = { nome: "", categoria: "", ca: "", unidade: "UN" };
const EMPTY_FUNC = {
  nome: "",
  matricula: "",
  funcao: "",
  empresa: "",
  setor: "",
  data_admissao: ""
};

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

      if (data.session) {
        loadData(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);

        if (next) {
          loadData(next.user.id);
        } else {
          setProfile(null);
          setEmployees([]);
          setEpis([]);
          setDeliveries([]);
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadData(userId) {
    setLoading(true);

    const [
      { data: p, error: pe },
      { data: f, error: fe },
      { data: e, error: ee },
      { data: d, error: de }
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("funcionarios")
        .select("*")
        .eq("ativo", true)
        .order("nome"),

      supabase
        .from("epis")
        .select("*")
        .eq("ativo", true)
        .order("nome"),

      supabase
        .from("entregas")
        .select(`
          id,
          funcionario_id,
          encarregado_id,
          data_entrega,
          observacao,
          assinatura,
          created_at,
          funcionarios(nome, matricula, funcao, empresa),
          entrega_itens(
            id,
            epi_id,
            quantidade,
            tamanho,
            ca,
            data_recebimento,
            data_devolucao,
            observacao,
            epis(nome, categoria)
          )
        `)
        .order("created_at", { ascending: false })
    ]);

    if (pe) {
      console.error(pe);
      setMessage("Erro no perfil: " + pe.message);
    }

    if (fe) console.error(fe);
    if (ee) console.error(ee);
    if (de) console.error(de);

    /*
      IMPORTANTE:
      Se existir perfil no Supabase, usamos o perfil real.
      Se não existir, usamos admin como fallback.
    */
    setProfile(
      p || {
        id: userId,
        nome: "Administrador",
        role: "admin"
      }
    );

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

    if (error) {
      setMessage("Erro do Supabase: " + error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();

    if (!q) {
      return employees.slice(0, 15);
    }

    return employees
      .filter(
        (x) =>
          x.nome.toLowerCase().includes(q) ||
          String(x.matricula || "")
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 20);
  }, [employees, employeeSearch]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();

    if (!q) return deliveries;

    return deliveries.filter((d) => {
      const f = d.funcionarios || {};

      return (
        String(f.nome || "")
          .toLowerCase()
          .includes(q) ||
        String(f.matricula || "")
          .toLowerCase()
          .includes(q)
      );
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

    setDeliveryItems((rows) => [
      ...rows,
      {
        epi_id: epi.id,
        nome: epi.nome,
        ca: epi.ca || "",
        quantidade: 1,
        tamanho: "",
        data_devolucao: ""
      }
    ]);
  }

  function updateDeliveryItem(index, field, value) {
    setDeliveryItems((rows) =>
      rows.map((r, i) =>
        i === index ? { ...r, [field]: value } : r
      )
    );
  }

  function removeDeliveryItem(index) {
    setDeliveryItems((rows) =>
      rows.filter((_, i) => i !== index)
    );
  }

  async function saveDelivery(e) {
    e.preventDefault();

    setMessage("");

    if (!selectedEmployee) {
      return setMessage(
        "Pesquise e selecione um funcionário."
      );
    }

    if (!deliveryItems.length) {
      return setMessage(
        "Adicione pelo menos um EPI."
      );
    }

    setLoading(true);

    const { data: delivery, error } =
      await supabase
        .from("entregas")
        .insert({
          funcionario_id: selectedEmployee.id,
          encarregado_id: session.user.id,
          data_entrega: deliveryDate || today(),
          observacao: observation || null,
          assinatura: null
        })
        .select()
        .single();

    if (error) {
      setLoading(false);
      return setMessage(
        "Erro ao salvar a entrega: " + error.message
      );
    }

    const rows = deliveryItems.map((item) => ({
      entrega_id: delivery.id,
      epi_id: item.epi_id,
      quantidade: Number(item.quantidade) || 1,
      tamanho: item.tamanho || null,
      ca: item.ca || null,
      data_recebimento:
        deliveryDate || today(),
      data_devolucao:
        item.data_devolucao || null
    }));

    const { error: itemsError } =
      await supabase
        .from("entrega_itens")
        .insert(rows);

    if (itemsError) {
      await supabase
        .from("entregas")
        .delete()
        .eq("id", delivery.id);

      setLoading(false);

      return setMessage(
        "Erro ao salvar os itens: " +
          itemsError.message
      );
    }

    await loadData(session.user.id);

    const full = {
      ...delivery,
      funcionarios: selectedEmployee,
      entrega_itens: deliveryItems.map(
        (item, i) => ({
          ...rows[i],
          epis: { nome: item.nome }
        })
      )
    };

    setPrintDelivery(full);
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setDeliveryItems([]);
    setObservation("");
    setDeliveryDate(today());
    setTab("historico");
    setMessage(
      "Entrega registrada com sucesso."
    );
    setLoading(false);
  }
