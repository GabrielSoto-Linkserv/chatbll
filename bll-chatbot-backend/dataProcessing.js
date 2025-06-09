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
        console.error(`Erro ao ler o arquivo ${filePath}:`, error);
        return null;
    }
}

async function readMetadataFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Erro ao ler o arquivo de metadados ${filePath}:`, error);
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
        chunks.push(encoding.decode(tokens.slice(i, end)));
        if (end === tokens.length) {
            break;
        }
        i = end - chunkOverlapTokens;
    }
    encoding.free();
    return chunks;
}



async function chunkTextByTokenLocal(text, maxTokens = 500, overlap = 50) {
    if (typeof text !== 'string') {
        throw new TypeError("Entrada para chunkTextByTokenLocal deve ser uma string");
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

    return chunks;
}

module.exports = { readTextFile, readMetadataFile, chunkTextByToken, chunkTextByTokenLocal};