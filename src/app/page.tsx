"use client";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { Header } from "@/components/layout/Header";

export default function AdsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <Dashboard />
      </main>
    </div>
  );
}
