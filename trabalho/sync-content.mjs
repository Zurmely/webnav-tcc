#!/usr/bin/env node
/* ============================================================================
   sync-content.mjs
   ----------------------------------------------------------------------------
   Gera a cópia EMBUTIDA do trabalho dentro do repo do WebNav, para que a
   visualização funcione serverless no GitHub Pages (tcc.zurmely.com), onde o
   diretório projeto-final/ NÃO existe.

   Copia (sem NUNCA alterar a origem):
     projeto-final/<MD>                       -> trabalho/content/trabalho.md
     projeto-final/figuras/output/png/*.png   -> trabalho/figuras/

   Em desenvolvimento local (servindo a raiz do TCC), o visualizador usa o
   caminho VIVO e ignora estas cópias — rode este script só antes de publicar.

   Uso:
     node sync-content.mjs            # usa o MD padrão (20-06.md)
     node sync-content.mjs 21-06.md   # usa outro arquivo datado
   ========================================================================== */

import { readdir, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// trabalho/ -> webnav-tcc/ -> trabalho-web/ -> raiz do TCC
const TCC_ROOT = path.resolve(__dirname, "..", "..", "..");

const MD_NAME = process.argv[2] || "20-06.md";
const SRC_MD = path.join(TCC_ROOT, "projeto-final", MD_NAME);
const SRC_PNG_DIR = path.join(TCC_ROOT, "projeto-final", "figuras", "output", "png");

const OUT_CONTENT = path.join(__dirname, "content");
const OUT_MD = path.join(OUT_CONTENT, "trabalho.md");
const OUT_FIG = path.join(__dirname, "figuras");

function rel(p) { return path.relative(TCC_ROOT, p); }

async function main() {
  if (!existsSync(SRC_MD)) {
    console.error(`✗ Markdown de origem não encontrado: ${rel(SRC_MD)}`);
    console.error(`  Passe o nome do arquivo: node sync-content.mjs <arquivo>.md`);
    process.exit(1);
  }

  // 1) markdown -> content/trabalho.md (com cabeçalho indicando que é gerado)
  await mkdir(OUT_CONTENT, { recursive: true });
  const md = await readFile(SRC_MD, "utf8");
  const banner =
    `<!-- GERADO por trabalho/sync-content.mjs a partir de projeto-final/${MD_NAME}. ` +
    `Não editar — edite o arquivo de origem e rode o script novamente. ` +
    `${new Date().toISOString()} -->\n`;
  await writeFile(OUT_MD, banner + md, "utf8");
  console.log(`✓ markdown  ${rel(SRC_MD)}  ->  trabalho/content/trabalho.md`);

  // 2) PNGs -> figuras/
  await mkdir(OUT_FIG, { recursive: true });
  let pngs = [];
  if (existsSync(SRC_PNG_DIR)) {
    pngs = (await readdir(SRC_PNG_DIR)).filter((f) => /^figura_\d+\.png$/i.test(f));
  }

  // limpa PNGs embutidos antigos para refletir exatamente o que foi exportado
  if (existsSync(OUT_FIG)) {
    const old = (await readdir(OUT_FIG)).filter((f) => /^figura_\d+\.png$/i.test(f));
    await Promise.all(old.map((f) => rm(path.join(OUT_FIG, f), { force: true })));
  }

  for (const f of pngs) {
    await copyFile(path.join(SRC_PNG_DIR, f), path.join(OUT_FIG, f));
  }
  console.log(`✓ figuras   ${pngs.length} PNG(s) exportado(s)  ->  trabalho/figuras/`);
  if (pngs.length) console.log(`            ${pngs.sort().join(", ")}`);
  else console.log(`            (nenhum PNG exportado ainda — as figuras aparecerão como marcas)`);

  console.log("\nConcluído. Faça commit de trabalho/content/ e trabalho/figuras/ para publicar.");
}

main().catch((err) => { console.error("Erro:", err); process.exit(1); });
