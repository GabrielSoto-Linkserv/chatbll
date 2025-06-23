require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const {
    getEmbeddingsInBatches,
    getEmbeddingsLocal,
} = require('./embedding');

const { addDocumentsToLance } = require('./lanceDb');
const {
    readTextFile,
    readMetadataFile,
    chunkTextByTokenLocal,
    chunkTextByToken,
} = require('./dataProcessing');

// Função principal
async function runIngestion(directoryPath, tableName, useOpenAI) {
    console.log("[INFO] Iniciando carregamento e armazenamento no LanceDB...");
    console.log(`[INFO] Fonte dos embeddings: ${useOpenAI ? "OpenAI (pago)" : "MiniLM local (gratuito)"}`);
    console.log(`[INFO] Tabela: ${tableName}`);

    let successCount = 0;
    let failCount = 0;

    try {
        const files = await fs.readdir(directoryPath);
        const textFiles = files.filter(file => file.endsWith('_text_only.txt'));

        if (textFiles.length === 0) {
            console.warn("[AVISO] Nenhum arquivo _text_only.txt encontrado.");
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
                    console.error(`[ERRO] Arquivo de texto inválido: ${file}`);
                    failCount++;
                    continue;
                }

                console.log(`[INFO] Inciando processo de chunking () para o arquivo: ${file}`);
                const chunks = useOpenAI
                    ? await chunkTextByToken(textContent, 250, 50, 'text-embedding-3-small')
                    : await chunkTextByTokenLocal(textContent, 250, 50);
                    
                console.log("[INFO] Processo de chunking finalizado para o arquivo:", file);

                const sanitizedChunks = chunks.filter(c => typeof c === 'string' && c.trim().length > 0).filter(c => c.split(/\s+/).length >= 3);;

                const embedder = useOpenAI ? getEmbeddingsInBatches : getEmbeddingsLocal;
                const embeddings = await embedder(sanitizedChunks);

                if (embeddings && embeddings.length === chunks.length) {
                    const chunk_ids = chunks.map((_, i) => `${baseName}_chunk_${i}`);
                    const chunk_metadatas = chunks.map(() => metadata);

                    await addDocumentsToLance(chunk_ids, embeddings, chunk_metadatas, chunks, tableName);
                    console.log(`[INFO] Armazenado com sucesso: ${file}`);
                    successCount++;
                } else {
                    console.error(`[ERRO] Falha ao gerar embeddings para ${file}`);
                    failCount++;
                }
            } catch (err) {
                console.error(`[ERRO] Processando ${file}:`, err);
                failCount++;
            }
        }

        console.log(`\n[RESUMO] Sucesso: ${successCount}, Falhas: ${failCount}`);
    } catch (err) {
        console.error("[ERRO] Erro ao ler diretório:", err);
        process.exit(1);
    }
}

// CLI: processa argumentos
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error("[ERRO] Uso: npm run load -- <caminho_diretorio> [nome_tabela] [--openai | --local]");
    process.exit(1);
}

const targetDirectory = path.resolve(args[0]);
const tableName = args[1] || 'rag_content';

if (!fsSync.existsSync(targetDirectory)) {
    console.error(`[ERRO] Diretório não encontrado: ${targetDirectory}`);
    process.exit(1);
}

const useOpenAI = args.includes('--openai');
runIngestion(targetDirectory, tableName, useOpenAI).catch(err => {
    console.error("[ERRO] Falha na ingestão:", err);
    process.exit(1);
});
