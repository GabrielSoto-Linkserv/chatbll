require('dotenv').config();
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { pipeline } = require('@xenova/transformers');
let reranker = null;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const maxOut = parseInt(process.env.MAX_OUTPUT_TOKEN, 10) || 500;

async function generateLLMResponse(query) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-nano",
            messages: [
                {
                    role: "system",
                    content: "Você é um assistente útil que responde de forma completa em no máximo 4 parágrafos curtos, com até 100 palavras cada, com base exclusivamente no contexto fornecido. Utilize o histórico da conversa, se relevante, para manter a coerência da interação, evite prolongar a resposta além do necessário."
                },
                {
                    role: "user",
                    content: query
                }
            ],
            temperature: 0.3,
            top_p: 1,
            max_output_tokens: maxOut,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        });

        return response.choices?.[0]?.message?.content || "Não consegui gerar uma resposta com base no contexto.";
    } catch (error) {
        console.error("Erro ao gerar resposta com OpenAI:", error);
        return "Houve um erro ao gerar a resposta.";
    }
}

async function generateLLMResponseGemini(query) {
    query = "Instrução: Você é um assistente útil que responde de forma completa em no máximo 4 parágrafos curtos, com até 100 palavras cada, com base exclusivamente no contexto fornecido. Utilize o histórico da conversa, se relevante, para manter a coerência da interação, evite prolongar a resposta além do necessário.\n" + query;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        const result = await model.generateContent(query);
        const response = await result.response;
        const text = response.text();

        return text || "Não consegui gerar uma resposta com base no contexto do Gemini.";
    } catch (error) {
        console.error("Erro ao gerar resposta com Google Gemini:", error);
        return "Houve um erro ao gerar a resposta com o Gemini.";
    }
}

async function callLLMWithFallback(query) {
    let response = null;
    try {
        console.log("Tentando gerar resposta com OpenAI...");
        response = await generateLLMResponse(query);
        if (response) {
            console.log("Resposta gerada com sucesso pela OpenAI.");
            return response;
        } else {
            console.warn("OpenAI não retornou conteúdo. Tentando Gemini como fallback...");
        }
    } catch (error) {
        console.error(`Erro na tentativa com OpenAI: ${error.message}. Tentando Gemini como fallback...`);
    }

    try {
        console.log("Tentando gerar resposta com Google Gemini...");
        response = await generateLLMResponseGemini(query);
        if (response) {
            console.log("Resposta gerada com sucesso pelo Google Gemini.");
            return response;
        } else {
            console.error("Ambos OpenAI e Gemini falharam em retornar conteúdo.");
            throw new Error("Nenhum modelo LLM conseguiu gerar uma resposta válida.");
        }
    } catch (error) {
        console.error(`Erro na tentativa com Google Gemini: ${error.message}.`);
        throw new Error("Nenhum modelo LLM conseguiu gerar uma resposta válida.");
    }
}

async function rerankChunks(query, chunks) {
  if (!reranker) {
    reranker = await pipeline('text-classification', 'Xenova/bge-reranker-base');
  }

  const rescored = await Promise.all(chunks.map(async (r) => {
    const input = `${query} [SEP] ${r.text}`;
    const result = await reranker(input, { topk: 1 });
    const rerankScore = result[0].score;
    return { ...r, rerankScore };
  }));

  return rescored.sort((a, b) => b.rerankScore - a.rerankScore);
}

module.exports = { 
    generateLLMResponse, 
    generateLLMResponseGemini,
    callLLMWithFallback,
    rerankChunks
};