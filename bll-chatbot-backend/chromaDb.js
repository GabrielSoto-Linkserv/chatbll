const { ChromaClient } = require('chromadb');
const path = require('path');

const persistDirectory = path.resolve(__dirname, '../chromaDb');
const client = new ChromaClient({ path: persistDirectory });
const collectionName = 'rag_content';
let collection;

async function getChromaCollection() {
    if (!collection) {
        collection = await client.getOrCreateCollection(collectionName);
    }
    return collection;
}

async function addDocumentsToChroma(ids, embeddings, metadatas, documents) {
    const collection = await getChromaCollection();
    await collection.add(ids, embeddings, metadatas, documents);
    console.log('Dados adicionados ao ChromaDB.');
}

async function queryChroma(queryEmbedding, nResults = 3) {
    const collection = await getChromaCollection();
    const results = await collection.query(queryEmbedding, nResults);
    return results;
}

module.exports = { getChromaCollection, addDocumentsToChroma, queryChroma };