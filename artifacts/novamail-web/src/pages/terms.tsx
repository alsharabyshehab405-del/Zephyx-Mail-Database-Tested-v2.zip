import { Link } from "wouter";
import { Inbox, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/hooks/use-i18n";

type Copy = {
  home: string;
  title: string;
  updated: string;
  sections: { title: string; text: string }[];
};

const copies: Record<string, Copy> = {
  en: {
    home: "Home",
    title: "Terms of Service",
    updated: "Last updated: August 10, 2026",
    sections: [
      {
        title: "1. Using Zephyx Mail",
        text: "You may use Zephyx Mail only in accordance with applicable law, these terms, and the rules of connected services.",
      },
      {
        title: "2. Your account",
        text: "You are responsible for maintaining the security of your account, password, authentication methods, and recovery information.",
      },
      {
        title: "3. Connected services",
        text: "Some Zephyx Mail features depend on third-party services such as Gmail. Your use of those services remains subject to their own terms, policies, availability, and authorization requirements.",
      },
      {
        title: "4. Acceptable use",
        text: "You may not use Zephyx Mail to abuse, disrupt, compromise, or gain unauthorized access to accounts, systems, networks, or other users.",
      },
      {
        title: "5. Service availability",
        text: "We aim to provide a reliable service, but uninterrupted or error-free availability cannot be guaranteed.",
      },
      {
        title: "6. Changes",
        text: "Zephyx Mail may evolve over time, including changes to features, integrations, security controls, and these terms.",
      },
      {
        title: "7. Termination",
        text: "Access may be restricted or terminated when necessary to protect users, the service, or comply with applicable requirements.",
      },
    ],
  },

  ar: {
    home: "الرئيسية",
    title: "شروط الخدمة",
    updated: "آخر تحديث: 10 أغسطس 2026",
    sections: [
      {
        title: "1. استخدام Zephyx Mail",
        text: "يجوز لك استخدام Zephyx Mail فقط وفقًا للقوانين المعمول بها وهذه الشروط وقواعد الخدمات المرتبطة.",
      },
      {
        title: "2. حسابك",
        text: "أنت مسؤول عن الحفاظ على أمان حسابك وكلمة المرور ووسائل المصادقة ومعلومات الاسترداد الخاصة بك.",
      },
      {
        title: "3. الخدمات المرتبطة",
        text: "تعتمد بعض ميزات Zephyx Mail على خدمات تابعة لجهات خارجية مثل Gmail. ويظل استخدامك لهذه الخدمات خاضعًا لشروطها وسياساتها وتوفرها ومتطلبات التفويض الخاصة بها.",
      },
      {
        title: "4. الاستخدام المقبول",
        text: "لا يجوز استخدام Zephyx Mail للإساءة أو التعطيل أو الاختراق أو محاولة الوصول غير المصرح به إلى الحسابات أو الأنظمة أو الشبكات أو المستخدمين الآخرين.",
      },
      {
        title: "5. توفر الخدمة",
        text: "نسعى إلى تقديم خدمة موثوقة، لكن لا يمكن ضمان توفر الخدمة بصورة متواصلة أو خالية تمامًا من الأخطاء.",
      },
      {
        title: "6. التغييرات",
        text: "قد يتطور Zephyx Mail بمرور الوقت، بما في ذلك تغييرات في الميزات والتكاملات وعناصر التحكم الأمنية وهذه الشروط.",
      },
      {
        title: "7. إنهاء الوصول",
        text: "قد يتم تقييد الوصول أو إنهاؤه عند الضرورة لحماية المستخدمين أو الخدمة أو للامتثال للمتطلبات المعمول بها.",
      },
    ],
  },

  fr: {
    home: "Accueil",
    title: "Conditions d'utilisation",
    updated: "Dernière mise à jour : 10 août 2026",
    sections: [
      {
        title: "1. Utilisation de Zephyx Mail",
        text: "Vous pouvez utiliser Zephyx Mail uniquement conformément aux lois applicables, aux présentes conditions et aux règles des services connectés.",
      },
      {
        title: "2. Votre compte",
        text: "Vous êtes responsable de la sécurité de votre compte, de votre mot de passe, de vos méthodes d'authentification et de vos informations de récupération.",
      },
      {
        title: "3. Services connectés",
        text: "Certaines fonctionnalités de Zephyx Mail dépendent de services tiers tels que Gmail. Votre utilisation de ces services reste soumise à leurs propres conditions, politiques, disponibilité et exigences d'autorisation.",
      },
      {
        title: "4. Utilisation acceptable",
        text: "Vous ne pouvez pas utiliser Zephyx Mail pour abuser, perturber, compromettre ou obtenir un accès non autorisé à des comptes, systèmes, réseaux ou autres utilisateurs.",
      },
      {
        title: "5. Disponibilité du service",
        text: "Nous cherchons à fournir un service fiable, mais une disponibilité continue et totalement exempte d'erreurs ne peut pas être garantie.",
      },
      {
        title: "6. Modifications",
        text: "Zephyx Mail peut évoluer au fil du temps, notamment en ce qui concerne les fonctionnalités, les intégrations, les contrôles de sécurité et les présentes conditions.",
      },
      {
        title: "7. Résiliation",
        text: "L'accès peut être limité ou résilié lorsque cela est nécessaire pour protéger les utilisateurs, le service ou respecter les exigences applicables.",
      },
    ],
  },

  es: {
    home: "Inicio",
    title: "Términos del servicio",
    updated: "Última actualización: 10 de agosto de 2026",
    sections: [
      {
        title: "1. Uso de Zephyx Mail",
        text: "Puedes utilizar Zephyx Mail únicamente de acuerdo con la legislación aplicable, estos términos y las normas de los servicios conectados.",
      },
      {
        title: "2. Tu cuenta",
        text: "Eres responsable de mantener la seguridad de tu cuenta, contraseña, métodos de autenticación e información de recuperación.",
      },
      {
        title: "3. Servicios conectados",
        text: "Algunas funciones de Zephyx Mail dependen de servicios de terceros como Gmail. El uso de dichos servicios continúa sujeto a sus propios términos, políticas, disponibilidad y requisitos de autorización.",
      },
      {
        title: "4. Uso aceptable",
        text: "No puedes utilizar Zephyx Mail para abusar, interrumpir, comprometer u obtener acceso no autorizado a cuentas, sistemas, redes u otros usuarios.",
      },
      {
        title: "5. Disponibilidad del servicio",
        text: "Nuestro objetivo es ofrecer un servicio fiable, pero no podemos garantizar una disponibilidad ininterrumpida o completamente libre de errores.",
      },
      {
        title: "6. Cambios",
        text: "Zephyx Mail puede evolucionar con el tiempo, incluyendo cambios en funciones, integraciones, controles de seguridad y estos términos.",
      },
      {
        title: "7. Terminación",
        text: "El acceso puede restringirse o finalizarse cuando sea necesario para proteger a los usuarios, al servicio o para cumplir con requisitos aplicables.",
      },
    ],
  },

  de: {
    home: "Startseite",
    title: "Nutzungsbedingungen",
    updated: "Letzte Aktualisierung: 10. August 2026",
    sections: [
      {
        title: "1. Nutzung von Zephyx Mail",
        text: "Du darfst Zephyx Mail nur in Übereinstimmung mit geltendem Recht, diesen Bedingungen und den Regeln verbundener Dienste verwenden.",
      },
      {
        title: "2. Dein Konto",
        text: "Du bist für die Sicherheit deines Kontos, deines Passworts, deiner Authentifizierungsmethoden und deiner Wiederherstellungsinformationen verantwortlich.",
      },
      {
        title: "3. Verbundene Dienste",
        text: "Einige Funktionen von Zephyx Mail hängen von Drittanbieterdiensten wie Gmail ab. Deine Nutzung dieser Dienste unterliegt weiterhin deren eigenen Bedingungen, Richtlinien, Verfügbarkeit und Autorisierungsanforderungen.",
      },
      {
        title: "4. Zulässige Nutzung",
        text: "Du darfst Zephyx Mail nicht verwenden, um Konten, Systeme, Netzwerke oder andere Benutzer zu missbrauchen, zu stören, zu kompromittieren oder unbefugt darauf zuzugreifen.",
      },
      {
        title: "5. Verfügbarkeit des Dienstes",
        text: "Wir bemühen uns um einen zuverlässigen Dienst, können jedoch keine ununterbrochene oder vollständig fehlerfreie Verfügbarkeit garantieren.",
      },
      {
        title: "6. Änderungen",
        text: "Zephyx Mail kann sich im Laufe der Zeit weiterentwickeln, einschließlich Änderungen an Funktionen, Integrationen, Sicherheitskontrollen und diesen Bedingungen.",
      },
      {
        title: "7. Beendigung",
        text: "Der Zugriff kann eingeschränkt oder beendet werden, wenn dies zum Schutz der Benutzer, des Dienstes oder zur Einhaltung geltender Anforderungen erforderlich ist.",
      },
    ],
  },

  pt: {
    home: "Início",
    title: "Termos de Serviço",
    updated: "Última atualização: 10 de agosto de 2026",
    sections: [
      {
        title: "1. Uso do Zephyx Mail",
        text: "Você pode utilizar o Zephyx Mail somente de acordo com a legislação aplicável, estes termos e as regras dos serviços conectados.",
      },
      {
        title: "2. Sua conta",
        text: "Você é responsável por manter a segurança da sua conta, senha, métodos de autenticação e informações de recuperação.",
      },
      {
        title: "3. Serviços conectados",
        text: "Alguns recursos do Zephyx Mail dependem de serviços de terceiros, como o Gmail. O uso desses serviços permanece sujeito aos próprios termos, políticas, disponibilidade e requisitos de autorização.",
      },
      {
        title: "4. Uso aceitável",
        text: "Você não pode utilizar o Zephyx Mail para abusar, interromper, comprometer ou obter acesso não autorizado a contas, sistemas, redes ou outros usuários.",
      },
      {
        title: "5. Disponibilidade do serviço",
        text: "Buscamos fornecer um serviço confiável, mas não podemos garantir disponibilidade ininterrupta ou totalmente livre de erros.",
      },
      {
        title: "6. Alterações",
        text: "O Zephyx Mail pode evoluir ao longo do tempo, incluindo alterações em recursos, integrações, controles de segurança e nestes termos.",
      },
      {
        title: "7. Encerramento",
        text: "O acesso pode ser restringido ou encerrado quando necessário para proteger usuários, o serviço ou cumprir requisitos aplicáveis.",
      },
    ],
  },
};

// TERMS_EXTRA_10_LANGUAGES
Object.assign(copies, {
  "tr": {
    "home": "Ana Sayfa",
    "title": "Kullanım Koşulları",
    "updated": "Son güncelleme: 10 Ağustos 2026",
    "sections": [
      {
        "title": "1. Zephyx Mail kullanımı",
        "text": "Zephyx Mail'i yalnızca yürürlükteki yasalara, bu koşullara ve bağlı hizmetlerin kurallarına uygun olarak kullanabilirsiniz."
      },
      {
        "title": "2. Hesabınız",
        "text": "Hesabınızın, parolanızın, kimlik doğrulama yöntemlerinizin ve kurtarma bilgilerinizin güvenliğini korumaktan siz sorumlusunuz."
      },
      {
        "title": "3. Bağlı hizmetler",
        "text": "Bazı Zephyx Mail özellikleri Gmail gibi üçüncü taraf hizmetlere bağlıdır. Bu hizmetleri kullanımınız kendi koşullarına, politikalarına, kullanılabilirliklerine ve yetkilendirme gereksinimlerine tabi olmaya devam eder."
      },
      {
        "title": "4. Kabul edilebilir kullanım",
        "text": "Zephyx Mail'i hesaplara, sistemlere, ağlara veya diğer kullanıcılara zarar vermek, hizmetleri bozmak ya da yetkisiz erişim elde etmek amacıyla kullanamazsınız."
      },
      {
        "title": "5. Hizmet kullanılabilirliği",
        "text": "Güvenilir bir hizmet sunmayı amaçlıyoruz ancak kesintisiz veya tamamen hatasız kullanılabilirlik garanti edilemez."
      },
      {
        "title": "6. Değişiklikler",
        "text": "Zephyx Mail zaman içinde gelişebilir; özelliklerde, entegrasyonlarda, güvenlik kontrollerinde ve bu koşullarda değişiklikler yapılabilir."
      },
      {
        "title": "7. Sonlandırma",
        "text": "Kullanıcıları veya hizmeti korumak ya da geçerli gerekliliklere uymak amacıyla gerektiğinde erişim kısıtlanabilir veya sonlandırılabilir."
      }
    ]
  },
  "zh": {
    "home": "首页",
    "title": "服务条款",
    "updated": "最后更新：2026年8月10日",
    "sections": [
      {
        "title": "1. 使用 Zephyx Mail",
        "text": "您只能按照适用法律、本条款以及已连接服务的相关规则使用 Zephyx Mail。"
      },
      {
        "title": "2. 您的账户",
        "text": "您有责任维护账户、密码、身份验证方式以及恢复信息的安全。"
      },
      {
        "title": "3. 已连接服务",
        "text": "Zephyx Mail 的部分功能依赖 Gmail 等第三方服务。您对这些服务的使用仍受其自身条款、政策、可用性以及授权要求的约束。"
      },
      {
        "title": "4. 可接受使用",
        "text": "您不得利用 Zephyx Mail 滥用、破坏、危害或未经授权访问账户、系统、网络或其他用户。"
      },
      {
        "title": "5. 服务可用性",
        "text": "我们致力于提供可靠的服务，但无法保证服务始终不中断或完全没有错误。"
      },
      {
        "title": "6. 变更",
        "text": "Zephyx Mail 可能会随着时间发展，包括对功能、集成、安全控制以及本条款进行修改。"
      },
      {
        "title": "7. 终止",
        "text": "在保护用户、服务或遵守适用要求所必需的情况下，访问权限可能会受到限制或终止。"
      }
    ]
  },
  "hi": {
    "home": "होम",
    "title": "सेवा की शर्तें",
    "updated": "अंतिम अपडेट: 10 अगस्त 2026",
    "sections": [
      {
        "title": "1. Zephyx Mail का उपयोग",
        "text": "आप Zephyx Mail का उपयोग केवल लागू कानूनों, इन शर्तों और कनेक्टेड सेवाओं के नियमों के अनुसार कर सकते हैं।"
      },
      {
        "title": "2. आपका खाता",
        "text": "अपने खाते, पासवर्ड, प्रमाणीकरण विधियों और रिकवरी जानकारी की सुरक्षा बनाए रखना आपकी जिम्मेदारी है।"
      },
      {
        "title": "3. कनेक्टेड सेवाएं",
        "text": "Zephyx Mail की कुछ सुविधाएं Gmail जैसी तृतीय-पक्ष सेवाओं पर निर्भर करती हैं। उन सेवाओं का आपका उपयोग उनकी अपनी शर्तों, नीतियों, उपलब्धता और अनुमति आवश्यकताओं के अधीन रहता है।"
      },
      {
        "title": "4. स्वीकार्य उपयोग",
        "text": "आप Zephyx Mail का उपयोग खातों, प्रणालियों, नेटवर्क या अन्य उपयोगकर्ताओं के दुरुपयोग, व्यवधान, समझौते या अनधिकृत पहुंच के लिए नहीं कर सकते।"
      },
      {
        "title": "5. सेवा उपलब्धता",
        "text": "हम एक विश्वसनीय सेवा प्रदान करने का प्रयास करते हैं, लेकिन निरंतर या पूरी तरह त्रुटिरहित उपलब्धता की गारंटी नहीं दी जा सकती।"
      },
      {
        "title": "6. बदलाव",
        "text": "Zephyx Mail समय के साथ विकसित हो सकता है, जिसमें सुविधाओं, एकीकरण, सुरक्षा नियंत्रण और इन शर्तों में बदलाव शामिल हैं।"
      },
      {
        "title": "7. समाप्ति",
        "text": "उपयोगकर्ताओं या सेवा की सुरक्षा अथवा लागू आवश्यकताओं के अनुपालन के लिए आवश्यक होने पर पहुंच सीमित या समाप्त की जा सकती है।"
      }
    ]
  },
  "id": {
    "home": "Beranda",
    "title": "Ketentuan Layanan",
    "updated": "Terakhir diperbarui: 10 Agustus 2026",
    "sections": [
      {
        "title": "1. Menggunakan Zephyx Mail",
        "text": "Anda hanya boleh menggunakan Zephyx Mail sesuai dengan hukum yang berlaku, ketentuan ini, dan aturan layanan yang terhubung."
      },
      {
        "title": "2. Akun Anda",
        "text": "Anda bertanggung jawab menjaga keamanan akun, kata sandi, metode autentikasi, dan informasi pemulihan Anda."
      },
      {
        "title": "3. Layanan terhubung",
        "text": "Beberapa fitur Zephyx Mail bergantung pada layanan pihak ketiga seperti Gmail. Penggunaan layanan tersebut tetap tunduk pada ketentuan, kebijakan, ketersediaan, dan persyaratan otorisasi masing-masing."
      },
      {
        "title": "4. Penggunaan yang dapat diterima",
        "text": "Anda tidak boleh menggunakan Zephyx Mail untuk menyalahgunakan, mengganggu, membahayakan, atau memperoleh akses tanpa izin ke akun, sistem, jaringan, atau pengguna lain."
      },
      {
        "title": "5. Ketersediaan layanan",
        "text": "Kami berupaya menyediakan layanan yang andal, tetapi ketersediaan tanpa gangguan atau sepenuhnya bebas kesalahan tidak dapat dijamin."
      },
      {
        "title": "6. Perubahan",
        "text": "Zephyx Mail dapat berkembang dari waktu ke waktu, termasuk perubahan pada fitur, integrasi, kontrol keamanan, dan ketentuan ini."
      },
      {
        "title": "7. Penghentian",
        "text": "Akses dapat dibatasi atau dihentikan bila diperlukan untuk melindungi pengguna, layanan, atau memenuhi persyaratan yang berlaku."
      }
    ]
  }
});

export default function Terms() {
  const { locale } = useI18n();
  const copy = copies[locale] ?? copies.en;
  const rtl = locale === "ar";
  const BackIcon = rtl ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Inbox className="h-5 w-5" />
            </div>
            <span className="font-bold">Zephyx Mail</span>
          </Link>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <BackIcon className="h-4 w-4" />
                {copy.home}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-4xl px-5 py-12"
        dir={rtl ? "rtl" : "ltr"}
      >
        <h1 className="text-4xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.updated}</p>

        <div className="mt-10 space-y-8 leading-7 text-muted-foreground">
          {copy.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-foreground">
                {section.title}
              </h2>
              <p className="mt-2">{section.text}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
