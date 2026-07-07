import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock,
  Monitor,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sun,
  Target,
  Timer,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useThemePreference, type ThemePreference } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowSchedule - Weekly Calendar & Task Planner" },
      {
        name: "description",
        content:
          "Plan your week visually. Add tasks, drag to snap to the grid, and keep every focus block in one calm view.",
      },
      { property: "og:title", content: "FlowSchedule - Weekly Calendar" },
      { property: "og:description", content: "A snap-to-grid weekly scheduler for focused work." },
    ],
  }),
  component: Index,
});

type Task = {
  id: string;
  title: string;
  day: number;
  start: number;
  duration: number;
  color: string;
};

type QuickTask = {
  id: string;
  title: string;
  color: string;
  duration: number;
};

type Note = {
  id: string;
  text: string;
  createdAt: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const SLOT_MIN = 30;
const HOUR_WIDTH = 56;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 72;

const COLORS = [
  { name: "Blue", value: "from-blue-500 to-blue-600" },
  { name: "Red", value: "from-red-500 to-rose-600" },
  { name: "Green", value: "from-emerald-500 to-green-600" },
  { name: "Yellow", value: "from-amber-400 to-yellow-500" },
  { name: "Purple", value: "from-violet-500 to-purple-600" },
  { name: "Pink", value: "from-pink-500 to-fuchsia-500" },
];


const STORAGE_KEY = "flowschedule.tasks.v2";
const LEGACY_STORAGE_PREFIX = `${STORAGE_KEY}.`;
const NOTES_STORAGE_KEY = "flowschedule.notes.v1";
const QUICK_TASKS_STORAGE_KEY = "flowschedule.quickTasks.v1";
const PROFILE_STORAGE_KEY = "flowschedule.profile.v1";
const PROFILE_NAME_STORAGE_KEY = "flowschedule.profileName.v1";
const DEFAULT_FOCUS_MINUTES = 25;
const QUICK_TASK_LIMIT = 5;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function to12h(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return { hr, period };
}

function hourLabel(h: number) {
  const { hr, period } = to12h(h);
  return `${hr}${period.toLowerCase()}`;
}

function minutesToLabel(m: number) {
  const total = START_HOUR * 60 + m;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  const { hr, period } = to12h(h);
  return `${hr}:${String(mm).padStart(2, "0")} ${period}`;
}

function currentTimeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function currentDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function noteDateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findLegacyTasks() {
  const legacyKey = Object.keys(localStorage).find((key) => key.startsWith(LEGACY_STORAGE_PREFIX));
  return legacyKey ? localStorage.getItem(legacyKey) : null;
}

function profileInitials(name: string | null) {
  if (!name) return "ME";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function Index() {
  const { setTheme, theme } = useThemePreference();
  const [tasksByWeek, setTasksByWeek] = useState<Record<string, Task[]>>({});
  const [tasksHydrated, setTasksHydrated] = useState(false);
  const [quickTasks, setQuickTasks] = useState<QuickTask[]>([]);
  const [quickTasksHydrated, setQuickTasksHydrated] = useState(false);
  const [quickTaskEditorOpen, setQuickTaskEditorOpen] = useState(false);
  const [quickTaskDraft, setQuickTaskDraft] = useState<{
    title: string;
    duration: number;
    color: string;
  }>({ title: "", duration: 60, color: COLORS[0].value });
  const [quickTaskEditingId, setQuickTaskEditingId] = useState<string | null>(null);
  const [quickTasksOpen, setQuickTasksOpen] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("My profile");
  const [now, setNow] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [hover, setHover] = useState<{ day: number; slot: number } | null>(null);
  const [creating, setCreating] = useState<
    | null
    | { day: number; startSlot: number; currentSlot: number; rectLeft: number }
    >(
    null,
  );
  const createdDraftRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const clickSuppressRef = useRef(false);
  const dragState = useRef<null | {
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origStart: number;
    origDuration: number;
    origDay: number;
    moved: boolean;
  }>(null);

  const weekKey = useMemo(() => dateKey(weekStart), [weekStart]);
  const tasks = useMemo(() => tasksByWeek[weekKey] ?? [], [tasksByWeek, weekKey]);
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const pxPerMin = HOUR_WIDTH / 60;
  const SLOT_WIDTH = SLOT_MIN * pxPerMin;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function updateScale() {
      const el = rootRef.current;
      if (!el) return;
      // Reset zoom first so measurements use natural size (prevents sticking small)
      (el.style as any).zoom = "1";
      // measure natural content size
      const contentW = el.scrollWidth || el.offsetWidth || window.innerWidth;
      const contentH = el.scrollHeight || el.offsetHeight || window.innerHeight;
      const wRatio = window.innerWidth / contentW;
      const hRatio = window.innerHeight / contentH;
      const scale = Math.min(1, wRatio, hRatio);
      // apply zoom (widely supported in Chromium-based browsers)
      (el.style as any).zoom = String(scale);
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [tasks, quickTasks, quickTasksOpen]);

  useEffect(() => {
    try {
      const rawTasks = localStorage.getItem(STORAGE_KEY) ?? findLegacyTasks();
      setTasksByWeek(rawTasks ? (JSON.parse(rawTasks) as Record<string, Task[]>) : {});
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setTasksByWeek({});
    } finally {
      setTasksHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!tasksHydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksByWeek));
  }, [tasksByWeek, tasksHydrated]);

  useEffect(() => {
    try {
      const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
      setNotes(rawNotes ? (JSON.parse(rawNotes) as Note[]) : []);
    } catch {
      localStorage.removeItem(NOTES_STORAGE_KEY);
      setNotes([]);
    } finally {
      setNotesHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      const rawQuickTasks = localStorage.getItem(QUICK_TASKS_STORAGE_KEY);
      setQuickTasks(rawQuickTasks ? (JSON.parse(rawQuickTasks) as QuickTask[]) : []);
    } catch {
      localStorage.removeItem(QUICK_TASKS_STORAGE_KEY);
      setQuickTasks([]);
    } finally {
      setQuickTasksHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!quickTasksHydrated) return;
    localStorage.setItem(QUICK_TASKS_STORAGE_KEY, JSON.stringify(quickTasks));
  }, [quickTasks, quickTasksHydrated]);

  useEffect(() => {
    if (!notesHydrated) return;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes, notesHydrated]);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
      setProfileImage(savedProfile);
    } catch {
      setProfileImage(null);
    }
  }, []);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(PROFILE_NAME_STORAGE_KEY);
      if (savedName) {
        setProfileName(savedName);
      }
    } catch {
      setProfileName("My profile");
    }
  }, []);

  useEffect(() => {
    if (profileImage === null) return;
    localStorage.setItem(PROFILE_STORAGE_KEY, profileImage);
  }, [profileImage]);

  useEffect(() => {
    if (!profileName) return;
    localStorage.setItem(PROFILE_NAME_STORAGE_KEY, profileName);
  }, [profileName]);

  const weekDates = useMemo(
    () =>
      DAYS.map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const todayWeekKey = useMemo(() => dateKey(startOfWeek(now)), [now]);
  const todayDay = (now.getDay() + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduleNow = nowMinutes - START_HOUR * 60;
  const todaysRemainingTasks = useMemo(() => {
    const todayTasks = tasksByWeek[todayWeekKey] ?? [];
    return todayTasks
      .filter((task) => task.day === todayDay)
      .filter((task) => START_HOUR * 60 + task.start + task.duration > nowMinutes)
      .sort((a, b) => a.start - b.start);
  }, [nowMinutes, tasksByWeek, todayDay, todayWeekKey]);
  const currentDayMarker = useMemo(() => {
    const visibleDay = weekDates.findIndex((date) => dateKey(date) === dateKey(now));
    if (visibleDay < 0 || scheduleNow < 0 || scheduleNow > totalMinutes) return null;
    return {
      day: visibleDay,
      left: scheduleNow * pxPerMin,
    };
  }, [now, pxPerMin, scheduleNow, totalMinutes, weekDates]);
  const busyMinutesPerDay = useMemo(() => {
    return DAYS.map((_, dayIdx) =>
      tasks.filter((t) => t.day === dayIdx).reduce((sum, t) => sum + t.duration, 0),
    );
  }, [tasks]);
  const totalMinutesWeek = busyMinutesPerDay.reduce((a, b) => a + b, 0);
  const totalHoursWeek = +(totalMinutesWeek / 60).toFixed(2);
  const avgHoursPerDay = +((totalHoursWeek / DAYS.length) || 0).toFixed(2);

  function snap(min: number) {
    return Math.round(min / SLOT_MIN) * SLOT_MIN;
  }

  function openNew(day: number, start: number, duration?: number, createNow = false) {
    const dur = typeof duration === "number" ? Math.max(SLOT_MIN, snap(duration)) : SLOT_MIN;
    const clampedStart = Math.min(snap(start), totalMinutes - dur);
    console.debug("openNew called", { day, start, duration, dur, createNow });
    const task: Task = {
      id: uid(),
      title: "",
      day,
      start: Math.max(0, clampedStart),
      duration: dur,
      color: COLORS[Math.floor(Math.random() * COLORS.length)].value,
    };
    if (createNow) {
      setTasksForWeek((prev) => [...prev, task]);
      createdDraftRef.current = task.id;
    }
    setEditing(task);
    setDialogOpen(true);
  }

  function openQuickAdd() {
    const defaultStart = 9 * 60 - START_HOUR * 60;
    const visibleStart =
      scheduleNow >= 0 && scheduleNow < totalMinutes ? scheduleNow : defaultStart;
    openNew(todayDay, visibleStart);
  }

  function openEdit(t: Task) {
    const latest = (tasksByWeek[weekKey] ?? []).find((x) => x.id === t.id) ?? t;
    setEditing({ ...latest });
    setDialogOpen(true);
  }

  function setTasksForWeek(updater: (prev: Task[]) => Task[]) {
    setTasksByWeek((prev) => ({
      ...prev,
      [weekKey]: updater(prev[weekKey] ?? []),
    }));
  }

  function saveTask() {
    if (!editing) return;
    if (!editing.title.trim()) return;
    setTasksForWeek((prev) => {
      const exists = prev.find((t) => t.id === editing.id);
      if (exists) return prev.map((t) => (t.id === editing.id ? editing : t));
      return [...prev, editing];
    });
    // clear draft tracking if this was the placeholder
    if (createdDraftRef.current === editing.id) createdDraftRef.current = null;
    setDialogOpen(false);
    setEditing(null);
  }

  function deleteTask() {
    if (!editing) return;
    setTasksForWeek((prev) => prev.filter((t) => t.id !== editing.id));
    if (createdDraftRef.current === editing.id) createdDraftRef.current = null;
    setDialogOpen(false);
    setEditing(null);
  }

  useEffect(() => {
    // If dialog was closed and a draft task exists, remove it
    if (dialogOpen) return;
    const draftId = createdDraftRef.current;
    if (!draftId) return;
    setTasksForWeek((prev) => prev.filter((t) => t.id !== draftId));
    createdDraftRef.current = null;
  }, [dialogOpen]);

  useEffect(() => {
    if (dialogOpen) console.debug("dialog opened editing", editing);
  }, [dialogOpen, editing]);

  function saveQuickTask() {
    const trimmed = quickTaskDraft.title.trim();
    if (!trimmed || quickTasks.length >= QUICK_TASK_LIMIT) return;
    if (quickTaskEditingId) {
      setQuickTasks((prev) => prev.map((q) => (q.id === quickTaskEditingId ? { ...q, title: trimmed, color: quickTaskDraft.color, duration: quickTaskDraft.duration } : q)));
    } else {
      setQuickTasks((prev) => [
        ...prev,
        {
          id: uid(),
          title: trimmed,
          color: quickTaskDraft.color,
          duration: quickTaskDraft.duration,
        },
      ]);
    }
    setQuickTaskDraft({ title: "", duration: 60, color: COLORS[0].value });
    setQuickTaskEditingId(null);
    setQuickTaskEditorOpen(false);
  }

  function removeQuickTask(id: string) {
    setQuickTasks((prev) => prev.filter((task) => task.id !== id));
  }

  function createTaskFromQuickTask(quickTask: QuickTask, day: number, start: number) {
    setTasksForWeek((prev) => [
      ...prev,
      {
        id: uid(),
        title: quickTask.title,
        day,
        start,
        duration: quickTask.duration,
        color: quickTask.color,
      },
    ]);
  }

  function addNote(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    setNotes((prev) => [
      {
        id: uid(),
        text: trimmedText,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function deleteNote(id: string) {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }

  function slotFromRect(clientX: number, rect: DOMRect) {
    const x = clientX - rect.left;
    return Math.max(0, Math.min(totalMinutes / SLOT_MIN - 1, Math.floor(x / SLOT_WIDTH)));
  }

  function slotFromEvent(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return slotFromRect(e.clientX, rect);
  }

  function handleQuickTaskDragStart(e: React.DragEvent, quickTask: QuickTask) {
    e.dataTransfer.setData("text/plain", quickTask.id);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleQuickTaskDrop(e: React.DragEvent, day: number) {
    e.preventDefault();
    const quickTaskId = e.dataTransfer.getData("text/plain");
    const quickTask = quickTasks.find((item) => item.id === quickTaskId);
    if (!quickTask) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slot = slotFromRect(e.clientX, rect);
    createTaskFromQuickTask(quickTask, day, slot * SLOT_MIN);
  }

  function handleRowClick(e: React.MouseEvent, day: number) {
    if (clickSuppressRef.current) {
      clickSuppressRef.current = false;
      return;
    }
    // if we just created a placeholder from a drag, ignore the click that may follow
    if (createdDraftRef.current) return;
    if ((e.target as HTMLElement).closest("[data-task]")) return;
    const slot = slotFromEvent(e);
    openNew(day, slot * SLOT_MIN);
  }

  function handleRowMove(e: React.MouseEvent, day: number) {
    if ((e.target as HTMLElement).closest("[data-task]")) {
      setHover(null);
      return;
    }
    setHover({ day, slot: slotFromEvent(e) });
  }

  function startDrag(e: React.MouseEvent, task: Task, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = {
      id: task.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: task.start,
      origDuration: task.duration,
      origDay: task.day,
      moved: false,
    };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  }

  // Create-by-drag handlers
  const createRef = useRef<
    | null
    | { rectLeft: number; rect: DOMRect; startSlot: number; currentSlot: number; day: number; startClientX: number }
    >(null);

  function handleGridMouseDown(e: React.MouseEvent, day: number) {
    if ((e.target as HTMLElement).closest("[data-task]")) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const startSlot = slotFromRect(e.clientX, rect);
    createRef.current = { rectLeft: rect.left, rect, startSlot, currentSlot: startSlot, day, startClientX: e.clientX };
    setCreating({ day, startSlot, currentSlot: startSlot, rectLeft: rect.left });
    window.addEventListener("mousemove", onCreateMove);
    window.addEventListener("mouseup", onCreateEnd);
  }

  function onCreateMove(e: MouseEvent) {
    const c = createRef.current;
    if (!c) return;
    const slot = slotFromRect(e.clientX, c.rect);
    c.currentSlot = slot;
    setCreating((prev) => (prev ? { ...prev, currentSlot: slot } : null));
  }

  function onCreateEnd(e: MouseEvent) {
    const c = createRef.current;
    window.removeEventListener("mousemove", onCreateMove);
    window.removeEventListener("mouseup", onCreateEnd);
    createRef.current = null;
    if (!c) {
      setCreating(null);
      return;
    }
    // compute float positions so release at a boundary maps to an exclusive end index
    const startFloat = (c.startClientX - c.rect.left) / SLOT_WIDTH;
    const endFloat = (e.clientX - c.rect.left) / SLOT_WIDTH;
    const leftIndex = Math.min(Math.floor(startFloat), Math.floor(endFloat));
    const rightExclusive = Math.max(Math.ceil(startFloat), Math.ceil(endFloat));
    const slotCount = Math.max(1, rightExclusive - leftIndex);
    const duration = slotCount * SLOT_MIN;
    const leftSlot = leftIndex;
    console.debug("onCreateEnd computed", { day: c.day, leftSlot, rightExclusive, slotCount, duration });
    // small delay to suppress click that follows
    clickSuppressRef.current = true;
    // allow a short timeout so the following click event is ignored
    window.setTimeout(() => (clickSuppressRef.current = false), 50);
    setCreating(null);
    // create placeholder task immediately so the dialog reflects the dragged duration
    openNew(c.day, leftSlot * SLOT_MIN, duration, true);
  }

  function onDrag(e: MouseEvent) {
    const s = dragState.current;
    if (!s) return;
    if (!s.moved && (Math.abs(e.clientX - s.startX) > 5 || Math.abs(e.clientY - s.startY) > 5)) {
      s.moved = true;
    }
    const dxMin = (e.clientX - s.startX) / pxPerMin;
    const dyRows = Math.round((e.clientY - s.startY) / ROW_HEIGHT);
    setTasksForWeek((prev) =>
      prev.map((t) => {
        if (t.id !== s.id) return t;
        if (s.mode === "move") {
          const newStart = Math.max(
            0,
            Math.min(totalMinutes - t.duration, snap(s.origStart + dxMin)),
          );
          const newDay = Math.max(0, Math.min(6, s.origDay + dyRows));
          return { ...t, start: newStart, day: newDay };
        }

        const newDur = Math.max(
          SLOT_MIN,
          Math.min(totalMinutes - t.start, snap(s.origDuration + dxMin)),
        );
        return { ...t, duration: newDur };
      }),
    );
  }

  function endDrag() {
    const s = dragState.current;
    if (s?.moved) {
      clickSuppressRef.current = true;
      window.setTimeout(() => {
        clickSuppressRef.current = false;
      }, 0);
    }
    dragState.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }

  if (!tasksHydrated) {
    return <LoadingShell />;
  }

  return (
    <div ref={rootRef} className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 text-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/THELOGO.png"
            alt="FlowSchedule logo"
            className="h-9 w-9 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          />
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
            FlowSchedule
          </h1>
        </div>
        <SettingsMenu
          setTheme={setTheme}
          theme={theme}
          profileName={profileName}
          profileImage={profileImage}
          onUploadProfileImage={setProfileImage}
          onChangeProfileName={setProfileName}
        />
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-full flex-1 gap-3 px-4 pb-0 lg:grid-cols-[260px_1fr_320px]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <TimeDateCard now={now} />
          <UpcomingTasksCard nowMinutes={nowMinutes} tasks={todaysRemainingTasks} />

          <QuickActionsPanel
            notes={notes}
            onAddNote={addNote}
            onAddTask={openQuickAdd}
            onDeleteNote={deleteNote}
          />
        </aside>

        <div className="flex min-h-0 flex-col gap-3 h-full">
          <section className="flex min-h-0 flex-1 flex-col rounded-lg bg-white/75 p-3 shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                Weekly Schedule
              </h2>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() - 7);
                    setWeekStart(d);
                  }}
                >
                  <ArrowLeft className="mr-1 h-3 w-3" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() + 7);
                    setWeekStart(d);
                  }}
                >
                  Next <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                >
                  This week
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <div style={{ minWidth: LABEL_WIDTH + HOURS.length * HOUR_WIDTH }}>
                <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white/85 pb-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
                  <div style={{ width: LABEL_WIDTH }} />
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      style={{ width: HOUR_WIDTH }}
                      className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      {hourLabel(h)}
                    </div>
                  ))}
                </div>

                <div ref={gridRef}>
                  {DAYS.map((d, dayIdx) => (
                    <div
                      key={d}
                      className="flex border-b border-slate-100 last:border-0 dark:border-slate-800/80"
                    >
                      <div
                        style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
                        className="flex flex-col justify-center pr-2"
                      >
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {d}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          {fmtMonthDay(weekDates[dayIdx])}
                        </div>
                      </div>
                      <div
                        onMouseDown={(e) => handleGridMouseDown(e, dayIdx)}
                        onClick={(e) => handleRowClick(e, dayIdx)}
                        onMouseMove={(e) => handleRowMove(e, dayIdx)}
                        onMouseLeave={() => setHover((h) => (h?.day === dayIdx ? null : h))}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(e) => handleQuickTaskDrop(e, dayIdx)}
                        className="relative flex-1"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {HOURS.map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 h-full border-l border-slate-100 dark:border-slate-800"
                            style={{ left: i * HOUR_WIDTH }}
                          />
                        ))}
                        {HOURS.map((_, i) => (
                          <div
                            key={`h${i}`}
                            className="absolute top-0 h-full border-l border-dashed border-slate-100/70 dark:border-slate-800/70"
                            style={{ left: i * HOUR_WIDTH + HOUR_WIDTH / 2 }}
                          />
                        ))}

                        {hover && hover.day === dayIdx && (
                          <div
                            className="pointer-events-none absolute bottom-0.5 top-0.5 rounded bg-blue-400/20 ring-1 ring-blue-400/40"
                            style={{ left: hover.slot * SLOT_WIDTH, width: SLOT_WIDTH }}
                          />
                        )}

                        {creating && creating.day === dayIdx && (() => {
                          const leftSlot = Math.min(creating.startSlot, creating.currentSlot);
                          const rightSlot = Math.max(creating.startSlot, creating.currentSlot);
                          const left = leftSlot * SLOT_WIDTH;
                          const width = (rightSlot - leftSlot + 1) * SLOT_WIDTH;
                          return (
                            <div
                              className="pointer-events-none absolute bottom-0.5 top-0.5 rounded bg-blue-500/25 ring-1 ring-blue-500/50"
                              style={{ left, width }}
                            />
                          );
                        })()}

                        {currentDayMarker?.day === dayIdx && (
                          <div
                            className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 rounded-full bg-rose-500 shadow-[0_0_0_1px_rgba(255,255,255,0.85)] dark:bg-rose-400 dark:shadow-[0_0_0_1px_rgba(15,23,42,0.9)]"
                            style={{ left: currentDayMarker.left }}
                          />
                        )}

                        {tasks
                          .filter((t) => t.day === dayIdx)
                          .map((t) => (
                            <div
                              key={t.id}
                              data-task
                              onMouseDown={(e) => startDrag(e, t, "move")}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (clickSuppressRef.current) return;
                                openEdit(t);
                              }}
                              className={`group absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded-md bg-gradient-to-br ${t.color} px-1.5 text-[11px] font-semibold text-white shadow`}
                              style={{
                                left: t.start * pxPerMin,
                                width: t.duration * pxPerMin - 2,
                              }}
                              title={`${t.title} - ${minutesToLabel(t.start)} to ${minutesToLabel(
                                t.start + t.duration,
                              )}`}
                            >
                              <span className="truncate">{t.title || "Untitled"}</span>
                              <div
                                onMouseDown={(e) => startDrag(e, t, "resize")}
                                className="absolute right-0 top-0 h-full w-4 cursor-ew-resize bg-white/0 group-hover:bg-white/40"
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Quick Tasks moved to footer */}
        </div>
        
        {/* Right stats / chart panel */}
        <aside className="hidden lg:flex flex-col gap-3 px-2">
          <section className="rounded-lg bg-white/75 p-3 text-slate-800 shadow ring-1 ring-white/10 dark:bg-slate-900/75 dark:text-slate-100">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Weekly Load</h3>
            </div>
            <div>
              <ChartLine data={busyMinutesPerDay.map((m) => m / 60)} labels={DAYS} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500">Average / day</div>
                <div className="mt-1 font-semibold">{avgHoursPerDay} hrs</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500">Total this week</div>
                <div className="mt-1 font-semibold">{totalHoursWeek} hrs</div>
              </div>
            </div>
          </section>
        </aside>
      </main>

      {/* Footer Quick Tasks bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 dark:bg-slate-900/85 border-t border-slate-200 dark:border-slate-800 backdrop-blur">
        <div className="mx-auto w-full px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="h-6 w-6 shrink-0 text-slate-400 dark:text-slate-500" />
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Quick Tasks</div>
              <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">Drag a shortcut onto the schedule to place it.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Toggle quick tasks"
                onClick={() => setQuickTasksOpen((s) => !s)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-background text-foreground transition hover:bg-accent"
              >
                <ArrowUp className={`h-4 w-4 transform ${quickTasksOpen ? '-rotate-180' : 'rotate-0'}`} />
              </button>
            </div>
          </div>

          <div className={`mt-2 overflow-hidden transition-all duration-200 ${quickTasksOpen ? 'max-h-96' : 'max-h-0'}`}>
            <div className="flex items-center gap-3 overflow-x-auto py-1">
              <QuickAction
                gradient="from-blue-500 to-blue-600"
                icon={<Plus className="h-4 w-4" />}
                label="Add"
                className="min-w-[140px] px-4"
                onClick={() => {
                  setQuickTaskDraft({ title: "", duration: 60, color: COLORS[Math.floor(Math.random() * COLORS.length)].value });
                  setQuickTaskEditingId(null);
                  setQuickTaskEditorOpen(true);
                }}
              />

              <div className="flex gap-2 px-2 items-center">
                {quickTasks.map((quickTask) => (
                  <div
                    key={quickTask.id}
                    draggable
                    onDragStart={(e) => handleQuickTaskDragStart(e, quickTask)}
                    className={`group flex items-center overflow-hidden rounded-md px-1 text-[12px] font-semibold text-white shadow cursor-grab select-none`}
                  >
                    <div
                      onClick={() => {
                        // open quick task editor (no day/start shown)
                        setQuickTaskEditingId(quickTask.id);
                        setQuickTaskDraft({ title: quickTask.title, duration: quickTask.duration, color: quickTask.color });
                        setQuickTaskEditorOpen(true);
                      }}
                      className={`flex items-center gap-2 rounded-md bg-gradient-to-br ${quickTask.color} px-3 py-2`}
                      style={{ width: Math.max(quickTask.duration * pxPerMin, 64), minHeight: 32 }}
                      title={quickTask.title}
                    >
                      <span className="truncate">{quickTask.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuickTask(quickTask.id)}
                      className="ml-2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      aria-label={`Remove ${quickTask.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {quickTasks.length === 0 && (
                  <div className="ml-4 rounded-md border border-dashed border-slate-200 p-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Add up to 5 shortcuts, then drag them into any day and time.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tasks.find((t) => t.id === editing?.id) ? "Edit task" : "New task"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  autoFocus
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Gym, Deep work, Kids"
                  onKeyDown={(e) => e.key === "Enter" && saveTask()}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Day</Label>
                  <Select
                    value={String(editing.day)}
                    onValueChange={(v) => setEditing({ ...editing, day: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start</Label>
                  <Select
                    value={String(editing.start)}
                    onValueChange={(v) => setEditing({ ...editing, start: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Array.from({ length: totalMinutes / SLOT_MIN }, (_, i) => i * SLOT_MIN).map(
                        (m) => (
                          <SelectItem key={m} value={String(m)}>
                            {minutesToLabel(m)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duration</Label>
                  <Select
                    value={String(editing.duration)}
                    onValueChange={(v) => setEditing({ ...editing, duration: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[30, 60, 90, 120, 150, 180, 240].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: c.value })}
                      className={`h-8 w-8 rounded-full bg-gradient-to-br ${c.value} ring-2 ring-offset-2 ring-offset-background transition ${
                        editing.color === c.value
                          ? "ring-slate-800 dark:ring-slate-100"
                          : "ring-transparent"
                      }`}
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between">
            {editing && tasks.find((t) => t.id === editing.id) ? (
              <Button variant="destructive" onClick={deleteTask}>
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveTask}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Task Editor Dialog (create a shortcut with duration only) */}
      <Dialog open={quickTaskEditorOpen} onOpenChange={setQuickTaskEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Shortcut</DialogTitle>
            <DialogDescription>Create a reusable shortcut (duration only)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="qt-title">Title</Label>
              <Input
                id="qt-title"
                autoFocus
                value={quickTaskDraft.title}
                onChange={(e) => setQuickTaskDraft({ ...quickTaskDraft, title: e.target.value })}
                placeholder="e.g. Gym, Deep work"
                onKeyDown={(e) => e.key === "Enter" && saveQuickTask()}
              />
            </div>
            <div>
              <Label>Duration</Label>
              <Select
                value={String(quickTaskDraft.duration)}
                onValueChange={(v) => setQuickTaskDraft({ ...quickTaskDraft, duration: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30, 60, 90, 120, 150, 180].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setQuickTaskDraft({ ...quickTaskDraft, color: c.value })}
                    className={`h-8 w-8 rounded-full bg-gradient-to-br ${c.value} ring-2 ring-offset-2 ring-offset-background transition ${
                      quickTaskDraft.color === c.value ? "ring-slate-800 dark:ring-slate-100" : "ring-transparent"
                    }`}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setQuickTaskEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveQuickTask}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 text-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-slate-100">
      <div className="flex items-center gap-3">
        <img src="/THELOGO.png" alt="FlowSchedule logo" className="h-10 w-10 rounded-lg shadow-sm" />
        <div>
          <div className="text-sm font-semibold">FlowSchedule</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading</div>
        </div>
      </div>
    </div>
  );
}

