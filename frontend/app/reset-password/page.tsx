import Link from "next/link";
import { ResetPasswordForm } from "../../components/auth/reset-password-form";
export default function ResetPasswordPage() { return <main className="authShell"><div className="authCard"><Link className="authBrand" href="/">AutoLister</Link><p className="sectionEyebrow">Neues Passwort</p><h1>Passwort festlegen.</h1><p>Wähle ein neues Passwort für dein AutoLister-Konto.</p><ResetPasswordForm /><p className="authSwitch"><Link href="/login">Zum Login</Link></p></div></main>; }
