import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getMyTickets } from "@/lib/my-tickets-data";
import { TicketsView } from "@/components/tickets/tickets-view";

export default async function TicketsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const tickets = await getMyTickets(session.userId);

  return <TicketsView tickets={tickets} />;
}