function TimeDateCard({ now }: { now: Date }) {
  return (
    <section className="rounded-lg bg-white/75 p-3 text-center shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
      <div className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
        {currentTimeLabel(now)}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        {currentDateLabel(now)}
      </div>
    </section>
  );
}

function UpcomingTasksCard({ nowMinutes, tasks }: { nowMinutes: number; tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <section className="rounded-lg bg-white/75 p-3 text-center shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
        <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-emerald-500" />
        <div className="text-sm font-bold text-slate-950 dark:text-slate-50">
          All done with your daily tasks
        </div>
      </section>
    );
  }

  const nextTask = tasks[0];
  const nextTaskStart = START_HOUR * 60 + nextTask.start;
  const isCurrentTask = nextTaskStart <= nowMinutes && nextTaskStart + nextTask.duration > nowMinutes;

  return (
    <section
      className={`rounded-lg bg-gradient-to-br ${nextTask.color} p-3 text-white shadow-lg ring-1 ring-white/20`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-white/90" />
        <h3 className="text-sm font-bold">
          {isCurrentTask ? "Currently happening" : "Upcoming tasks"}
        </h3>
      </div>
      <div className="space-y-2">
        {tasks.slice(0, 4).map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between gap-2 rounded-md bg-white/15 px-2 py-1.5 text-white shadow-sm ring-1 ring-white/15"
          >
            <span className="min-w-0 truncate text-xs font-semibold">
              {task.title || "Untitled"}
            </span>
            <span className="shrink-0 text-[11px] font-medium text-white/85">
              {minutesToLabel(task.start)}
            </span>
          </div>
        ))}
      </div>
      {tasks.length > 4 && (
        <div className="mt-2 text-right text-[11px] font-medium text-white/85">
          +{tasks.length - 4} more
        </div>
      )}
    </section>
  );
}

