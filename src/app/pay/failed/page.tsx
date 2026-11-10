export default function PayFailed() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">התשלום לא הושלם</h1>
        <p className="mt-3 text-muted">
          לא חויבת. אפשר לחזור לקישור ולנסות שוב, או לפנות אלינו ונשמח לעזור.
        </p>
      </div>
    </main>
  );
}
