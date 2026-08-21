import { Link } from "wouter";
import { Inbox, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/hooks/use-i18n";

const copies = {
  en: {
    home: "Home",
    title: "Privacy Policy",
    updated: "Last updated: August 10, 2026",
    sections: [
      { title: "1. Information we process", text: "Zephyx Mail processes account information you provide when creating and using your account. When you connect Gmail, we may process email-related data that you authorize through Google to provide the email features you request." },
      { title: "2. How information is used", text: "Information is used for authentication, connected inbox functionality, message, folder and attachment management, synchronization, account security, and other features you choose to use." },
      { title: "3. Google user data", text: "Zephyx Mail accesses Google account data only after you authorize access. Google user data is used only to provide and improve user-facing email functionality requested by you." },
      { title: "4. Storage and security", text: "Data needed to operate your account, synchronization, and email features may be stored. We use technical and organizational safeguards to protect accounts and service data, including two-factor authentication, recovery codes, and session controls." },
      { title: "5. Data sharing", text: "Zephyx Mail does not sell Google user data to advertisers. Data is shared only when necessary to operate the service or comply with applicable legal requirements." },
      { title: "6. Retention and your choices", text: "Information may be retained while your account or connected services remain active and as reasonably necessary to operate and secure the service. You may disconnect Gmail, manage security and sessions, or stop using Zephyx Mail." },
      { title: "7. Google API Limited Use", text: "Zephyx Mail's use of information received from Google APIs is subject to the Google API Services User Data Policy, including the Limited Use requirements." },
      { title: "8. Changes to this policy", text: "This Privacy Policy may be updated as the service develops. Material updates will be reflected by changing the date displayed on this page." },
    ],
  },
  ar: {
    home: "الرئيسية",
    title: "سياسة الخصوصية",
    updated: "آخر تحديث: 10 أغسطس 2026",
    sections: [
      { title: "1. المعلومات التي نعالجها", text: "يعالج Zephyx Mail معلومات الحساب التي تقدمها عند إنشاء حسابك واستخدامه. وعند ربط Gmail، قد نعالج بيانات البريد التي تسمح بالوصول إليها من خلال Google لتقديم وظائف البريد التي تطلبها." },
      { title: "2. كيفية استخدام المعلومات", text: "نستخدم المعلومات لتسجيل الدخول، وتشغيل البريد المرتبط، وإدارة الرسائل والمجلدات والمرفقات، والمزامنة، وحماية الحساب، وتقديم الميزات التي تختار استخدامها." },
      { title: "3. بيانات مستخدم Google", text: "لا يصل Zephyx Mail إلى بيانات حساب Google إلا بعد منحك الإذن. ويقتصر استخدام بيانات Google على تشغيل وتحسين ميزات البريد الظاهرة للمستخدم والتي طلبتها." },
      { title: "4. التخزين والأمان", text: "قد تُخزّن البيانات اللازمة لتشغيل حسابك والمزامنة وتقديم ميزات البريد. نستخدم إجراءات تقنية وتنظيمية لحماية الحساب والبيانات، بما في ذلك التحقق بخطوتين ورموز الاسترداد وإدارة الجلسات." },
      { title: "5. مشاركة البيانات", text: "لا يبيع Zephyx Mail بيانات مستخدم Google للمعلنين. ولا تتم مشاركة البيانات إلا بالقدر اللازم لتشغيل الخدمة أو الامتثال للمتطلبات القانونية المطبقة." },
      { title: "6. الاحتفاظ والاختيارات", text: "قد يتم الاحتفاظ بالمعلومات أثناء بقاء حسابك أو الخدمات المرتبطة نشطة وبالقدر اللازم لتشغيل الخدمة وحمايتها. ويمكنك فصل Gmail وإدارة إعدادات الأمان والجلسات والتوقف عن استخدام Zephyx Mail." },
      { title: "7. الاستخدام المحدود لبيانات Google", text: "استخدام Zephyx Mail للمعلومات المستلمة من Google APIs يخضع لسياسة بيانات مستخدم خدمات Google API، بما في ذلك متطلبات الاستخدام المحدود." },
      { title: "8. التغييرات على هذه السياسة", text: "قد يتم تحديث سياسة الخصوصية مع تطور الخدمة. وستظهر التحديثات المهمة من خلال تغيير تاريخ آخر تحديث المعروض في هذه الصفحة." },
    ],
  },
  fr: {
    home: "Accueil",
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : 10 août 2026",
    sections: [
      { title: "1. Informations que nous traitons", text: "Zephyx Mail traite les informations de compte que vous fournissez lors de la création et de l’utilisation de votre compte. Lorsque vous connectez Gmail, nous pouvons traiter les données liées aux e-mails que vous autorisez via Google afin de fournir les fonctions de messagerie demandées." },
      { title: "2. Utilisation des informations", text: "Les informations sont utilisées pour l’authentification, les fonctions de boîte de réception connectée, la gestion des messages, dossiers et pièces jointes, la synchronisation, la sécurité du compte et les autres fonctions que vous choisissez d’utiliser." },
      { title: "3. Données utilisateur Google", text: "Zephyx Mail n’accède aux données de votre compte Google qu’après votre autorisation. Les données utilisateur Google sont utilisées uniquement pour fournir et améliorer les fonctions de messagerie visibles par l’utilisateur que vous avez demandées." },
      { title: "4. Stockage et sécurité", text: "Les données nécessaires au fonctionnement de votre compte, à la synchronisation et aux fonctions de messagerie peuvent être stockées. Nous utilisons des mesures techniques et organisationnelles de protection, notamment l’authentification à deux facteurs, les codes de récupération et la gestion des sessions." },
      { title: "5. Partage des données", text: "Zephyx Mail ne vend pas les données utilisateur Google aux annonceurs. Les données ne sont partagées que lorsque cela est nécessaire au fonctionnement du service ou au respect des obligations légales applicables." },
      { title: "6. Conservation et vos choix", text: "Les informations peuvent être conservées tant que votre compte ou vos services connectés restent actifs et aussi longtemps que cela est raisonnablement nécessaire au fonctionnement et à la sécurité du service. Vous pouvez déconnecter Gmail, gérer la sécurité et les sessions, ou cesser d’utiliser Zephyx Mail." },
      { title: "7. Utilisation limitée des API Google", text: "L’utilisation par Zephyx Mail des informations reçues des API Google est soumise à la politique relative aux données utilisateur des services API Google, y compris les exigences d’utilisation limitée." },
      { title: "8. Modifications de cette politique", text: "Cette politique de confidentialité peut être mise à jour à mesure que le service évolue. Les modifications importantes seront indiquées par la mise à jour de la date affichée sur cette page." },
    ],
  },
  es: {
    home: "Inicio",
    title: "Política de privacidad",
    updated: "Última actualización: 10 de agosto de 2026",
    sections: [
      { title: "1. Información que procesamos", text: "Zephyx Mail procesa la información de la cuenta que proporcionas al crear y utilizar tu cuenta. Cuando conectas Gmail, podemos procesar datos relacionados con el correo electrónico que autorizas mediante Google para ofrecer las funciones de correo que solicitas." },
      { title: "2. Cómo usamos la información", text: "La información se utiliza para la autenticación, las funciones de la bandeja conectada, la gestión de mensajes, carpetas y archivos adjuntos, la sincronización, la seguridad de la cuenta y otras funciones que decidas utilizar." },
      { title: "3. Datos de usuario de Google", text: "Zephyx Mail accede a los datos de tu cuenta de Google únicamente después de que autorices el acceso. Los datos de usuario de Google se utilizan solo para proporcionar y mejorar las funciones de correo visibles para el usuario que hayas solicitado." },
      { title: "4. Almacenamiento y seguridad", text: "Pueden almacenarse los datos necesarios para operar tu cuenta, la sincronización y las funciones de correo. Utilizamos medidas técnicas y organizativas para proteger las cuentas y los datos del servicio, incluida la autenticación de dos factores, los códigos de recuperación y los controles de sesión." },
      { title: "5. Compartición de datos", text: "Zephyx Mail no vende datos de usuario de Google a anunciantes. Los datos solo se comparten cuando es necesario para operar el servicio o cumplir los requisitos legales aplicables." },
      { title: "6. Conservación y tus opciones", text: "La información puede conservarse mientras tu cuenta o los servicios conectados sigan activos y durante el tiempo razonablemente necesario para operar y proteger el servicio. Puedes desconectar Gmail, administrar la seguridad y las sesiones o dejar de utilizar Zephyx Mail." },
      { title: "7. Uso limitado de las API de Google", text: "El uso que Zephyx Mail hace de la información recibida de las API de Google está sujeto a la Política de datos de usuario de los servicios API de Google, incluidos los requisitos de Uso limitado." },
      { title: "8. Cambios en esta política", text: "Esta Política de privacidad puede actualizarse a medida que evoluciona el servicio. Los cambios importantes se reflejarán actualizando la fecha mostrada en esta página." },
    ],
  },
  de: {
    home: "Startseite",
    title: "Datenschutzerklärung",
    updated: "Zuletzt aktualisiert: 10. August 2026",
    sections: [
      { title: "1. Informationen, die wir verarbeiten", text: "Zephyx Mail verarbeitet Kontoinformationen, die Sie beim Erstellen und Verwenden Ihres Kontos angeben. Wenn Sie Gmail verbinden, können wir E-Mail-bezogene Daten verarbeiten, die Sie über Google autorisieren, um die von Ihnen angeforderten E-Mail-Funktionen bereitzustellen." },
      { title: "2. Verwendung der Informationen", text: "Informationen werden für Authentifizierung, Funktionen des verbundenen Posteingangs, Verwaltung von Nachrichten, Ordnern und Anhängen, Synchronisierung, Kontosicherheit und weitere von Ihnen gewählte Funktionen verwendet." },
      { title: "3. Google-Nutzerdaten", text: "Zephyx Mail greift erst nach Ihrer Autorisierung auf Google-Kontodaten zu. Google-Nutzerdaten werden ausschließlich verwendet, um die von Ihnen angeforderten, nutzerbezogenen E-Mail-Funktionen bereitzustellen und zu verbessern." },
      { title: "4. Speicherung und Sicherheit", text: "Daten, die für den Betrieb Ihres Kontos, die Synchronisierung und E-Mail-Funktionen erforderlich sind, können gespeichert werden. Wir verwenden technische und organisatorische Schutzmaßnahmen, darunter Zwei-Faktor-Authentifizierung, Wiederherstellungscodes und Sitzungsverwaltung." },
      { title: "5. Datenweitergabe", text: "Zephyx Mail verkauft keine Google-Nutzerdaten an Werbetreibende. Daten werden nur weitergegeben, wenn dies für den Betrieb des Dienstes oder zur Erfüllung geltender rechtlicher Anforderungen erforderlich ist." },
      { title: "6. Aufbewahrung und Ihre Wahlmöglichkeiten", text: "Informationen können aufbewahrt werden, solange Ihr Konto oder verbundene Dienste aktiv sind und soweit dies für Betrieb und Sicherheit des Dienstes angemessen erforderlich ist. Sie können Gmail trennen, Sicherheits- und Sitzungseinstellungen verwalten oder die Nutzung von Zephyx Mail beenden." },
      { title: "7. Eingeschränkte Nutzung der Google APIs", text: "Die Nutzung von Informationen aus Google APIs durch Zephyx Mail unterliegt der Google API Services User Data Policy einschließlich der Anforderungen zur eingeschränkten Nutzung." },
      { title: "8. Änderungen dieser Richtlinie", text: "Diese Datenschutzerklärung kann mit der Weiterentwicklung des Dienstes aktualisiert werden. Wesentliche Änderungen werden durch die Aktualisierung des auf dieser Seite angezeigten Datums kenntlich gemacht." },
    ],
  },
  pt: {
    home: "Início",
    title: "Política de Privacidade",
    updated: "Última atualização: 10 de agosto de 2026",
    sections: [
      { title: "1. Informações que processamos", text: "O Zephyx Mail processa as informações da conta fornecidas ao criar e usar sua conta. Ao conectar o Gmail, podemos processar dados relacionados a e-mails autorizados por você por meio do Google para oferecer os recursos de e-mail solicitados." },
      { title: "2. Como as informações são usadas", text: "As informações são usadas para autenticação, recursos da caixa de entrada conectada, gerenciamento de mensagens, pastas e anexos, sincronização, segurança da conta e outros recursos que você optar por usar." },
      { title: "3. Dados de usuário do Google", text: "O Zephyx Mail acessa dados da sua conta do Google somente após sua autorização. Os dados de usuário do Google são usados apenas para fornecer e aprimorar os recursos de e-mail voltados ao usuário que você solicitou." },
      { title: "4. Armazenamento e segurança", text: "Os dados necessários para operar sua conta, a sincronização e os recursos de e-mail podem ser armazenados. Utilizamos medidas técnicas e organizacionais de proteção, incluindo autenticação de dois fatores, códigos de recuperação e controles de sessão." },
      { title: "5. Compartilhamento de dados", text: "O Zephyx Mail não vende dados de usuário do Google a anunciantes. Os dados são compartilhados apenas quando necessário para operar o serviço ou cumprir requisitos legais aplicáveis." },
      { title: "6. Retenção e suas escolhas", text: "As informações podem ser mantidas enquanto sua conta ou serviços conectados permanecerem ativos e pelo tempo razoavelmente necessário para operar e proteger o serviço. Você pode desconectar o Gmail, gerenciar segurança e sessões ou deixar de usar o Zephyx Mail." },
      { title: "7. Uso limitado das APIs do Google", text: "O uso pelo Zephyx Mail das informações recebidas das APIs do Google está sujeito à Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado." },
      { title: "8. Alterações nesta política", text: "Esta Política de Privacidade pode ser atualizada à medida que o serviço evolui. Alterações relevantes serão refletidas pela atualização da data exibida nesta página." },
    ],
  },
  tr: {
    home: "Ana Sayfa",
    title: "Gizlilik Politikası",
    updated: "Son güncelleme: 10 Ağustos 2026",
    sections: [
      { title: "1. İşlediğimiz bilgiler", text: "Zephyx Mail, hesabınızı oluştururken ve kullanırken sağladığınız hesap bilgilerini işler. Gmail'i bağladığınızda, talep ettiğiniz e-posta özelliklerini sunmak için Google üzerinden izin verdiğiniz e-posta ile ilgili bilgiler işlenebilir." },
      { title: "2. Bilgilerin kullanımı", text: "Bilgiler hesap kimlik doğrulaması, bağlı gelen kutusu özellikleri, mesaj, klasör ve ek yönetimi, senkronizasyon, hesap güvenliği ve seçtiğiniz diğer özellikleri sağlamak için kullanılır." },
      { title: "3. Google kullanıcı verileri", text: "Google hesap verilerine yalnızca Zephyx Mail'e izin verdikten sonra erişilir. Google kullanıcı verileri yalnızca talep ettiğiniz kullanıcıya yönelik e-posta işlevlerini sağlamak ve geliştirmek için kullanılır." },
      { title: "4. Depolama ve güvenlik", text: "Hesabınızı, senkronizasyonu ve e-posta özelliklerini çalıştırmak için gereken veriler saklanabilir. İki faktörlü kimlik doğrulama, kurtarma kodları ve oturum kontrolleri dahil teknik ve organizasyonel güvenlik önlemleri kullanırız." },
      { title: "5. Veri paylaşımı", text: "Zephyx Mail, Google kullanıcı verilerini reklamverenlere satmaz. Veriler yalnızca hizmeti işletmek veya geçerli yasal gerekliliklere uymak için gerekli olduğunda paylaşılır." },
      { title: "6. Saklama ve tercihleriniz", text: "Bilgiler hesabınız veya bağlı hizmetleriniz aktif olduğu sürece ve hizmetin işletilmesi ile güvenliği için makul ölçüde gerekli olduğu süre boyunca saklanabilir. Gmail bağlantısını kesebilir, güvenliği ve oturumları yönetebilir veya Zephyx Mail'i kullanmayı bırakabilirsiniz." },
      { title: "7. Google API Sınırlı Kullanım", text: "Zephyx Mail'in Google API'lerinden aldığı bilgileri kullanması, Sınırlı Kullanım gereklilikleri dahil Google API Hizmetleri Kullanıcı Verileri Politikası'na tabidir." },
      { title: "8. Politika değişiklikleri", text: "Bu Gizlilik Politikası hizmet geliştikçe güncellenebilir. Önemli değişiklikler bu sayfada gösterilen tarihin güncellenmesiyle belirtilecektir." },
    ],
  },
  zh: {
    home: "首页",
    title: "隐私政策",
    updated: "最后更新：2026年8月10日",
    sections: [
      { title: "1. 我们处理的信息", text: "Zephyx Mail 会处理您在创建和使用账户时提供的账户信息。连接 Gmail 后，本服务可能处理您通过 Google 授权的电子邮件相关信息，以提供您所请求的邮件功能。" },
      { title: "2. 信息的使用", text: "信息用于账户身份验证、已连接收件箱功能、邮件、文件夹和附件管理、同步、账户安全以及您选择使用的其他功能。" },
      { title: "3. Google 用户数据", text: "只有在您授权 Zephyx Mail 后才会访问 Google 账户数据。Google 用户数据仅用于提供和改进您所请求的面向用户的邮件功能。" },
      { title: "4. 存储与安全", text: "为运行您的账户、同步和邮件功能所需的数据可能会被存储。我们采用技术和组织安全措施，包括双重身份验证、恢复代码和会话控制。" },
      { title: "5. 数据共享", text: "Zephyx Mail 不会将 Google 用户数据出售给广告商。仅在运行服务或遵守适用法律要求所必需的情况下共享数据。" },
      { title: "6. 数据保留与您的选择", text: "在您的账户或已连接服务保持有效期间，以及为运行和保护服务而合理必要的期间内，相关信息可能会被保留。您可以断开 Gmail、管理安全和会话，或停止使用 Zephyx Mail。" },
      { title: "7. Google API 有限使用", text: "Zephyx Mail 对从 Google API 获取的信息的使用受 Google API 服务用户数据政策约束，包括有限使用要求。" },
      { title: "8. 政策变更", text: "随着服务的发展，本隐私政策可能会更新。重大变更将通过更新本页面显示的日期来体现。" },
    ],
  },
  hi: {
    home: "होम",
    title: "गोपनीयता नीति",
    updated: "अंतिम अपडेट: 10 अगस्त 2026",
    sections: [
      { title: "1. हम कौन-सी जानकारी संसाधित करते हैं", text: "Zephyx Mail वह खाता जानकारी संसाधित करता है जो आप खाता बनाते और उपयोग करते समय प्रदान करते हैं। Gmail कनेक्ट करने पर सेवा उन ईमेल-संबंधित जानकारियों को संसाधित कर सकती है जिनकी अनुमति आप Google के माध्यम से देते हैं।" },
      { title: "2. जानकारी का उपयोग", text: "जानकारी का उपयोग खाता प्रमाणीकरण, कनेक्टेड इनबॉक्स, संदेश, फ़ोल्डर और अटैचमेंट प्रबंधन, सुरक्षा, सिंक्रोनाइज़ेशन और आपके द्वारा चुनी गई अन्य सुविधाओं के लिए किया जाता है।" },
      { title: "3. Google उपयोगकर्ता डेटा", text: "Google खाते के डेटा तक पहुंच केवल आपकी अनुमति के बाद होती है। Google उपयोगकर्ता डेटा का उपयोग केवल आपके द्वारा अनुरोधित उपयोगकर्ता-मुखी ईमेल सुविधाएँ प्रदान करने और बेहतर बनाने के लिए किया जाता है।" },
      { title: "4. संग्रहण और सुरक्षा", text: "आपके खाते, सिंक्रोनाइज़ेशन और ईमेल सुविधाओं को चलाने के लिए आवश्यक डेटा संग्रहित किया जा सकता है। हम दो-कारक प्रमाणीकरण, रिकवरी कोड और सत्र नियंत्रण सहित तकनीकी और संगठनात्मक सुरक्षा उपायों का उपयोग करते हैं।" },
      { title: "5. डेटा साझा करना", text: "Zephyx Mail Google उपयोगकर्ता डेटा को विज्ञापनदाताओं को नहीं बेचता। डेटा केवल सेवा चलाने या लागू कानूनी आवश्यकताओं का पालन करने के लिए आवश्यक होने पर साझा किया जाता है।" },
      { title: "6. डेटा प्रतिधारण और आपके विकल्प", text: "जानकारी तब तक रखी जा सकती है जब तक आपका खाता या कनेक्टेड सेवाएं सक्रिय हैं और सेवा को चलाने व सुरक्षित रखने के लिए उचित रूप से आवश्यक है। आप Gmail डिस्कनेक्ट कर सकते हैं, सुरक्षा और सत्रों का प्रबंधन कर सकते हैं या Zephyx Mail का उपयोग बंद कर सकते हैं।" },
      { title: "7. Google API सीमित उपयोग", text: "Google APIs से प्राप्त जानकारी का Zephyx Mail द्वारा उपयोग Google API Services User Data Policy के अधीन है, जिसमें Limited Use आवश्यकताएँ शामिल हैं।" },
      { title: "8. नीति में बदलाव", text: "सेवा के विकास के साथ यह गोपनीयता नीति अपडेट हो सकती है। महत्वपूर्ण बदलाव इस पेज पर दिखाई गई तारीख को अपडेट करके दर्शाए जाएंगे।" },
    ],
  },
  id: {
    home: "Beranda",
    title: "Kebijakan Privasi",
    updated: "Terakhir diperbarui: 10 Agustus 2026",
    sections: [
      { title: "1. Informasi yang kami proses", text: "Zephyx Mail memproses informasi akun yang Anda berikan saat membuat dan menggunakan akun. Saat Gmail dihubungkan, layanan dapat memproses informasi terkait email yang Anda izinkan melalui Google untuk menyediakan fitur yang Anda minta." },
      { title: "2. Penggunaan informasi", text: "Informasi digunakan untuk autentikasi akun, fungsi kotak masuk terhubung, pengelolaan pesan, folder dan lampiran, sinkronisasi, keamanan akun, serta fitur lain yang Anda pilih." },
      { title: "3. Data pengguna Google", text: "Data akun Google hanya diakses setelah Anda memberikan izin kepada Zephyx Mail. Data pengguna Google hanya digunakan untuk menyediakan dan meningkatkan fungsi email yang Anda minta." },
      { title: "4. Penyimpanan dan keamanan", text: "Data yang diperlukan untuk menjalankan akun, sinkronisasi, dan fitur email dapat disimpan. Kami menggunakan perlindungan teknis dan organisasi, termasuk autentikasi dua faktor, kode pemulihan, dan kontrol sesi." },
      { title: "5. Berbagi data", text: "Zephyx Mail tidak menjual data pengguna Google kepada pengiklan. Data hanya dibagikan jika diperlukan untuk menjalankan layanan atau mematuhi persyaratan hukum yang berlaku." },
      { title: "6. Retensi dan pilihan Anda", text: "Informasi dapat disimpan selama akun atau layanan terhubung Anda tetap aktif dan selama diperlukan secara wajar untuk menjalankan serta melindungi layanan. Anda dapat memutuskan Gmail, mengelola keamanan dan sesi, atau berhenti menggunakan Zephyx Mail." },
      { title: "7. Penggunaan Terbatas Google API", text: "Penggunaan informasi yang diterima dari Google API oleh Zephyx Mail tunduk pada Kebijakan Data Pengguna Layanan Google API, termasuk persyaratan Penggunaan Terbatas." },
      { title: "8. Perubahan kebijakan", text: "Kebijakan Privasi ini dapat diperbarui seiring perkembangan layanan. Perubahan penting akan ditunjukkan dengan memperbarui tanggal pada halaman ini." },
    ],
  },
} as const;

export default function Privacy() {
  const { locale } = useI18n();
  const copy = copies[locale as keyof typeof copies] ?? copies.en;
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

      <main className="mx-auto max-w-4xl px-5 py-12" dir={rtl ? "rtl" : "ltr"}>
        <h1 className="text-4xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.updated}</p>

        <div className="mt-10 space-y-8 leading-7 text-muted-foreground">
          {copy.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="mt-2">{section.text}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
