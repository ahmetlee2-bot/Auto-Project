import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";

export default function LoginPage() { return <main className="authShell"><div className="authCard"><Link className="authBrand" href="/">AutoLister</Link><p className="sectionEyebrow">Sicherer Zugang</p><h1>Willkommen zurück.</h1><p>Melde dich an, um dein AutoLister Dashboard zu öffnen.</p><AuthForm mode="login" /><p className="authSwitch"><Link href="/forgot-password">Passwort vergessen?</Link></p><p className="authSwitch">Noch kein Konto? <Link href="/register">Kostenlos registrieren</Link></p></div></main>; }
