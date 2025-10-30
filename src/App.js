import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

// Firebase setup
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC0gdtYXuVBNAfXhHd4a_8O6V2QDYKu12o",
  authDomain: "lead-summit.firebaseapp.com",
  databaseURL: "https://lead-summit-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lead-summit",
  storageBucket: "lead-summit.firebasestorage.app",
  messagingSenderId: "950564020379",
  appId: "1:950564020379:web:a10a1be7f9df2925b1263e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PROGRAM_OWNERS = {
  0: "Marcelo Afonso",
  1: "Sofia Fernandes",
  2: "Oriol Contijoch",
  3: "Joao Oliveira",
  4: "Goncalo Candido",
};

const BASE_PHASES = [
  { id: 0, name: "Strategic Relevance & Stakeholder Positioning", minutes: 40 },
  { id: 1, name: "People & Capability Evolution", minutes: 40 },
  { id: 2, name: "AI Transformation", minutes: 40 },
  { id: 3, name: "Portfolio Growth & Business Criticality", minutes: 40 },
  { id: 4, name: "Operational Efficiency", minutes: 40 },
];

const DEFAULT_GROUPS_CSV = [
  "André Martins",
  "Bruno Lourenço",
  "Bruno Areal",
  "Filipe Esteves",
  "Ivo Ferreira",
  "Marco Sarroeira",
  "Nuno Perpétua",
  "Stefan Sarroeira",
  "Igor Carvalho",
  "Caio Arruda",
  "Ana Machado",
  "Andreia Pitti",
  "Andre Santos",
  "Puja Naghi",
  "Fábio Oliveira",
  "Carlos Fernandes",
  "Diogo Teixeira",
  "Daniel Brandão",
  "Duarte Dias",
  "João Carradinha",
  "Gilberto Pe-Curto",
  "Vera Charneika",
  "Jackson Varjão",
  "Joana Esteves",
  "Nadja Pirzadeh",
  "Luís Lima",
  "Melissa De Leon",
  "Miguel Fernandes",
  "Miguel Sousa",
  "Tiago Bilreiro",
  "Ricardo Arruda",
  "Rodolfo Pereira",
  "Sofia Sousa",
  "Sukhdeep Sodhi",
  "Joana Maia",
  "Albertina Soares",
  "Joana Martins",
  "Patrick Schwerhoff",
].join("\n");

function normalizePhases(phases = BASE_PHASES) {
  const source = phases && phases.length ? phases : BASE_PHASES;
  return source.map((phase, idx) => {
    const id = phase.id ?? idx;
    const basePhase = BASE_PHASES.find((p) => (p.id ?? idx) === id) || BASE_PHASES[idx] || {};
    const owner = PROGRAM_OWNERS[id] ?? PROGRAM_OWNERS[idx] ?? phase.owner ?? basePhase.owner;
    const minutes = typeof phase.minutes === "number" ? phase.minutes : basePhase.minutes ?? 40;
    return {
      ...phase,
      id,
      name: phase.name || basePhase.name || "",
      minutes,
      owner,
    };
  });
}

const DEFAULT_PHASES = normalizePhases(BASE_PHASES);

const defaultState = {
  sessionId: "VWDS-2026",
  phases: DEFAULT_PHASES,
  currentPhase: 0,
  isRunning: false,
  startEpochMs: null,
  pausedElapsedMs: 0,
  lastUpdateBy: "",
  groupsCSV: DEFAULT_GROUPS_CSV,
};

