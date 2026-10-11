import Link from "next/link";
import { VerifyEmailForm } from "../../components/auth/verify-email-form";
import { AuthShell } from "../../components/auth/auth-shell";
import { LocaleMessage } from "../../components/locale-message";

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
      description={<LocaleMessage de={`Wir haben einen 6-stelligen Code an ${email || "deine E-Mail-Adresse"} gesendet.`} en={`We sent a 6-digit code to ${email || "your email address"}.`} tr={`${email || "E-posta adresine"} 6 haneli bir kod gönderdik.`} />}
    >
      {email ? (
        <VerifyEmailForm email={email} />
      ) : (
        <p className="authError"><LocaleMessage de="Keine E-Mail-Adresse angegeben." en="No email address was provided." tr="E-posta adresi belirtilmedi." /></p>
      )}
      <p className="authHelper">
        <Link href="/login"><LocaleMessage de="← Zurück zum Login" en="← Back to sign in" tr="← Girişe dön" /></Link>
      </p>
    </AuthShell>
  );
}
