import { LocaleMessage } from "../locale-message";

const questions = [
  {
    q: "Brauche ich einen dauerhaft eingeschalteten PC?",
    a: "Der Server verarbeitet gestartete Aufträge und überwacht verbundene Abläufe unabhängig von deinem Computer. Die Erweiterung brauchst du nur für Aktionen direkt im Browser.",
    enQ: "Do I need to keep my computer on?",
    enA: "The server processes submitted jobs and monitors connected workflows independently of your computer. You only need the extension for actions in your browser.",
    trQ: "Bilgisayarımın sürekli açık kalması gerekir mi?",
    trA: "Sunucu, başlatılan görevleri ve bağlı iş akışlarını bilgisayarından bağımsız yürütür. Eklenti yalnızca tarayıcıdaki işlemler için gerekir.",
  },
  {
    q: "Kann ich Produkte ohne Erweiterung importieren?",
    a: "Ja. Im Dashboard kannst du eine Amazon.de-URL oder ASIN eingeben und den Server-Auftrag direkt starten.",
    enQ: "Can I import products without the extension?",
    enA: "Yes. Enter an Amazon.de URL or ASIN in the dashboard and start a server job directly.",
    trQ: "Eklenti olmadan ürün aktarabilir miyim?",
    trA: "Evet. Panelde Amazon.de URL'si veya ASIN girip sunucu görevini doğrudan başlatabilirsin.",
  },
  {
    q: "Wird ein Angebot sofort veröffentlicht?",
    a: "Du kannst einen Entwurf zunächst prüfen. Die automatische Veröffentlichung ist eine eigene, auswählbare Option im Importformular.",
    enQ: "Is a listing published immediately?",
    enA: "You can review a draft first. Automatic publishing is a separate, optional setting in the import form.",
    trQ: "İlan hemen yayınlanır mı?",
    trA: "Önce taslağı inceleyebilirsin. Otomatik yayınlama, içe aktarma formunda ayrıca seçilen bir ayardır.",
  },
  {
    q: "Benötige ich für die Registrierung eine Kreditkarte?",
    a: "Für die Kontoerstellung werden Name, E-Mail-Adresse und Passwort benötigt. Zahlungsdaten werden dabei nicht abgefragt.",
    enQ: "Do I need a credit card to sign up?",
    enA: "You only need a name, email address, and password to create an account. No payment details are requested.",
    trQ: "Kayıt için kredi kartı gerekir mi?",
    trA: "Hesap açmak için ad, e-posta adresi ve şifre yeterlidir. Ödeme bilgisi istenmez.",
  },
  {
    q: "Brauche ich ein Amazon Prime-Konto?",
    a: "Nein. Ein Prime-Abo ist für den Import nicht erforderlich. Versandkosten und Lieferzeiten hängen vom jeweiligen Angebot ab und sollten vor der Veröffentlichung geprüft werden; sie werden derzeit nicht automatisch in die Marge eingerechnet.",
    enQ: "Do I need an Amazon Prime account?",
    enA: "No. A Prime subscription is not required for import. Shipping costs and delivery times depend on the offer and should be checked before publishing; they are not currently added to the margin automatically.",
    trQ: "Amazon Prime hesabı gerekli mi?",
    trA: "Hayır. İçe aktarma için Prime aboneliği gerekmez. Kargo ve teslimat süreleri teklife bağlıdır; yayınlamadan önce kontrol edilmelidir ve şu anda marja otomatik eklenmez.",
  },
  {
    q: "Wie funktioniert die Übernahme von Trackingnummern?",
    a: "Im Dashboard werden Sendungsdaten angezeigt, die für deine eBay-Bestellungen verfügbar sind. Ein automatischer Upload der Trackingnummern und eine VTR-Garantie sind derzeit nicht Bestandteil des bestätigten Ablaufs.",
    enQ: "How are tracking numbers handled?",
    enA: "The dashboard displays shipment details available for your eBay orders. Automatic tracking uploads and a VTR guarantee are not currently part of the confirmed workflow.",
    trQ: "Kargo takip numaraları nasıl aktarılıyor?",
    trA: "Panelde eBay siparişlerin için mevcut olan gönderi bilgileri gösterilir. Otomatik takip yükleme ve VTR garantisi şu an doğrulanmış akışın parçası değildir.",
  },
  {
    q: "Kann ich mein Abonnement jederzeit kündigen?",
    a: "Die Tarifauswahl startet derzeit nur die Registrierung und kein kostenpflichtiges Abonnement. Eine Abo-Verwaltung oder Kündigungsfunktion im Dashboard ist noch nicht verfügbar.",
    enQ: "Can I cancel my subscription at any time?",
    enA: "Choosing a plan currently starts registration only and does not create a paid subscription. Subscription management and cancellation are not yet available in the dashboard.",
    trQ: "Aboneliğimi istediğim zaman iptal edebilir miyim?",
    trA: "Plan seçimi şu anda yalnızca kayıt sürecini başlatır, ücretli abonelik oluşturmaz. Panelde abonelik yönetimi veya iptal özelliği henüz yoktur.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="sectionWrap marketingSection faqSection">
      <div className="sectionIntro">
        <span className="sectionKicker">FAQ</span>
        <h2><LocaleMessage de="Häufige Fragen." en="Frequently asked questions." tr="Sıkça sorulan sorular." /></h2>
        <p><LocaleMessage de="Das Wichtigste zum Einstieg und zum Betrieb auf dem Server." en="The essentials for getting started and running jobs on the server." tr="Başlangıç ve sunucuda görev yürütme hakkında bilmen gerekenler." /></p>
      </div>
      <div className="faqList">
        {questions.map((item) => (
          <details key={item.q}>
            <summary>
              <LocaleMessage className="faqQuestion" de={item.q} en={item.enQ} tr={item.trQ} />
              <span className="faqToggleIcon" aria-hidden="true">＋</span>
            </summary>
            <p><LocaleMessage de={item.a} en={item.enA} tr={item.trA} /></p>
          </details>
        ))}
      </div>
    </section>
  );
}
