# 🦴 Animações externas

Coloque aqui arquivos **.glb**, **.gltf**, **.fbx** ou **.json** (convertido pelo jogo) com animações de personagem humanoide
(Mixamo, Quaternius, Kenney…). O jogo converte a animação para os 15 ossos do boneco de blocos.

## Ossos do personagem (15, estilo R15)

```
Hips (tronco de baixo)
 ├─ Spine (tronco de cima, gira na cintura)
 │   ├─ Head (cabeça)
 │   ├─ RightArm → RightForeArm → RightHand (segura a arma)
 │   └─ LeftArm → LeftForeArm → LeftHand
 ├─ RightUpLeg → RightLeg → RightFoot
 └─ LeftUpLeg → LeftLeg → LeftFoot
```

Dedos, clavículas, pescoço e ossos extras do arquivo são ignorados.
Os nomes são os mesmos do Mixamo, mas o jogo também reconhece outros padrões
(`UpperArm.R`, `thigh_l`, `Bip01 R UpperArm`, `pelvis`, `chest`...).

## Testar

- **Arraste** o arquivo para a janela do jogo: ele carrega e toca no seu personagem.
- Ou use o console (tecla `'` ou F2):
  - `anim load anims/danca.glb danca` carrega e toca
  - `anim play danca` · `anim play danca once` (uma vez só) · `anim play danca upper` (só da cintura pra cima)
  - `anim stop` para · `anim list` lista · `anim bones` mostra o esqueleto · `anim save` baixa o .json

## Já incluídas

`locomocao.json`: andar pra frente, pra trás e pros lados (`walk_f`, `walk_b`, `walk_l`, `walk_r`), correr (`run_f` e `dash_run_f`) e parado (`stand_idle`). Animações feitas pelo Duckix03.

**Corrida oficial:** a `dash_run_f` toca sozinha quando alguém corre (você e os bots). Sem arma é a animação inteira;
com arma, as pernas e parte do tronco vêm da `dash_run_f` e os braços seguram a arma atravessada no peito
(ajuste em `LS.Anim.CARRY`, no `js/animlib.js`). Mirar, recarregar ou curar correndo volta os braços pro normal.

## Emotes

`emotes.json`: emotes da roda de emotes (segure **B** no PC, botão de carinha no celular, ícone no lobby).
- `emote_risada`: risada (Mixamo "LOL").

Pra adicionar um emote: carregue o .fbx no jogo (arraste na janela), use `anim save emote_nome` e junte o clipe no `emotes.json`;
depois coloque na lista `LIST` do `js/emotes.js` (id de 1 a 15, nome, clip e quantas vezes repete).

## Salvar só o movimento (.json)

Se o seu .fbx/.glb vem com o modelo 3D de algum personagem (de outro jogo, por exemplo), **não suba o arquivo original**.
Carregue no jogo e use `anim save` (ou `anim save nome1 nome2`) no console: baixa um `animacoes.json` só com o movimento
já convertido para os 15 ossos, bem menor e sem nenhum modelo junto. Coloque esse .json aqui em `anims/`.

## Deixar fixa no jogo

Em `js/animlib.js`, adicione na lista `LIBRARY`:

```js
LIBRARY: [
  { name: 'danca', url: 'anims/danca.glb' },
  { name: 'vitoria', url: 'anims/vitoria.fbx', loop: false },
],
```

E no código: `LS.Anim.play(model, 'danca')`.

## Dicas

- No Mixamo, baixe em **FBX Binary**, com **"In Place"** marcado (sem andar pelo mapa).
- Antes de usar algo do GitHub, veja a licença: **CC0** ou **MIT** pode usar tranquilo.
- Cotovelos, punhos, joelhos e tornozelos dobram com a animação; as animações do código mantêm essas juntas retas.
