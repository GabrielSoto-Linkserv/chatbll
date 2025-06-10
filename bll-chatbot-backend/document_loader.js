require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const {
    getEmbeddingsLocal, // substituto local ao OpenAI
} = require('./embedding');
const { addDocumentsToLance } = require('./lanceDb');
const {
    readTextFile,
    readMetadataFile,
    chunkTextByTokenLocal 
} = require('./dataProcessing');

async function runIngestion(directoryPath) {
    console.log("Iniciando o carregamento, embedding, chunking e armazenamento no LanceDB...");
    let successCount = 0;
    let failCount = 0;

    try {
        const files = await fs.readdir(directoryPath);
        const textFiles = files.filter(file => file.endsWith('_text_only.txt'));

        if (textFiles.length === 0) {
            console.warn("[AVISO] Nenhum arquivo _text_only.txt encontrado no diretório.");
            return;
        }

        for (const file of textFiles) {
            const baseName = path.basename(file, '_text_only.txt');
            const textFilePath = path.join(directoryPath, file);
            const metadataFilePath = path.join(directoryPath, `${baseName}_metadata.json`);

            try {
                const textContent = await readTextFile(textFilePath);
                const metadata = await readMetadataFile(metadataFilePath);

                if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
                    console.error(`[FALHA] Conteúdo do arquivo de texto vazio ou inválido: ${file}`);
                    failCount++;
                    continue;
                }

                console.log(`[DEBUG] Tipo do conteúdo do txt:`, typeof textContent);
                console.log(`[DEBUG] Início do conteúdo:`, textContent.slice(0, 100));

                const chunks = await chunkTextByTokenLocal(textContent, 250, 50);
                const embeddings = await getEmbeddingsLocal(chunks);

                console.log(">> Vetor exemplo (primeiros 5 valores):", embeddings[0]?.slice(0, 5));

                if (embeddings && embeddings.length === chunks.length) {
                    const chunk_ids = chunks.map((_, index) => `${baseName}_chunk_${index}`);
                    const chunk_metadatas = chunks.map(() => metadata);
                    console.log(">> Metadata exemplo:", chunk_metadatas[0]);

                    await addDocumentsToLance(chunk_ids, embeddings, chunk_metadatas, chunks);
                    console.log(`[SUCESSO] Processado e armazenado: ${file}`);
                    successCount++;
                } else {
                    console.error(`[FALHA] Erro ao gerar embeddings para ${file}`);
                    failCount++;
                }
            } catch (innerError) {
                console.error(`[ERRO] Falha ao processar ${file}:`, innerError);
                failCount++;
            }
        }

        console.log(`\nProcesso concluído.\n Sucesso: ${successCount}\n Falhas: ${failCount}`);
    } catch (outerError) {
        console.error("Erro ao ler diretório:", outerError);
        process.exit(1);
    }
}

const args = process.argv.slice(2);

if (args.length === 0) {
    console.error("Uso: npm run load -- <caminho_do_diretorio>");
    process.exit(1);
}

const targetDirectory = path.resolve(args[0]);
console.log("[DEBUG] Caminho resolvido:", targetDirectory);

if (!fsSync.existsSync(targetDirectory)) {
    console.error(`[ERRO] Diretório não encontrado: ${targetDirectory}`);
    process.exit(1);
}

runIngestion(targetDirectory).catch(err => {
    console.error("Erro fatal na ingestão:", err);
    process.exit(1);
});
