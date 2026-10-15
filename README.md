# CritBox

MVP da Bioma Labs: um D20 em 3D para jogos de RPG, feito como web app (PWA) com TypeScript, three.js e Vite.

Decisões e estado do projeto: [docs/DECISAO_TECNICA.md](docs/DECISAO_TECNICA.md).

## Rodar localmente

```
npm install
npm test                 # testes do núcleo (sorteio, face final, histórico, feedback)
npm run dev              # abre em http://localhost:5173
npm run dev -- --host    # para abrir no celular, na mesma rede
```

## Publicação

Cada push em `main` roda os testes e publica o app no GitHub Pages
(configurar uma vez em Settings > Pages > Source: **GitHub Actions**).
