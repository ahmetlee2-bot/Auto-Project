import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";

export default function RegisterPage() { return <main className="authShell"><div className="authCard"><Link className="authBrand" href="/">AutoLister</Link><p className="sectionEyebrow">Kostenlos starten</p><h1>Dein Cockpit für bessere Listings.</h1><p>Erstelle dein Konto und verwalte deine eBay-Abläufe zentral.</p><AuthForm mode="register" /><p className="authSwitch">Schon registriert? <Link href="/login">Einloggen</Link></p></div></main>; }
