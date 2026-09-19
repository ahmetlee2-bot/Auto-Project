"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function AuthNav() { const [email, setEmail] = useState<string | null>(null); useEffect(() => { const supabase = createClient(); void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null)); }, []); return email ? <Link className="primaryButton" href="/dashboard">Panele Git →</Link> : <span className="authNav"><Link className="quietButton" href="/login">Giriş Yap</Link><Link className="primaryButton" href="/register">Ücretsiz Kaydol</Link></span>; }
