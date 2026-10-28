# Spanish review checklist

Every Spanish string in Prayer Tower, beside the English, for a native Spanish speaker to check before release. 1043 items. Generated from the code by `npx tsx scripts/i18n/spanish-review.ts`; regenerate it after strings change, and don't edit the tables by hand.

## How to review

- **Audience:** Latin American Spanish, neutral, using **tú** (not usted or vos). The readers are Christians from many churches, praying for each other.
- **For each line:** tick the box if the Spanish is right. If it isn't, write your wording in the **Correction** column.
- **Check:**
  - The meaning matches the English.
  - The tone is warm and plain.
  - The Christian vocabulary is natural (petición, orar, testimonio, iglesia aliada).
  - Buttons stay short.
- **Placeholders:** leave anything like `%{name}` exactly as it is. The app fills it in.
- **Words used across the app; please confirm them once:**
  - "fichas" for tokens
  - "Sacerdotales" for Priestly (tokens)
  - "Orando ahora" for Praying Now
  - "Prometer orar" for Commit to Pray
  - "Equipo Testigo" for the Witness team
  - "Iglesia aliada" for church partner
- **Corrections:** send them back as this file with the Correction column filled in, or as comments. A developer copies them into `apps/mobile/src/locales/es.ts`.

## Contents

1. App screens (by section)
2. Labels (post types, kinds of prayer, actions…)
3. Phone system text
4. Notifications
5. Website, legal pages and store listing (read as whole pages)

## 1. App screens

### common (8)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `common.back` | ‹ Back | ‹ Atrás | |
| ☐ | `common.praiseGod` | Praise God! | ¡Gloria a Dios! | |
| ☐ | `common.photo` | Photo | Foto | |
| ☐ | `common.playVideo` | Play video | Reproducir video | |
| ☐ | `common.close` | Close | Cerrar | |
| ☐ | `common.loading` | Loading… | Cargando… | |
| ☐ | `common.cancel` | Cancel | Cancelar | |
| ☐ | `common.friend` | friend | amigo | |

### tabs (6)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `tabs.label` | Main sections | Secciones principales | |
| ☐ | `tabs.prayers` | Prayers | Oraciones | |
| ☐ | `tabs.promises` | My Promises | Promesas | |
| ☐ | `tabs.messages` | Messages | Mensajes | |
| ☐ | `tabs.notices` | Notices | Avisos | |
| ☐ | `tabs.me` | Me | Yo | |

### menu (6)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `menu.go` | Go | Ir | |
| ☐ | `menu.newRequest` | New Prayer Request | Nueva petición de oración | |
| ☐ | `menu.back` | Back | Atrás | |
| ☐ | `menu.notificationSettings` | Notification Settings… | Ajustes de notificaciones… | |
| ☐ | `menu.tour` | Prayer Tower Tour | Recorrido por Prayer Tower | |
| ☐ | `menu.feedback` | Send Feedback… | Enviar comentarios… | |

### widget (2)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `widget.heading` | Pray now | Ora ahora | |
| ☐ | `widget.empty` | Open Prayer Tower to see who needs prayer. | Abre Prayer Tower para ver quién necesita oración. | |

### language (2)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `language.heading` | Language | Idioma | |
| ☐ | `language.system` | Phone setting | Según el teléfono | |

### signIn (15)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `signIn.tagline` | Real people praying for you, by name, right now. | Personas reales orando por ti, por tu nombre, ahora mismo. | |
| ☐ | `signIn.name` | Your name | Tu nombre | |
| ☐ | `signIn.email` | Email | Correo electrónico | |
| ☐ | `signIn.password` | Password | Contraseña | |
| ☐ | `signIn.signIn` | Sign in | Iniciar sesión | |
| ☐ | `signIn.createAccount` | Create account | Crear cuenta | |
| ☐ | `signIn.checkEmail` | Check your email to confirm your account, then sign in. | Revisa tu correo para confirmar tu cuenta y luego inicia sesión. | |
| ☐ | `signIn.legalPrefix` | By creating an account you confirm you are 18 or older and agree to the | Al crear una cuenta confirmas que tienes 18 años o más y aceptas los | |
| ☐ | `signIn.toSignUp` | New here? Create an account | ¿Eres nuevo? Crea una cuenta | |
| ☐ | `signIn.toSignIn` | Already have an account? Sign in | ¿Ya tienes cuenta? Inicia sesión | |
| ☐ | `signIn.inviteCode` | Invite code | Código de invitación | |
| ☐ | `signIn.invitePlaceholder` | From the person who invited you | De la persona que te invitó | |
| ☐ | `signIn.inviteHint` | Prayer Tower is invite-only during the pilot. Ask the person who invited you for a code. | Durante el piloto, Prayer Tower es solo por invitación. Pide un código a la persona que te invitó. | |
| ☐ | `signIn.inviteNeeded` | Prayer Tower is invite-only right now. Enter your invite code. | Por ahora Prayer Tower es solo por invitación. Escribe tu código de invitación. | |
| ☐ | `signIn.inviteInvalid` | That invite code is not valid. Check it, or ask for a new one. | Ese código de invitación no es válido. Revísalo o pide uno nuevo. | |

### legal (4)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `legal.terms` | Terms of Use | Términos de uso | |
| ☐ | `legal.privacy` | Privacy Policy | Política de privacidad | |
| ☐ | `legal.and` | and | y la | |
| ☐ | `legal.questions` | Questions or concerns? | ¿Preguntas o inquietudes? | |

### onboarding (22)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `onboarding.welcome` | Welcome | Bienvenido | |
| ☐ | `onboarding.welcomeName` | Welcome, %{name} | Bienvenido, %{name} | |
| ☐ | `onboarding.intro` | A few questions so your prayers and requests fit you. You can change these any time. | Unas preguntas para que tus oraciones y peticiones se ajusten a ti. Puedes cambiarlas cuando quieras. | |
| ☐ | `onboarding.whyHere` | Why are you here? | ¿Por qué estás aquí? | |
| ☐ | `onboarding.supportWanted` | What prayer support would you like? | ¿Qué apoyo en oración te gustaría recibir? | |
| ☐ | `onboarding.supportOffered` | What can you pray for others about? | ¿Por qué temas puedes orar por otros? | |
| ☐ | `onboarding.scope` | Who will you pray for? | ¿Por quiénes orarás? | |
| ☐ | `onboarding.start` | Start praying | Empezar a orar | |
| ☐ | `onboarding.support.Health` | Health | Salud | |
| ☐ | `onboarding.support.Family` | Family | Familia | |
| ☐ | `onboarding.support.Grief` | Grief | Duelo | |
| ☐ | `onboarding.support.Provision` | Provision | Provisión | |
| ☐ | `onboarding.support.Guidance` | Guidance | Dirección | |
| ☐ | `onboarding.support.Addiction` | Addiction | Adicciones | |
| ☐ | `onboarding.support.Faith` | Faith | Fe | |
| ☐ | `onboarding.support.Relationships` | Relationships | Relaciones | |
| ☐ | `onboarding.scopes.family` | My family | Mi familia | |
| ☐ | `onboarding.scopes.friends` | Friends | Amigos | |
| ☐ | `onboarding.scopes.church` | My church | Mi iglesia | |
| ☐ | `onboarding.scopes.community` | My community | Mi comunidad | |
| ☐ | `onboarding.scopes.nation` | My nation | Mi país | |
| ☐ | `onboarding.scopes.world` | The world | El mundo | |

### tour (15)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `tour.progress` | %{n} of %{total} | %{n} de %{total} | |
| ☐ | `tour.skip` | Skip | Omitir | |
| ☐ | `tour.back` | Back | Atrás | |
| ☐ | `tour.next` | Next | Siguiente | |
| ☐ | `tour.start` | Start praying | Empezar a orar | |
| ☐ | `tour.askTitle` | Ask for prayer | Pide oración | |
| ☐ | `tour.askBody` | Tap "Type your prayer here" on the Prayers tab. Share a need, a praise or a testimony in a few words, with your name or anonymously. | Toca "Escribe tu oración aquí" en la pestaña Oraciones. Comparte una necesidad, una alabanza o un testimonio en pocas palabras, con tu nombre o de forma anónima. | |
| ☐ | `tour.prayTitle` | Pray now | Ora ahora | |
| ☐ | `tour.prayBody` | When you pray for someone, tap "Praying Now" on their request. They see that a real person is praying for them right then. Please tap it only when you truly pray. | Cuando ores por alguien, toca "Orando ahora" en su petición. Esa persona verá que alguien real está orando por ella en ese momento. Tócalo solo cuando de verdad ores. | |
| ☐ | `tour.promiseTitle` | Keep a promise to pray | Cumple tu promesa de orar | |
| ☐ | `tour.promiseBody` | "Commit to Pray" lets you promise to pray daily or weekly. Prayer Tower gently reminds you, and your promises live under My Promises. | "Prometer orar" te permite comprometerte a orar cada día o cada semana. Prayer Tower te lo recuerda con amabilidad, y tus promesas están en la pestaña Promesas. | |
| ☐ | `tour.tokensTitle` | Tokens, never money | Fichas, nunca dinero | |
| ☐ | `tour.tokensBody` | Praying for others and keeping your promises earns tokens. Use them to help a request reach more people, or give them to someone. Tokens can never be bought or cashed out. | Orar por otros y cumplir tus promesas te da fichas. Úsalas para que una petición llegue a más personas, o regálaselas a alguien. Las fichas nunca se compran ni se cambian por dinero. | |
| ☐ | `tour.safeTitle` | A safe place | Un lugar seguro | |
| ☐ | `tour.safeBody` | Report anything that breaks the community rules, and block anyone you like. Real moderators read every report. If someone is in crisis, Prayer Tower shows a crisis line right away. | Reporta todo lo que rompa las reglas de la comunidad y bloquea a quien quieras. Moderadores reales leen cada reporte. Si alguien está en crisis, Prayer Tower muestra de inmediato una línea de ayuda. | |

### notifySettings (20)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `notifySettings.title` | Notification settings | Ajustes de notificaciones | |
| ☐ | `notifySettings.intro` | Choose which alerts your phone shows. Everything still appears under Notices. | Elige qué avisos muestra tu teléfono. Todo sigue apareciendo en Avisos. | |
| ☐ | `notifySettings.prayers` | Prayers for you | Oraciones por ti | |
| ☐ | `notifySettings.prayersHint` | When someone prays now, asks you to pray, or a radio prayer goes out | Cuando alguien ora ahora, te pide oración o sale una oración por radio | |
| ☐ | `notifySettings.promises` | Promise reminders | Recordatorios de tus promesas | |
| ☐ | `notifySettings.promisesHint` | Reminders to keep praying for what you promised | Recordatorios para seguir orando por lo que prometiste | |
| ☐ | `notifySettings.encouragement` | Encouragement and thanks | Ánimo y agradecimientos | |
| ☐ | `notifySettings.encouragementHint` | Notes of encouragement, thanks, and your week in prayer | Notas de ánimo, agradecimientos y tu semana en oración | |
| ☐ | `notifySettings.messages` | Messages | Mensajes | |
| ☐ | `notifySettings.messagesHint` | Private messages, meetups and care requests | Mensajes privados, encuentros y solicitudes de cuidado | |
| ☐ | `notifySettings.community` | Groups and events | Grupos y eventos | |
| ☐ | `notifySettings.communityHint` | Invitations, new events and event reminders | Invitaciones, eventos nuevos y recordatorios de eventos | |
| ☐ | `notifySettings.tokens` | Tokens | Fichas | |
| ☐ | `notifySettings.tokensHint` | Tokens earned, milestones and scheduled gifts | Fichas ganadas, logros y regalos programados | |
| ☐ | `notifySettings.safety` | Notices about your posts and appeals are always sent. | Los avisos sobre tus publicaciones y apelaciones siempre se envían. | |
| ☐ | `notifySettings.quiet` | Quiet hours | Horas de silencio | |
| ☐ | `notifySettings.quietHint` | Alerts that arrive during quiet hours wait until they end. | Los avisos que lleguen durante las horas de silencio esperan hasta que terminen. | |
| ☐ | `notifySettings.from` | From | Desde | |
| ☐ | `notifySettings.until` | Until | Hasta | |
| ☐ | `notifySettings.saved` | Saved | Guardado | |

### settings (10)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `settings.digest` | Weekly email | Correo semanal | |
| ☐ | `settings.digestHint` | A Sunday email with prayers answered and how your promises went. | Un correo cada domingo con oraciones respondidas y cómo van tus compromisos. | |
| ☐ | `settings.traumaOptOut` | Hide graphic or trauma-related requests | Ocultar peticiones gráficas o sobre traumas | |
| ☐ | `settings.traumaOptOutHint` | Posts marked sensitive will not appear in your feed. | Las publicaciones marcadas como delicadas no aparecerán en tu feed. | |
| ☐ | `settings.anonymous` | Pray and post anonymously by default | Orar y publicar de forma anónima por defecto | |
| ☐ | `settings.anonymousHint` | Others see “Anonymous.” Your prayers still count toward your tier, privately. | Los demás verán “Anónimo”. Tus oraciones siguen contando para tu nivel, en privado. | |
| ☐ | `settings.prompts` | Occasional prayer reminders | Recordatorios de oración ocasionales | |
| ☐ | `settings.firm` | Firmer reminders | Recordatorios más firmes | |
| ☐ | `settings.firmHint` | For example: "Remember, you made a commitment before God to pray for Billy." | Por ejemplo: "Recuerda que te comprometiste ante Dios a orar por Billy." | |
| ☐ | `settings.updatesFirst` | Show my updates as the first comment | Mostrar mis novedades como primer comentario | |

