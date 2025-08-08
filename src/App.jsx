import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, writeBatch } from "firebase/firestore";
import { DndContext, useDroppable, useDraggable, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";

const CATEGORIES = [
  { id: "viktigt_bratttom", label: "Viktigt, br\u00e5ttom" },
  { id: "viktigt_inte_bratttom", label: "Viktigt, inte br\u00e5ttom" },
  { id: "bratttom_inte_viktigt", label: "Br\u00e5ttom inte viktigt" },
  { id: "inte_bratttom_inte_viktigt", label: "Inte br\u00e5ttom, inte viktigt" }
];

function useFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyDeUDN2nyek5vScs9pHegXXx6o61QheKNQ",
    authDomain: "todoapp-6d8a9.firebaseapp.com",
    projectId: "todoapp-6d8a9",
    storageBucket: "todoapp-6d8a9.firebasestorage.app",
    messagingSenderId: "645662631507",
    appId: "1:645662631507:web:80d856be1769cb97fec8a6"
  };
  const app = useMemo(() => initializeApp(firebaseConfig), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);
  return { app, auth, db };
}

function Loader() {
  return (<div className="loader-wrap"><div className="card"><h2 style={{margin:0}}>Laddar...</h2><div className="mono">Verifierar inloggning</div></div></div>);
}

function Login({ onLogin }) {
  return (<div className="login-wrap"><div className="card"><h1 className="h1">Att g\u00f6ra</h1><div className="h2">Logga in med Google f\u00f6r att b\u00f6rja</div><button className="btn btn-primary" onClick={onLogin}>Logga in med Google</button><div className="hr"></div><div className="mono">Popup-inloggning, inga redirects.</div></div></div>);
}

function useTasks(db, uid) {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    if (!db || !uid) return;
    const q = query(collection(db, "users", uid, "tasks"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = []; snap.forEach((d) => items.push({ id: d.id, ...d.data() })); setTasks(items);
    });
    return () => unsub();
  }, [db, uid]);
  return tasks;
}

function DroppableColumn({ id, title, children, isOver }) {
  const { setNodeRef, isOver: over } = useDroppable({ id });
  const overState = typeof isOver === "boolean" ? isOver : over;
  return (<div className="panel"><div className="panel-header column-header">{title}</div><div ref={setNodeRef} className={"list droppable" + (overState ? " over" : "")}>{children}</div></div>);
}

function DraggableTask({ task, onToggleComplete, onSelectForEdit, blockClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: transform ? "translate3d(" + transform.x + "px, " + transform.y + "px, 0)" : undefined, opacity: isDragging ? 0.6 : 1 };
  return (
    <div className="task" ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={() => { if (blockClick.current) return; onSelectForEdit(task); }}>
      <input type="checkbox" checked={!!task.completed} onChange={(e) => onToggleComplete(task, e.target.checked)} onClick={(e) => e.stopPropagation()} />
      <div className="task-text">{task.text}</div>
      {task.completed && task.completedAt ? (<div className="task-meta">{new Date(task.completedAt).toLocaleDateString()}</div>) : null}
    </div>
  );
}

