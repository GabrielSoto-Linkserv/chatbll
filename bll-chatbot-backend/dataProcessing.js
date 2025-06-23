const fs = require('fs').promises;
const path = require('path');
const { encoding_for_model } = require('tiktoken');
const { pipeline } = require('@xenova/transformers');
let tokenizer = null;

async function readTextFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
    } catch (error) {
        console.error(`[ERRO] Erro ao ler o arquivo ${filePath}:`, error);
        return null;
    }
}

async function readMetadataFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`[ERRO] Erro ao ler o arquivo de metadados ${filePath}:`, error);
        return {};
    }
}

function chunkTextByToken(text, maxTokens = 500, chunkOverlapTokens = 50, modelName = 'text-embedding-3-small') {
    const encoding = encoding_for_model(modelName);
    const tokens = encoding.encode(text);
    const chunks = [];
    let i = 0;

    while (i < tokens.length) {
        const end = Math.min(i + maxTokens, tokens.length);
        const tokenSlice = tokens.slice(i, end);
        const decodedBytes = encoding.decode(tokenSlice);
        const chunkText = new TextDecoder("utf-8").decode(decodedBytes);
        chunks.push(chunkText);

        if (end === tokens.length) break;
        i = Math.max(0, end - chunkOverlapTokens);
    }

    encoding.free();

    console.log("[DEBUG] Total chunks:", chunks.length);
    console.log("[DEBUG] Primeiro chunk:", chunks[0]?.slice(0, 100));
    return chunks;
}

async function chunkTextByTokenLocal(text, maxTokens = 500, overlap = 50) {
    if (typeof text !== 'string') {
        throw new TypeError("[ERRO] Entrada para chunkTextByTokenLocal deve ser uma string");
    }

    if (!tokenizer) {
        const pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        tokenizer = pipelineInstance.tokenizer;
    }

    const tokenIds = tokenizer.encode(text);

    const chunks = [];
    let start = 0;

    while (start < tokenIds.length) {
        const end = Math.min(start + maxTokens, tokenIds.length);
        const chunkTokenIds = tokenIds.slice(start, end);

        const chunkText = tokenizer.decode(chunkTokenIds, { skip_special_tokens: true });
        chunks.push(chunkText);

        start += maxTokens - overlap;
    }
    
    console.log("[DEBUG] Total chunks:", chunks.length);
    console.log("[DEBUG] Primeiro chunk:", chunks[0]?.slice(0, 100));

    return chunks;
}

module.exports = {
    readTextFile,
    readMetadataFile,
    chunkTextByToken,
    chunkTextByTokenLocal
};
