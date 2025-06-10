require('dotenv').config();
const { getEmbeddingsLocal } = require('./embedding');
const { queryLance , listarDocumentos, getLanceTable } = require('./lanceDb');

(async () => {
    await listarDocumentos();

    const consulta = "Sanções Administrativas";
    console.log("[INFO] Gerando embedding local para a consulta...");
    const results = await getEmbeddingsLocal([consulta]);

    if (!Array.isArray(results)) {
        console.error("[FALHA] A função getEmbeddingsLocal não retornou um array válido.");
        process.exit(1);
    }

    const consultaEmbedding = Array.from(results[0]);
    const norm = Math.sqrt(consultaEmbedding.reduce((sum, x) => sum + x * x, 0));
    console.log("[DEBUG] Norma do embedding:", norm.toFixed(6));
    console.log("[DEBUG] Embedding (5 primeiros valores):", consultaEmbedding.slice(0, 5));

    const matches = await queryLance(consultaEmbedding, 20, 0.1);

    if (!matches.length) {
    console.log("[INFO] Nenhuma correspondência encontrada acima do threshold de similaridade.");
    } else {
    matches.forEach((m, i) => {
        console.log(`--- Resultado ${i + 1} ---`);
        console.log("Texto:", m.text);
        console.log("Similaridade:", m.similarity.toFixed(4));
        console.log("Metadata:", m.metadata);
    });
    }


    // Teste direto com vetor de documento já salvo
    const table = await getLanceTable();
    const docs = await table.query().limit(1).toArray();
    const docVectorRaw = docs[0].vector;
    const docVector = Array.from(docVectorRaw); // converter para array normal
    console.log("[TESTE] Consulta com vetor real salvo:");
    const directMatch = await queryLance(docVector, 5);
    console.log(directMatch.map(r => r.text));
})();
