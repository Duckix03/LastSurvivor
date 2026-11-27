# 🌐 Servidor online do Last Survivor

Servidor da partida online, feito pra rodar **de graça** na Cloudflare (Workers + Durable Objects).
O site continua no GitHub Pages; só a parte online fica na Cloudflare.

## Como funciona

1. Quem clica em **JOGAR** entra numa fila e fica **até 30 segundos procurando jogadores**.
2. Se achar 2 ou mais, abre uma partida: os jogadores reais + **bots completando as 31 vagas**.
   Cada jogador monta o mapa no próprio aparelho, então a partida só **começa quando todos terminam de carregar** (o servidor manda o `go`, no máximo 20 s de espera). Assim ninguém cai numa ilha sem bots porque o host dos bots demorou a carregar.
3. Se não achar ninguém, o jogo começa **contra bots**, como antes.

Na partida, o **servidor é a autoridade**:

- guarda a **vida** de todo mundo (editar o jogo no navegador não dá vida infinita);
- confere cada **tiro**: se a pessoa tem aquela arma, se não está atirando mais rápido do que a arma permite e se o alvo está no alcance. O **dano é calculado no servidor**;
- recusa **teleporte e velocidade impossível**;
- decide quem pegou cada **item** do chão, as mortes, a colocação e o **vencedor**;
- **anti-wallhack:** cada jogador só recebe a posição de quem ele poderia ver. O servidor confere a linha de visão
  (relevo, paredes, telhados e pedras do mapa, em `src/occluders.js`) umas 3 vezes por segundo pra cada par.
  Quem está bem escondido atrás de parede ou morro nem chega no navegador, então não tem ESP que mostre.
  Tiros só chegam pra quem está perto o bastante pra ouvir. A regra é generosa (na dúvida, aparece), pra ninguém
  ficar invisível por erro.

A IA dos bots roda no navegador de um dos jogadores (o "host"). Se ele sair, outro jogador assume.
Os comandos de trapaça do console (`give`, `god`, `tp`, `esp`...) ficam desligados no online.
O console fica escondido pros jogadores. Pra ligar: **perfil → ADMIN → Console de dev** (só o owner vê), ou abrir o jogo uma vez com `?dev` no link (`?dev=0` desliga). Depois abre com a tecla `'` ou `F2`.

**Atualizou o servidor (ex.: contas novas)?** Rode `npx wrangler deploy` de novo dentro da pasta `server`. Sem isso, o botão de criar conta dá erro.

**Mudou o mapa?** (terreno, casas, pedras ou `LS.MAP_SEED`) Rode `python tools/export-occluders.py . server/src/occluders.js`
pra atualizar as paredes que o servidor usa pra linha de visão.

## 👤 Contas

O servidor também guarda as **contas** (`src/accounts.js`): nome único com senha, perfil, estatísticas, curtidas e selos.

- O **nome** de uma conta é só dela. Na partida online, quem não tem conta e tenta usar o nome de uma conta entra como `Convidado1234`.
- A senha é guardada com hash (PBKDF2 + sal), nunca em texto.
- **Selos** (Owner, Dev, Criador de Conteúdo, Verificado) só podem ser dados pelo **owner**, no botão **ADMIN** do perfil.
- Não tem e-mail: quem esquecer a senha perde a conta (dá pra adicionar depois).

### Virar owner (uma vez só)

1. Crie a **chave de admin** (uma senha grande que só você sabe). Dentro da pasta `server`:

   ```bash
   npx wrangler secret put ADMIN_KEY
   ```

   Ele pede pra você digitar a chave (mínimo 12 caracteres). Ela fica guardada só na Cloudflare, não no GitHub.
2. Publique de novo: `npx wrangler deploy` (veja abaixo).
3. No jogo: abra o **perfil** (clique no seu nome no canto de cima), **CRIAR CONTA**, depois **CONTA** → **Chave de admin** → cole a chave → **USAR**.
   Você ganha Owner, Dev e Verificado, e aparece o botão **ADMIN** no perfil pra dar selos pelo ID de cada um.

## Publicar (uma vez só, uns 5 minutos)

