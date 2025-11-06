import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
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

const PROGRAMS = [
  { id: 0, name: "Strategic relevance", owner: "Joao Oliveira", room: "Bentley" },
  { id: 1, name: "People & Capability Evolution", owner: "Sofia Fernandes", room: "Lamborghini" },
  { id: 2, name: "AI Transformation", owner: "Oriol Contijoch", room: "SKODA" },
  { id: 3, name: "Portfolio Transformation & Stakeholder positioning", owner: "Marcelo Afonso", room: "Volkswagen" },
  { id: 4, name: "Business Criticality & Product Excellence", owner: "Goncalo Candido", room: "Porsche" },
];

const PROGRAM_COUNT = PROGRAMS.length;
const HOST_PASSWORD = "VWDS26";

const DEFAULT_GROUP_LIST = [
  [
    "André Martins",
    "Marco Sarroeira",
    "Ana Machado",
    "Carlos Fernandes",
    "Gilberto Pe-Curto",
    "Luís Lima",
    "Ricardo Arruda",
    "Joana Maia",
  ],
  [
    "Bruno Lourenço",
    "Nuno Perpétua",
    "Andreia Pitti",
    "Diogo Teixeira",
    "Vera Charneika",
    "Melissa De Leon",
    "Rodolfo Pereira",
    "Albertina Soares",
  ],
  [
    "Bruno Areal",
    "Stefan Sarroeira",
    "Andre Santos",
    "Daniel Brandão",
    "Jackson Varjão",
    "Miguel Fernandes",
    "Sofia Sousa",
    "Joana Martins",
  ],
  [
    "Filipe Esteves",
    "Igor Carvalho",
    "Puja Naghi",
    "Duarte Dias",
    "Joana Esteves",
    "Miguel Sousa",
    "Sukhdeep Sodhi",
    "Patrick Schwerhoff",
  ],
  [
    "Ivo Ferreira",
    "Caio Arruda",
    "Fábio Oliveira",
    "João Carradinha",
    "Nadja Pirzadeh",
    "Tiago Bilreiro",
  ],
];

const DEFAULT_GROUPS_CSV = DEFAULT_GROUP_LIST.map((group) => group.join("\n")).join("\n\n");
const DEFAULT_NAME_SET = new Set(DEFAULT_GROUP_LIST.flat());

const DEFAULT_PHASES = PROGRAMS.map((program, idx) => ({
  id: program.id ?? idx,
  name: program.name,
  minutes: 40,
  owner: program.owner,
}));

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

