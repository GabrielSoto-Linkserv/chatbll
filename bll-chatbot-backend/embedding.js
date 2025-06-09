// embedding.js
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let extractor = null; // Mantém o pipeline carregado na memória

function normalizeVector(vec) {
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map(val => val / norm);
}


// Função para gerar embeddings com OpenAI
async function getEmbeddings(texts) {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
        });
        return response.data.map(item => normalizeVector(item.embedding));

    } catch (error) {
        console.error("Erro ao gerar embeddings (OpenAI):", error);
        return null;
    }
}

// Função para gerar embeddings localmente com transformers.js
async function getEmbeddingsLocal(texts) {
    try {
        // Lazy load do pipeline
        if (!extractor) {
            const { pipeline } = await import('@xenova/transformers');
            extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        }

        const results = [];
        for (const text of texts) {
            const output = await extractor(text, {
            pooling: 'mean',
            normalize: true
            });

            // Verifica se o retorno é [[...]] ou diretamente [...]
            const vector = Array.isArray(output.data[0]) ? output.data[0] : output.data;
            results.push(vector);
        }

        return results;
    } catch (error) {
        console.error("Erro ao gerar embeddings (local):", error);
        return [];
    }
}

module.exports = {
    getEmbeddings,
    getEmbeddingsLocal
};
