# 📱 Last Survivor no Android (APK)

O jogo vai **inteiro dentro do APK** (feito com [Capacitor](https://capacitorjs.com)): abre deitado, em tela cheia,
sem barra do navegador, e joga **contra bots mesmo sem internet**.

## 🔁 Crossplay (navegador ↔ app)

Quem joga no navegador e quem joga no app entram **na mesma fila e na mesma partida**: os dois falam com o mesmo
servidor da Cloudflare. As contas, os amigos e as curtidas também são os mesmos.

Pra ninguém entrar numa partida com regras diferentes (ex.: APK antigo com armas antigas), existe a **versão do online**:

- `LS.NET_PROTO` em `js/config.js`
- `MIN_PROTO` em `server/src/worker.js`

**Mudou algo que afeta o online** (armas, mapa, mensagens de rede...)? Suba os dois números juntos (+1), faça o push e
rode `npx wrangler deploy` na pasta `server`. Quem estiver com a versão velha vê **"JOGO DESATUALIZADO"**: no app aparece
o botão pra baixar o APK novo; no navegador é só recarregar. Mudanças só visuais (menus, roupas, efeitos) não precisam disso.

## 📦 Baixar o APK

O **GitHub Actions** compila o APK sozinho a cada push:

- **main** → publica em **Releases**. Link fixo, sempre o mais novo:
  https://github.com/Duckix03/LastSurvivor/releases/latest/download/LastSurvivor.apk
- outras branches → o APK fica em **Actions → (o run) → Artifacts**

No celular: abra o link, baixe e instale (o Android pede pra permitir "instalar apps desconhecidos"). As próximas
versões instalam **por cima**, sem perder nada.

## 🔄 Atualização dentro do app

Quando sai versão nova, o app mostra **"Ei! Seu jogo está desatualizado."** e o botão **Atualizar** confere se o APK
novo já foi publicado em Releases e abre o link no navegador do celular, que baixa sozinho (`LS.AppUpdate` em `js/config.js`).
⚠️ O app **não** instala APK por conta própria: a permissão `REQUEST_INSTALL_PACKAGES` + código que baixa APK faz o
Google Play Protect marcar o jogo como **"App nocivo"** (padrão de vírus "dropper"). Não coloque de volta.

## 🛠️ Compilar no seu computador (opcional)

Precisa de Node 22, JDK 21 e Android Studio (ou o Android SDK).

```bash
npm install
npm run sync              # copia o jogo pra pasta android/
npx cap open android      # abre no Android Studio (Run ▶ no celular conectado)
# ou direto pelo terminal:
cd android && ./gradlew assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/app-release.apk`.

## 🔑 Chave de assinatura (antes da Play Store)

O repositório tem uma chave **de teste** (`android/app/teste.keystore`): serve pra instalar e atualizar o app.
Como ela é pública, **antes de publicar na Play Store** crie a sua:

```bash
keytool -genkeypair -v -keystore minha.keystore -alias lastsurvivor -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 minha.keystore   # copie o resultado
```

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o texto do `base64` |
| `ANDROID_KEYSTORE_PASSWORD` | a senha do keystore |
| `ANDROID_KEY_ALIAS` | `lastsurvivor` |
| `ANDROID_KEY_PASSWORD` | a senha da chave |

Guarde o arquivo `minha.keystore` e as senhas num lugar seguro. **Atenção:** um APK com a chave nova não instala por cima
de um com a chave de teste (é preciso desinstalar uma vez).

## 🧩 O que tem de diferente no app

- `js/app.js`: botão **voltar** do Android pausa a partida, fecha painéis e minimiza no menu; minimizar o app pausa
- botão e opção de **tela cheia** somem (o app já é tela cheia)
- `MainActivity.java`: modo imersivo (sem barras do sistema), tela não apaga na partida, usa a área do entalhe
- Three.js agora vem de `js/vendor/three.min.js` (antes era de CDN), então o app abre sem internet
- Ícone e splash: `assets/` (gere de novo com `npx @capacitor/assets generate --android`)