export default function App() {
  const { auth, db } = useFirebase();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [input, setInput] = useState(""); const [category, setCategory] = useState(CATEGORIES[0].id);
  const [editingId, setEditingId] = useState(null);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [dragOverId, setDragOverId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).finally(() => {
      const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
      return () => unsub();
    });
  }, [auth]);

  const tasks = useTasks(db, user ? user.uid : null);

  const columns = React.useMemo(() => {
    const map = { viktigt_bratttom: [], viktigt_inte_bratttom: [], bratttom_inte_viktigt: [], inte_bratttom_inte_viktigt: [] };
    const completed = [];
    for (const t of tasks) { if (t.completed) completed.push(t); else if (map[t.category]) map[t.category].push(t); }
    return { map, completed };
  }, [tasks]);

  async function handleLogin() { const provider = new GoogleAuthProvider(); await signInWithPopup(auth, provider); }
  async function handleLogout() { await signOut(auth); }

  async function handleAddOrSave(e) {
    if (e) e.preventDefault();
    const text = input.trim(); if (!text || !user) return;
    if (editingId) {
      const ref = doc(db, "users", user.uid, "tasks", editingId);
      await updateDoc(ref, { text, category, updatedAt: new Date().toISOString() });
      setEditingId(null); setInput("");
    } else {
      await addDoc(collection(db, "users", user.uid, "tasks"), { text, category, previousCategory: category, completed: false, completedAt: null, createdAt: new Date().toISOString() });
      setInput("");
    }
  }

  function startEdit(task) { setEditingId(task.id); setInput(task.text); setCategory(task.category); }

  async function toggleComplete(task, checked) {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "tasks", task.id);
    if (checked) { await updateDoc(ref, { completed: true, completedAt: new Date().toISOString(), previousCategory: task.category }); }
    else { await updateDoc(ref, { completed: false, completedAt: null, category: task.previousCategory || CATEGORIES[0].id }); }
  }

  async function clearCompleted() {
    if (!user) return;
    const batch = writeBatch(db);
    for (const t of columns.completed) batch.delete(doc(db, "users", user.uid, "tasks", t.id));
    await batch.commit();
  }

  function onDragStart(event) { setDraggingId(event.active ? event.active.id : null); }
  function onDragOver(event) { const { over } = event; setDragOverId(over ? over.id : null); }
  function onDragEnd(event) {
    const { active, over } = event; setDragOverId(null); setDraggingId(null);
    if (!active || !over || !user) return;
    const overId = over.id; const colIds = CATEGORIES.map((c) => c.id);
    if (colIds.includes(overId)) {
      const t = tasks.find((x) => x.id === active.id);
      if (!t || t.completed || t.category === overId) return;
      const ref = doc(db, "users", user.uid, "tasks", active.id);
      updateDoc(ref, { category: overId, previousCategory: overId });
    }
  }

  if (!authReady) return <Loader />;
  if (!user) return <Login onLogin={handleLogin} />;

  const blockClick = React.useRef(false);
  useEffect(() => { blockClick.current = draggingId != null; }, [draggingId]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="title-wrap">
            <h1 className="h1">Att g\u00f6ra</h1>
            <div className="h2">You&apos;re doing great today, by the way</div>
          </div>
          <div className="user-wrap">
            <div className="mono">{user.displayName || "Inloggad"}</div>
            <button className="btn" onClick={handleLogout}>Logga ut</button>
          </div>
        </div>

        <form className="input-row" onSubmit={handleAddOrSave}>
          <input className="input" placeholder="L\u00e4gg till eller redigera en uppgift" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddOrSave(); } }} />
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
          </select>
          <button className="btn btn-primary" type="submit">{editingId ? "Spara" : "L\u00e4gg till"}</button>
          {editingId ? (<button type="button" className="btn" onClick={() => { setEditingId(null); setInput(""); }}>Avbryt</button>) : null}
        </form>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver}>
        <main className="main">
          {CATEGORIES.map((c) => (
            <DroppableColumn key={c.id} id={c.id} title={c.label} isOver={dragOverId === c.id}>
              {columns.map[c.id].map((t) => (
                <DraggableTask key={t.id} task={t} onToggleComplete={toggleComplete} onSelectForEdit={startEdit} blockClick={blockClick} />
              ))}
            </DroppableColumn>
          ))}
          <div className="panel sidebar">
            <div className="panel-header column-header">Klarmarkerade</div>
            <div className="footer-row" style={{ paddingTop: 12 }}>
              <button className="btn" onClick={() => setCompletedOpen((v) => !v)} type="button">{completedOpen ? "D\u00f6lj" : "Visa"}</button>
              <button className="btn btn-danger" onClick={clearCompleted} type="button" title="Radera alla klarmarkerade uppgifter">Rensa alla</button>
            </div>
            <div className="list" style={{ paddingTop: 0 }}>
              {completedOpen && columns.completed.map((t) => (
                <div className="completed-item" key={t.id}>
                  <input type="checkbox" checked={true} onChange={(e) => toggleComplete(t, e.target.checked)} />
                  <div className="task-text">{t.text}</div>
                  <div className="completed-date">{t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ""}</div>
                </div>
              ))}
              {completedOpen && columns.completed.length === 0 ? (<div className="mono">Inga klarmarkerade uppgifter \u00e4n.</div>) : null}
            </div>
          </div>
        </main>
      </DndContext>
    </div>
  );
}