### profile (34)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `profile.export` | Download my data | Descargar mis datos | |
| ☐ | `profile.exporting` | Preparing your data… | Preparando tus datos… | |
| ☐ | `profile.me` | Me | Yo | |
| ☐ | `profile.tier` | Your tier | Tu nivel | |
| ☐ | `profile.tierPrivate` | Your tier (private) | Tu nivel (privado) | |
| ☐ | `profile.prayers` | Prayers | Oraciones | |
| ☐ | `profile.tokens` | Tokens | Fichas | |
| ☐ | `profile.priestly` | Priestly | Sacerdotales | |
| ☐ | `profile.nextTier` | %{count} more prayers to become a %{tier}. | Te faltan %{count} oraciones para ser %{tier}. | |
| ☐ | `profile.priestlyProgress` | %{done} of %{per} prayers toward your next Priestly token. Priestly tokens keep the prayer infrastructure running; you can give them to others or donate them. | %{done} de %{per} oraciones para tu próxima ficha sacerdotal. Las fichas sacerdotales mantienen funcionando la infraestructura de oración; puedes regalarlas o donarlas. | |
| ☐ | `profile.donatePriestly` | Donate 1 Priestly token | Donar 1 ficha sacerdotal | |
| ☐ | `profile.tokensNote` | Tokens help requests reach more people. A lack of tokens never stops a request from being seen. | Las fichas ayudan a que las peticiones lleguen a más personas. Que falten fichas nunca impide que una petición se vea. | |
| ☐ | `profile.pools` | Token pools | Fondos de fichas | |
| ☐ | `profile.scheduled` | Scheduled gifts | Regalos programados | |
| ☐ | `profile.prayerCast` | Prayer Cast | Prayer Cast | |
| ☐ | `profile.feedStyle` | Feed style | Estilo del feed | |
| ☐ | `profile.beta` | %{name} (beta) | %{name} (beta) | |
| ☐ | `profile.mix` | Pick your prayer mix | Elige tu mezcla de oración | |
| ☐ | `profile.mixHint` | See more or less of each kind of post. Nothing is ever hidden; this only changes the order. | Ve más o menos de cada tipo de publicación. Nunca se oculta nada; solo cambia el orden. | |
| ☐ | `profile.less` | Less | Menos | |
| ☐ | `profile.normal` | Normal | Normal | |
| ☐ | `profile.more` | More | Más | |
| ☐ | `profile.settings` | Settings | Ajustes | |
| ☐ | `profile.rules` | Community rules | Normas de la comunidad | |
| ☐ | `profile.churchApply` | Are you a pastor? Add your church | ¿Eres pastor? Agrega tu iglesia | |
| ☐ | `profile.myChurch` | My church | Mi iglesia | |
| ☐ | `profile.moderation` | Moderation queue | Cola de moderación | |
| ☐ | `profile.macroNeeds` | Macro needs | Grandes necesidades | |
| ☐ | `profile.witness` | Witness team | Equipo de testigos | |
| ☐ | `profile.admin` | Admin | Administración | |
| ☐ | `profile.tour` | How Prayer Tower works | Cómo funciona Prayer Tower | |
| ☐ | `profile.feedback` | Send feedback | Enviar comentarios | |
| ☐ | `profile.signOut` | Sign out | Cerrar sesión | |
| ☐ | `profile.deleteAccount` | Delete my account | Eliminar mi cuenta | |

### compose (23)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `compose.post` | Post | Publicar | |
| ☐ | `compose.greeting` | Welcome, %{name}! Let's talk to the Lord. | ¡Bienvenido, %{name}! Hablemos con el Señor. | |
| ☐ | `compose.placeholder` | Type your prayer here | Escribe tu oración aquí | |
| ☐ | `compose.bodyLabel` | Your prayer | Tu oración | |
| ☐ | `compose.words` | %{count}/%{max} words | %{count}/%{max} palabras | |
| ☐ | `compose.removeAttachment` | Remove this attachment | Quitar este archivo adjunto | |
| ☐ | `compose.video` | Video | Video | |
| ☐ | `compose.remove` | Remove | Quitar | |
| ☐ | `compose.addMedia` | Add photos or video | Agregar fotos o video | |
| ☐ | `compose.background` | Background | Fondo | |
| ☐ | `compose.noBackground` | No background | Sin fondo | |
| ☐ | `compose.backgroundNamed` | %{name} background | Fondo %{name} | |
| ☐ | `compose.kind` | What kind of prayer? | ¿Qué tipo de oración? | |
| ☐ | `compose.realm` | Who is it for? | ¿Por quién es? | |
| ☐ | `compose.urgency` | How urgent is it? | ¿Qué tan urgente es? | |
| ☐ | `compose.urgencies.0` | Whenever you can | Cuando puedas | |
| ☐ | `compose.urgencies.1` | Soon | Pronto | |
| ☐ | `compose.urgencies.2` | Today | Hoy | |
| ☐ | `compose.urgencies.3` | Right now | Ahora mismo | |
| ☐ | `compose.anonymous` | Post anonymously | Publicar de forma anónima | |
| ☐ | `compose.anonymousHint` | Others will see “Anonymous.” | Los demás verán “Anónimo”. | |
| ☐ | `compose.sensitive` | Contains graphic or trauma-related details | Contiene detalles gráficos o sobre traumas | |
| ☐ | `compose.sensitiveHint` | Hidden from people who asked not to see such posts. | Se oculta a quienes pidieron no ver este tipo de publicaciones. | |

### feed (9)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `feed.composer` | Type your prayer here… | Escribe tu oración aquí… | |
| ☐ | `feed.filterAll` | All prayers | Todas las oraciones | |
| ☐ | `feed.filterTestimonies` | Testimonies | Testimonios | |
| ☐ | `feed.testimoniesHint` | Answered prayers, in the words of the people who asked. | Oraciones contestadas, en palabras de quienes las pidieron. | |
| ☐ | `feed.weekLink` | This week’s most prayed requests and prayer warriors › | Las peticiones más oradas y los guerreros de oración de esta semana › | |
| ☐ | `feed.pinned` | Pray for this first | Ora por esto primero | |
| ☐ | `feed.prayed` | I prayed | Ya oré | |
| ☐ | `feed.openRequest` | Open request | Abrir petición | |
| ☐ | `feed.notNow` | Not now | Ahora no | |

### actions (58)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `actions.queued` | Thank you. You're offline, so this will be sent as soon as you're back online. | Gracias. No tienes conexión, así que se enviará en cuanto vuelvas a estar en línea. | |
| ☐ | `actions.alreadyCommitted` | You are already praying %{frequency} for this request. | Ya estás orando %{frequency} por esta petición. | |
| ☐ | `actions.promiseYou` | I will pray for you. | Oraré por ti. | |
| ☐ | `actions.promiseName` | I will pray for %{name}. | Oraré por %{name}. | |
| ☐ | `actions.integrity` | Tapping means you are bringing this request before the Lord right now. | Tocar significa que estás presentando esta petición ante el Señor ahora mismo. | |
| ☐ | `actions.prayingNow` | I'm praying now | Estoy orando ahora | |
| ☐ | `actions.prayingDone` | Thank you. They will know someone is praying for them right now. | Gracias. Sabrá que alguien está orando por su petición ahora mismo. | |
| ☐ | `actions.commitTitle` | Commit to Regular Prayer | Comprometerse a orar con regularidad | |
| ☐ | `actions.promise` | Your promise | Tu promesa | |
| ☐ | `actions.howOften` | How often | Con qué frecuencia | |
| ☐ | `actions.days` | For how many days | Durante cuántos días | |
| ☐ | `actions.commit` | Make this commitment | Hacer este compromiso | |
| ☐ | `actions.commitDone` | Your commitment is saved. We will remind you when it is time to pray. | Tu compromiso quedó guardado. Te recordaremos cuando sea hora de orar. | |
| ☐ | `actions.encourageTitle` | Send Encouragement | Enviar ánimo | |
| ☐ | `actions.encouragePlaceholder` | A few words of hope | Unas palabras de esperanza | |
| ☐ | `actions.encourageDone` | Your encouragement was sent. | Se envió tu mensaje de ánimo. | |
| ☐ | `actions.send` | Send | Enviar | |
| ☐ | `actions.shareTitle` | Share to your feed | Compartir en tu feed | |
| ☐ | `actions.shareIntro` | Add a one-line intro (optional) | Agrega una introducción de una línea (opcional) | |
| ☐ | `actions.shareDone` | Shared. Thank you for spreading the word. | Compartido. Gracias por correr la voz. | |
| ☐ | `actions.askTitle` | Ask people to pray | Pedir a otros que oren | |
| ☐ | `actions.followToAsk` | Follow people to ask them to pray for requests. | Sigue a otras personas para poder pedirles que oren por peticiones. | |
| ☐ | `actions.askCount` | Ask %{count} to pray | Pedir a %{count} que oren | |
| ☐ | `actions.choosePeople` | Choose people to ask | Elige a quién pedírselo | |
| ☐ | `actions.alreadyAsked` | You have already asked them to pray for this. | Ya les pediste que oren por esto. | |
| ☐ | `actions.askDone` | Sent. They will see that you asked them to pray. | Enviado. Verán que les pediste que oren. | |
| ☐ | `actions.shareOutside` | Share outside Prayer Tower | Compartir fuera de Prayer Tower | |
| ☐ | `actions.shareMessage` | Please pray: “%{preview}” %{url} | Por favor, ora: “%{preview}” %{url} | |
| ☐ | `actions.giftNote` | Tokens help more people see this request. No one is ever hidden for lacking tokens. | Las fichas ayudan a que más personas vean esta petición. Nadie queda oculto por no tener fichas. | |
| ☐ | `actions.howMany` | How many tokens | Cuántas fichas | |
| ☐ | `actions.when` | When | Cuándo | |
| ☐ | `actions.now` | Now | Ahora | |
| ☐ | `actions.whenOptions.fri` | Friday 7 pm | Viernes 7 p. m. | |
| ☐ | `actions.whenOptions.sat` | Saturday 9 am | Sábado 9 a. m. | |
| ☐ | `actions.whenOptions.sun` | Sunday 9 am | Domingo 9 a. m. | |
| ☐ | `actions.pickTime` | Pick a time | Elegir una hora | |
| ☐ | `actions.timeFormat` | YYYY-MM-DD HH:MM, e.g. game start | AAAA-MM-DD HH:MM, p. ej., inicio del partido | |
| ☐ | `actions.once` | Once | Una vez | |
| ☐ | `actions.weeklyFor` | Weekly for %{count} weeks | Cada semana durante %{count} semanas | |
| ☐ | `actions.give` | Give tokens | Dar fichas | |
| ☐ | `actions.giveDone` | Thank you. More people will see this request. | Gracias. Más personas verán esta petición. | |
| ☐ | `actions.schedule` | Schedule gift | Programar regalo | |
| ☐ | `actions.scheduledOnce` | Scheduled. %{count} tokens will go to this request on %{when}. Tokens are taken then; see Scheduled gifts in your profile. | Programado. %{count} fichas irán a esta petición el %{when}. Las fichas se descuentan en ese momento; consulta Regalos programados en tu perfil. | |
| ☐ | `actions.scheduledRepeat` | Scheduled. %{count} tokens will go to this request on %{when}, then weekly for %{weeks} weeks in all. Tokens are taken then; see Scheduled gifts in your profile. | Programado. %{count} fichas irán a esta petición el %{when} y luego cada semana, %{weeks} semanas en total. Las fichas se descuentan en ese momento; consulta Regalos programados en tu perfil. | |
| ☐ | `actions.orPool` | Or use a donated pool | O usa un fondo donado | |
| ☐ | `actions.poolGive` | %{name}: give %{count} tokens | %{name}: dar %{count} fichas | |
| ☐ | `actions.poolDone` | Thank you. %{count} tokens from “%{name}” will help more people see this request. | Gracias. %{count} fichas de “%{name}” ayudarán a que más personas vean esta petición. | |
| ☐ | `actions.reportPost` | Report this request | Denunciar esta petición | |
| ☐ | `actions.reportComment` | Report this comment | Denunciar este comentario | |
| ☐ | `actions.reportNote` | A moderator will look at it. The person is not told who reported it. | Un moderador lo revisará. No se le dice a la persona quién lo denunció. | |
| ☐ | `actions.reasons.0` | Harmful or abusive | Dañino o abusivo | |
| ☐ | `actions.reasons.1` | Spam or selling | Spam o ventas | |
| ☐ | `actions.reasons.2` | Not a prayer or praise | No es una oración ni alabanza | |
| ☐ | `actions.reasons.3` | Someone may be in danger | Alguien podría estar en peligro | |
| ☐ | `actions.reasons.4` | Something else | Otra cosa | |
| ☐ | `actions.reportDetails` | Anything the moderator should know (optional) | Algo que el moderador deba saber (opcional) | |
| ☐ | `actions.sendReport` | Send report | Enviar denuncia | |
| ☐ | `actions.reportDone` | Thank you. A moderator will review this. | Gracias. Un moderador lo revisará. | |

### post (46)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `post.delete` | Delete this request | Eliminar esta petición | |
| ☐ | `post.deleteConfirm` | Tap again to delete this request for good | Toca de nuevo para eliminar esta petición definitivamente | |
| ☐ | `post.writePrivately` | Write to them privately | Escribirle en privado | |
| ☐ | `post.privateNote` | Only they will see it. They can reply, say no thanks, or block. | Solo esa persona lo verá. Puede responder, decir no gracias o bloquear. | |
| ☐ | `post.notePlaceholder` | I prayed for you today… | Hoy oré por ti… | |
| ☐ | `post.sendAnonymously` | Send anonymously | Enviar de forma anónima | |
| ☐ | `post.markAnswered` | Mark this prayer answered | Marcar esta oración como contestada | |
| ☐ | `post.testimonyOptional` | How did God answer? Share a testimony (optional) | ¿Cómo respondió Dios? Comparte un testimonio (opcional) | |
| ☐ | `post.testimonyLabel` | Your testimony | Tu testimonio | |
| ☐ | `post.testimonyPlaceholder` | Tell the people who prayed what happened. | Cuéntales a quienes oraron lo que pasó. | |
| ☐ | `post.testimonySave` | Share testimony | Compartir testimonio | |
| ☐ | `post.testimonyShare` | Share a testimony | Compartir un testimonio | |
| ☐ | `post.testimonyEdit` | Edit testimony | Editar testimonio | |
| ☐ | `post.testimonyRemove` | Remove testimony | Quitar testimonio | |
| ☐ | `post.radioSent` | Sent. This request is going out as a radio prayer. | Enviado. Esta petición saldrá como oración por radio. | |
| ☐ | `post.radio` | Send as a radio prayer | Enviar como oración por radio | |
| ☐ | `post.radioCost.one` | Send as a radio prayer (1 Priestly token) | Enviar como oración por radio (1 ficha sacerdotal) | |
| ☐ | `post.radioCost.other` | Send as a radio prayer (%{count} Priestly tokens) | Enviar como oración por radio (%{count} fichas sacerdotales) | |
| ☐ | `post.amplify` | Amplify: send it out by radio %{count} times (free) | Amplificar: enviarla por radio %{count} veces (gratis) | |
| ☐ | `post.powerNone` | Thank you. Everyone we could ask has already been asked or has prayed; your tokens still extend its reach. | Gracias. A todas las personas que podíamos pedírselo ya se les pidió o ya oraron; tus fichas igual amplían su alcance. | |
| ☐ | `post.powerSentYou.one` | Thank you. We asked 1 person who doesn't know you yet to pray. | Gracias. Le pedimos a 1 persona que aún no te conoce que ore. | |
| ☐ | `post.powerSentYou.other` | Thank you. We asked %{count} people who don't know you yet to pray. | Gracias. Les pedimos a %{count} personas que aún no te conocen que oren. | |
| ☐ | `post.powerSentThem.one` | Thank you. We asked 1 person who doesn't know them yet to pray. | Gracias. Le pedimos a 1 persona que aún no conoce a quien publicó que ore. | |
| ☐ | `post.powerSentThem.other` | Thank you. We asked %{count} people who don't know them yet to pray. | Gracias. Les pedimos a %{count} personas que aún no conocen a quien publicó que oren. | |
| ☐ | `post.powerBlocked` | Power Prayer: %{reason} | Oración poderosa: %{reason} | |
| ☐ | `post.powerFree` | Power Prayer: ask %{count} more people to pray (free this week) | Oración poderosa: pedir a %{count} personas más que oren (gratis esta semana) | |
| ☐ | `post.powerCost` | Power Prayer: ask %{count} more people to pray (%{cost} tokens) | Oración poderosa: pedir a %{count} personas más que oren (%{cost} fichas) | |
| ☐ | `post.prayed.zero` | No one has prayed yet | Nadie ha orado todavía | |
| ☐ | `post.prayed.one` | 1 person has prayed | 1 persona ha orado | |
| ☐ | `post.prayed.other` | %{count} people have prayed | %{count} personas han orado | |
| ☐ | `post.thanked.one` | Your thanks went to 1 person. | Tu agradecimiento llegó a 1 persona. | |
| ☐ | `post.thanked.other` | Your thanks went to %{count} people. | Tu agradecimiento llegó a %{count} personas. | |
| ☐ | `post.thanksPlaceholder` | A short thank-you (optional) | Un breve agradecimiento (opcional) | |
| ☐ | `post.thankEveryone` | Thank everyone who prayed | Agradecer a todos los que oraron | |
| ☐ | `post.comments` | Comments | Comentarios | |
| ☐ | `post.noComments` | No comments yet. | Aún no hay comentarios. | |
| ☐ | `post.reply` | Reply | Responder | |
| ☐ | `post.shareComment` | “%{body}” (%{name}, on a Prayer Tower request) %{url} | “%{body}” (%{name}, en una petición de Prayer Tower) %{url} | |
| ☐ | `post.share` | Share | Compartir | |
| ☐ | `post.report` | Report | Denunciar | |
| ☐ | `post.tapAgain` | Tap again to delete | Toca de nuevo para eliminar | |
| ☐ | `post.deleteShort` | Delete | Eliminar | |
| ☐ | `post.replyingTo` | Replying to %{name} (tap to cancel) | Respondiendo a %{name} (toca para cancelar) | |
| ☐ | `post.commentPlaceholder` | Write a comment | Escribe un comentario | |
| ☐ | `post.comment` | Comment | Comentar | |
| ☐ | `post.postUpdate` | Post as an update | Publicar como novedad | |