function QuickActionsPanel({
  notes,
  onAddNote,
  onAddTask,
  onDeleteNote,
}: {
  notes: Note[];
  onAddNote: (text: string) => void;
  onAddTask: () => void;
  onDeleteNote: (id: string) => void;
}) {
  const [mode, setMode] = useState<"actions" | "focus" | "notes">("actions");
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MINUTES);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_FOCUS_MINUTES * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    if (mode !== "focus" || !focusRunning) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [focusRunning, mode]);

  function updateFocusMinutes(value: string) {
    const nextMinutes = Math.max(1, Math.min(180, Number(value) || DEFAULT_FOCUS_MINUTES));
    setFocusMinutes(nextMinutes);
    setRemainingSeconds(nextMinutes * 60);
    setFocusRunning(false);
  }

  function toggleFocusTimer() {
    if (remainingSeconds === 0) {
      setRemainingSeconds(focusMinutes * 60);
    }
    setFocusRunning((prev) => !prev);
  }

  function resetFocusTimer() {
    setFocusRunning(false);
    setRemainingSeconds(focusMinutes * 60);
  }

  function submitNote() {
    onAddNote(noteDraft);
    setNoteDraft("");
  }

  if (mode === "focus") {
    return (
      <section className="rounded-lg bg-white/75 p-3 shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Back to quick actions"
            onClick={() => setMode("actions")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-slate-50">
            <Timer className="h-4 w-4 text-emerald-500" />
            Focus
          </div>
        </div>

        <div className="rounded-md bg-emerald-50 p-3 text-center dark:bg-emerald-950/40">
          <div className="text-4xl font-bold tabular-nums text-emerald-700 dark:text-emerald-200">
            {formatTimer(remainingSeconds)}
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor="focus-minutes">Minutes</Label>
          <Input
            id="focus-minutes"
            type="number"
            min={1}
            max={180}
            value={focusMinutes}
            onChange={(e) => updateFocusMinutes(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" onClick={toggleFocusTimer}>
            {focusRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {focusRunning ? "Pause" : "Start"}
          </Button>
          <Button type="button" variant="outline" onClick={resetFocusTimer}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </section>
    );
  }

  if (mode === "notes") {
    return (
      <section className="rounded-lg bg-white/75 p-3 shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Back to quick actions"
            onClick={() => setMode("actions")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-slate-50">
            <BookOpen className="h-4 w-4 text-amber-500" />
            Notes
          </div>
        </div>

        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Write a note..."
          className="min-h-24 resize-none"
        />
        <Button type="button" className="mt-2 w-full" onClick={submitNote}>
          <Plus className="mr-2 h-4 w-4" />
          Add note
        </Button>

        <div className="mt-3 max-h-44 space-y-2 overflow-auto">
          {notes.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-2 py-3 text-center text-xs font-medium text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
              No notes yet
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="rounded-md bg-slate-50 p-2 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:text-slate-100 dark:ring-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 whitespace-pre-wrap break-words text-xs">{note.text}</p>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => onDeleteNote(note.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 text-[10px] font-medium text-slate-400">
                  {noteDateLabel(note.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-white/75 p-3 shadow-lg shadow-slate-200/50 ring-1 ring-white backdrop-blur dark:bg-slate-900/75 dark:shadow-black/20 dark:ring-white/10">
      <h3 className="mb-2 text-sm font-bold text-slate-950 dark:text-slate-50">Quick Actions</h3>
      <div className="grid gap-2">
        <QuickAction
          icon={<Plus className="h-4 w-4" />}
          label="Add"
          gradient="from-blue-500 to-blue-600"
          onClick={onAddTask}
        />
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            icon={<Timer className="h-4 w-4" />}
            label="Focus"
            gradient="from-emerald-500 to-green-600"
            onClick={() => setMode("focus")}
          />
          <QuickAction
            icon={<BookOpen className="h-4 w-4" />}
            label="Notes"
            gradient="from-orange-400 to-amber-500"
            onClick={() => setMode("notes")}
          />
        </div>
      </div>
    </section>
  );
}

function SettingsMenu({
  setTheme,
  theme,
  profileName,
  profileImage,
  onUploadProfileImage,
  onChangeProfileName,
}: {
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
  profileName: string;
  profileImage: string | null;
  onUploadProfileImage: (image: string | null) => void;
  onChangeProfileName: (name: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <span className="hidden sm:inline truncate">{profileName || "Profile"}</span>
            <Avatar>
              {profileImage ? (
                <AvatarImage src={profileImage} alt="Profile picture" />
              ) : (
                <AvatarFallback>{profileInitials(profileName)}</AvatarFallback>
              )}
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDialog
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        setTheme={setTheme}
        theme={theme}
        profileName={profileName}
        profileImage={profileImage}
        onUploadProfileImage={onUploadProfileImage}
        onChangeProfileName={onChangeProfileName}
      />
    </>
  );
}

function SettingsDialog({
  onOpenChange,
  open,
  setTheme,
  theme,
  profileName,
  profileImage,
  onUploadProfileImage,
  onChangeProfileName,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
  profileName: string;
  profileImage: string | null;
  onUploadProfileImage: (image: string | null) => void;
  onChangeProfileName: (name: string) => void;
}) {
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        onUploadProfileImage(result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Choose how FlowSchedule should look.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar>
              {profileImage ? (
                <AvatarImage src={profileImage} alt="Profile picture" />
              ) : (
                <AvatarFallback>{profileInitials(profileName)}</AvatarFallback>
              )}
            </Avatar>
            <div className="min-w-0 flex-1">
              <Label>Display name</Label>
              <Input
                value={profileName}
                onChange={(event) => onChangeProfileName(event.target.value)}
                placeholder="Enter your name"
                className="mt-2 w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Avatar>
              {profileImage ? (
                <AvatarImage src={profileImage} alt="Profile picture" />
              ) : (
                <AvatarFallback>{profileInitials(profileName)}</AvatarFallback>
              )}
            </Avatar>
            <div className="min-w-0 flex-1">
              <Label>Profile picture</Label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-200 dark:text-slate-100 dark:file:bg-slate-800 dark:file:text-slate-100"
              />
            </div>
          </div>

          <div>
            <Label>Theme</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ThemeButton
                icon={<Sun className="h-4 w-4" />}
                label="Light"
                onClick={() => setTheme("light")}
                selected={theme === "light"}
              />
              <ThemeButton
                icon={<Moon className="h-4 w-4" />}
                label="Dark"
                onClick={() => setTheme("dark")}
                selected={theme === "dark"}
              />
              <ThemeButton
                icon={<Monitor className="h-4 w-4" />}
                label="System"
                onClick={() => setTheme("system")}
                selected={theme === "system"}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThemeButton({
  icon,
  label,
  onClick,
  selected,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function QuickAction({
  gradient,
  icon,
  label,
  onClick,
  className,
}: {
  gradient: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br ${gradient} px-2 py-2 text-white shadow transition hover:scale-[1.02] hover:shadow-md ${className ?? ""}`}
    >
      {icon}
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}

function ChartLine({ data, labels }: { data: number[]; labels: string[] }) {
  const width = 260;
  const height = 120;
  const padding = 18;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = padding + (i * (width - padding * 2)) / (data.length - 1 || 1);
    const y = padding + (1 - v / max) * (height - padding * 2);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  return (
    <div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {/* area fill */}
        <path d={`${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`} fill="url(#g1)" stroke="none" />
        {/* line */}
        <path d={pathD} fill="none" stroke="#2563EB" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* points */}
        {data.map((v, i) => {
          const x = padding + (i * (width - padding * 2)) / (data.length - 1 || 1);
          const y = padding + (1 - v / max) * (height - padding * 2);
          return <circle key={i} cx={x} cy={y} r={3} fill="#1D4ED8" />;
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
        {labels.map((l, i) => (
          <div key={l} className="w-8 text-center truncate">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