1. Crie uma conta grátis em **https://dash.cloudflare.com/sign-up** (não pede cartão).
2. Instale o **Node.js** (versão LTS) em **https://nodejs.org**.
3. Abra o terminal **dentro da pasta `server`** deste repositório e rode:

   ```bash
   npx wrangler login
   npx wrangler deploy
   ```

   O primeiro comando abre o navegador pra você autorizar. O segundo publica e mostra um endereço parecido com
   `https://lastsurvivor.lastsurvivorbr.workers.dev`.
4. Abra esse endereço no navegador: tem que aparecer **"Last Survivor server ok"**.
5. Em **`js/config.js`**, coloque o endereço:

   ```js
   LS.NET_URL = 'https://lastsurvivor.lastsurvivorbr.workers.dev'; // já configurado
   ```

   Faça commit e espere o GitHub Pages atualizar. Pronto: o **JOGAR** já procura jogadores de verdade.

**Pra testar sozinho:** abra o jogo em duas janelas (ou no PC e no celular) e clique em **JOGAR** nas duas, com menos de 30 s de diferença.

## Testar no seu computador (opcional)

```bash
cd server
npx wrangler dev
```

Depois, no console do jogo (tecla `'`; no localhost ele sempre abre), digite `LS.NET_URL = 'http://127.0.0.1:8787'` e clique em **JOGAR**.

## Limites do plano grátis

- **100.000 requisições por dia.** Cada mensagem que chega do jogador conta como uma fração de requisição, e o jogo manda até 20 posições por segundo. Dá pra muitas partidas por dia entre amigos.
- Se o jogo crescer muito, a Cloudflare tem o plano pago (Workers Paid).

## O que ainda dá pra trapacear (e como melhorar depois)

- **Wallhack/ESP:** resolvido em boa parte (veja acima). Sobra: quem está perto (até 18 m) ou visível há menos de 1 s ainda chega, e o **host** recebe todo mundo, porque os bots rodam no navegador dele. Um host trapaceiro ainda veria todos.
- **Inventário e munição** ainda são controlados pelo navegador. O servidor já confere a arma em uso e o ritmo de tiro, mas não conta as balas.
- **Mira automática** não tem como o servidor impedir totalmente. Dá pra detectar padrões suspeitos depois.

## 🔵 Login com Google (sincronização entre aparelhos)

O botão **Entrar com Google** (Configurações → Conta) fica como "EM BREVE" até você colocar o ID do cliente do Google.
É grátis e só precisa fazer uma vez:

1. Entre em <https://console.cloud.google.com/> e crie um projeto (ex.: `Last Survivor`).
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**, nome do app `Last Survivor`, seu e-mail. Publique (não precisa de revisão, só pede nome/e-mail).
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - **Origens JavaScript autorizadas**: `https://lastsurvivor.pages.dev` (e, se quiser testar no PC, `http://localhost:8765`)
   - Não precisa de "URI de redirecionamento".
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e coloque nos dois lugares:
   - `js/config.js` → `LS.GOOGLE_CLIENT_ID = '...'`
   - `server/wrangler.toml` → `GOOGLE_CLIENT_ID = "..."`
5. `npx wrangler deploy` na pasta `server` e faça o push do site.

Como funciona:
- **Navegador**: botão oficial do Google. O servidor confere a assinatura do token com as chaves públicas do Google
  e só aceita se for pro seu ID de cliente. Primeira vez = cria a conta (sem senha); depois = entra nela.
- **Logado** (com nome e senha): o botão vira **Ligar Google** e liga o Google à conta que você já tem.
- **App (APK)**: o Google não deixa logar dentro do app, então o app abre o jogo no navegador do celular
  (`?glogin=app`), a pessoa entra com o Google lá e toca em **VOLTAR PRO JOGO**. O navegador devolve pro app
  um código de uso único (vale 3 minutos), e o app troca o código pela sessão. Nada de senha passa pela URL.
- Conta que só entra pelo Google pode **criar uma senha** depois (Configurações → Conta).

## 💎 Diamantes e codiguins