### promises (16)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `promises.week` | Your week in prayer | Tu semana en oración | |
| ☐ | `promises.empty` | When you commit to pray for someone, your promise appears here. | Cuando te comprometas a orar por alguien, tu promesa aparecerá aquí. | |
| ☐ | `promises.progress` | Prayed %{done} of %{total} reminders | Oraste en %{done} de %{total} recordatorios | |
| ☐ | `promises.next` | next %{when} | próximo: %{when} | |
| ☐ | `promises.times` | Times I prayed: %{count} | Veces que oré: %{count} | |
| ☐ | `promises.recordNote` | This record helps us measure whether we are helping. We do not judge. | Este registro nos ayuda a medir si estamos ayudando. No juzgamos. | |
| ☐ | `promises.save` | Save | Guardar | |
| ☐ | `promises.complete` | Mark complete | Marcar como cumplida | |
| ☐ | `promises.end` | End this promise | Terminar esta promesa | |
| ☐ | `promises.snooze` | Snooze 1 hour | Posponer 1 hora | |
| ☐ | `promises.edit` | Edit | Editar | |
| ☐ | `promises.past` | Past promises | Promesas anteriores | |
| ☐ | `promises.completed` | Completed | Cumplida | |
| ☐ | `promises.ended` | Ended | Terminada | |
| ☐ | `promises.prayedTimes.one` | prayed once | oraste una vez | |
| ☐ | `promises.prayedTimes.other` | prayed %{count} times | oraste %{count} veces | |

### notices (2)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `notices.empty` | When someone prays for you, you will see it here. | Cuando alguien ore por ti, lo verás aquí. | |
| ☐ | `notices.appeal` | Appeal this decision | Apelar esta decisión | |

### messages (11)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `messages.kinds.prayer` | Prayer note | Nota de oración | |
| ☐ | `messages.kinds.direct` | Message | Mensaje | |
| ☐ | `messages.kinds.group` | Group | Grupo | |
| ☐ | `messages.kinds.care` | Prayer partner | Compañero de oración | |
| ☐ | `messages.privacy` | Private notes stay between you, but a message can be reviewed by a moderator if someone reports it. | Las notas privadas quedan entre ustedes, pero un moderador puede revisar un mensaje si alguien lo denuncia. | |
| ☐ | `messages.groups` | Prayer groups | Grupos de oración | |
| ☐ | `messages.events` | Meetings & events | Reuniones y eventos | |
| ☐ | `messages.care` | Pray with someone now | Orar con alguien ahora | |
| ☐ | `messages.requests` | Requests and invites | Solicitudes e invitaciones | |
| ☐ | `messages.conversations` | Conversations | Conversaciones | |
| ☐ | `messages.empty` | After you pray for someone, you can send them a private note from their request. You can also message people who follow you back, or join a prayer group. | Después de orar por alguien, puedes enviarle una nota privada desde su petición. También puedes escribir a quienes te siguen mutuamente o unirte a un grupo de oración. | |

### rulesWarning (2)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `rulesWarning.text` | This may go against our community rules: pray for good, never for harm, and no harassment. It may be hidden or removed. Would you like to edit it? | Esto podría ir en contra de nuestras normas: ora por el bien, nunca por el mal, y sin acoso. Podría ocultarse o eliminarse. ¿Quieres editarlo? | |
| ☐ | `rulesWarning.postAnyway` | Post anyway | Publicar de todos modos | |

### rulesPage (20)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `rulesPage.items.0.title` | We do not judge | No juzgamos | |
| ☐ | `rulesPage.items.0.body` | Bring any need, in any state. Desperate prayers, small prayers and prayers you are not sure how to say are all welcome here. | Trae cualquier necesidad, en cualquier estado. Las oraciones desesperadas, las pequeñas y las que no sabes cómo decir son bienvenidas aquí. | |
| ☐ | `rulesPage.items.1.title` | Pray for good, never for harm | Ora por el bien, nunca por el mal | |
| ☐ | `rulesPage.items.1.body` | “Keep my son safe” and “Let this war end” are prayers. Prayers that call for harm to anyone, such as “I pray we kill them all,” are forbidden and will be removed. | “Protege a mi hijo” y “Que termine esta guerra” son oraciones. Las oraciones que piden daño para alguien, como “Oro para que los matemos a todos”, están prohibidas y se eliminarán. | |
| ☐ | `rulesPage.items.2.title` | No flooding for a side | No inundar a favor de un bando | |
| ☐ | `rulesPage.items.2.body` | Tokens can help a request reach more people, but no one may flood the feed to push one side of a conflict. Coordinated pile-ons are removed. | Las fichas pueden ayudar a que una petición llegue a más personas, pero nadie puede inundar el feed para impulsar un lado de un conflicto. Los ataques coordinados se eliminan. | |
| ☐ | `rulesPage.items.3.title` | No harassment or abuse | Sin acoso ni abuso | |
| ☐ | `rulesPage.items.3.body` | Disagree in love. Insults, threats, mockery and pile-ons against anyone, in requests, comments or encouragements, are removed. | Discrepa con amor. Los insultos, amenazas, burlas y ataques en grupo contra cualquier persona, en peticiones, comentarios o mensajes de ánimo, se eliminan. | |
| ☐ | `rulesPage.items.4.title` | No details of suicide or self-harm methods | Sin detalles de métodos de suicidio o autolesión | |
| ☐ | `rulesPage.items.4.body` | If you are struggling, please post: you will see a crisis line you can reach any time, and people will pray with you. Details of methods are removed to keep others safe, and you are welcome to post again without them. | Si estás pasando por un momento difícil, publica: verás una línea de crisis a la que puedes llamar en cualquier momento, y otras personas orarán contigo. Los detalles de métodos se eliminan para proteger a otros, y puedes volver a publicar sin ellos. | |
| ☐ | `rulesPage.items.5.title` | No ads | Sin anuncios | |
| ☐ | `rulesPage.items.5.body` | Prayer Tower has no ads. A prayer request used to sell something or promote a business is an ad, and is penalized. | Prayer Tower no tiene anuncios. Una petición de oración usada para vender algo o promocionar un negocio es un anuncio y se sanciona. | |
| ☐ | `rulesPage.items.6.title` | Anonymous is always allowed | El anonimato siempre está permitido | |
| ☐ | `rulesPage.items.6.body` | You can post and pray anonymously. Others see “Anonymous”; your prayers still count toward your own record. | Puedes publicar y orar de forma anónima. Los demás verán “Anónimo”; tus oraciones siguen contando para tu propio registro. | |
| ☐ | `rulesPage.items.7.title` | Tokens | Fichas | |
| ☐ | `rulesPage.items.7.body` | Tokens pay for the infrastructure and extend a request’s reach. They never cash out, and a lack of tokens never stops a request from being seen. | Las fichas pagan la infraestructura y amplían el alcance de una petición. Nunca se cambian por dinero, y que falten fichas nunca impide que una petición se vea. | |
| ☐ | `rulesPage.items.8.title` | How moderation works | Cómo funciona la moderación | |
| ☐ | `rulesPage.items.8.body` | Anyone can report a request or comment. Automated checks only flag content; they hide it right away only in the most severe cases, until a person reviews it. A human moderator decides every penalty: removing the post, forfeiting tokens, suspension or reversing token transfers. Every decision is logged, you are told which rule applied, and you can appeal once from your notices. | Cualquiera puede denunciar una petición o un comentario. Las revisiones automáticas solo marcan contenido; lo ocultan de inmediato solo en los casos más graves, hasta que una persona lo revise. Un moderador humano decide cada sanción: quitar la publicación, perder fichas, suspensión o revertir transferencias de fichas. Cada decisión queda registrada, se te dice qué norma se aplicó y puedes apelar una vez desde tus avisos. | |
| ☐ | `rulesPage.howTo` | To report something, tap Report on the request, comment, message or event. To stop someone reaching you, open their profile and tap Block. | Para denunciar algo, toca Denunciar en la petición, comentario, mensaje o evento. Para que alguien deje de contactarte, abre su perfil y toca Bloquear. | |
| ☐ | `rulesPage.partOf` | These rules are part of our | Estas normas forman parte de nuestros | |

### deleteAccount (4)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `deleteAccount.intro` | This happens right away and can't be undone. We delete: | Esto ocurre de inmediato y no se puede deshacer. Eliminamos: | |
| ☐ | `deleteAccount.list` | • your sign-in and profile<br>• your requests, comments, encouragements and photos<br>• your messages, promises, events and prayer history<br>• your tokens | • tu inicio de sesión y tu perfil<br>• tus peticiones, comentarios, mensajes de ánimo y fotos<br>• tus mensajes, promesas, eventos e historial de oración<br>• tus fichas | |
| ☐ | `deleteAccount.keep` | We keep only what we must: the token ledger and moderators' past decisions, under "Deleted member" with no name or email. A request that already holds tokens others gave is emptied and taken down rather than erased. | Solo conservamos lo necesario: el registro de fichas y las decisiones anteriores de los moderadores, bajo "Miembro eliminado", sin nombre ni correo. Una petición que ya tiene fichas que otros dieron se vacía y se retira en lugar de borrarse. | |
| ☐ | `deleteAccount.confirm` | Type DELETE to confirm | Escribe DELETE para confirmar | |

### feedback (8)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `feedback.intro` | Tell us what broke, what confused you, or what you wish Prayer Tower did. The pilot team reads every note. | Cuéntanos qué falló, qué te confundió o qué te gustaría que hiciera Prayer Tower. El equipo del piloto lee cada nota. | |
| ☐ | `feedback.kinds.bug` | Something broke | Algo falló | |
| ☐ | `feedback.kinds.idea` | An idea | Una idea | |
| ☐ | `feedback.kinds.other` | Something else | Otra cosa | |
| ☐ | `feedback.label` | Your feedback | Tus comentarios | |
| ☐ | `feedback.bugPlaceholder` | What happened, and what did you expect? | ¿Qué pasó y qué esperabas? | |
| ☐ | `feedback.placeholder` | Tell us more | Cuéntanos más | |
| ☐ | `feedback.sent` | Thank you! Your feedback was sent. | ¡Gracias! Se enviaron tus comentarios. | |

### person (8)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `person.following` | Following | Siguiendo | |
| ☐ | `person.follow` | Follow | Seguir | |
| ☐ | `person.writeTo` | Write to %{name} | Escribir a %{name} | |
| ☐ | `person.message` | Message | Mensaje | |
| ☐ | `person.unblock` | Unblock %{name} | Desbloquear a %{name} | |
| ☐ | `person.block` | Block %{name} | Bloquear a %{name} | |
| ☐ | `person.blockedNote` | You won't see their requests, comments or messages, and they can't message you. | No verás sus peticiones, comentarios ni mensajes, y no podrá escribirte. | |
| ☐ | `person.noPosts` | %{name} has not posted under their name yet. | %{name} aún no ha publicado con su nombre. | |

### appeal (6)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `appeal.title` | Appeal | Apelación | |
| ☐ | `appeal.sent` | Thank you. A moderator will look at this again and you will get a notice with the outcome. | Gracias. Un moderador lo revisará de nuevo y recibirás un aviso con el resultado. | |
| ☐ | `appeal.intro` | Tell us why you think this decision was wrong. A moderator will look at it again. | Cuéntanos por qué crees que esta decisión fue un error. Un moderador lo revisará de nuevo. | |
| ☐ | `appeal.reason` | Your reason | Tu motivo | |
| ☐ | `appeal.send` | Send appeal | Enviar apelación | |
| ☐ | `appeal.rules` | Read the community rules | Leer las normas de la comunidad | |

### highlights (6)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `highlights.mostPrayed` | Most prayed this week | Las más oradas esta semana | |
| ☐ | `highlights.none` | No prayers yet this week. | Aún no hay oraciones esta semana. | |
| ☐ | `highlights.warriors` | Top prayer warriors | Principales guerreros de oración | |
| ☐ | `highlights.beFirst` | Be the first to pray this week. | Sé el primero en orar esta semana. | |
| ☐ | `highlights.window` | Prayers for others in the last %{count} days. | Oraciones por otros en los últimos %{count} días. | |
| ☐ | `highlights.thisWeek` | This week | Esta semana | |

### conversation (21)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `conversation.about` | About the request | Sobre la petición | |
| ☐ | `conversation.invited` | You were invited to this group. Join to pray and talk together. | Te invitaron a este grupo. Únete para orar y conversar juntos. | |
| ☐ | `conversation.wantsToTalk` | %{name} would like to talk with you. They can't send more until you reply. | %{name} quisiera hablar contigo. No podrá enviar más mensajes hasta que respondas. | |
| ☐ | `conversation.join` | Join | Unirme | |
| ☐ | `conversation.accept` | Accept | Aceptar | |
| ☐ | `conversation.noThanks` | No thanks | No, gracias | |
| ☐ | `conversation.block` | Block | Bloquear | |
| ☐ | `conversation.reported` | Reported | Denunciado | |
| ☐ | `conversation.reportTitle` | Report this message | Denunciar este mensaje | |
| ☐ | `conversation.reportNote` | A moderator will read this message and decide. The sender isn't told who reported it. | Un moderador leerá este mensaje y decidirá. No se le dice a quien lo envió quién lo denunció. | |
| ☐ | `conversation.whatsWrong` | What's wrong with it? | ¿Qué tiene de malo? | |
| ☐ | `conversation.waiting` | Your message is waiting for them. You can write again once they reply. | Tu mensaje está esperando respuesta. Podrás escribir de nuevo cuando te respondan. | |
| ☐ | `conversation.writeGroup` | Write to the group | Escribir al grupo | |
| ☐ | `conversation.write` | Write a message | Escribe un mensaje | |
| ☐ | `conversation.invite` | Invite people | Invitar personas | |
| ☐ | `conversation.leave` | Leave group | Salir del grupo | |
| ☐ | `conversation.close` | Close conversation | Cerrar conversación | |
| ☐ | `conversation.inviteTitle` | Invite people you know | Invita a personas que conoces | |
| ☐ | `conversation.followToInvite` | Follow people to invite them here. | Sigue a otras personas para invitarlas aquí. | |
| ☐ | `conversation.member` | Member | Miembro | |
| ☐ | `conversation.sendInvites` | Send invites | Enviar invitaciones | |

