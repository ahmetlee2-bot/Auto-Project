import Link from "next/link";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";
export default function ForgotPasswordPage() { return <main className="authShell"><div className="authCard"><Link className="authBrand" href="/">AutoLister</Link><p className="sectionEyebrow">Konto wiederherstellen</p><h1>Passwort vergessen?</h1><p>Gib deine E-Mail-Adresse ein. Wir senden dir automatisch einen sicheren Link.</p><ForgotPasswordForm /><p className="authSwitch"><Link href="/login">Zurück zum Login</Link></p></div></main>; }