function msLeftForPhase(state, nowMs = Date.now()) {
  const phase = state.phases[state.currentPhase] || DEFAULT_PHASES[state.currentPhase] || { minutes: 0 };
  const durationMs = (phase.minutes || 0) * 60 * 1000;
  const elapsed = state.isRunning && state.startEpochMs
    ? nowMs - state.startEpochMs + (state.pausedElapsedMs || 0)
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

function parseGroups(csv) {
  const text = (csv || "").trim();
  if (!text) {
    return Array.from({ length: PROGRAM_COUNT }, () => []);
  }

  const blockMatches = text.split(/\n\s*\n+/).map((block) =>
    block
      .split(/\n|,/)
      .map((n) => n.trim())
      .filter(Boolean)
  );

  if (blockMatches.length === PROGRAM_COUNT && blockMatches.every((group) => group.length > 0)) {
    return blockMatches;
  }

  const names = text.split(/\n|,/).map((n) => n.trim()).filter(Boolean);
  const groups = Array.from({ length: PROGRAM_COUNT }, () => []);
  names.forEach((name, idx) => {
    groups[idx % PROGRAM_COUNT].push(name);
  });
  return groups;
}

function splitIntoProgramGroups(csv) {
  return canonicalizeGroups(parseGroups(csv));
}

function toCanonicalRoster(csv) {
  return canonicalizeGroups(parseGroups(csv))
    .map((group) => group.join("\n"))
    .join("\n\n");
}

function canonicalizeGroups(groups) {
  const flattened = groups.flat().filter(Boolean);
  const uniqueNames = new Set(flattened);
  const matchesDefaultRoster =
    flattened.length === DEFAULT_NAME_SET.size &&
    uniqueNames.size === DEFAULT_NAME_SET.size &&
    flattened.every((name) => DEFAULT_NAME_SET.has(name));

  if (matchesDefaultRoster) {
    return DEFAULT_GROUP_LIST.map((group) => [...group]);
  }

  return groups.map((group) => [...group]);
}

function normalizePhases(phases = DEFAULT_PHASES) {
  const source = phases && phases.length ? phases : DEFAULT_PHASES;
  return source.map((phase, idx) => {
    const id = phase.id ?? idx;
    const program = PROGRAMS.find((p) => p.id === id) || PROGRAMS[idx];
    const fallback = DEFAULT_PHASES[idx] || { id, minutes: 40 };
    const minutes = typeof phase.minutes === "number" ? phase.minutes : fallback.minutes ?? 40;
    return {
      ...phase,
      id,
      name: phase.name || fallback.name || program?.name || `Phase ${idx + 1}`,
      minutes,
      owner: phase.owner || program?.owner || fallback.owner,
    };
  });
}

export default function App() {
  const [role, setRole] = useState("viewer");
  const [hostUnlocked, setHostUnlocked] = useState(false);
  const [state, setState] = useState(defaultState);
  const [connected, setConnected] = useState(false);
  const [draftGroups, setDraftGroups] = useState(() =>
    splitIntoProgramGroups(defaultState.groupsCSV).map((group) => group.join("\n"))
  );
  const [draftDirty, setDraftDirty] = useState(false);

  async function push(newState) {
    const normalizedState = {
      ...newState,
      phases: normalizePhases(newState.phases),
      groupsCSV: toCanonicalRoster(newState.groupsCSV || DEFAULT_GROUPS_CSV),
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
          merged.groupsCSV = toCanonicalRoster((data.groupsCSV ?? prev.groupsCSV ?? DEFAULT_GROUPS_CSV) || DEFAULT_GROUPS_CSV);
          return merged;
        });
      }
      setConnected(true);
    });
  }, [state.sessionId]);

  useEffect(() => {
    if (!draftDirty) {
      setDraftGroups(splitIntoProgramGroups(state.groupsCSV || DEFAULT_GROUPS_CSV).map((group) => group.join("\n")));
    }
  }, [state.groupsCSV, draftDirty]);

  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 200);
  const timeLeftMs = useMemo(() => msLeftForPhase(state, now), [state, now]);
  const allGroups = useMemo(
    () => splitIntoProgramGroups(state.groupsCSV || DEFAULT_GROUPS_CSV),
    [state.groupsCSV]
  );
  const programAssignments = useMemo(
    () => PROGRAMS.map((program, programIdx) => {
      const groupIdx = (programIdx - state.currentPhase + PROGRAM_COUNT) % PROGRAM_COUNT;
      return {
        program,
        groupIdx,
        names: allGroups[groupIdx] || [],
      };
    }),
    [allGroups, state.currentPhase]
  );

  const isHost = role === "host";
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
  const updatePhaseMinutes = async (idx, minutes) => {
    const m = Math.max(1, Math.min(240, Number(minutes) || 0));
    const phases = state.phases.map((p) => (p.id === idx ? { ...p, minutes: m } : p));
    await push({ ...state, phases });
  };
  const updateDraftGroup = (idx, text) => {
    setDraftGroups((prev) => prev.map((group, gIdx) => (gIdx === idx ? text : group)));
    setDraftDirty(true);
  };
  const resetDraftGroups = () => {
    setDraftGroups(splitIntoProgramGroups(state.groupsCSV || DEFAULT_GROUPS_CSV).map((group) => group.join("\n")));
    setDraftDirty(false);
  };
  const saveDraftGroups = async () => {
    const combined = draftGroups.join("\n\n");
    await push({ ...state, groupsCSV: combined });
    setDraftDirty(false);
  };
  const setSession = async (sid) => await push({ ...state, sessionId: sid || "VWDS-2026" });

  const phase = state.phases[state.currentPhase] || DEFAULT_PHASES[state.currentPhase] || DEFAULT_PHASES[0];
  const phaseLabel = phase.name || `Phase ${state.currentPhase + 1}`;
  const simplePhaseLabel = `Phase ${state.currentPhase + 1}`;
  const phaseOwner = phase.owner || PROGRAMS.find((p) => p.id === phase.id)?.owner || "";
  const headerSubtitle = isHost
    ? "Coordinate the summit rotation and manage the countdown."
    : "Stay aligned with your program rotation and the time remaining.";
  const progressPct = useMemo(() => {
    const durationMs = (phase.minutes || 0) * 60 * 1000;
    if (durationMs === 0) {
      return 0;
    }
    const elapsed = Math.max(0, durationMs - timeLeftMs);
    return Math.min(100, Math.round((elapsed / durationMs) * 100));
  }, [phase, timeLeftMs]);

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="app-header">
          <div className="app-header-text">
            <h1 className="app-title">Summit Sync Timer</h1>
            <p className="app-subtitle">{headerSubtitle}</p>
          </div>
          <div className="app-header-controls">
            <select
              className="control-select"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value;
                if (nextRole === "host" && !hostUnlocked) {
                  const supplied = window.prompt("Enter host passcode to continue:");
                  if (supplied === null) {
                    setRole("viewer");
                  } else if (supplied === HOST_PASSWORD) {
                    setHostUnlocked(true);
                    setRole("host");
                  } else {
                    window.alert("Incorrect passcode. Remaining in viewer mode.");
                    setRole("viewer");
                  }
                } else {
                  setRole(nextRole);
                }
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="host">Host</option>
            </select>
            <input
              className="control-input"
              placeholder="Session ID"
              defaultValue={state.sessionId}
              onBlur={(e) => setSession(e.target.value)}
            />
          </div>
          {isHost ? (
            !hostUnlocked && (
              <div className="role-helper">
                Host view is protected. Provide the summit passcode when prompted.
              </div>
            )
          ) : (
            <div className="viewer-helper">
              This live view updates as soon as the host moves everyone to the next phase.
            </div>
          )}
        </div>
        {isHost ? (
          <>
            <div className="status-bar">
              <div className="session-pill">
                <span className="pill-label">Session</span>
                <span className="pill-value">{state.sessionId}</span>
              </div>
              <div className="session-pill">
                <span className="pill-label">Role</span>
                <span className="pill-value">Host</span>
              </div>
              <div className={`session-pill${state.isRunning ? " is-emphasis" : ""}`}>
                <span className="pill-label">Timer</span>
                <span className="pill-value">{state.isRunning ? "Running" : "Paused"}</span>
              </div>
              <div className="connection-indicator">
                <span className={`status-dot ${connected ? "is-online" : "is-offline"}`} />
                {connected ? "Live Sync" : "Offline"}
              </div>
            </div>
            <div className="layout-grid">
              <div className="panel timer-panel">
                <div className="timer-header">
                  <div>
                    <div className="eyebrow">Current Phase</div>
                    <div className="timer-phase-name">{phaseLabel}</div>
                    {phaseOwner && <div className="phase-owner">Owner: {phaseOwner}</div>}
                  </div>
                  <div className="timer-countdown">
                    <div className="timer-countdown-value">{fmt(timeLeftMs)}</div>
                    <div className="timer-countdown-meta">Duration: {phase.minutes} min</div>
                  </div>
                </div>
                <div className="progress-track">
                  <motion.div
                    className="progress-bar"
                    initial={false}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
                  />
                </div>
                <div className="timer-controls">
                  <button className="btn btn-primary" onClick={start}>Start</button>
                  <button className="btn" onClick={pause}>Pause</button>
                  <button className="btn" onClick={reset}>Reset</button>
                  <button className="btn" disabled={!canPrev} onClick={prevPhase}>Prev Phase</button>
                  <button className="btn" disabled={!canNext} onClick={nextPhase}>Next Phase</button>
                </div>
              </div>
              <div className="panel phases-panel">
                <div className="panel-title">Phases</div>
                {state.phases.map((p, idx) => {
                  const owner = p.owner || PROGRAMS[p.id ?? idx]?.owner;
                  return (
                    <div key={p.id} className={`phase-card${p.id === state.currentPhase ? " is-active" : ""}`}>
                      <div className="phase-name">{p.name}</div>
                      {owner && <div className="phase-owner">Owner: {owner}</div>}
                      <div className="phase-minute-row">
                        <span className="label-muted">Minutes:</span>
                        <input
                          type="number"
                          className="phase-minute-input"
                          value={p.minutes}
                          min={1}
                          max={240}
                          onChange={(e) => updatePhaseMinutes(p.id, e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="panel groups-panel">
              <div className="groups-header">
                <div>
                  <div className="panel-title">Program Rotations</div>
                  <p className="panel-help-text">
                    Participants rotate to the next program each phase. Owners remain assigned to their programs.
                  </p>
                </div>
                <div className="panel-caption">
                  Connected: {connected ? "Live sync enabled" : "Offline"}
                </div>
              </div>
              <div className="groups-editor">
                <p className="panel-caption">
                  Edit names per group (one per line). Click <strong>Save groups</strong> to publish to everyone once you’re ready.
                </p>
                <div className="groups-grid">
                  {draftGroups.map((groupText, idx) => (
                    <div key={idx} className="group-card group-edit-card">
                      <div className="group-label">{PROGRAMS[idx].name}</div>
                      <div className="group-owner">Owner: {PROGRAMS[idx].owner}</div>
                      <div className="group-room">Room: {PROGRAMS[idx].room}</div>
                      <div className="group-phase">Group {idx + 1}</div>
                      <textarea
                        className="groups-textarea group-edit-textarea"
                        value={groupText}
                        onChange={(e) => updateDraftGroup(idx, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div className="group-edit-actions">
                  <button className="btn btn-primary" disabled={!draftDirty} onClick={saveDraftGroups}>Save groups</button>
                  <button className="btn" disabled={!draftDirty} onClick={resetDraftGroups}>Discard</button>
                </div>
              </div>
              <div className="panel-caption">Published rotation</div>
              <div className="groups-grid">
                {programAssignments.map((assignment, idx) => (
                  <div key={idx} className="group-card">
                    <div className="group-label">{assignment.program.name}</div>
                    <div className="group-owner">Owner: {assignment.program.owner}</div>
                    <div className="group-room">Room: {assignment.program.room}</div>
                    <div className="group-phase">Group {assignment.groupIdx + 1}</div>
                    <ul className="group-list">
                      {assignment.names.length > 0
                        ? assignment.names.map((name, i) => (<li key={i} className="group-list-item">• {name}</li>))
                        : (<li className="group-list-empty">No names yet</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="viewer-meta">
              <div className="viewer-chip">{simplePhaseLabel}</div>
              <div className="viewer-chip">{phase.minutes} minute phase</div>
              <div className="viewer-chip">Session {state.sessionId}</div>
              <div className="connection-indicator">
                <span className={`status-dot ${connected ? "is-online" : "is-offline"}`} />
                {connected ? "Live sync" : "Offline"}
              </div>
            </div>
            <div className="viewer-layout">
              <div className="panel viewer-timer-panel">
                <div className="viewer-phase-heading">{simplePhaseLabel}</div>
                <div className="viewer-countdown">{fmt(timeLeftMs)}</div>
                <div className="viewer-countdown-meta">Everyone rotates when the timer reaches zero.</div>
              </div>
              <div className="panel viewer-program-panel">
                <div className="viewer-program-header">
                  <h2>Where each group is now</h2>
                  <p>Find your name under your group to know which program you’re contributing to this phase.</p>
                </div>
                <div className="groups-grid viewer-programs-grid">
                {programAssignments.map((assignment, idx) => (
                  <div key={idx} className="group-card viewer-program-card">
                    <div className="group-label">{assignment.program.name}</div>
                    <div className="group-owner">Owner: {assignment.program.owner}</div>
                    <div className="group-room">Room: {assignment.program.room}</div>
                    <div className="group-phase viewer-group-tag">Group {assignment.groupIdx + 1}</div>
                    <ul className="group-list">
                      {assignment.names.length > 0
                        ? assignment.names.map((name, i) => (<li key={i} className="group-list-item">• {name}</li>))
                        : (<li className="group-list-empty">No names yet</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        <div className="app-footer">© 2025 Summit Sync Timer</div>
      </div>
    </div>
  );
}