### groups (15)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `groups.intro` | Pray and talk together about a need, a place, or a topic. | Oren y conversen juntos sobre una necesidad, un lugar o un tema. | |
| ☐ | `groups.name` | Group name | Nombre del grupo | |
| ☐ | `groups.namePlaceholder` | Morning prayer circle | Círculo de oración matutina | |
| ☐ | `groups.topic` | What it's for (optional) | Para qué es (opcional) | |
| ☐ | `groups.topicPlaceholder` | We pray together at 7am | Oramos juntos a las 7 a. m. | |
| ☐ | `groups.public` | Open to everyone | Abierto a todos | |
| ☐ | `groups.publicHint` | Anyone can find and join it. | Cualquiera puede encontrarlo y unirse. | |
| ☐ | `groups.privateHint` | Only people you invite can join. | Solo pueden unirse las personas que invites. | |
| ☐ | `groups.create` | Start the group | Crear el grupo | |
| ☐ | `groups.start` | Start a group | Crear un grupo | |
| ☐ | `groups.empty` | No open groups yet. Start the first one. | Aún no hay grupos abiertos. Crea el primero. | |
| ☐ | `groups.members.one` | 1 member | 1 miembro | |
| ☐ | `groups.members.other` | %{count} members | %{count} miembros | |
| ☐ | `groups.joined` | you are in this group | estás en este grupo | |
| ☐ | `groups.tapToJoin` | tap to join | toca para unirte | |

### events (36)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `events.dateError` | Enter a future date and time like 2026-11-06 19:30 | Escribe una fecha y hora futuras, como 2026-11-06 19:30 | |
| ☐ | `events.groupTitle` | Group events | Eventos del grupo | |
| ☐ | `events.intro` | Pray together on a video call or meet in person. | Oren juntos en una videollamada o en persona. | |
| ☐ | `events.title` | Title | Título | |
| ☐ | `events.titlePlaceholder` | Wednesday night prayer | Oración del miércoles por la noche | |
| ☐ | `events.about` | What it's about (optional) | De qué se trata (opcional) | |
| ☐ | `events.otherTime` | Other time | Otra hora | |
| ☐ | `events.minutes` | Minutes | Minutos | |
| ☐ | `events.video` | Video meeting link (Zoom, Google Meet, Teams…) | Enlace de videollamada (Zoom, Google Meet, Teams…) | |
| ☐ | `events.place` | Or a place | O un lugar | |
| ☐ | `events.placePlaceholder` | Grace Church, 12 Main St | Iglesia Gracia, Calle Principal 12 | |
| ☐ | `events.safety` | Meet in a public place, and tell someone where you're going. | Reúnete en un lugar público y avisa a alguien adónde vas. | |
| ☐ | `events.host` | Host this event | Organizar este evento | |
| ☐ | `events.hostAn` | Host an event | Organizar un evento | |
| ☐ | `events.empty` | No upcoming events yet. Host the first one. | Aún no hay eventos próximos. Organiza el primero. | |
| ☐ | `events.happening` | Happening now | En curso | |
| ☐ | `events.minutesShort` | %{count} min | %{count} min | |
| ☐ | `events.forGroup` | For the group %{name} | Para el grupo %{name} | |
| ☐ | `events.hostedYou` | Hosted by you · %{count} going | Organizado por ti · %{count} asistirán | |
| ☐ | `events.hostedBy` | Hosted by %{name} · %{count} going | Organizado por %{name} · %{count} asistirán | |
| ☐ | `events.youreGoing` | you're going | asistirás | |
| ☐ | `events.youreMaybe` | you're a maybe | quizás asistas | |
| ☐ | `events.videoMeeting` | Video meeting | Videollamada | |
| ☐ | `events.groupLabel` | Group: %{name} | Grupo: %{name} | |
| ☐ | `events.cancelled` | This event was cancelled. | Este evento se canceló. | |
| ☐ | `events.joinNow` | Join the video meeting now | Unirse a la videollamada ahora | |
| ☐ | `events.openLink` | Open the video meeting link | Abrir el enlace de la videollamada | |
| ☐ | `events.rsvpForLink` | Say you're coming to see the video meeting link. | Confirma tu asistencia para ver el enlace de la videollamada. | |
| ☐ | `events.going` | I'm going | Asistiré | |
| ☐ | `events.goingOn` | ✓ I'm going | ✓ Asistiré | |
| ☐ | `events.maybe` | Maybe | Quizás | |
| ☐ | `events.cantMake` | Can't make it | No podré | |
| ☐ | `events.reminder` | We'll remind you shortly before it starts. | Te recordaremos poco antes de que empiece. | |
| ☐ | `events.cancel` | Cancel this event | Cancelar este evento | |
| ☐ | `events.report` | Report this event | Denunciar este evento | |
| ☐ | `events.reportDone` | Thank you. A moderator will look at it. | Gracias. Un moderador lo revisará. | |

### care (17)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `care.status.open` | Waiting for a prayer partner | Esperando a un compañero de oración | |
| ☐ | `care.status.claimed` | Someone is with you | Alguien está contigo | |
| ☐ | `care.status.closed` | Closed | Cerrada | |
| ☐ | `care.title` | Pray with someone | Orar con alguien | |
| ☐ | `care.intro` | Ask, and one of our prayer partners or pastors will reach out to you privately to pray with you. | Pídelo, y uno de nuestros compañeros de oración o pastores se comunicará contigo en privado para orar contigo. | |
| ☐ | `care.unavailable` | Prayer partners aren't available right now. Please try again later. | Los compañeros de oración no están disponibles ahora. Inténtalo más tarde. | |
| ☐ | `care.sentTitle` | Your request is in | Recibimos tu solicitud | |
| ☐ | `care.sent` | A prayer partner will message you. You'll get a notice when they do. | Un compañero de oración te escribirá. Recibirás un aviso cuando lo haga. | |
| ☐ | `care.askElse` | Ask for something else | Pedir otra cosa | |
| ☐ | `care.placeholder` | What would you like prayer for? | ¿Por qué te gustaría que oremos? | |
| ☐ | `care.ask` | Ask for a prayer partner | Pedir un compañero de oración | |
| ☐ | `care.yours` | Your requests | Tus solicitudes | |
| ☐ | `care.open` | Open conversation | Abrir conversación | |
| ☐ | `care.queue` | Care queue | Cola de cuidado | |
| ☐ | `care.noneWaiting` | No one is waiting right now. | Nadie está esperando ahora. | |
| ☐ | `care.danger` | May be in danger ·  | Podría estar en peligro ·  | |
| ☐ | `care.reachOut` | Reach out | Comunicarme | |

### pools (22)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `pools.intro` | Put tokens in a pool, and other members can use them to help requests reach more people. Pools carry no links or ads, and you stay anonymous unless you choose to be named. | Pon fichas en un fondo y otros miembros podrán usarlas para que las peticiones lleguen a más personas. Los fondos no llevan enlaces ni anuncios, y sigues en el anonimato salvo que elijas mostrar tu nombre. | |
| ☐ | `pools.start` | Start a pool | Crear un fondo | |
| ☐ | `pools.youHave` | You have %{count} tokens. | Tienes %{count} fichas. | |
| ☐ | `pools.name` | Name | Nombre | |
| ☐ | `pools.namePlaceholder` | e.g. For families in need | p. ej., Para familias necesitadas | |
| ☐ | `pools.purpose` | Purpose (optional) | Propósito (opcional) | |
| ☐ | `pools.onlyFor` | Only for (optional) | Solo para (opcional) | |
| ☐ | `pools.amount` | Tokens to put in | Fichas que aportas | |
| ☐ | `pools.drawAmount` | Tokens each use gives a request | Fichas que recibe una petición en cada uso | |
| ☐ | `pools.showName` | Show my name on this pool | Mostrar mi nombre en este fondo | |
| ☐ | `pools.create` | Start pool | Crear fondo | |
| ☐ | `pools.yours` | Your pools | Tus fondos | |
| ☐ | `pools.noneMine` | You haven't started a pool. | Aún no has creado un fondo. | |
| ☐ | `pools.left` | %{count} tokens left · %{per} per use | Quedan %{count} fichas · %{per} por uso | |
| ☐ | `pools.only` | %{realm} only | solo %{realm} | |
| ☐ | `pools.addTokens` | Add tokens | Agregar fichas | |
| ☐ | `pools.add` | Add | Agregar | |
| ☐ | `pools.close` | Close and take back what's left | Cerrar y recuperar lo que queda | |
| ☐ | `pools.open` | Open pools | Fondos abiertos | |
| ☐ | `pools.noneOpen` | No other pools yet. | Aún no hay otros fondos. | |
| ☐ | `pools.from` | From %{name} | De %{name} | |
| ☐ | `pools.howToUse` | Use it from Gift Tokens on any request. | Úsalo desde Regalar fichas en cualquier petición. | |

### scheduled (8)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `scheduled.intro` | Tokens you set to go to a request later. They are taken when the time comes. Schedule one from Gift Tokens on any request. | Fichas que programaste para una petición más adelante. Se descuentan cuando llega el momento. Programa uno desde Regalar fichas en cualquier petición. | |
| ☐ | `scheduled.empty` | Nothing scheduled. | No hay nada programado. | |
| ☐ | `scheduled.status.active` | Scheduled | Programado | |
| ☐ | `scheduled.status.done` | Done | Hecho | |
| ☐ | `scheduled.status.cancelled` | Cancelled | Cancelado | |
| ☐ | `scheduled.status.failed` | Did not go out | No se envió | |
| ☐ | `scheduled.tokens` | %{count} tokens | %{count} fichas | |
| ☐ | `scheduled.weeks` | %{done} of %{total} weeks | %{done} de %{total} semanas | |

### cast (6)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `cast.intro` | Prayers that went out by radio. Only the words of the request are sent, never a name. Send one from any request with “Send as a radio prayer”. | Oraciones que salieron por radio. Solo se envían las palabras de la petición, nunca un nombre. Envía una desde cualquier petición con “Enviar como oración por radio”. | |
| ☐ | `cast.sent` | prayers sent | oraciones enviadas | |
| ☐ | `cast.transmissions` | transmissions | transmisiones | |
| ☐ | `cast.empty` | No prayers have gone out yet. | Aún no ha salido ninguna oración. | |
| ☐ | `cast.amplified` | amplified, sent %{count} times | amplificada, enviada %{count} veces | |
| ☐ | `cast.testLog` | test log (no radio yet) | registro de prueba (aún sin radio) | |

### macro (7)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `macro.kicker` | Macro need | Gran necesidad | |
| ☐ | `macro.pray` | Pray | Orar | |
| ☐ | `macro.prayingNow` | Praying now | Orando ahora | |
| ☐ | `macro.commit` | Commit to pray | Comprometerme a orar | |
| ☐ | `macro.help` | Help in person or with a gift | Ayuda en persona o con un donativo | |
| ☐ | `macro.thanks` | Thank you for helping. | Gracias por ayudar. | |
| ☐ | `macro.gave` | I gave material help | Di ayuda material | |

### moderation (33)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `moderation.flagsTitle` | Prayer taps that look automated | Toques de oración que parecen automáticos | |
| ☐ | `moderation.tooMany.one` | 1 prayer tap in an hour | 1 toque de oración en una hora | |
| ☐ | `moderation.tooMany.other` | %{count} prayer taps in an hour | %{count} toques de oración en una hora | |
| ☐ | `moderation.regular.one` | 1 tap spaced almost exactly alike | 1 toque con intervalos casi idénticos | |
| ☐ | `moderation.regular.other` | %{count} taps spaced almost exactly alike | %{count} toques con intervalos casi idénticos | |
| ☐ | `moderation.flagHint` | Nothing happens to them unless you act. Open their profile to look closer. | No le pasa nada a menos que actúes. Abre su perfil para mirar con más detalle. | |
| ☐ | `moderation.human` | Looks human | Parece humano | |
| ☐ | `moderation.automated` | Likely automated | Probablemente automático | |
| ☐ | `moderation.profile` | Profile | Perfil | |
| ☐ | `moderation.appeals` | Appeals | Apelaciones | |
| ☐ | `moderation.removedFor` | %{target} removed for “%{rule}” | %{target} eliminado por “%{rule}” | |
| ☐ | `moderation.suspendedUntil` | suspended until %{date} | suspendido hasta el %{date} | |
| ☐ | `moderation.gone` | (content no longer available) | (el contenido ya no está disponible) | |
| ☐ | `moderation.theirAppeal` | Their appeal: %{message} | Su apelación: %{message} | |
| ☐ | `moderation.uphold` | Keep the decision | Mantener la decisión | |
| ☐ | `moderation.overturn` | Overturn and restore | Revertir y restaurar | |
| ☐ | `moderation.queue` | Queue | Cola | |
| ☐ | `moderation.empty` | Nothing waiting for review. | Nada pendiente de revisión. | |
| ☐ | `moderation.why` | Why: %{reason} | Motivo: %{reason} | |
| ☐ | `moderation.reachedOut` | Reached out, keep it | Ya nos comunicamos, mantener | |
| ☐ | `moderation.removeMethod` | Remove method details | Quitar detalles del método | |
| ☐ | `moderation.ruleBroken` | Rule broken (the member is told): | Norma incumplida (se le informa al miembro): | |
| ☐ | `moderation.keep` | Keep it | Mantener | |
| ☐ | `moderation.remove` | Remove | Eliminar | |
| ☐ | `moderation.removeSuspend` | Remove and suspend 7 days | Eliminar y suspender 7 días | |
| ☐ | `moderation.target.post` | Request | Petición | |
| ☐ | `moderation.target.comment` | Comment | Comentario | |
| ☐ | `moderation.target.reaction` | Encouragement | Mensaje de ánimo | |
| ☐ | `moderation.target.message` | Private message | Mensaje privado | |
| ☐ | `moderation.target.event` | Event | Evento | |
| ☐ | `moderation.source.ai` | Flagged automatically | Marcado automáticamente | |
| ☐ | `moderation.source.report` | Reported by a member | Denunciado por un miembro | |
| ☐ | `moderation.source.crisis` | May need support | Podría necesitar apoyo | |

