export default function PayDone() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">התשלום התקבל, תודה!</h1>
        <p className="mt-3 text-muted">חשבונית מס/קבלה תישלח אליך במייל בדקות הקרובות.</p>
        <p className="mt-6 text-sm text-muted">
          <bdi dir="ltr">SST™</bdi> · המרכז
        </p>
      </div>
    </main>
  );
}
