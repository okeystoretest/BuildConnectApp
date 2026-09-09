import { redirect } from "next/navigation";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getMyTickets } from "@/lib/my-tickets-data";
import { TicketsView } from "@/components/tickets/tickets-view";

export default async function TicketsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect(LOGIN_EXPIRED_PATH);

  const tickets = await getMyTickets(session.userId);

  return <TicketsView tickets={tickets} />;
}