### witness (19)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `witness.intro` | Needs marked as sincere, from a request's page. Notes stay inside the team. | Necesidades marcadas como sinceras desde la página de una petición. Las notas quedan dentro del equipo. | |
| ☐ | `witness.open` | Open | Abiertas | |
| ☐ | `witness.status.watching` | Watching | En observación | |
| ☐ | `witness.status.reaching_out` | Reaching out | Contactando | |
| ☐ | `witness.status.helped` | Helped | Ayudada | |
| ☐ | `witness.status.closed` | Closed | Cerrada | |
| ☐ | `witness.empty` | No needs here yet. Open a request and mark it as a sincere need. | Aún no hay necesidades aquí. Abre una petición y márcala como necesidad sincera. | |
| ☐ | `witness.anonymous` | (posted anonymously) | (publicada de forma anónima) | |
| ☐ | `witness.with` | with %{name} | con %{name} | |
| ☐ | `witness.helpCount` | help sent %{count}× | ayuda enviada %{count}× | |
| ☐ | `witness.lastNote` | Last note: %{note} | Última nota: %{note} | |
| ☐ | `witness.hideNotes` | Hide notes | Ocultar notas | |
| ☐ | `witness.notes` | Notes | Notas | |
| ☐ | `witness.reachOut` | I'll reach out | Yo me comunico | |
| ☐ | `witness.helpSent` | Help sent: %{kind} | Ayuda enviada: %{kind} | |
| ☐ | `witness.notePlaceholder` | Add a note | Agrega una nota | |
| ☐ | `witness.helpPlaceholder` | Help sent (groceries, rent, a visit…), if any | Ayuda enviada (despensa, renta, una visita…), si hubo | |
| ☐ | `witness.logHelp` | Log help sent | Registrar ayuda enviada | |
| ☐ | `witness.addNote` | Add note | Agregar nota | |

### macroAdmin (12)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `macroAdmin.saved` | Featured above the feed. | Destacada encima del feed. | |
| ☐ | `macroAdmin.intro` | Feature a large need, such as a disaster, above everyone's feed. Members can pray for it and give tokens, and you can add up to five relief partners where they can give material help. Prayer Tower never handles the money. | Destaca una gran necesidad, como un desastre, encima del feed de todos. Los miembros pueden orar por ella y dar fichas, y puedes agregar hasta cinco organizaciones de ayuda donde pueden dar ayuda material. Prayer Tower nunca maneja el dinero. | |
| ☐ | `macroAdmin.title` | Title | Título | |
| ☐ | `macroAdmin.titlePlaceholder` | e.g. Hurricane relief | p. ej., Ayuda por el huracán | |
| ☐ | `macroAdmin.body` | Prayer request | Petición de oración | |
| ☐ | `macroAdmin.partners` | Material-help partners (https links) | Organizaciones de ayuda material (enlaces https) | |
| ☐ | `macroAdmin.partnerName` | Partner name | Nombre de la organización | |
| ☐ | `macroAdmin.feature` | Feature this need | Destacar esta necesidad | |
| ☐ | `macroAdmin.featured` | Featured now | Destacadas ahora | |
| ☐ | `macroAdmin.none` | None. | Ninguna. | |
| ☐ | `macroAdmin.stats` | %{prayers} praying · %{tokens} tokens · %{helpers} gave material help | %{prayers} orando · %{tokens} fichas · %{helpers} dieron ayuda material | |
| ☐ | `macroAdmin.stop` | Stop featuring | Dejar de destacar | |

### admin (151)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `admin.trend.requests_posted` | Requests | Peticiones | |
| ☐ | `admin.trend.praying_now_taps` | Prayers | Oraciones | |
| ☐ | `admin.trend.commitments_made` | Promises | Compromisos | |
| ☐ | `admin.trend.commitment_checkins` | Kept | Cumplidos | |
| ☐ | `admin.role.admin` | Admin | Administrador | |
| ☐ | `admin.role.moderator` | Moderator | Moderador | |
| ☐ | `admin.role.pastor` | Church pastor (verified) | Pastor de iglesia (verificado) | |
| ☐ | `admin.role.pastor_counselor` | Pastor / counselor | Pastor / consejero | |
| ☐ | `admin.role.witness` | Witness team | Equipo Testigo | |
| ☐ | `admin.role.prayer_partner` | Prayer partner | Compañero de oración | |
| ☐ | `admin.metric.members` | (English comes from the server) | Miembros | |
| ☐ | `admin.metric.new_members` | (English comes from the server) | Miembros nuevos | |
| ☐ | `admin.metric.onboarded` | (English comes from the server) | Con bienvenida completa | |
| ☐ | `admin.metric.posts` | (English comes from the server) | Publicaciones | |
| ☐ | `admin.metric.requests` | (English comes from the server) | Peticiones | |
| ☐ | `admin.metric.answered` | (English comes from the server) | Respondidas | |
| ☐ | `admin.metric.comments` | (English comes from the server) | Comentarios | |
| ☐ | `admin.metric.encouragements` | (English comes from the server) | Mensajes de ánimo | |
| ☐ | `admin.metric.prayer` | (English comes from the server) | Oración | |
| ☐ | `admin.metric.praying_now_taps` | (English comes from the server) | Toques de Orando ahora | |
| ☐ | `admin.metric.active_pray_ers` | (English comes from the server) | Personas que oran activas | |
| ☐ | `admin.metric.commitments` | (English comes from the server) | Compromisos | |
| ☐ | `admin.metric.commitments_made` | (English comes from the server) | Compromisos hechos | |
| ☐ | `admin.metric.checkins` | (English comes from the server) | Registros | |
| ☐ | `admin.metric.moderation` | (English comes from the server) | Moderación | |
| ☐ | `admin.metric.reports` | (English comes from the server) | Denuncias | |
| ☐ | `admin.metric.ai_flags` | (English comes from the server) | Marcas de IA | |
| ☐ | `admin.metric.removed` | (English comes from the server) | Eliminadas | |
| ☐ | `admin.metric.tokens` | (English comes from the server) | Fichas | |
| ☐ | `admin.metric.radio` | (English comes from the server) | Radio | |
| ☐ | `admin.saved.tokens` | Token settings saved. | Ajustes de fichas guardados. | |
| ☐ | `admin.saved.radio` | Radio settings saved. | Ajustes de radio guardados. | |
| ☐ | `admin.saved.funding` | Radio funding saved. | Financiación de la radio guardada. | |
| ☐ | `admin.saved.safety` | New-member limits saved. | Límites para miembros nuevos guardados. | |
| ☐ | `admin.saved.tiers` | Tiers saved. | Niveles guardados. | |
| ☐ | `admin.saved.ruleOn` | Milestone on. | Hito activado. | |
| ☐ | `admin.saved.ruleOff` | Milestone off. | Hito desactivado. | |
| ☐ | `admin.saved.ruleAdded` | Milestone added. Turn it on when ready. | Hito agregado. Actívalo cuando esté listo. | |
| ☐ | `admin.saved.events` | Event settings saved. | Ajustes de eventos guardados. | |
| ☐ | `admin.saved.messages` | Message settings saved. | Ajustes de mensajes guardados. | |
| ☐ | `admin.reportTitle` | Prayer Tower pilot report | Informe del piloto de Prayer Tower | |
| ☐ | `admin.metrics` | Pilot metrics | Métricas del piloto | |
| ☐ | `admin.days.one` | 1 day | 1 día | |
| ☐ | `admin.days.other` | %{count} days | %{count} días | |
| ☐ | `admin.byWeek` | Pilot results by week | Resultados del piloto por semana | |
| ☐ | `admin.weekOf` | Week of | Semana del | |
| ☐ | `admin.downloadCsv` | Download %{weeks}-week report (CSV) | Descargar informe de %{weeks} semanas (CSV) | |
| ☐ | `admin.downloadSponsor` | Sponsor report, %{weeks} weeks (HTML, print to PDF) | Informe para patrocinadores, %{weeks} semanas (HTML, imprimir a PDF) | |
| ☐ | `admin.announcements` | Announcements | Anuncios | |
| ☐ | `admin.invites` | Invite codes | Códigos de invitación | |
| ☐ | `admin.auditLog` | Audit log of staff actions | Registro de acciones del personal | |
| ☐ | `admin.churches` | Church partner applications | Solicitudes de iglesias aliadas | |
| ☐ | `admin.tokens` | Tokens | Fichas | |
| ☐ | `admin.radioFree` | Radio prayers are free | Las oraciones por radio son gratis | |
| ☐ | `admin.radioFreeHint` | On: radio prayers cost nothing and Priestly tokens are donations only. Off: each radio prayer spends Priestly tokens. | Activado: las oraciones por radio no cuestan nada y las fichas sacerdotales son solo donaciones. Desactivado: cada oración por radio gasta fichas sacerdotales. | |
| ☐ | `admin.field.perToken` | Verified prayers per Priestly token | Oraciones verificadas por ficha sacerdotal | |
| ☐ | `admin.field.gap` | Minimum seconds between verified prayers | Segundos mínimos entre oraciones verificadas | |
| ☐ | `admin.field.cost` | Priestly tokens per radio prayer | Fichas sacerdotales por oración por radio | |
| ☐ | `admin.field.verifiedPerDay` | Verified prayers a day per member (0 = no cap) | Oraciones verificadas al día por miembro (0 = sin límite) | |
| ☐ | `admin.field.postsHour` | Requests an hour | Peticiones por hora | |
| ☐ | `admin.field.commentsHour` | Comments an hour | Comentarios por hora | |
| ☐ | `admin.field.messagesMinute` | Messages a minute | Mensajes por minuto | |
| ☐ | `admin.field.hours` | Hours as a new member | Horas como miembro nuevo | |
| ☐ | `admin.field.prayers` | Prayers for others to lift limits | Oraciones por otros para quitar los límites | |
| ☐ | `admin.field.posts` | Requests a day | Peticiones al día | |
| ☐ | `admin.field.comments` | Comments a day | Comentarios al día | |
| ☐ | `admin.field.hosts` | Allowed video meeting sites | Sitios de videollamada permitidos | |
| ☐ | `admin.field.reminder` | Reminder, minutes before | Recordatorio, minutos antes | |
| ☐ | `admin.field.requests` | Messages before the other person replies | Mensajes antes de que la otra persona responda | |
| ☐ | `admin.field.perDay` | Messages a day for new members | Mensajes al día para miembros nuevos | |
| ☐ | `admin.field.groupMax` | Most members in a group | Máximo de miembros en un grupo | |
| ☐ | `admin.field.tierMin` | Prayers to reach this tier | Oraciones para llegar a este nivel | |
| ☐ | `admin.field.tierWeekly` | Weekly token allotment | Asignación semanal de fichas | |
| ☐ | `admin.field.ruleName` | Name | Nombre | |
| ☐ | `admin.field.ruleAt` | Reached at | Se alcanza en | |
| ☐ | `admin.field.ruleAmount` | Bonus tokens | Fichas de bonificación | |
| ☐ | `admin.btn.saveTokens` | Save token settings | Guardar ajustes de fichas | |
| ☐ | `admin.btn.saveSafety` | Save new-member limits | Guardar límites para miembros nuevos | |
| ☐ | `admin.btn.saveTiers` | Save tiers | Guardar niveles | |
| ☐ | `admin.btn.addRule` | Add milestone | Agregar hito | |
| ☐ | `admin.btn.find` | Find | Buscar | |
| ☐ | `admin.btn.saveEvents` | Save event settings | Guardar ajustes de eventos | |
| ☐ | `admin.btn.saveMessages` | Save message limits | Guardar límites de mensajes | |
| ☐ | `admin.btn.dismiss` | Dismiss | Descartar | |
| ☐ | `admin.btn.handled` | Mark handled | Marcar como atendido | |
| ☐ | `admin.toggle.limitNew` | Limit new members | Limitar a los miembros nuevos | |
| ☐ | `admin.toggle.limitNewHint` | New until they have been here long enough and prayed for others enough times. Admins and moderators are exempt. | Son nuevos hasta que lleven aquí suficiente tiempo y hayan orado por otros suficientes veces. Los administradores y moderadores están exentos. | |
| ☐ | `admin.toggle.stationFree` | Station sends only while radio prayers are free | La estación solo transmite mientras las oraciones por radio son gratis | |
| ☐ | `admin.toggle.stationFreeHint` | Amateur radio rules (47 CFR 97.113) forbid tying a transmission to payment. Keep this on for an amateur station. | Las normas de radioaficionados (47 CFR 97.113) prohíben vincular una transmisión a un pago. Mantenlo activado para una estación de radioaficionado. | |
| ☐ | `admin.toggle.confession` | Confession to a pastor | Confesión con un pastor | |
| ☐ | `admin.toggle.confessionHint` | Off until a lawyer reviews confidentiality and reporting duties. | Desactivado hasta que un abogado revise la confidencialidad y las obligaciones de denuncia. | |
| ☐ | `admin.toggle.anyPrayer` | Anyone who prayed can write | Cualquiera que oró puede escribir | |
| ☐ | `admin.toggle.anyPrayerHint` | Off: only people who committed to pray. | Desactivado: solo quienes se comprometieron a orar. | |
| ☐ | `admin.toggle.mutual` | Only between people who follow each other | Solo entre personas que se siguen mutuamente | |
| ☐ | `admin.toggle.mutualHint` | Off: anyone can send a message request. | Desactivado: cualquiera puede enviar una solicitud de mensaje. | |
| ☐ | `admin.toggle.links` | New members can post links | Los miembros nuevos pueden publicar enlaces | |
| ☐ | `admin.toggle.care` | Members can ask for a prayer partner | Los miembros pueden pedir un compañero de oración | |
| ☐ | `admin.toggle.events` | Events | Eventos | |
| ☐ | `admin.toggle.host` | New members can host events | Los miembros nuevos pueden organizar eventos | |
| ☐ | `admin.toggle.prayerMessages` | Pray-ers can write to people they prayed for | Quienes oran pueden escribir a las personas por quienes oraron | |
| ☐ | `admin.toggle.direct` | Direct messages | Mensajes directos | |
| ☐ | `admin.toggle.groups` | Group chats | Chats de grupo | |
| ☐ | `admin.toggle.newStart` | New members can start conversations | Los miembros nuevos pueden iniciar conversaciones | |
| ☐ | `admin.everyoneLimits` | Limits for everyone (admins and moderators are exempt; 0 = no limit). The same request or comment can't be posted twice in a day. | Límites para todos (los administradores y moderadores están exentos; 0 = sin límite). No se puede publicar la misma petición o comentario dos veces en un día. | |
| ☐ | `admin.newMembers` | New members | Miembros nuevos | |
| ☐ | `admin.radio` | Radio | Radio | |
| ☐ | `admin.logOnly` | Log only (no radio) | Solo registro (sin radio) | |
| ☐ | `admin.station` | Radio station | Estación de radio | |
| ☐ | `admin.amplify` | Amplify sends a prayer %{count} times (free only). “1,000x a second” is not possible on PSK31, about one prayer a minute. | Amplificar envía una oración %{count} veces (solo gratis). “1000 veces por segundo” no es posible en PSK31, que envía una oración por minuto aproximadamente. | |
| ☐ | `admin.paused` | The station is paused: turn on “Radio prayers are free” above. | La estación está en pausa: activa “Las oraciones por radio son gratis” arriba. | |
| ☐ | `admin.tiers` | Tiers | Niveles | |
| ☐ | `admin.tiersHint` | Leave a box empty to keep it undecided. | Deja una casilla vacía para dejarla sin decidir. | |
| ☐ | `admin.milestones` | Milestone bonuses | Bonificaciones por hitos | |
| ☐ | `admin.milestonesHint` | Bonus tokens for reaching a milestone, given once per member. Every rule is off until you turn it on. | Fichas de bonificación por alcanzar un hito, una vez por miembro. Cada regla está desactivada hasta que la actives. | |
| ☐ | `admin.priestlyTokens.one` | 1 Priestly token | 1 ficha sacerdotal | |
| ☐ | `admin.priestlyTokens.other` | %{count} Priestly tokens | %{count} fichas sacerdotales | |
| ☐ | `admin.regularTokens.one` | 1 token | 1 ficha | |
| ☐ | `admin.regularTokens.other` | %{count} tokens | %{count} fichas | |
| ☐ | `admin.given.one` | given 1 time | otorgado 1 vez | |
| ☐ | `admin.given.other` | given %{count} times | otorgado %{count} veces | |
| ☐ | `admin.addRuleTitle` | Add a milestone (starts off) | Agregar un hito (empieza desactivado) | |
| ☐ | `admin.ruleMetric.prayers_for_others` | Prayers for others | Oraciones por otros | |
| ☐ | `admin.ruleMetric.commitment_checkins` | Commitment check-ins | Registros de compromisos | |
| ☐ | `admin.ruleMetric.answered_requests` | Answered requests | Peticiones respondidas | |
| ☐ | `admin.people` | People and roles | Personas y funciones | |
| ☐ | `admin.search` | Name or email | Nombre o correo | |
| ☐ | `admin.noMatch` | No one matches. | Nadie coincide. | |
| ☐ | `admin.deletion` | Account deletion requests | Solicitudes de eliminación de cuenta | |
| ☐ | `admin.deletionHint` | From the web page. Confirm with the person by email before deleting. | Desde la página web. Confirma con la persona por correo antes de eliminar. | |
| ☐ | `admin.found` | account found | cuenta encontrada | |
| ☐ | `admin.notFound` | no account with this email | no hay cuenta con este correo | |
| ☐ | `admin.confirmDelete` | Tap again to delete for good | Toca otra vez para eliminar para siempre | |
| ☐ | `admin.deleteAccount` | Delete account | Eliminar cuenta | |
| ☐ | `admin.tone` | Reminder tone | Tono de los recordatorios | |
| ☐ | `admin.toneHint` | Members can choose for themselves; this is the default for everyone else. | Los miembros pueden elegir por sí mismos; este es el valor predeterminado para los demás. | |
| ☐ | `admin.gentle` | Gentle | Suave | |
| ☐ | `admin.firm` | Firm | Firme | |
| ☐ | `admin.toneResult` | %{tone}: %{prayed} of %{shown} reminders led to a prayer (last 30 days) | %{tone}: %{prayed} de %{shown} recordatorios llevaron a una oración (últimos 30 días) | |
| ☐ | `admin.careEvents` | Prayer partners and events | Compañeros de oración y eventos | |
| ☐ | `admin.messages` | Messages | Mensajes | |
| ☐ | `admin.warriors` | Prayer Warrior standings | Clasificación de Guerreros de Oración | |
| ☐ | `admin.warriorsHint` | Verified prayers for others and kept promises. Private to admins until award rules are approved. | Oraciones verificadas por otros y compromisos cumplidos. Privado para administradores hasta que se aprueben las reglas del premio. | |
| ☐ | `admin.year` | Year | Año | |
| ☐ | `admin.standing` | %{prayers} prayers, %{checkins} promise check-ins, %{people} people | %{prayers} oraciones, %{checkins} registros de compromisos, %{people} personas | |
| ☐ | `admin.noWarriors` | No verified prayers yet. | Aún no hay oraciones verificadas. | |
| ☐ | `admin.feedback` | Member feedback (%{count}) | Comentarios de miembros (%{count}) | |
| ☐ | `admin.feedbackTriage` | Triage and export feedback | Clasificar y exportar comentarios | |
| ☐ | `admin.feedbackFrom` | %{kind} from %{name} | %{kind} de %{name} | |
| ☐ | `admin.feedbackKind.bug` | Bug | Error | |
| ☐ | `admin.feedbackKind.idea` | Idea | Idea | |
| ☐ | `admin.feedbackKind.other` | Feedback | Comentario | |

