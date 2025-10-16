"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Download, Upload } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

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

  // Load/save localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  }, [entries]);

  const allExercises = useMemo(() => {
    const set = new Set<string>([...defaultExercises, ...entries.map(e => e.exercise)]);
    return Array.from(set);
  }, [entries]);

  const addEntry = () => {
    const w = parseFloat(weight.replace(",", "."));
    if (!exercise.trim() || !date || isNaN(w)) return;
    const r = reps.trim() ? parseInt(reps) : undefined;
    const entry: Entry = { id: uid(), date, exercise: exercise.trim(), weight: w, reps: r };
    setEntries(prev => [...prev, entry].sort((a,b) => a.date.localeCompare(b.date)));
    setWeight("");
    setReps("");
  };

  const deleteEntry = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));
  const clearAll = () => {
    if (confirm("Alle Einträge wirklich löschen?")) setEntries([]);
  };

  // Data for chart
  const filtered = useMemo(() => entries.filter(e => e.exercise === filterExercise).sort((a,b) => a.date.localeCompare(b.date)), [entries, filterExercise]);
  const chartData = filtered.map(e => ({ date: e.date, Gewicht: e.weight }));

  // Export/import JSON
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-tracker-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(String(fr.result)) as Entry[];
        if (!Array.isArray(data)) throw new Error("Invalid");
        // Basic sanitize
        const cleaned = data
          .filter(d => d && d.date && d.exercise && typeof d.weight === "number")
          .map(d => ({ ...d, id: d.id || uid() }));
        setEntries(cleaned);
      } catch (e) {
        alert("Import fehlgeschlagen. Prüfe die Datei.");
      }
    };
    fr.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <motion.h1 initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} className="text-3xl font-bold tracking-tight">GymTracker</motion.h1>
        <p className="text-sm text-slate-600">Trage für jedes Datum dein Gewicht (und optional Wiederholungen) pro Übung ein und verfolge deinen Verlauf.</p>

        {/* Eingabeformular */}
        <Card className="shadow-md rounded-2xl">
          <CardHeader>
            <CardTitle>Neuen Eintrag hinzufügen</CardTitle>
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
                      <YAxis domain={["dataMin - 5", "dataMax + 5"]} width={60} />
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
                      {entries.map(e => (
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
          <p>Speichert lokal im Browser (kein Server). Du kannst deine Daten jederzeit als JSON exportieren oder importieren.</p>
        </footer>
      </div>
    </div>
  );
}
