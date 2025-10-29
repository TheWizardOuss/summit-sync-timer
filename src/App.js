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
  "Strategic Relevance & Stakeholder Positioning",
  "People & Capability Evolution",
  "AI Transformation",
  "Portfolio Growth & Business-Critical Positioning",
  "Operational Efficiency",
];

const DEFAULT_PHASES = PROGRAMS.map((_, idx) => ({
  id: idx,
  name: `Phase ${idx + 1}`,
  minutes: 40,
}));

const HOST_PASSWORD = "VWDS26";
const GROUP_COUNT = PROGRAMS.length;

const defaultState = {
  sessionId: "VWDS-2026",
  phases: DEFAULT_PHASES,
  currentPhase: 0,
  isRunning: false,
  startEpochMs: null,
  pausedElapsedMs: 0,
  lastUpdateBy: "",
};

function msLeftForPhase(state, nowMs = Date.now()) {
  const phase = state.phases[state.currentPhase];
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

function distributeParticipants(names, groupCount) {
  if (!names.length) {
    return Array.from({ length: groupCount }, () => []);
  }
  const groups = Array.from({ length: groupCount }, () => []);
  names.forEach((name, idx) => {
    groups[idx % groupCount].push(name);
  });
  return groups;
}

export default function App() {
  const [role, setRole] = useState("viewer");
  const [hostUnlocked, setHostUnlocked] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [state, setState] = useState(defaultState);
  const [connected, setConnected] = useState(false);

  async function push(newState) {
    setState(newState);
    const r = ref(db, `sessions/${newState.sessionId}`);
    await set(r, { ...newState, lastUpdateBy: role });
  }

  useEffect(() => {
    const r = ref(db, `sessions/${state.sessionId}`);
    return onValue(r, (snap) => {
      const data = snap.val();
      if (data) setState(data);
      setConnected(true);
    });
  }, [state.sessionId]);

  useEffect(() => {
    async function loadParticipants() {
      try {
        const response = await fetch("/participants.json");
        if (!response.ok) throw new Error("Failed to load participants");
        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : payload.participants;
        setParticipants(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error(error);
        setParticipants([]);
      }
    }
    loadParticipants();
  }, []);

  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 200);
  const timeLeftMs = useMemo(() => msLeftForPhase(state, now), [state, now]);
  const baseGroups = useMemo(
    () => distributeParticipants(participants, GROUP_COUNT),
    [participants]
  );
  const programAssignments = useMemo(
    () => PROGRAMS.map((programName, programIdx) => {
      const groupIdx = (programIdx - state.currentPhase + GROUP_COUNT) % GROUP_COUNT;
      return {
        programName,
        groupIdx,
        names: baseGroups[groupIdx] || [],
      };
    }),
    [baseGroups, state.currentPhase]
  );

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
    const phases = state.phases.map(p => p.id === idx ? { ...p, minutes: m } : p);
    await push({ ...state, phases });
  };
  const setSession = async (sid) => await push({ ...state, sessionId: sid || "VWDS-2026" });

  const phase = state.phases[state.currentPhase];
  const phaseLabel = `Phase ${state.currentPhase + 1}`;
  const progressPct = useMemo(() => {
    const durationMs = (phase.minutes || 0) * 60 * 1000;
    const elapsed = Math.max(0, durationMs - timeLeftMs);
    return Math.min(100, Math.round((elapsed / durationMs) * 100));
  }, [phase, timeLeftMs]);

  return (
    <div className="app-root">
      <div className="app-container">
        <div className="app-header">
          <div className="app-header-text">
            <h1 className="app-title">Summit Sync Timer</h1>
            <p className="app-subtitle">Shared session ID keeps everyone in sync. Host controls the timer and phases.</p>
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
          <div className="role-helper">
            Host view is protected. Provide the summit passcode when prompted.
          </div>
        </div>
        <div className="status-bar">
          <div className="session-pill">
            <span className="pill-label">Session</span>
            <span className="pill-value">{state.sessionId}</span>
          </div>
          <div className="session-pill">
            <span className="pill-label">Role</span>
            <span className="pill-value">{role === "host" ? "Host" : "Viewer"}</span>
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
            {role === "host" && (
              <div className="timer-controls">
                <button className="btn btn-primary" onClick={start}>Start</button>
                <button className="btn" onClick={pause}>Pause</button>
                <button className="btn" onClick={reset}>Reset</button>
                <button className="btn" disabled={!canPrev} onClick={prevPhase}>Prev Phase</button>
                <button className="btn" disabled={!canNext} onClick={nextPhase}>Next Phase</button>
              </div>
            )}
          </div>
          <div className="panel phases-panel">
            <div className="panel-title">Phases</div>
            {state.phases.map((p, idx) => (
              <div key={p.id} className={`phase-card${p.id === state.currentPhase ? " is-active" : ""}`}>
                <div className="phase-name">Phase {idx + 1}</div>
                <div className="phase-minute-row">
                  <span className="label-muted">Minutes:</span>
                  {role === "host" ? (
                    <input
                      type="number"
                      className="phase-minute-input"
                      value={p.minutes}
                      min={1}
                      max={240}
                      onChange={(e) => updatePhaseMinutes(p.id, e.target.value)}
                    />
                  ) : (
                    <span>{p.minutes}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel groups-panel">
          <div className="groups-header">
            <div className="panel-title">Program Rotations</div>
            <p className="panel-help-text">
              Participants move to the next program each phase. Advance the phase to rotate the rosters together with the timer.
            </p>
          </div>
          <div className="groups-grid">
            {programAssignments.map((assignment, idx) => (
              <div key={idx} className="group-card">
                <div className="group-label">{assignment.programName}</div>
                <div className="group-phase">Group {assignment.groupIdx + 1}</div>
                <ul className="group-list">
                  {assignment.names.length > 0
                    ? assignment.names.map((name, i) => (<li key={i} className="group-list-item">• {name}</li>))
                    : (<li className="group-list-empty">Loading roster…</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="app-footer">© 2025 Summit Sync Timer</div>
      </div>
    </div>
  );
}
