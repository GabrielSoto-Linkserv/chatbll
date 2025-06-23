const lancedb = require('@lancedb/lancedb');
const path = require('path');
const arrow = require('apache-arrow');
const { getEmbeddingsLocal } = require('./embedding');


const dbPath = path.join(__dirname, '../lancedb');
let db;

async function getDb() {
  if (!db) {
    db = await lancedb.connect(dbPath);
  }
  return db;
}

const tableCache = new Map();

async function getLanceTable(tableName = 'rag_content') {
  if (!tableCache.has(tableName)) {
    const db = await getDb();
    try {
      const openedTable = await db.openTable(tableName);
      tableCache.set(tableName, openedTable);
    } catch (e) {
      console.error(`[ERRO] Não foi possível abrir a tabela "${tableName}":`, e);
      return null;
    }
  }
  return tableCache.get(tableName);
}


async function addDocumentsToLance(ids, embeddings, metadatas, documents, tableName = 'rag_content') {
  const db = await getDb();

  const vectorDimension = embeddings[0]?.length;
  console.log(`[INFO] Dimensão do vetor: ${vectorDimension}, tabela: ${tableName}`);
  if (!vectorDimension || vectorDimension <= 0) {
    throw new Error("A dimensão do vetor não pôde ser determinada ou é inválida.");
  }

  const records = ids.map((id, i) => ({
    id,
    text: documents[i],
    vector: Array.from(embeddings[i]),
    metadata: JSON.stringify(metadatas[i]),
  }));

  // Construir o esquema
  const schema = new arrow.Schema([
    new arrow.Field('id', new arrow.Utf8()),
    new arrow.Field('text', new arrow.Utf8()),
    new arrow.Field(
      'vector',
      new arrow.FixedSizeList(
        vectorDimension,
        new arrow.Field('item', new arrow.Float32(), false)
      )
    ),
    new arrow.Field('metadata', new arrow.Utf8()),
  ]);

  let table;
  try {
    table = await db.openTable(tableName);
    await table.add(records);
    } catch (e) {
      if (e.message.includes("Table does not exist") || e.message.includes("not found")) {
        table = await db.createTable(tableName, records, {
        schema,
        index: { type: "vector", column: "vector", metric: "cosine" }
        });
      } else {
        console.error(`[ERRO] Falha ao abrir ou criar tabela "${tableName}":`, e);
        throw e;
      }
  }


  console.log('[INFO] Dados adicionados ao LanceDB com sucesso!');
}

async function queryLance(queryEmbedding, k = 3, similarityThreshold = 0.3, tableName = 'rag_content') {
  console.log(`[DEBUG] QueryEmbedding dims: ${queryEmbedding.length}, table: ${tableName}`);
  console.log("[DEBUG] Consulta - dimensão do vetor:", queryEmbedding.length);

  if (!Array.isArray(queryEmbedding)) {
    try {
      queryEmbedding = Array.from(queryEmbedding);
    } catch {
      throw new TypeError("[ERRO] queryEmbedding precisa ser um array ou iterable convertível.");
    }
  }

  const table = await getLanceTable(tableName);
  if (!table) {
    throw new Error('[ERRO] Tabela LanceDB não encontrada.');
  }

  try {
    const schema = await table.schema();
    const vectorField = schema.fields.find(f => f.name === 'vector');

    if (!vectorField || !vectorField.type.listSize) {
      throw new Error('[ERRO] A coluna "vector" não está definida corretamente no schema.');
    }

    const expectedDim = vectorField.type.listSize;

    if (queryEmbedding.length !== expectedDim) {
      throw new Error(`[ERRO] Dimensão do embedding incorreta. Esperado: ${expectedDim}, recebido: ${queryEmbedding.length}`);
    }

    const norm = l2Norm(queryEmbedding);
    console.log("[DEBUG] Norma do vetor da query:", norm.toFixed(6));
    console.log("[DEBUG] Vetor da query (primeiros 5 valores):", queryEmbedding.slice(0, 5));

    // Realiza a busca
    const rawResults = await table.search(queryEmbedding)
      .distanceType("cosine")
      .limit(k)
      .toArray();

    // Log de todos os resultados
    // for (const row of rawResults) {
    //   console.log(`[DEBUG] ID: ${row.id}, DIST: ${row._distance}`);
    // }

    // Converte distância para similaridade
    const resultsWithSimilarity = rawResults.map(r => ({
      ...r,
      similarity: 1 - r._distance,
    }));

    // Filtra por similaridade
    const filtered = resultsWithSimilarity.filter(r => r.similarity >= similarityThreshold);

    if (filtered.length === 0) {
      console.log(`[INFO] Nenhuma correspondência encontrada acima do threshold de similaridade (${similarityThreshold}).`);
    } else {
      console.log(`[INFO] Correspondências acima do threshold (${similarityThreshold}):`);
      for (const r of filtered) {
        const chunkText = r.text;
        console.log(`[INFO] ID: ${r.id}, SIM: ${r.similarity.toFixed(4)} (DIST: ${r._distance.toFixed(4)}), Chunk: "${chunkText}"`);
      }
    }

    return filtered;

  } catch (err) {
    console.error("[ERRO] Falha ao executar a consulta no LanceDB:", err);
    return [];
  }
}


function l2Norm(vec) {
  return Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
}

async function listarDocumentos() {
    try {
        const db = await lancedb.connect(dbPath);
        const table = await db.openTable("rag_content");

        console.log("[DEBUG] Schema da tabela:");
        console.log(table.schema);


        const um = await table.query().limit(1).toArray();
        console.log("[DEBUG] Um vetor salvo (dimensão):", um[0].vector.length);
        const vetor = Array.from(um[0].vector);
        console.log("[DEBUG] Norma do vetor salvo:", l2Norm(vetor));



        if (!table || typeof table.query !== 'function') {
            console.error("[ERRO] A tabela não foi carregada corretamente.");
            return;
        }

        const all = await table.query().limit(5).toArray();

        if (all.length === 0) {
            console.log("[INFO] Nenhum documento encontrado na base.");
        } else {
            console.log("[INFO] Documentos encontrados:");
            all.forEach((doc, idx) => {
                console.log(`[#${idx + 1}] id: ${doc.id}, texto: ${doc.text?.slice(0, 80)}...`);
            });
        }

        const vetorSalvo = Array.from(um[0].vector);
        const consultaEmbedding = await getEmbeddingsLocal(["licitações públicas"]);
        const vetorConsulta = consultaEmbedding[0];

        // Calcular similaridade (produto escalar se normalizados)
        function cosineSimilarity(a, b) {
            return a.reduce((sum, val, i) => sum + val * b[i], 0);
        }

        const similarity = cosineSimilarity(vetorSalvo, vetorConsulta);
        console.log("[DEBUG] Similaridade direta:", similarity.toFixed(6));


    } catch (err) {
        console.error("[ERRO] Falha ao listar documentos:", err);
    }
}



module.exports = {
  getLanceTable,
  addDocumentsToLance,
  queryLance,
  listarDocumentos,
};