- **Diamantes** ficam guardados só no servidor (`a.diamonds`). Compram as **fantasias completas** na loja
  (preços em `DIAMOND_PRICES`, iguais aos `dprice` de `js/cosmetics.js`).
- Como ganhar: **codiguins** e a **recompensa diária** (+10 a cada 20 h, em Configurações → Conta ou no botão DIÁRIO da loja).
- **Itens exclusivos** (raridade CÓDIGO) só entram na conta por codiguin. O servidor não aceita que o jogo
  "se dê" itens de diamante ou exclusivos pelo salvamento do perfil (lista `PROTECTED`).

### Criar um codiguin (owner)
Perfil → **ADMIN** → aba **GERADOR DE CODIGUIN**:
1. **Selecionar item para codiguinho** (opcional): escolhe no painel com as fotos 3D (fantasias, exclusivos, chapéus...).
2. Marque **Dar moedas ou diamantes?** e escolha **Moedas**, **Diamantes** ou **Os 2** com as quantidades.
3. Código (vazio = aleatório, tipo `LSK2B79NJLLE`), **usos** (0 = sem limite) e **validade** em dias (0 = sempre).
4. **Gerar codiguin** → aparece o código pra copiar. A lista embaixo mostra usos, validade e deixa apagar.

Cada conta resgata cada código **uma vez** (Configurações → Conta ou botão **CODIGUIN** na loja).
**Adicionar item exclusivo novo:** coloque em `EXCLUSIVE` (js/cosmetics.js), desenhe em `js/character.js`/`js/skin.js`
e adicione o id em `EXCLUSIVE` no `server/src/accounts.js` (fantasia: `EXCLUSIVE_COSTUMES` com as peças).

## 🏝️ Salas personalizadas (só amigos)

- Rotas novas: `POST /room/new` (cria, precisa de conta), `POST /room/list` (salas abertas dos amigos) e `/ws/room/<ID de 7 números>`.
- Dois Durable Objects novos: `Room` (uma por sala: lobby + partida) e `RoomDir` (a lista de salas abertas). Já estão no `wrangler.toml` (migração `v3`), então é só rodar `npx wrangler deploy` de novo.
- Só entra quem é **amigo do dono** da sala (e com a senha, se tiver). Espectadores recebem a posição de todo mundo; jogadores continuam com o anti-wallhack.
- A autoridade é a mesma da partida normal (vida, tiros, dano), sem bots e sem fogo amigo. Não dá kill, moedas nem XP.
- Teste local: `npx wrangler dev --var SHOP_SECS:60` deixa a loja com 60 s (padrão 15 s).

## 👥 Party e esquadrões (v97)

- O Battle Royale online agora é em **esquadrões de 4** (32 vagas = 8 times). Cada party fica no mesmo time e os bots completam; sem fogo amigo; vence o último time de pé.
- Rotas novas: `/ws/party` (PartyHub, um só no mundo: convites, líder, modo, "vamos!") e `/ws/pduel/<id>` (PartyDuel: a dupla da party contra 2 bots no galpão).
- Dois Durable Objects novos já estão no `wrangler.toml` (migração `v4`). O PartyHub usa a hibernação de WebSocket (conexão aberta sem gastar a cota do plano grátis).
- `MIN_PROTO` subiu pra **2**: rode `npx wrangler deploy` e publique o site **juntos** (versões antigas do jogo pedem pra atualizar).

## 🎮 Solo / Duo / Squad, configurações na conta (v101)

- `/ws/find?s=1|2|4`: uma fila (Matchmaker) por tamanho de time. Sem `s` = Squad (versões antigas continuam funcionando).
- A partida manda `size` (tamanho do time) e `caps: ['hits']` no `start`: o jogo novo junta os acertos do mesmo tiro (escopeta) num pacote `hits`.
- Party: o limite segue o modo (Solo 1, Duo 2, Squad 4, Duelo 2). Trocar pra um modo menor pede pro líder escolher quem fica.
- `POST /api/settings {settings}`: configurações do jogador na conta (sensibilidade, som, HUD do celular). Gráfico fica em cada aparelho.
- Sem migração nova: é só `npx wrangler deploy`.