function msLeftForPhase(state) {
  const phase = state.phases[state.currentPhase] || DEFAULT_PHASES[state.currentPhase] || { minutes: 0 };
  const durationMs = (phase.minutes || 0) * 60 * 1000;
  const now = Date.now();
  const elapsed = state.isRunning && state.startEpochMs
    ? now - state.startEpochMs + (state.pausedElapsedMs || 0)
    : (state.pausedElapsedMs || 0);
  return Math.max(0, durationMs - elapsed);
}

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useInterval(callback, delay) {
  const savedRef = useRef();
  useEffect(() => { savedRef.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current && savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function splitIntoFiveGroups(csv) {
  const names = csv.split(/\n|,/).map(n => n.trim()).filter(Boolean);
  const groups = [[], [], [], [], []];
  names.forEach((n, i) => groups[i % 5].push(n));
  return groups;
}

export default function App() {
  const [role, setRole] = useState("viewer");
  const [state, setState] = useState(defaultState);
  const [connected, setConnected] = useState(false);

  async function push(newState) {
    const normalizedState = {
      ...newState,
      phases: normalizePhases(newState.phases),
      groupsCSV: newState.groupsCSV || DEFAULT_GROUPS_CSV,
    };
    const nextState = { ...normalizedState, lastUpdateBy: role };
    setState(nextState);
    const r = ref(db, `sessions/${nextState.sessionId}`);
    await set(r, nextState);
  }

  useEffect(() => {
    const r = ref(db, `sessions/${state.sessionId}`);
    return onValue(r, (snap) => {
      const data = snap.val();
      if (data) {
        setState((prev) => {
          const merged = {
            ...prev,
            ...data,
          };
          merged.phases = normalizePhases(data.phases || prev.phases);
          merged.groupsCSV = (data.groupsCSV ?? prev.groupsCSV ?? DEFAULT_GROUPS_CSV) || DEFAULT_GROUPS_CSV;
          return merged;
        });
      }
      setConnected(true);
    });
  }, [state.sessionId]);

  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 200);
  const timeLeftMs = useMemo(() => msLeftForPhase(state), [state, now]);
  const allGroups = useMemo(() => splitIntoFiveGroups(state.groupsCSV || DEFAULT_GROUPS_CSV), [state.groupsCSV]);

  const canPrev = state.currentPhase > 0;
  const canNext = state.currentPhase < state.phases.length - 1;

  const start = async () => {
    if (state.isRunning) return;
    await push({ ...state, isRunning: true, startEpochMs: Date.now() });
  };
  const pause = async () => {
    if (!state.isRunning) return;
    const elapsed = (state.pausedElapsedMs || 0) + (Date.now() - (state.startEpochMs || Date.now()));
    await push({ ...state, isRunning: false, startEpochMs: null, pausedElapsedMs: elapsed });
  };
  const reset = async () => {
    await push({ ...state, isRunning: false, startEpochMs: null, pausedElapsedMs: 0 });
  };
  const nextPhase = async () => {
    if (!canNext) return;
    await push({ ...state, currentPhase: state.currentPhase + 1, isRunning: false, startEpochMs: null, pausedElapsedMs: 0 });
  };
  const prevPhase = async () => {
    if (!canPrev) return;
    await push({ ...state, currentPhase: state.currentPhase - 1, isRunning: false, startEpochMs: null, pausedElapsedMs: 0 });
  };
  const updatePhaseName = async (idx, name) => {
    const phases = state.phases.map(p => p.id === idx ? { ...p, name } : p);
    await push({ ...state, phases });
  };
  const updatePhaseMinutes = async (idx, minutes) => {
    const m = Math.max(1, Math.min(240, Number(minutes) || 0));
    const phases = state.phases.map(p => p.id === idx ? { ...p, minutes: m } : p);
    await push({ ...state, phases });
  };
  const setSession = async (sid) => await push({ ...state, sessionId: sid || "VWDS-2026" });
  const setGroupsCSV = async (text) => await push({ ...state, groupsCSV: text });

  const phase = state.phases[state.currentPhase] || DEFAULT_PHASES[state.currentPhase];
  const progressPct = useMemo(() => {
    const durationMs = (phase.minutes || 0) * 60 * 1000;
    const elapsed = Math.max(0, durationMs - timeLeftMs);
    return Math.min(100, Math.round((elapsed / durationMs) * 100));
  }, [phase, timeLeftMs]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Summit Sync Timer</h1>
            <p className="text-sm opacity-70">Shared session ID keeps everyone in sync. Host controls the timer and phases.</p>
          </div>
          <div className="flex gap-3 items-center">
            <select className="border rounded-lg px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="host">Host</option>
            </select>
            <input className="border rounded-lg px-3 py-2 w-44" placeholder="Session ID" defaultValue={state.sessionId} onBlur={(e) => setSession(e.target.value)} />
          </div>
        </div>
        <div className="text-xs opacity-70">Connected: {connected ? "Yes" : "No"}</div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-2xl shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider opacity-60">Current Phase</div>
                <div className="text-xl font-semibold">{phase.name}</div>
                <div className="text-sm opacity-70">Owner: {phase.owner || PROGRAM_OWNERS[phase?.id ?? state.currentPhase]}</div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-mono tabular-nums">{fmt(timeLeftMs)}</div>
                <div className="text-xs opacity-60">Duration: {phase.minutes} min</div>
              </div>
            </div>
            <div className="mt-4 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600" style={{ width: `${progressPct}%` }} />
            </div>
            {role === "host" && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="px-3 py-2 rounded-lg bg-indigo-600 text-white" onClick={start}>Start</button>
                <button className="px-3 py-2 rounded-lg bg-slate-200" onClick={pause}>Pause</button>
                <button className="px-3 py-2 rounded-lg bg-slate-200" onClick={reset}>Reset</button>
                <button className="px-3 py-2 rounded-lg bg-slate-200" disabled={!canPrev} onClick={prevPhase}>Prev Phase</button>
                <button className="px-3 py-2 rounded-lg bg-slate-200" disabled={!canNext} onClick={nextPhase}>Next Phase</button>
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <div className="text-sm font-semibold">Phases</div>
            {state.phases.map((p, idx) => {
              const owner = p.owner || PROGRAM_OWNERS[p.id ?? idx];
              return (
                <div key={p.id} className={`p-3 rounded-xl border ${p.id === state.currentPhase ? "border-indigo-500" : "border-slate-200"}`}>
                  {role === "host" ? (
                    <input className="w-full text-sm font-medium mb-1 border-b outline-none" value={p.name} onChange={(e) => updatePhaseName(p.id, e.target.value)} />
                  ) : (
                    <div className="text-sm font-medium">{p.name}</div>
                  )}
                  <div className="text-xs opacity-60 mb-2">Owner: {owner}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="opacity-60">Minutes:</span>
                    {role === "host" ? (
                      <input type="number" className="w-20 border rounded px-2 py-1" value={p.minutes} min={1} max={240} onChange={(e) => updatePhaseMinutes(p.id, e.target.value)} />
                    ) : (
                      <span>{p.minutes}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Groups (auto-split into 5)</div>
              <p className="text-xs opacity-70">Paste names (one per line or comma-separated). They’ll be distributed across the 5 program groups.</p>
            </div>
            <div className="text-xs opacity-70">Approx. 50 managers ⇒ ~10 per group</div>
          </div>
          {role === "host" && (
            <textarea className="mt-3 w-full h-28 border rounded-lg p-3 font-mono text-sm" placeholder="Paste manager names here..." value={state.groupsCSV} onChange={(e) => setGroupsCSV(e.target.value)} />
          )}
          <div className="mt-4 grid md:grid-cols-5 gap-4">
            {allGroups.map((g, idx) => {
              const program = state.phases[idx] || DEFAULT_PHASES[idx];
              const owner = program?.owner || PROGRAM_OWNERS[program?.id ?? idx];
              const label = program?.name || `Program ${idx + 1}`;
              return (
                <div key={idx} className="p-3 rounded-xl border border-slate-200">
                  <div className="text-xs uppercase tracking-wider opacity-60">Group {idx + 1}</div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs opacity-60 mb-2">Owner: {owner}</div>
                  <ul className="text-sm space-y-1">
                    {g.map((name, i) => (<li key={i} className="truncate">• {name}</li>))}
                    {g.length === 0 && <li className="opacity-50">No names yet</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-center text-xs opacity-60 py-4">© 2025 Summit Sync Timer</div>
      </div>
    </div>
  );
}
