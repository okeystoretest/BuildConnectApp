import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyTickets } from "@/lib/my-tickets-data";
import { TicketsView } from "@/components/tickets/tickets-view";

export default async function TicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tickets = await getMyTickets(session.userId);

  return <TicketsView tickets={tickets} />;
}
