import { connection } from "next/server";

// Placeholder until the app shell lands (Story 2.4). `connection()` keeps the
// page dynamic: every tool page is server-rendered per request.
export default async function Home() {
  await connection();
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">MAC Recap</h1>
    </main>
  );
}