### feedbackTriage (31)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `feedbackTriage.title` | Feedback | Comentarios | |
| ☐ | `feedbackTriage.intro` | What testers sent from Me → Send feedback. Tag each item by type, set how serious it is, add a note, and mark it handled. Suggested tags are filled in for you. | Lo que enviaron los probadores desde Yo → Enviar comentarios. Etiqueta cada uno por tipo, indica qué tan grave es, agrega una nota y márcalo como atendido. Las etiquetas sugeridas ya vienen puestas. | |
| ☐ | `feedbackTriage.show` | Show | Mostrar | |
| ☐ | `feedbackTriage.status.open` | Open | Abiertos | |
| ☐ | `feedbackTriage.status.closed` | Handled | Atendidos | |
| ☐ | `feedbackTriage.status.all` | All | Todos | |
| ☐ | `feedbackTriage.anyTag` | Any type | Cualquier tipo | |
| ☐ | `feedbackTriage.export` | Export as CSV | Exportar como CSV | |
| ☐ | `feedbackTriage.empty` | No feedback here. | No hay comentarios aquí. | |
| ☐ | `feedbackTriage.type` | Type | Tipo | |
| ☐ | `feedbackTriage.severity` | How serious | Qué tan grave | |
| ☐ | `feedbackTriage.sev.low` | Low | Baja | |
| ☐ | `feedbackTriage.sev.medium` | Medium | Media | |
| ☐ | `feedbackTriage.sev.high` | High | Alta | |
| ☐ | `feedbackTriage.sev.blocker` | Blocker | Bloqueante | |
| ☐ | `feedbackTriage.note` | Staff note | Nota del personal | |
| ☐ | `feedbackTriage.saveNote` | Save note | Guardar nota | |
| ☐ | `feedbackTriage.saved` | Saved. | Guardado. | |
| ☐ | `feedbackTriage.closed` | Marked handled. | Marcado como atendido. | |
| ☐ | `feedbackTriage.tag.bug` | Bug | Error | |
| ☐ | `feedbackTriage.tag.crash` | Crash | Cierre inesperado | |
| ☐ | `feedbackTriage.tag.idea` | Idea | Idea | |
| ☐ | `feedbackTriage.tag.confusing` | Confusing | Confuso | |
| ☐ | `feedbackTriage.tag.content` | Content | Contenido | |
| ☐ | `feedbackTriage.tag.notifications` | Notifications | Notificaciones | |
| ☐ | `feedbackTriage.tag.account` | Account | Cuenta | |
| ☐ | `feedbackTriage.tag.accessibility` | Accessibility | Accesibilidad | |
| ☐ | `feedbackTriage.tag.spanish` | Spanish | Español | |
| ☐ | `feedbackTriage.tag.performance` | Speed | Velocidad | |
| ☐ | `feedbackTriage.tag.praise` | Praise | Elogio | |
| ☐ | `feedbackTriage.tag.other` | Other | Otro | |

### ledgerCheck (11)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `ledgerCheck.title` | Ledger check | Revisión del registro | |
| ☐ | `ledgerCheck.never` | Not run yet. It runs every night at 04:15 UTC. | Todavía no se ha ejecutado. Se ejecuta cada noche a las 04:15 UTC. | |
| ☐ | `ledgerCheck.ok` | All balances match the ledger (%{date}). | Todos los saldos coinciden con el registro (%{date}). | |
| ☐ | `ledgerCheck.problems.one` | 1 problem found (%{date}). Admins were alerted. | Se encontró 1 problema (%{date}). Se avisó a los administradores. | |
| ☐ | `ledgerCheck.problems.other` | %{count} problems found (%{date}). Admins were alerted. | Se encontraron %{count} problemas (%{date}). Se avisó a los administradores. | |
| ☐ | `ledgerCheck.counts` | %{accounts} accounts and %{transfers} transfers checked. Runs nightly at 04:15 UTC. | Se revisaron %{accounts} cuentas y %{transfers} movimientos. Se ejecuta cada noche a las 04:15 UTC. | |
| ☐ | `ledgerCheck.check.balance_mismatch` | Balance does not match transfers | El saldo no coincide con los movimientos | |
| ☐ | `ledgerCheck.check.currency_total` | Currency does not add up to zero | La moneda no suma cero | |
| ☐ | `ledgerCheck.check.negative_balance` | Negative balance | Saldo negativo | |
| ☐ | `ledgerCheck.check.clawback_mismatch` | Clawback does not match the original | La reversión no coincide con el original | |
| ☐ | `ledgerCheck.run` | Run the check now | Revisar ahora | |

### import (24)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `import.title` | Import from a spreadsheet | Importar desde una hoja de cálculo | |
| ☐ | `import.intro` | Bring in a church's members or starter prayer requests from a CSV file (in Google Sheets or Excel: File → Download → CSV). Preview first: nothing changes until you press Import. | Trae los miembros de una iglesia o peticiones iniciales desde un archivo CSV (en Google Sheets o Excel: Archivo → Descargar → CSV). Primero revisa la vista previa: nada cambia hasta que pulses Importar. | |
| ☐ | `import.members` | Members | Miembros | |
| ☐ | `import.requests` | Prayer requests | Peticiones de oración | |
| ☐ | `import.membersHint` | Columns: email (needed), name, language (en or es). Each person gets their own single-use invite code. People who already have an account are skipped. | Columnas: email o correo (obligatoria), nombre, idioma (en o es). Cada persona recibe su propio código de invitación de un solo uso. Se omite a quien ya tiene cuenta. | |
| ☐ | `import.requestsHint` | Columns: request (needed), anonymous (yes or no). Each request is posted by you. | Columnas: petición (obligatoria), anónimo (sí o no). Cada petición se publica a tu nombre. | |
| ☐ | `import.pickFile` | Choose a CSV file | Elegir un archivo CSV | |
| ☐ | `import.paste` | Or paste the CSV here | O pega el CSV aquí | |
| ☐ | `import.note` | Who the codes are for (optional) | Para quién son los códigos (opcional) | |
| ☐ | `import.notePlaceholder` | For example, Grace Church | Por ejemplo, Iglesia Gracia | |
| ☐ | `import.sendEmails` | Email each person their code | Enviar a cada persona su código por correo | |
| ☐ | `import.sendEmailsHint` | In their language. Needs email set up on the server. | En su idioma. Requiere que el correo esté configurado en el servidor. | |
| ☐ | `import.preview` | Preview | Vista previa | |
| ☐ | `import.run.one` | Import 1 row | Importar 1 fila | |
| ☐ | `import.run.other` | Import %{count} rows | Importar %{count} filas | |
| ☐ | `import.previewSummary` | %{ok} ready, %{skipped} skipped, %{errors} with problems. | %{ok} listas, %{skipped} omitidas, %{errors} con problemas. | |
| ☐ | `import.doneSummary` | Done: %{done} imported, %{skipped} skipped, %{errors} with problems. | Listo: %{done} importadas, %{skipped} omitidas, %{errors} con problemas. | |
| ☐ | `import.line` | Row %{line} | Fila %{line} | |
| ☐ | `import.status.ok` | Ready | Lista | |
| ☐ | `import.status.invited` | Invite code made | Código creado | |
| ☐ | `import.status.emailed` | Code emailed | Código enviado | |
| ☐ | `import.status.posted` | Posted | Publicada | |
| ☐ | `import.status.skipped` | Skipped | Omitida | |
| ☐ | `import.status.error` | Problem | Problema | |

### jobs (11)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `jobs.title` | Background jobs | Tareas en segundo plano | |
| ☐ | `jobs.intro` | Pushes, emails, moderation scans and radio prayers run in the background and are retried by themselves. Jobs that ran out of tries are listed here, and admins get an alert. | Los avisos, los correos, las revisiones de moderación y las oraciones por radio se hacen en segundo plano y se reintentan solos. Aquí aparecen las tareas que agotaron sus intentos, y los administradores reciben un aviso. | |
| ☐ | `jobs.healthy` | Nothing has failed. | No ha fallado nada. | |
| ☐ | `jobs.retrying.one` | %{task}: 1 job retrying (tried %{attempts} times) | %{task}: 1 tarea reintentándose (%{attempts} intentos) | |
| ☐ | `jobs.retrying.other` | %{task}: %{count} jobs retrying (tried up to %{attempts} times) | %{task}: %{count} tareas reintentándose (hasta %{attempts} intentos) | |
| ☐ | `jobs.failed` | Failed jobs | Tareas fallidas | |
| ☐ | `jobs.tries` | Tried %{attempts} of %{max} times · %{date} | %{attempts} de %{max} intentos · %{date} | |
| ☐ | `jobs.retry` | Retry %{task} | Reintentar %{task} | |
| ☐ | `jobs.discard` | Discard %{task} | Descartar %{task} | |
| ☐ | `jobs.retried` | Queued to run again. | Se volverá a ejecutar. | |
| ☐ | `jobs.discarded` | Discarded. | Descartada. | |

### announcements (2)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `announcements.label` | Announcements | Anuncios | |
| ☐ | `announcements.dismiss` | Dismiss: %{title} | Cerrar: %{title} | |

### announcementsAdmin (27)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `announcementsAdmin.title` | Announcements | Anuncios | |
| ☐ | `announcementsAdmin.intro` | Post a message to every member. It shows at the top of their feed until they dismiss it, or until it ends. | Publica un mensaje para todos los miembros. Aparece arriba de su feed hasta que lo cierren o hasta que termine. | |
| ☐ | `announcementsAdmin.new` | New announcement | Anuncio nuevo | |
| ☐ | `announcementsAdmin.kind.banner` | Banner | Franja | |
| ☐ | `announcementsAdmin.kind.notice` | Notice | Aviso | |
| ☐ | `announcementsAdmin.kindHint.banner` | One short line across the top of the feed. | Una línea corta arriba del feed. | |
| ☐ | `announcementsAdmin.kindHint.notice` | A card with a title and a few sentences. | Una tarjeta con un título y unas frases. | |
| ☐ | `announcementsAdmin.titleEn` | Title (English) | Título (inglés) | |
| ☐ | `announcementsAdmin.bodyEn` | Text (English) | Texto (inglés) | |
| ☐ | `announcementsAdmin.titleEs` | Title in Spanish (optional) | Título en español (opcional) | |
| ☐ | `announcementsAdmin.bodyEs` | Text in Spanish (optional) | Texto en español (opcional) | |
| ☐ | `announcementsAdmin.hours` | Ends after (hours, blank to keep it up) | Termina después de (horas, en blanco para dejarlo) | |
| ☐ | `announcementsAdmin.untilEnded` | Until you end it | Hasta que lo termines | |
| ☐ | `announcementsAdmin.needTitleEs` | Add a Spanish title to go with the Spanish text. | Agrega un título en español para acompañar el texto en español. | |
| ☐ | `announcementsAdmin.post` | Post to everyone | Publicar para todos | |
| ☐ | `announcementsAdmin.posted` | Posted. Members see it the next time they open the feed. | Publicado. Los miembros lo verán la próxima vez que abran el feed. | |
| ☐ | `announcementsAdmin.posts` | Posted | Publicados | |
| ☐ | `announcementsAdmin.empty` | No announcements yet. | Todavía no hay anuncios. | |
| ☐ | `announcementsAdmin.live` | Showing | Visible | |
| ☐ | `announcementsAdmin.ended` | Ended | Terminado | |
| ☐ | `announcementsAdmin.dismissals.one` | 1 dismissed | 1 lo cerró | |
| ☐ | `announcementsAdmin.dismissals.other` | %{count} dismissed | %{count} lo cerraron | |
| ☐ | `announcementsAdmin.endsAt` | ends %{date} | termina el %{date} | |
| ☐ | `announcementsAdmin.endedAt` | ended %{date} | terminó el %{date} | |
| ☐ | `announcementsAdmin.englishOnly` | English only | Solo en inglés | |
| ☐ | `announcementsAdmin.end` | End: %{title} | Terminar: %{title} | |
| ☐ | `announcementsAdmin.endedNotice` | Ended. Members no longer see it. | Terminado. Los miembros ya no lo ven. | |

