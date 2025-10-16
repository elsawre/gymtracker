"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Download, Upload, LogIn, LogOut } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

// =============================
//  Supabase (Client-Side)
// =============================
// .env.local (lokal) + Vercel Env-Vars:
// NEXT_PUBLIC_SUPABASE_URL="https://...supabase.co"
// NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnon);

// --- Types
interface Entry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  exercise: string;
  weight: number; // kg
  reps?: number; // optional
}

const LS_KEY = "gym-tracker-entries-v1";

// --- Helpers
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const defaultExercises = [
  "Bankdrücken",
  "Kniebeuge",
  "Kreuzheben",
  "Schulterdrücken",
  "Klimmzüge",
];

export default function GymTrackerApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [exercise, setExercise] = useState<string>(defaultExercises[0]);
  const [weight, setWeight] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [filterExercise, setFilterExercise] = useState<string>(defaultExercises[0]);

  // Auth
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const userId = session?.user?.id;

  // Load/save localStorage (immer als Cache/Fallback)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  }, [entries]);

  // Auth-Session laden + Listener
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Wenn eingeloggt: Cloud-Daten laden
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, date, exercise, weight, reps")
        .eq("user_id", userId)
        .order("date", { ascending: true });
      if (!error && data) {
        // Merge simpel: Cloud ersetzt lokal (lokal bleibt als Cache erhalten)
        setEntries(data as Entry[]);
      }
    })();
  }, [userId]);

  // Optional: lokale Einträge einmalig in die Cloud schieben (bei erstem Login)
  useEffect(() => {
    const firstSyncFlag = "gymtracker-first-sync-done";
    if (!userId) return;
    if (localStorage.getItem(firstSyncFlag)) return;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const local: Entry[] = JSON.parse(raw);
    if (local.length === 0) return;
    setIsSyncing(true);
    (async () => {
      const rows = local.map((e) => ({ ...e, user_id: userId }));
      const { error } = await supabase.from("entries").upsert(rows, { onConflict: "id" });
      if (!error) {
        localStorage.setItem(firstSyncFlag, "1");
        // danach frisch laden
        const { data } = await supabase
          .from("entries")
          .select("id, date, exercise, weight, reps")
          .eq("user_id", userId)
          .order("date", { ascending: true });
        if (data) setEntries(data as Entry[]);
      }
      setIsSyncing(false);
    })();
  }, [userId]);

  const allExercises = useMemo(() => {
    const set = new Set<string>([...defaultExercises, ...entries.map((e) => e.exercise)]);
    return Array.from(set);
  }, [entries]);

  // --- CRUD helpers (lokal + optional Cloud)
  const addEntry = async () => {
    const w = parseFloat(weight.replace(",", "."));
    if (!exercise.trim() || !date || isNaN(w)) return;
    const r = reps.trim() ? parseInt(reps) : undefined;
    const entry: Entry = { id: uid(), date, exercise: exercise.trim(), weight: w, reps: r };

    // lokal sofort
    setEntries((prev) => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));

    // Cloud (wenn eingeloggt)
    if (userId) {
      await supabase.from("entries").upsert({ ...entry, user_id: userId });
      // sicherheitshalber reload (Server ist Source of Truth)
      const { data } = await supabase
        .from("entries")
        .select("id, date, exercise, weight, reps")
        .eq("user_id", userId)
        .order("date", { ascending: true });
      if (data) setEntries(data as Entry[]);
    }

    setWeight("");
    setReps("");
  };

  const deleteEntry = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (userId) {
      await supabase.from("entries").delete().eq("id", id).eq("user_id", userId);
    }
  };

  const clearAll = async () => {
    if (!confirm("Alle Einträge wirklich löschen?")) return;
    setEntries([]);
    if (userId) {
      await supabase.from("entries").delete().eq("user_id", userId);
    }
  };

  // Export/import JSON (weiterhin nützlich für Backups)
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const data = JSON.parse(String(fr.result)) as Entry[];
        if (!Array.isArray(data)) throw new Error("Invalid");
        const cleaned = data
          .filter((d) => d && d.date && d.exercise && typeof d.weight === "number")
          .map((d) => ({ ...d, id: d.id || uid() }));
        setEntries(cleaned);
        if (userId) {
          const rows = cleaned.map((e) => ({ ...e, user_id: userId }));
          await supabase.from("entries").upsert(rows, { onConflict: "id" });
          const { data: refreshed } = await supabase
            .from("entries")
            .select("id, date, exercise, weight, reps")
            .eq("user_id", userId)
            .order("date", { ascending: true });
          if (refreshed) setEntries(refreshed as Entry[]);
        }
      } catch (e) {
        alert("Import fehlgeschlagen. Prüfe die Datei.");
      }
    };
    fr.readAsText(file);
  };

  // --- Auth actions
  const sendMagicLink = async () => {
    if (!email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) alert("Konnte keinen Magic Link senden: " + error.message);
    else alert("Magic Link gesendet. Öffne deine E-Mails und klicke auf den Link.");
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  // Data für Chart
  const filtered = useMemo(
    () => entries.filter((e) => e.exercise === filterExercise).sort((a, b) => a.date.localeCompare(b.date)),
    [entries, filterExercise]
  );
  const chartData = filtered.map((e) => ({ date: e.date, Gewicht: e.weight }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Top Bar: Title + Auth */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight">
              GymTracker
            </motion.h1>
            <p className="text-sm text-slate-600">Trage für jedes Datum dein Gewicht (und optional Wiederholungen) pro Übung ein und verfolge deinen Verlauf.</p>
          </div>

          {/* Auth Widget */}
          <Card className="shadow-md rounded-2xl min-w-[320px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{session ? "Angemeldet" : "Anmelden (Magic Link)"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {session ? (
                <div className="flex items-center gap-2 justify-between">
                  <div className="text-sm text-slate-600">
                    {session.user.email}
                    {isSyncing && <span className="ml-2 text-xs text-slate-500">(synchronisiere…)</span>}
                  </div>
                  <Button variant="secondary" onClick={signOut} title="Abmelden"><LogOut className="h-4 w-4 mr-1"/>Logout</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="email" placeholder="deine@mail.de" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button onClick={sendMagicLink} title="Magic Link senden"><LogIn className="h-4 w-4 mr-1"/>Link</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Eingabeformular */}
        <Card className="shadow-md rounded-2xl">
          <CardHeader>
            <CardTitle>Neuen Eintrag hinzufügen {session ? <span className="text-xs text-slate-500">(wird in die Cloud gespeichert)</span> : <span className="text-xs text-slate-500">(nur lokal gespeichert)</span>}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2 space-y-2">
              <Label>Übung</Label>
              <div className="flex gap-2">
                <Select value={exercise} onValueChange={setExercise}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Übung wählen" /></SelectTrigger>
                  <SelectContent>
                    {allExercises.map((ex) => (
                      <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="oder neue Übung eintippen"
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Gewicht (kg)</Label>
              <Input inputMode="decimal" placeholder="z. B. 62.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Wdh. (optional)</Label>
              <Input inputMode="numeric" placeholder="z. B. 5" value={reps} onChange={(e) => setReps(e.target.value)} />
            </div>

            <div className="sm:col-span-5 flex items-end justify-end gap-2">
              <Button onClick={addEntry}>Speichern</Button>
              <Button variant="secondary" onClick={exportJson} title="Export als JSON"><Download className="h-4 w-4 mr-2"/>Export</Button>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-md border">
                <Upload className="h-4 w-4"/>
                <span>Import</span>
                <input className="hidden" type="file" accept="application/json" onChange={(e) => e.target.files && importJson(e.target.files[0])} />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Verlauf */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="shadow-md rounded-2xl lg:col-span-2">
            <CardHeader>
              <CardTitle>Verlauf je Übung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Label>Übung</Label>
                <Select value={filterExercise} onValueChange={setFilterExercise}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Übung wählen" /></SelectTrigger>
                  <SelectContent>
                    {allExercises.map((ex) => (
                      <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="h-72">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickMargin={8} />
                      <YAxis width={60} />
                      <Tooltip formatter={(value: number | string) => `${value} kg`} labelFormatter={(l: string) => `Datum: ${l}`} />
                      <Line type="monotone" dataKey="Gewicht" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-600">Keine Daten für diese Übung. Füge oben Einträge hinzu.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabelle */}
          <Card className="shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle>Alle Einträge</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-sm text-slate-600">Noch keine Einträge.</p>
              ) : (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-2">Datum</th>
                        <th className="py-2 pr-2">Übung</th>
                        <th className="py-2 pr-2">Gewicht (kg)</th>
                        <th className="py-2 pr-2">Wdh.</th>
                        <th className="py-2 pr-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id} className="border-b hover:bg-slate-50">
                          <td className="py-1 pr-2 whitespace-nowrap">{e.date}</td>
                          <td className="py-1 pr-2">{e.exercise}</td>
                          <td className="py-1 pr-2">{e.weight}</td>
                          <td className="py-1 pr-2">{e.reps ?? "-"}</td>
                          <td className="py-1 pr-2 text-right">
                            <Button size="icon" variant="ghost" onClick={() => deleteEntry(e.id)} title="Löschen">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {entries.length > 0 && (
                <div className="flex justify-end mt-3">
                  <Button variant="destructive" onClick={clearAll}>Alles löschen</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <footer className="text-xs text-slate-500 pt-2">
          <p>
            Speichert lokal im Browser <em>und</em> (wenn angemeldet) sicher in Supabase.
            Export/Import als JSON ist weiterhin möglich.
          </p>
        </footer>
      </div>
    </div>
  );
}
