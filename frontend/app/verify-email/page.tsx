import Link from "next/link";
import { VerifyEmailForm } from "../../components/auth/verify-email-form";
import { AuthShell } from "../../components/auth/auth-shell";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const email = String((await searchParams).email || "")
    .trim()
    .toLowerCase();
  return (
    <AuthShell
      eyebrow="E-MAIL BESTÄTIGEN"
      title="Fast geschafft"
      description={`Wir haben einen 6-stelligen Code an ${email || "deine E-Mail-Adresse"} gesendet.`}
    >
      {email ? (
        <VerifyEmailForm email={email} />
      ) : (
        <p className="authError">Keine E-Mail-Adresse angegeben.</p>
      )}
      <p className="authHelper">
        <Link href="/login">← Zurück zum Login</Link>
      </p>
    </AuthShell>
  );
}