### invites (38)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `invites.title` | Invite codes | Códigos de invitación | |
| ☐ | `invites.intro` | While invite-only mode is on, new members need a code to create an account. Share a code with each person or group you invite. | Mientras el modo solo por invitación esté activo, los miembros nuevos necesitan un código para crear su cuenta. Comparte un código con cada persona o grupo que invites. | |
| ☐ | `invites.inviteOnly` | Invite-only sign-up | Registro solo por invitación | |
| ☐ | `invites.inviteOnlyHint` | On: sign-up needs a valid code. Off: anyone can create an account. | Activado: el registro necesita un código válido. Desactivado: cualquiera puede crear una cuenta. | |
| ☐ | `invites.nowOn` | Invite-only mode is on. | El modo solo por invitación está activado. | |
| ☐ | `invites.nowOff` | Invite-only mode is off. Anyone can sign up. | El modo solo por invitación está desactivado. Cualquiera puede registrarse. | |
| ☐ | `invites.new` | New codes | Códigos nuevos | |
| ☐ | `invites.note` | Who it is for (optional) | Para quién es (opcional) | |
| ☐ | `invites.notePlaceholder` | For example, Grace Church small group | Por ejemplo, grupo pequeño de la iglesia Gracia | |
| ☐ | `invites.maxUses` | People who can use each code | Personas que pueden usar cada código | |
| ☐ | `invites.expiresInDays` | Expires after (days, blank for never) | Vence después de (días, en blanco para nunca) | |
| ☐ | `invites.never` | Never | Nunca | |
| ☐ | `invites.count` | How many codes | Cuántos códigos | |
| ☐ | `invites.limits` | Use 1 to 1,000 people, 1 to 365 days and 1 to 50 codes. | Usa de 1 a 1000 personas, de 1 a 365 días y de 1 a 50 códigos. | |
| ☐ | `invites.create` | Create codes | Crear códigos | |
| ☐ | `invites.created.one` | Created 1 code. | Se creó 1 código. | |
| ☐ | `invites.created.other` | Created %{count} codes. | Se crearon %{count} códigos. | |
| ☐ | `invites.codes` | Codes | Códigos | |
| ☐ | `invites.empty` | No invite codes yet. | Todavía no hay códigos de invitación. | |
| ☐ | `invites.status.active` | Active | Activo | |
| ☐ | `invites.status.used` | Used up | Agotado | |
| ☐ | `invites.status.expired` | Expired | Vencido | |
| ☐ | `invites.status.revoked` | Revoked | Anulado | |
| ☐ | `invites.used` | %{uses} of %{max} used | %{uses} de %{max} usados | |
| ☐ | `invites.expires` | expires %{date} | vence el %{date} | |
| ☐ | `invites.share` | Share | Compartir | |
| ☐ | `invites.revokeCode` | Revoke %{code} | Anular %{code} | |
| ☐ | `invites.revoked` | Code revoked. | Código anulado. | |
| ☐ | `invites.shareMessage` | You are invited to Prayer Tower. Your invite code is %{code}. Open %{url} in the app, or enter the code when you create your account. | Te invitamos a Prayer Tower. Tu código de invitación es %{code}. Abre %{url} en la aplicación, o escribe el código al crear tu cuenta. | |
| ☐ | `invites.email` | Email | Correo | |
| ☐ | `invites.import` | Import from a spreadsheet (CSV) | Importar desde una hoja de cálculo (CSV) | |
| ☐ | `invites.emailCode` | Email %{code} | Enviar %{code} por correo | |
| ☐ | `invites.emailTo` | Their email address | Su correo electrónico | |
| ☐ | `invites.emailLanguage` | Email language | Idioma del correo | |
| ☐ | `invites.emailMessage` | A personal note (optional) | Una nota personal (opcional) | |
| ☐ | `invites.send` | Send invite | Enviar invitación | |
| ☐ | `invites.sent` | Invite sent to %{email}. | Invitación enviada a %{email}. | |
| ☐ | `invites.emailOff` | Email isn’t set up on the server yet (SMTP). | El correo aún no está configurado en el servidor (SMTP). | |

### auditLog (48)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `auditLog.action.PUT_admin_people_id_roles_role` | Gave a role | Asignó un rol | |
| ☐ | `auditLog.action.POST_admin_churches_id_decision` | Reviewed a church partner | Revisó una iglesia aliada | |
| ☐ | `auditLog.action.DELETE_admin_people_id_roles_role` | Took away a role | Quitó un rol | |
| ☐ | `auditLog.action.PATCH_admin_token-settings` | Changed token settings | Cambió los ajustes de fichas | |
| ☐ | `auditLog.action.PATCH_admin_radio-settings` | Changed radio settings | Cambió los ajustes de radio | |
| ☐ | `auditLog.action.PATCH_admin_safety-settings` | Changed safety settings | Cambió los ajustes de seguridad | |
| ☐ | `auditLog.action.PATCH_admin_tiers_tier` | Changed a tier | Cambió un nivel | |
| ☐ | `auditLog.action.PATCH_admin_messaging-settings` | Changed messaging settings | Cambió los ajustes de mensajes | |
| ☐ | `auditLog.action.PATCH_admin_reach-settings` | Changed reach settings | Cambió los ajustes de alcance | |
| ☐ | `auditLog.action.PATCH_admin_prompt-settings` | Changed prayer prompt settings | Cambió los ajustes de recordatorios | |
| ☐ | `auditLog.action.PATCH_admin_event-settings` | Changed event settings | Cambió los ajustes de eventos | |
| ☐ | `auditLog.action.PATCH_admin_care-settings` | Changed care settings | Cambió los ajustes de cuidado | |
| ☐ | `auditLog.action.PATCH_admin_activity-settings` | Changed activity check settings | Cambió los ajustes de actividad | |
| ☐ | `auditLog.action.PATCH_admin_future-settings` | Changed future feature settings | Cambió los ajustes de funciones futuras | |
| ☐ | `auditLog.action.POST_admin_milestones` | Added a milestone | Añadió un hito | |
| ☐ | `auditLog.action.PATCH_admin_milestones_id` | Changed a milestone | Cambió un hito | |
| ☐ | `auditLog.action.POST_admin_scripture-leaves` | Added a scripture leaf | Añadió una hoja bíblica | |
| ☐ | `auditLog.action.PATCH_admin_scripture-leaves_id` | Changed a scripture leaf | Cambió una hoja bíblica | |
| ☐ | `auditLog.action.POST_admin_deletion-requests_id` | Handled a deletion request | Atendió una solicitud de eliminación | |
| ☐ | `auditLog.action.POST_admin_feedback_id_close` | Closed feedback | Cerró un comentario | |
| ☐ | `auditLog.action.POST_moderation_items_id_decision` | Moderation decision | Decisión de moderación | |
| ☐ | `auditLog.action.POST_moderation_appeals_id_decision` | Appeal decision | Decisión de apelación | |
| ☐ | `auditLog.action.POST_moderation_activity-flags_id` | Activity flag decision | Decisión sobre alerta de actividad | |
| ☐ | `auditLog.action.POST_posts_id_witness` | Marked a request for the witness team | Marcó una petición para testigos | |
| ☐ | `auditLog.action.PATCH_witness_cases_id` | Updated a witness case | Actualizó un caso de testigos | |
| ☐ | `auditLog.action.POST_witness_cases_id_notes` | Added a witness note | Añadió una nota de testigos | |
| ☐ | `auditLog.action.POST_care-requests_id_claim` | Took a care request | Tomó una solicitud de cuidado | |
| ☐ | `auditLog.action.POST_care-requests_id_close` | Closed a care request | Cerró una solicitud de cuidado | |
| ☐ | `auditLog.action.POST_macro-needs` | Posted a macro need | Publicó una gran necesidad | |
| ☐ | `auditLog.action.POST_macro-needs_id_end` | Ended a macro need | Terminó una gran necesidad | |
| ☐ | `auditLog.action.POST_macro-needs_id_helped` | Marked helpers on a macro need | Marcó ayudantes en una gran necesidad | |
| ☐ | `auditLog.action.PATCH_admin_feedback_id` | Triaged feedback | Clasificó comentarios | |
| ☐ | `auditLog.action.POST_admin_ledger-checks` | Ran the ledger check | Ejecutó la revisión del registro | |
| ☐ | `auditLog.action.POST_admin_announcements` | Posted an announcement | Publicó un anuncio | |
| ☐ | `auditLog.action.POST_admin_announcements_id_end` | Ended an announcement | Terminó un anuncio | |
| ☐ | `auditLog.action.POST_admin_invites` | Created invite codes | Creó códigos de invitación | |
| ☐ | `auditLog.action.POST_admin_invites_code_revoke` | Revoked an invite code | Anuló un código de invitación | |
| ☐ | `auditLog.action.POST_admin_invites_code_email` | Emailed an invite code | Envió un código de invitación por correo | |
| ☐ | `auditLog.action.POST_admin_jobs_id_retry` | Retried a failed background job | Reintentó una tarea en segundo plano fallida | |
| ☐ | `auditLog.action.POST_admin_jobs_id_discard` | Discarded a failed background job | Descartó una tarea en segundo plano fallida | |
| ☐ | `auditLog.action.POST_admin_import` | Imported a CSV file | Importó un archivo CSV | |
| ☐ | `auditLog.action.PATCH_admin_invite-settings` | Changed invite-only mode | Cambió el modo solo por invitación | |
| ☐ | `auditLog.title` | Audit log | Registro de auditoría | |
| ☐ | `auditLog.intro` | Every change staff made, newest first: roles, settings, moderation decisions, witness and care actions. Witness notes are logged without their text. | Cada cambio que hizo el personal, del más reciente al más antiguo: roles, ajustes, decisiones de moderación y acciones de testigos y cuidado. Las notas de testigos se registran sin su texto. | |
| ☐ | `auditLog.empty` | No staff actions yet. | Aún no hay acciones del personal. | |
| ☐ | `auditLog.deleted` | Deleted member | Miembro eliminado | |
| ☐ | `auditLog.target` | Record …%{id} | Registro …%{id} | |
| ☐ | `auditLog.more` | Show older | Mostrar anteriores | |

### stats (10)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `stats.title` | Your prayer life | Tu vida de oración | |
| ☐ | `stats.days` | Days prayed | Días orando | |
| ☐ | `stats.people` | People prayed for | Personas por las que oraste | |
| ☐ | `stats.streak` | Days in a row | Días seguidos | |
| ☐ | `stats.summary` | You have prayed on %{days} days, for %{people} people. %{streak} days in a row. | Has orado %{days} días, por %{people} personas. %{streak} días seguidos. | |
| ☐ | `stats.streakNote` | %{count} days in a row. One day at a time, in God's company. | %{count} días seguidos. Un día a la vez, en compañía de Dios. | |
| ☐ | `stats.gentle` | Every prayer counts. Pick up again whenever you're ready; a missed day costs nothing. | Cada oración cuenta. Retoma cuando quieras; un día sin orar no te quita nada. | |
| ☐ | `stats.private` | Only you can see these. | Solo tú puedes ver esto. | |
| ☐ | `stats.toggle` | Show my prayer stats | Mostrar mis estadísticas de oración | |
| ☐ | `stats.toggleHint` | Days prayed and people prayed for, on this page only. There are no rankings. | Días orando y personas por las que oraste, solo en esta página. No hay clasificaciones. | |

### church (24)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `church.title` | My church | Mi iglesia | |
| ☐ | `church.intro` | Pastors: add your church to become a Prayer Tower church partner. An admin checks it, usually by phone or your church's website, and then a pastor badge shows on the requests you post under your name. | Pastores: agreguen su iglesia para ser una iglesia aliada de Prayer Tower. Un administrador la revisa, por lo general por teléfono o en el sitio web de la iglesia, y luego aparece una insignia de pastor en las peticiones que publicas con tu nombre. | |
| ☐ | `church.status.pending` | Waiting for review | En revisión | |
| ☐ | `church.status.verified` | Verified | Verificada | |
| ☐ | `church.status.declined` | Not verified | No verificada | |
| ☐ | `church.pendingHint` | We'll send you a notice when an admin has checked your church. | Te avisaremos cuando un administrador haya revisado tu iglesia. | |
| ☐ | `church.verifiedHint` | Your badge: %{badge}. It never shows on anonymous posts. | Tu insignia: %{badge}. Nunca aparece en publicaciones anónimas. | |
| ☐ | `church.note` | Note from the team: %{note} | Nota del equipo: %{note} | |
| ☐ | `church.edit` | Edit | Editar | |
| ☐ | `church.withdraw` | Withdraw application | Retirar solicitud | |
| ☐ | `church.applyAgain` | Apply again | Solicitar de nuevo | |
| ☐ | `church.name` | Church name | Nombre de la iglesia | |
| ☐ | `church.pastorTitle` | Your title | Tu título | |
| ☐ | `church.pastorTitlePlaceholder` | Pastor, Senior Pastor, Reverend… | Pastor, Pastor principal, Reverendo… | |
| ☐ | `church.denomination` | Denomination or network (optional) | Denominación o red (opcional) | |
| ☐ | `church.city` | City | Ciudad | |
| ☐ | `church.region` | State or region (optional) | Estado o región (opcional) | |
| ☐ | `church.country` | Country | País | |
| ☐ | `church.website` | Church website (optional) | Sitio web de la iglesia (opcional) | |
| ☐ | `church.phone` | Church phone (optional) | Teléfono de la iglesia (opcional) | |
| ☐ | `church.about` | Anything that helps us check your church (optional) | Algo que nos ayude a verificar tu iglesia (opcional) | |
| ☐ | `church.checkHint` | A website or phone number helps us verify your church faster. | Un sitio web o un número de teléfono nos ayuda a verificar tu iglesia más rápido. | |
| ☐ | `church.submit` | Send for review | Enviar a revisión | |
| ☐ | `church.save` | Save changes | Guardar cambios | |

