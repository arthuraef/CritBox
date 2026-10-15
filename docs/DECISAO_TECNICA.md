# CritBox MVP: Decisão Técnica (revisão 2: web app)

Bioma Labs | pt-BR | Substitui a revisão 1 (Unity), que exigia builds nativos fora deste ambiente.

## 1. Decisão

**Web app (PWA)** com **TypeScript + three.js + Vite**. Roda no navegador de iOS e Android, é instalável na tela inicial e funciona offline. Lojas (Google Play e App Store) ficam como etapa opcional posterior, embrulhando o mesmo código com Capacitor.

## 2. Por que mudou

A revisão 1 recomendava Unity. O build de Unity para iOS e Android precisa do editor, de macOS/Xcode para iOS e de contas de loja, e nada disso existe no ambiente de trabalho. Um web app pode ser construído, testado e entregue sem essas dependências, e valida o que o MVP quer validar: experiência do D20, aleatoriedade confiável, histórico, skins e fluxo de desbloqueio.

## 3. Mudanças em relação ao documento de escopo

| Item do escopo | No web app |
|---|---|
| iOS e Android | Navegadores móveis (PWA). Apps de loja só via Capacitor, depois |
| Anúncio recompensado | AdMob não funciona na web. Em desenvolvimento, usa-se um módulo de teste com a mesma interface (`RewardedAdProvider`). O desbloqueio real exige Google Ad Manager (GPT) com conta aprovada, ou o AdMob após o empacotamento com Capacitor |
| Resposta tátil | `navigator.vibrate` funciona no Chrome/Android; **não existe no Safari/iOS**. No iOS o app segue sem vibração (fallback silencioso) |
| Som | Navegadores só liberam áudio após um gesto do usuário; o áudio é iniciado no primeiro toque |
| Armazenamento local | `localStorage`/IndexedDB, atrás de uma interface `Storage` |

Tudo o mais permanece como no documento: um D20, duas skins, toque e arrastar para rolar, resultados 1 e 20 especiais, histórico, splash, configurações, sem backend nem contas.

## 4. Arquitetura

O núcleo não depende de three.js nem do navegador, para ser testável isoladamente.

```
src/
  core/
    random.ts       RandomSource, fonte criptográfica, uniformInt (amostragem por rejeição, sem viés de módulo)
    d20.ts          geometria do icosaedro, numeração (opostas somam 21), orientação por face, faceUp()
    animation.ts    trajetória do lançamento como função pura do tempo; termina exatamente na orientação-alvo
    rollController.ts  máquina de estados idle/rolling; gera e guarda o resultado ANTES da animação
  render/
    atlas.ts        mapa UV das faces para o atlas de números (puro, testado)
    diceScene.ts    cena three.js, skin Scuffed Metal, raycast do toque
    (index.html + main.ts ligam entrada, núcleo e cena)
  main.ts           liga núcleo e renderização
```

Regras de projeto herdadas do documento:

1. O resultado é sorteado primeiro, por `uniformInt(1, 20)`, e guardado na rolagem atual.
2. A animação é uma função pura do tempo que termina exatamente na orientação que mostra a face sorteada. A orientação física final nunca é fonte de aleatoriedade.
3. Ao fim, `faceUp(orientação)` calcula a face superior e é comparada ao resultado; divergência é erro, não é exibida.
4. A intensidade do gesto não entra no sorteio. O gesto só dispara a rolagem.
5. Enquanto há rolagem em andamento, novos disparos são ignorados (sem resultados duplicados). Cada rolagem tem um identificador único e só pode ser concluída uma vez.
6. A animação usa uma fonte aleatória visual separada, que não toca o resultado.

## 5. Como a face final é garantida

Para a face de normal `n`, calcula-se a rotação de menor arco que leva `n` a `+Y` (para cima), combinada com um giro aleatório em torno de `Y` só para variar o aspecto. Na animação, um giro extra em torno de um eixo aleatório decai a zero junto com a interpolação, então em `t = 1` a orientação é exatamente a calculada. Isso é verificado em teste para os 20 valores.

## 6. Numeração

As faces são numeradas de 1 a 20 com faces opostas somando 21 (como em dados reais). O arranjo exato dos números vizinhos não segue um fabricante específico.

## 7. Testes (executados com o executor nativo do Node, sem dependências)

- Faixa 1..20, todos os valores aparecem, qui-quadrado (19 graus de liberdade) abaixo do valor crítico.
- Amostragem por rejeição: valores acima do limite são descartados (fonte determinística).
- Geometria: 12 vértices, 30 arestas, 20 faces, normais unitárias e opostas, opostas somam 21.
- Para cada n de 1 a 20: orientação alvo, animação em `t = 1` e `faceUp` coincidem, com giros aleatórios.
- Controlador: duplo disparo gera uma só rolagem; conclusão duplicada é ignorada; face divergente é rejeitada.

## 8. Limites desta revisão e riscos

1. **Camada three.js não executada no ambiente de trabalho**: o registro npm está bloqueado aqui (ENOTFOUND, mesmo via proxy), então three.js, Vite e `@types/three` não puderam ser instalados. O núcleo e o mapeamento UV foram testados (49 testes) e seus tipos conferidos; `diceScene.ts` e `main.ts` **não foram compilados nem abertos**. Rode `npm install`, `npm run typecheck` e `npm run dev` na sua máquina e confira: números legíveis e não espelhados, face de cima = número exibido, um único resultado por toque.
2. Háptico indisponível no iOS Safari.
3. Anúncio recompensado real depende de conta e aprovação (Ad Manager ou AdMob via Capacitor).
4. Sons e texturas das skins precisam ser criados ou licenciados.
5. Consentimento de anúncios e política de privacidade (LGPD) antes de publicar.
6. Desempenho em aparelhos fracos: uma luz principal, sem sombras em tempo real; medir em aparelho de entrada.

## 9. Etapas

| Etapa | Entrega |
|---|---|
| 1 | Prova de conceito do D20 3D |
| 2 | Geração de resultados e animação (com testes) |
| 3 | Interface e interações |
| 4 | Sons e resposta tátil |
| 5 | Histórico e persistência |
| 6 | Skins e anúncios |
| 7 | Testes e preparação para publicação |

Estado:
- Etapas 1 e 2 (D20 3D, sorteio, animação): concluídas e verificadas visualmente.
- Etapa 3 (interface) e etapa 5 (histórico e persistência): verificadas pelo usuário.
- Etapa 4 (sons e resposta tátil): lógica de eventos, padrões de vibração e configurações testadas (`core/feedback.ts`, `core/settings.ts`). Síntese de áudio (`audio/sound.ts`), vibração (`audio/haptics.ts`), tela de configurações e efeitos visuais de 1 e 20 escritos; **pendentes de verificação por audição e no aparelho**.
- Botão de skins: ainda não incluído (etapa 6).
- Etapas 6 e 7: não iniciadas.

Notas da etapa 4:
- `planFeedback` não recebe o resultado: som e vibração da rolagem não dependem dele. Os efeitos de 1 e 20 só são acionados depois de a face ser confirmada.
- Navegadores só liberam áudio após um gesto; o primeiro som pode faltar se o primeiro gesto for a própria rolagem (o toque na splash já libera).
- iOS/Safari não tem Vibration API: o interruptor aparece desativado com explicação.
- Os sons são sintetizados (Web Audio), sem arquivos; servem para validar o MVP e podem ser trocados por áudio produzido depois.
