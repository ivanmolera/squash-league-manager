import AgendaPage from "../page";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  return <AgendaPage searchParams={Promise.resolve({ view: "results" })} />;
}
