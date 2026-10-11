import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../../components/brand-mark";
import { legalIdentity } from "../../lib/legal";
import { HeaderPreferences } from "../../components/header-preferences";
import { LocaleMessage } from "../../components/locale-message";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Datenschutzerklärung",
    robots: { index: !legalIdentity().isExample, follow: true },
  };
}

export default function DatenschutzPage() {
  const legal = legalIdentity();
  return (
    <main className="legalPage">
      <div className="legalTools"><HeaderPreferences /></div>
      <BrandMark />
      <h1><LocaleMessage de="Datenschutzerklärung" en="Privacy policy" tr="Gizlilik politikası" /></h1>
      {legal.isExample ? (
        <div className="legalNotice">
          <LocaleMessage de="Mustertext: Betreiberangaben und Verarbeitungsdetails müssen vor dem produktiven Einsatz mit den tatsächlichen Diensten und Verträgen abgeglichen werden." en="Template notice: Before production use, verify the operator details and processing information against the actual services and contracts." tr="Örnek metin: Üretim kullanımından önce işletmeci bilgilerini ve veri işleme ayrıntılarını kullanılan hizmetler ve sözleşmelerle karşılaştırıp doğrulayın." />
        </div>
      ) : null}
      <p className="legalTranslationNote"><LocaleMessage de="Die deutsche Fassung ist maßgeblich. Übersetzungen dienen nur der Orientierung." en="The German version is authoritative. Translations are provided for convenience only." tr="Esas metin Almancadır. Çeviriler yalnızca bilgilendirme amaçlıdır." /></p>
      <section>
        <h2><LocaleMessage de="1. Verantwortliche Stelle" en="1. Data controller" tr="1. Veri sorumlusu" /></h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
          <br />
          <LocaleMessage de="Kontakt:" en="Contact:" tr="İletişim:" /> {legal.email}
        </p>
      </section>
      <section>
        <h2><LocaleMessage de="2. Welche Daten verarbeitet werden" en="2. Data we process" tr="2. İşlediğimiz veriler" /></h2>
        <p><LocaleMessage de="Bei Registrierung und Anmeldung verarbeiten wir insbesondere Namen, E-Mail-Adresse, Kontoinformationen und technische Sitzungsdaten. Für die Nutzung von AutoLister können Produktdaten wie ASIN, Titel, Bilder, Preise, Lagerbestand, eBay-Angebotsdaten und Statusmeldungen verarbeitet werden." en="When you register or sign in, we process information such as your name, email address, account information, and technical session data. Using AutoLister may also involve product data such as ASINs, titles, images, prices, stock levels, eBay listing data, and status updates." tr="Kayıt ve giriş sırasında ad, e-posta adresi, hesap bilgileri ve teknik oturum verileri gibi bilgileri işleriz. AutoLister kullanımı; ASIN, başlık, görsel, fiyat, stok düzeyi, eBay ilan verileri ve durum güncellemeleri gibi ürün verilerinin işlenmesini de içerebilir." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="3. Zwecke und Rechtsgrundlagen" en="3. Purposes and legal bases" tr="3. Amaçlar ve hukuki dayanaklar" /></h2>
        <p><LocaleMessage de="Die Verarbeitung dient der Bereitstellung des Benutzerkontos und der angeforderten Import- und Listing-Funktionen (Art. 6 Abs. 1 lit. b DSGVO). Sicherheitsprotokolle und die Absicherung des Dienstes beruhen auf berechtigten Interessen (Art. 6 Abs. 1 lit. f DSGVO). Soweit eine Einwilligung erforderlich ist, erfolgt die Verarbeitung nach Art. 6 Abs. 1 lit. a DSGVO." en="We process data to provide your account and the import and listing features you request (Art. 6(1)(b) GDPR). Security logs and service protection are based on legitimate interests (Art. 6(1)(f) GDPR). Where consent is required, processing is based on Art. 6(1)(a) GDPR." tr="Veriler, hesabınızı ve talep ettiğiniz içe aktarma ve ilan özelliklerini sağlamak amacıyla işlenir (GDPR Madde 6(1)(b)). Güvenlik kayıtları ve hizmetin korunması meşru menfaatlere dayanır (Madde 6(1)(f)). Rıza gereken durumlarda işleme Madde 6(1)(a) kapsamında yapılır." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="4. Hosting und Dienstleister" en="4. Hosting and service providers" tr="4. Barındırma ve hizmet sağlayıcılar" /></h2>
        <p><LocaleMessage de="Die Anwendung wird auf Hetzner Cloud Infrastruktur betrieben. Die Anmeldung verwendet Supabase Auth. Für verbundene eBay-Funktionen werden die dafür notwendigen Daten über die eBay API verarbeitet. Beim Aufruf externer Dienste gelten ergänzend deren Datenschutzhinweise. Eingesetzte Dienstleister und Verarbeitungsorte sind vor Veröffentlichung dieser Mustererklärung zu prüfen." en="The application runs on Hetzner Cloud infrastructure and uses Supabase Auth for sign-in. Data needed for connected eBay features is processed through the eBay API. When external services are accessed, their privacy notices also apply. The service providers and processing locations used must be verified before this template is published as a final notice." tr="Uygulama Hetzner Cloud altyapısında çalışır ve oturum açmak için Supabase Auth kullanır. Bağlı eBay özellikleri için gerekli veriler eBay API üzerinden işlenir. Harici hizmetler kullanıldığında bu hizmetlerin gizlilik bildirimleri de geçerlidir. Bu örnek bildirim yayımlanmadan önce kullanılan hizmet sağlayıcılar ve veri işleme konumları doğrulanmalıdır." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="5. Speicherdauer" en="5. Retention period" tr="5. Saklama süresi" /></h2>
        <p><LocaleMessage de="Personenbezogene Daten werden nur so lange gespeichert, wie es für die Bereitstellung des Dienstes oder gesetzliche Aufbewahrungspflichten erforderlich ist. Konkrete Aufbewahrungsfristen und Löschabläufe sind vom Betreiber zu ergänzen." en="Personal data is retained only as long as needed to provide the service or meet statutory retention duties. The operator must specify the applicable retention periods and deletion procedures." tr="Kişisel veriler yalnızca hizmeti sağlamak veya yasal saklama yükümlülüklerini yerine getirmek için gerekli olduğu sürece tutulur. Geçerli saklama süreleri ve silme süreçleri işletmeci tarafından belirtilmelidir." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="6. Cookies und lokale Speicherung" en="6. Cookies and local storage" tr="6. Çerezler ve yerel depolama" /></h2>
        <p><LocaleMessage de="Für Anmeldung und Sitzungsverwaltung können technisch erforderliche Cookies oder vergleichbare lokale Speichermechanismen verwendet werden. Sie ermöglichen es, den angemeldeten Bereich sicher bereitzustellen." en="Technically necessary cookies or similar local storage may be used for sign-in and session management. They help provide the authenticated area securely." tr="Oturum açma ve oturum yönetimi için teknik açıdan gerekli çerezler veya benzer yerel depolama yöntemleri kullanılabilir. Bunlar, giriş gerektiren alanın güvenli biçimde sunulmasına yardımcı olur." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="7. Deine Rechte" en="7. Your rights" tr="7. Haklarınız" /></h2>
        <p><LocaleMessage de="Du hast nach Maßgabe der DSGVO Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Eine erteilte Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden. Du kannst dich zudem bei einer Datenschutzaufsichtsbehörde beschweren." en="Under the GDPR, you may have rights to access, rectification, erasure, restriction, data portability, and objection. You may withdraw consent at any time with effect for the future. You may also lodge a complaint with a data protection supervisory authority." tr="GDPR kapsamında erişim, düzeltme, silme, işlemenin kısıtlanması, veri taşınabilirliği ve itiraz haklarınız olabilir. Verdiğiniz rızayı geleceğe yönelik olarak istediğiniz zaman geri çekebilirsiniz. Ayrıca bir veri koruma denetim makamına şikâyette bulunabilirsiniz." /></p>
      </section>
      <section>
        <h2><LocaleMessage de="8. Sicherheit und Kontakt" en="8. Security and contact" tr="8. Güvenlik ve iletişim" /></h2>
        <p><LocaleMessage de={`Die Übertragung der Website erfolgt über HTTPS. Für Datenschutzanfragen erreichst du die verantwortliche Stelle unter ${legal.email}.`} en={`The website is served over HTTPS. For privacy enquiries, contact the controller at ${legal.email}.`} tr={`Web sitesi HTTPS üzerinden sunulur. Gizlilikle ilgili sorular için veri sorumlusuna ${legal.email} adresinden ulaşabilirsiniz.`} /></p>
      </section>
      <p><LocaleMessage de="Stand: September 2026" en="Last updated: September 2026" tr="Son güncelleme: Eylül 2026" /></p>
      <p><Link href="/"><LocaleMessage de="← Zur Startseite" en="← Back to home" tr="← Ana sayfaya dön" /></Link></p>
    </main>
  );
}