### churchReview (9)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `churchReview.title` | Church partners | Iglesias aliadas | |
| ☐ | `churchReview.intro` | Check each church before verifying it: call the number, open the website, or look it up in its denomination's directory. Verifying gives the applicant the pastor badge. Declining or revoking needs a note, which the pastor sees. | Revisa cada iglesia antes de verificarla: llama al número, abre el sitio web o búscala en el directorio de su denominación. Al verificarla, quien la solicitó recibe la insignia de pastor. Para rechazar o revocar se necesita una nota, que el pastor verá. | |
| ☐ | `churchReview.empty` | Nothing here. | No hay nada aquí. | |
| ☐ | `churchReview.applicant` | Applied by %{name} (%{title}) | Solicitada por %{name} (%{title}) | |
| ☐ | `churchReview.notePlaceholder` | Note for the pastor (needed to decline) | Nota para el pastor (necesaria para rechazar) | |
| ☐ | `churchReview.revokePlaceholder` | Why the badge is being removed (needed to revoke) | Por qué se quita la insignia (necesario para revocar) | |
| ☐ | `churchReview.verify` | Verify church | Verificar iglesia | |
| ☐ | `churchReview.decline` | Decline | Rechazar | |
| ☐ | `churchReview.revoke` | Revoke verification | Revocar verificación | |

### card (13)

| ✓ | Key | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `card.answered` | ✨ Prayer answered | ✨ Oración contestada | |
| ☐ | `card.hide` | Not for me: hide this post | No es para mí: ocultar esta publicación | |
| ☐ | `card.more` | more | más | |
| ☐ | `card.praying` | %{count} praying | %{count} orando | |
| ☐ | `card.firstToPray` | Be the first to pray | Sé el primero en orar | |
| ☐ | `card.committed` | %{count} committed | %{count} comprometidos | |
| ☐ | `card.encouragements` | %{count} encouragements | %{count} ánimos | |
| ☐ | `card.committedLabel` | Committed | Comprometido | |
| ☐ | `card.update` | Update ·  | Novedad ·  | |
| ☐ | `card.openHint` | Opens the request and all comments | Abre la petición y todos los comentarios | |
| ☐ | `card.viewAll` | View all %{count} comments | Ver los %{count} comentarios | |
| ☐ | `card.pastorBadge` | %{title} at %{church}, a verified church partner | %{title} de %{church}, una iglesia aliada verificada | |
| ☐ | `card.testimony` | Testimony | Testimonio | |

## 2. Labels

### moderationRule

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `harm` | Pray for good, never for harm | Ora por el bien, nunca por el mal | |
| ☐ | `flooding` | No flooding for a side | No inundar a favor de un bando | |
| ☐ | `ads` | No ads | Sin anuncios | |
| ☐ | `abuse` | No harassment or abuse | Sin acoso ni abuso | |
| ☐ | `safe_messaging` | No details of suicide or self-harm methods | Sin detalles de métodos de suicidio o autolesión | |
| ☐ | `other` | Community rules | Normas de la comunidad | |

### postType

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `prayer_request` | Prayer Request | Petición de oración | |
| ☐ | `praise` | Praise & Thanks | Alabanza y gratitud | |
| ☐ | `open_prayer` | Open Prayer | Oración abierta | |
| ☐ | `testimony` | Testimony | Testimonio | |
| ☐ | `confessional` | Confession | Confesión | |

### prayerKind

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `supplication` | Supplication | Súplica | |
| ☐ | `intercessory` | Intercession | Intercesión | |
| ☐ | `praise_thanks` | Praise & thanks | Alabanza y gratitud | |

### prayerRealm

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `personal` | Personal & relationships | Personal y relaciones | |
| ☐ | `family` | Family | Familia | |
| ☐ | `church_community` | Church & community | Iglesia y comunidad | |
| ☐ | `general_welfare` | Welfare of all | Bienestar de todos | |
| ☐ | `national` | Nation | Nación | |
| ☐ | `world` | World | Mundo | |

### action

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `praying_now` | Praying Now | Orando ahora | |
| ☐ | `commit` | Commit to Pray | Prometer orar | |
| ☐ | `encouragement` | Encourage | Animar | |
| ☐ | `well_wishes` | Well Wishes | Buenos deseos | |
| ☐ | `share` | Share | Compartir | |
| ☐ | `gift_tokens` | Gift Tokens | Regalar fichas | |

### frequency

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `weekly` | Every week | Cada semana | |
| ☐ | `daily` | Every day | Cada día | |
| ☐ | `three_daily` | Three times a day | Tres veces al día | |

### eventKind

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `prayer_meeting` | Prayer meeting | Reunión de oración | |
| ☐ | `meetup` | Local meet-up | Encuentro local | |
| ☐ | `seminar` | Seminar | Seminario | |
| ☐ | `outreach` | Outreach | Alcance | |
| ☐ | `circle` | Restorative circle | Círculo restaurativo | |

### careKind

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `pray_with_me` | Pray with me now | Ora conmigo ahora | |
| ☐ | `pastor` | Talk with a pastor | Hablar con un pastor | |
| ☐ | `confession` | Confession | Confesión | |

### whyHere

| ✓ | Value | English | Español | Correction |
| --- | --- | --- | --- | --- |
| ☐ | `pray_for_others` | To pray for others | Para orar por otros | |
| ☐ | `prayer_for_myself` | To ask for prayer for myself | Para pedir oración por mí | |
| ☐ | `pray_without_ceasing` | To pray without ceasing | Para orar sin cesar | |
| ☐ | `extend_reach` | To extend the reach of prayer | Para extender el alcance de la oración | |

## 3. Phone system text

Shown by iOS and Android outside the app (app name, permission prompts).

| ✓ | Key | Español | Correction |
| --- | --- | --- | --- |
| ☐ | `ios.CFBundleDisplayName` | Prayer Tower | |
| ☐ | `ios.NSPhotoLibraryUsageDescription` | Permite que Prayer Tower agregue tus fotos y videos a tus peticiones de oración. | |
| ☐ | `android.app_name` | Prayer Tower | |

## 4. Notifications

Push notices and the Notices tab, for members whose app is in Spanish. Values in `${…}` are filled in by the app: `p.who` is a name, `p.excerpt` the start of a request, `p.church` a church name, `p.note` a note from staff.

### Words used inside notices

| ✓ | Key | Español | Correction |
| --- | --- | --- | --- |
| ☐ | `post` | petición | |
| ☐ | `comment` | comentario | |
| ☐ | `reaction` | ánimo | |
| ☐ | `message` | mensaje | |
| ☐ | `event` | evento | |
| ☐ | `harm` | Ora por el bien, nunca por el mal | |
| ☐ | `flooding` | No inundar a favor de un bando | |
| ☐ | `ads` | Sin anuncios | |
| ☐ | `abuse` | Sin acoso ni abuso | |
| ☐ | `safe_messaging` | Sin detalles de métodos de suicidio o autolesión | |
| ☐ | `other` | Normas de la comunidad | |
| ☐ | `weekly` | cada semana | |
| ☐ | `daily` | cada día | |
| ☐ | `three_daily` | tres veces al día | |

- [ ] **praying_now**

  ```ts
  praying_now: (p) => ({
      title: `${s(p.who, 'Alguien')} está orando por ti${p.poster ? `, ${p.poster},` : ''} ahora mismo`,
      body: 'Alguien se detuvo a presentar tu petición ante el Señor.',
    })
  ```

- [ ] **encouragement**

  ```ts
  encouragement: (p) => ({ title: `${s(p.who, 'Alguien')} te envió ánimo`, body: s(p.body) })
  ```

- [ ] **thanks**

  ```ts
  thanks: (p) => ({ title: 'Gracias por orar', body: s(p.body, 'Alguien por quien oraste te envió su agradecimiento.') })
  ```

- [ ] **pray_request**

  ```ts
  pray_request: (p) => ({ title: `${s(p.who, 'Alguien')} quisiera que ores por esto`, body: s(p.body) })
  ```

- [ ] **commitment_made**

  ```ts
  commitment_made: (p) => ({
      title: `${s(p.who, 'Alguien')} se comprometió a orar por ti`,
      body: `${s(p.who, 'Alguien')} orará ${ES_FREQUENCY[s(p.frequency)] ?? ''}.`,
    })
  ```

- [ ] **commitment_reminder**

  ```ts
  commitment_reminder: (p) => ({ title: 'Hora de orar', body: `Prometiste orar: "${s(p.excerpt)}"` })
  ```

- [ ] **power_prayer**

  ```ts
  power_prayer: (p) => ({ title: '¿Orarías por esta petición?', body: s(p.body) })
  ```

- [ ] **moderation_removed**

  ```ts
  moderation_removed: (p) => {
      const noun = ES_NOUN[s(p.target)] ?? 'publicación';
      const body =
        p.rule === 'safe_messaging'
          ? `Quitamos tu ${noun} porque describía formas de autolesión, lo cual puede poner a otros en riesgo. Tu oración importa y puedes publicarla de nuevo sin esos detalles. Si estás pasando por un momento difícil: ${s(p.reach)}.`
          : `Quitamos tu ${noun} porque no cumplía una norma de la comunidad: ${ES_RULES[s(p.rule)] ?? ES_RULES.other}.` +
            (p.until ? ` Tu cuenta no puede publicar hasta el ${s(p.until)}.` : '') +
            ' Si crees que nos equivocamos, puedes apelar.';
      return { title: `Quitamos tu ${noun}`, body };
    }
  ```

- [ ] **appeal_decision**

  ```ts
  appeal_decision: (p) => {
      const noun = ES_NOUN[s(p.target)] ?? 'publicación';
      return p.overturned
        ? { title: 'Aceptamos tu apelación', body: `Un moderador lo revisó de nuevo y restauró tu ${noun}. Gracias por tu paciencia.` }
        : { title: 'Revisamos tu apelación', body: `Un moderador lo revisó de nuevo y la decisión se mantiene.${p.note ? ` ${s(p.note)}` : ''}` };
    }
  ```

- [ ] **event_new**

  ```ts
  event_new: (p) => ({ title: 'Nuevo evento en tu grupo', body: s(p.body) })
  ```

- [ ] **event_cancelled**

  ```ts
  event_cancelled: (p) => ({ title: 'Se canceló un evento', body: `${s(p.title)} no se realizará como estaba previsto.` })
  ```

- [ ] **event_reminder**

  ```ts
  event_reminder: (p) => ({ title: 'Comienza pronto', body: `${s(p.title)} comienza pronto. Toca para unirte.` })
  ```

- [ ] **milestone**

  ```ts
  milestone: (p) => {
      const n = Number(p.amount ?? 0);
      const kind = p.priestly ? (n === 1 ? ' sacerdotal' : ' sacerdotales') : '';
      return {
        title: `Logro: ${s(p.label)}`,
        body: `Recibiste ${n} ${n === 1 ? 'ficha' : 'fichas'} de bonificación${kind}. Gracias por orar.`,
      };
    }
  ```

- [ ] **care_request**

  ```ts
  care_request: (p) => ({
      title: p.crisis ? 'Alguien podría estar en peligro y pidió oración' : 'Alguien pidió un compañero de oración',
      body: 'Abre la cola de cuidado para comunicarte.',
    })
  ```

- [ ] **care_claimed**

  ```ts
  care_claimed: (p) => ({ title: `${s(p.who, 'Un compañero de oración')} está aquí para orar contigo`, body: 'Abre la conversación para hablar y orar juntos.' })
  ```

- [ ] **group_invite**

  ```ts
  group_invite: (p) => ({ title: 'Te invitaron a un grupo', body: `Únete a "${s(p.title)}" para orar y conversar juntos.` })
  ```

- [ ] **message**

  ```ts
  message: (p) => ({
      title: p.prayer ? `${s(p.who)} oró por ti y te envió un mensaje` : `Nuevo mensaje de ${s(p.who)}`,
      body: s(p.body),
    })
  ```

- [ ] **radio_prayer**

  ```ts
  radio_prayer: () => ({
      title: 'Tu petición salió como oración por radio',
      body: 'Alguien la envió para que más personas puedan orar contigo.',
    })
  ```

- [ ] **scheduled_spend_failed**

  ```ts
  scheduled_spend_failed: (p) => ({ title: 'Un regalo programado no se envió', body: s(p.body) })
  ```

- [ ] **weekly_review**

  ```ts
  weekly_review: (p) => ({ title: 'Tu semana en oración', body: s(p.body) })
  ```

- [ ] **testimony**

  ```ts
  testimony: (p) => ({ title: 'Una oración que hiciste fue contestada', body: `${s(p.who, 'Alguien')} contó lo que Dios hizo: "${s(p.excerpt)}"` })
  ```

- [ ] **church_verified**

  ```ts
  church_verified: (p) => ({
      title: `${s(p.church, 'Tu iglesia')} está verificada`,
      body: 'Tu insignia de pastor ahora aparece en las peticiones que publicas con tu nombre. Gracias por pastorear con nosotros.',
    })
  ```

- [ ] **church_declined**

  ```ts
  church_declined: (p) => ({ title: `Aún no pudimos verificar ${s(p.church, 'tu iglesia')}`, body: s(p.note) })
  ```

- [ ] **church_revoked**

  ```ts
  church_revoked: (p) => ({ title: `${s(p.church, 'Tu iglesia')} ya no está verificada`, body: s(p.note) })
  ```

- [ ] **crisis_flag**

  ```ts
  crisis_flag: () => ({
      title: 'Alguien podría estar en peligro',
      body: 'Una publicación o un mensaje menciona el suicidio o la autolesión. Abre la cola de moderación; está arriba de todo.',
    })
  ```

- [ ] **job_alert**

  ```ts
  job_alert: (p) => ({
      title: 'Hay tareas en segundo plano que fallan',
      body: `${p.count ? `${s(p.count, '1')} ${p.count === 1 ? 'tarea agotó' : 'tareas agotaron'} sus intentos. ` : ''}Fallan: ${s(p.tasks)}. Abre Administración → Tareas en segundo plano para reintentar o descartar.`,
    })
  ```

- [ ] **ledger_alert**

  ```ts
  ledger_alert: (p) => ({
      title: 'La revisión del registro de fichas encontró un problema',
      body: `${s(p.count, '1')} ${p.count === 1 ? 'problema' : 'problemas'} en el registro de fichas. Abre Administración → Fichas para ver los detalles.`,
    })
  ```

## 5. Website, legal pages and store listing

Read each one as a whole page.

- [ ] Website home: `/es` (the text is in `apps/server/src/modules/site/index.ts`, `es` block)
- [ ] Support: `/es/support`
- [ ] Privacy policy: `/es/privacy`, from `docs/legal/PRIVACY_POLICY_DRAFT.es.md`. A lawyer reviews the English first.
- [ ] Terms of use: `/es/terms`, from `docs/legal/TERMS_OF_USE_DRAFT.es.md`
- [ ] Account deletion page: `/es/account-deletion`
- [ ] Google Play release notes (es-419): `docs/store/WHATS_NEW.md`
- [ ] Store listing in Spanish, if it goes live: `docs/store/STORE_LISTING.md`
