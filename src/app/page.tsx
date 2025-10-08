"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function Home() {
  return (
    <main className="container stack">
      <h1 className="text-2xl font-bold">Benvenuto</h1>
      <p className="text-sm text-gray-600">Accedi per gestire le mail predefinite.</p>
      <div className="grid grid-1 grid-sm-2 items-center gap-3">
        <button onClick={() => signIn("google")} className="btn btn-primary w-full">
          Accedi con Google
        </button>
        <Link href="/templates" className="btn btn-outline w-full text-center">
          Vai alle mail predefinite
        </Link>
      </div>
    </main>
  );
}
