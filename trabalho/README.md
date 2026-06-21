# Trabalho — visualizador do TCC

Renderiza o markdown do trabalho (`projeto-final/<arquivo>.md`) dentro da
identidade visual do WebNav, com **navegação por capítulos e subcapítulos** e
**resolução automática de figuras**. É um subdiretório autossuficiente — não
altera o `index.html`/`app.js` do WebNav principal.

## Como as figuras são resolvidas

Para cada marca `[FIGURA figura_NN: …]` no markdown:

- **PNG existe** em `figuras/output/png/figura_NN.png` → renderiza a imagem
  (clique para ampliar).
- **PNG não existe** → renderiza a própria marca inline (cartão tracejado
  amarelo com o texto `[FIGURA figura_NN: …]`).

Marcas sem número (`[FIGURA: …]`) são sempre mostradas inline. Os nomes seguem
sempre o padrão `figura_NUMERO.png`.

## Duas fontes (local ao vivo · GitHub Pages serverless)

O visualizador busca o conteúdo em cadeia de fallback (`trabalho.js` › `MD_SOURCES`):

| Ordem | Markdown | Figuras | Quando |
| --- | --- | --- | --- |
| 1 | `../../../projeto-final/20-06.md` | `../../../projeto-final/figuras/output/png/` | **Local**, servindo a raiz do TCC — edição ao vivo |
| 2 | `content/trabalho.md` | `figuras/` | **GitHub Pages** (`tcc.zurmely.com`), onde `projeto-final/` não existe |

A primeira fonte que responder vence. Localmente o `.md` é relido a cada
~1,5 s, então edições aparecem em tempo real (e PNGs recém-exportados trocam as
marcas por imagens sem recarregar).

> O arquivo de origem **nunca** é modificado. A pasta `content/` e os PNGs em
> `figuras/` são **cópias geradas** pelo script de sincronização.

## Rodar localmente (edição ao vivo)

Sirva a **raiz do TCC** (o `start-servers.sh` já faz isso na porta 4174):

```bash
# na raiz do TCC
python3 -m http.server 4174
```

Abra: <http://localhost:4174/trabalho-web/webnav-tcc/trabalho/>

## Publicar no GitHub Pages

Antes de commitar, regenere a cópia embutida:

```bash
# em trabalho-web/webnav-tcc/trabalho/
node sync-content.mjs            # usa 20-06.md
node sync-content.mjs 27-06.md   # ou outro arquivo datado
```

Isso atualiza `content/trabalho.md` e `figuras/figura_*.png`. Faça commit das
duas pastas. Em produção a página servirá essa cópia.

> Se o arquivo datado de trabalho mudar de nome, atualize **as duas** referências
> ao nome do `.md`: a 1ª entrada de `MD_SOURCES` em `trabalho.js` (caminho vivo)
> e o argumento/padrão do `sync-content.mjs`.

## Arquivos

```
trabalho/
├── index.html        # casca + CSS (identidade WebNav + estilos de leitura)
├── trabalho.js       # fetch vivo, parser, navegação, figuras, notas, live-reload
├── vendor/marked.min.js   # parser de markdown (vendorizado, sem CDN em runtime)
├── sync-content.mjs  # gera a cópia embutida (não edita a origem)
├── content/trabalho.md    # cópia gerada do markdown (para GitHub Pages)
└── figuras/figura_*.png   # cópia gerada dos PNGs (para GitHub Pages)
```
