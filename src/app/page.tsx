import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">BNOW.NET</h1>
      <p className="max-w-md text-center text-gray-500">
        Transparent source reliability ratings for conflict-zone OSINT — validated daily
        against expert analysis.
      </p>
      <p className="text-sm text-gray-400">Launching: Russia · Ukraine</p>
      <Link href="/health" className="text-sm underline">
        system health
      </Link>
    </main>
  );
}
