require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { getEmbeddings, getEmbeddingsLocal } = require('./embedding');
const { queryLance } = require('./lanceDb');   
const { callLLMWithFallback, generateLLMResponseGemini } = require('./llm'); 
const { encoding_for_model } = require('tiktoken');
const mysql = require('mysql2/promise');
const enc = encoding_for_model('gpt-4');
const app = express();
const port = 5000;
const maxInput = parseInt(process.env.MAX_INPUT_TOKENS, 10) || 8000;
const maxMsg = parseInt(process.env.MAX_MSG_TOKENS, 10) || 300;
const maxQst = parseInt(process.env.MAX_QUESTIONS, 10) || 5;

app.use(cors());
app.use(express.json());

// Setup SQLite database
const db = new sqlite3.Database('./chatbot_db.sqlite3', (err) => {
  if (err) {
    console.error('Erro ao criar o banco:', err);
  } else {
    console.log('Conexão estabelecida com sucesso com banco de dados.');
  }
});

// Setup Remote MySQL
// const pool = mysql.createPool({
//   host: process.env.DB_SERVER,
//   user: process.env.DB_USER,
//   password: process.env.DB_SECRET,
//   database: process.env.DB_DATABASE,
//   port: process.env.DB_PORT || 3306,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

// pool.getConnection()
//   .then(connection => {
//     console.log('Conexão estabelecida com sucesso com banco de dados MySQL.');
//     connection.release();
//   })
//   .catch(err => {
//     console.error('Erro ao conectar ao banco de dados MySQL:', err);
//     process.exit(1);
//   });


// Create users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      department TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      question_count INTEGER DEFAULT 0,
      last_reset DATETIME,
      flag BOOL DEFAULT 0
  )
  `);
db.run(`
  CREATE TABLE IF NOT EXISTS session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL, -- 'user' or 'model'
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

function countTokens(text) {
  return enc.encode(text).length;
}

app.post('/chat-history', async (req, res) => {
    const { sessionId } = req.body;
    console.log("TESTE BACKEND:",req.body)

    if (!sessionId) {
      return res.status(400).json({ error: 'Erro ao recuperar o ID de sessão.' });
    }

    console.log(sessionId)

    db.all(
      'SELECT role, content, timestamp FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId],
      (err, rows) => {
          if (err) {
              console.error('Erro ao carregar o histórico da conversa:', err);
              return res.status(500).json({ error: 'Erro ao carregar o histórico da conversa.' });
          }
          res.json(rows);
      }
    );

    // try{
    //   const [rows] = await pool.execute(
    //    'SELECT role, content, timestamp FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC',
    //    [sessionId]
    //  );
    //  res.json(rows);
    // } catch(err){
    //   console.error('Erro ao carregar o histórico da conversa:', err);
    //   return res.status(500).json({ error: 'Erro ao carregar o histórico da conversa.' });
    // }
});

app.post('/user-sessions', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Erro ao recuperar ID do usuário.' });
    }

    const query = `
        SELECT sm.session_id,
               MIN(sm.timestamp) as created_at,
               (SELECT content FROM session_messages
                WHERE session_id = sm.session_id AND role = 'user'
                ORDER BY timestamp ASC LIMIT 1) AS title
        FROM session_messages sm
        WHERE sm.user_id = ?
        GROUP BY sm.session_id
        ORDER BY created_at DESC
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Failed to retrieve sessions:', err);
            return res.status(500).json({ error: 'Erro ao recuperar as sessões existentes do usuário.' });
        }

        res.json(rows);
    });

  // try {
  //   const [rows] = await pool.execute(query, [userId]);
  //   res.json(rows);
  // } catch (err) {
  //   console.error('Erro ao recuperar as sessões existentes do usuário:', err);
  //   return res.status(500).json({ error: 'Erro ao recuperar as sessões existentes do usuário.' });
  // }
    
});

async function handleRAGQuery(query, sessionId) {
    const queryEmbedding = await getEmbeddingsLocal([query]);
    if (!queryEmbedding) {
        return "Falha ao gerar embedding para a pergunta.";
    }

    const matches = await queryLance(queryEmbedding[0], 3, 0.4);

    if (!matches.length) {
        return "Nenhum resultado relevante encontrado na base de conhecimento.";
    }

    const context = matches.map(r => r.text).join("\n\n");

    let formattedHistory = "";
    const HISTORY_LIMIT = 6;
    if (sessionId) {
        const historyRows = await new Promise((resolve, reject) => {
            db.all(
                'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
                [sessionId, HISTORY_LIMIT],
                (err, rows) => {
                    if (err) {
                        console.error('Erro ao buscar histórico:', err);
                        reject(err);
                        return;
                    }
                    resolve(rows);
                }
            );
        });
        formattedHistory = historyRows.reverse().map(row => `${row.role}: ${row.content}`).join('\n');

      // try {
      //   const [historyRows] = await pool.execute(
      //     'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
      //     [sessionId, HISTORY_LIMIT]
      //   );
      //   formattedHistory = historyRows.reverse().map(row => `${row.role}: ${row.content}`).join('\n');
      // } catch (err) {
      //   console.error('Erro ao buscar histórico no RAG query:', err);
      // }
    }

    const promptForGeminiRAG = [
        "CONTEXTO:",
        "\"\"\"",
        context,
        "\"\"\"",
        "HISTÓRICO DA CONVERSA:",
        "\"\"\"",
        formattedHistory,
        "\"\"\"",
        `Pergunta:${query}`,
        "Resposta:",
    ].join("\n").trim();

    if ((countTokens(promptForGeminiRAG) + countTokens(query)) > maxInput){
        console.log(`Tokens de prompt: ${countTokens(promptForGeminiRAG)} | Tokens da query:${countTokens(query)}`)
        console.log("A soma total do Input ultrapassa o limite de tokens da janela de contexto do modelo");
    }

    return await generateLLMResponseGemini(promptForGeminiRAG);
    // return await callLLMWithFallback(promptForGeminiRAG);
}


app.post('/chat', async (req, res) => {
    const { userId, message: userMessage, sessionId: clientSessionId } = req.body;
    let currentSessionId = clientSessionId;

    if (!userId || !userMessage) {
        return res.status(400).json({ error: 'Falha ao recuperar userId E message.' });
    }

  // try {
  //   const [rows] = await pool.execute('SELECT question_count FROM users WHERE id = ?', [userId]);
  //   const userRow = rows[0];

  //   if (userRow?.question_count >= maxQst) {
  //     return res.status(403).json({ error: 'Limite de perguntas atingido.' });
  //   }

  //   if (!currentSessionId) {
  //     currentSessionId = uuidv4();
  //   }
  //   if (countTokens(userMessage) > MAX_MSG_TOKENS) {
  //     return res.status(400).json({ error: "A mensagem enviada ultrapassa o tamanho limite permitido, reescreva a mensagem com um tamanho menor." });
  //   }

  //   const botResponse = await handleRAGQuery(userMessage, currentSessionId);
  //   const responseTokenCount = countTokens(botResponse);
  //   console.log(`[AVISO] Resposta do modelo em tokens: ${responseTokenCount}`);

  //   // Salvar a mensagem do usuário
  //   await pool.execute(
  //     `INSERT INTO session_messages (session_id, user_id, role, content) VALUES (?, ?, ?, ?)`,
  //     [currentSessionId, userId, 'user', userMessage]
  //   );

  //   // Salvar a resposta do bot
  //   await pool.execute(
  //     `INSERT INTO session_messages (session_id, user_id, role, content) VALUES (?, ?, ?, ?)`,
  //     [currentSessionId, userId, 'model', botResponse]
  //   );

  //   // Atualizar o contador do usuário
  //   await pool.execute(
  //     'UPDATE users SET question_count = question_count + 1 WHERE id = ?',
  //     [userId]
  //   );

  //   res.json({ response: botResponse, sessionId: currentSessionId });

  // } catch (error) {
  //   console.error('Erro ao processar mensagem no chat:', error);
  //   res.status(500).json({ error: 'Falha ao gerar resposta.' });
  // }

    // Passo 1: Verifica se o usuário atingiu o limite
    db.get('SELECT question_count FROM users WHERE id = ?', [userId], async (err, row) => {
        if (err) {
            console.error('Erro ao buscar contador:', err);
            return res.status(500).json({ error: 'Erro interno ao verificar limite.' });
        }

        if (row?.question_count >= maxQst) {
            return res.status(403).json({ error: `Limite de perguntas atingido. (${limit} perguntas diárias)` });
        }

        try {
            if (!currentSessionId) {
                currentSessionId = uuidv4();
            }
            if(countTokens(userMessage) > maxMsg){
              return res.status(400).json({error: "A mensagem enviada ultrapassa o tamanho limite permitido, reescreva a mensagem com um tamanho menor."})
            }
            const botResponse = await handleRAGQuery(userMessage, currentSessionId);
            const responseTokenCount = countTokens(botResponse);
            console.log(`[AVISO] Resposta do modelo em tokens: ${responseTokenCount}`);


            // Salvar a mensagem do usuário
            db.run(
                `INSERT INTO session_messages (session_id, user_id, role, content) VALUES (?, ?, ?, ?)`,
                [currentSessionId, userId, 'user', userMessage],
                (err) => {
                    if (err) {
                        console.error('Erro ao salvar mensagem do usuário:', err);
                    }
                }
            );

            // Salvar a resposta do bot
            db.run(
                `INSERT INTO session_messages (session_id, user_id, role, content) VALUES (?, ?, ?, ?)`,
                [currentSessionId, userId, 'model', botResponse],
                (err) => {
                    if (err) {
                        console.error('Erro ao salvar resposta do bot:', err);
                    }
                }
            );

            // Atualizar o contador do usuário
            db.run(
                'UPDATE users SET question_count = question_count + 1 WHERE id = ?',
                [userId],
                (err) => {
                    if (err) {
                        console.error('Erro ao incrementar contador:', err);
                    }
                }
            );

            res.json({ response: botResponse, sessionId: currentSessionId });

        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            res.status(500).json({ error: 'Falha ao gerar resposta.' });
        }
    });
});


// Registration route
app.post('/register', async (req, res) => {
  const { firstName, lastName, department, email, password } = req.body;

  if (!firstName || !lastName || !department || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios, preencher corretamente.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (firstName, lastName, department, email, password)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run([firstName, lastName, department, email, hashedPassword], function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          res.status(400).json({ error: 'Email já registrado.' });
        } else {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Falha ao registrar.' });
        }
      } else {
        res.status(200).json({ message: 'Registrado com sucesso.' });
      }
    });

    stmt.finalize();
  } catch (error) {
    console.error('Hashing or DB error:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Login route
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.get(query, [email], async (err, user) => {
    if (err) {
      console.error('Erro ao acessar o banco de dados para login:', err);
      return res.status(500).json({ error: 'Erro no servidor.' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }

    try {
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Email ou senha incorretos.' });
      }

      // On success, return user info (excluding password)
      const { id, firstName, lastName, department, email } = user;
      res.json({ id, firstName, lastName, department, email });

    } catch (error) {
      console.error('Error comparing password:', error);
      res.status(500).json({ error: 'Erro interno ao realizar o login.' });
    }
  });
});

// Atualizações CRON
cron.schedule('0 0 * * *', () => {
  console.log('Executando reset diário dos contadores de perguntas...');
  
  const now = new Date().toISOString();
  db.run(
    `UPDATE users SET question_count = 0, last_reset = ?`,
    [now],
    (err) => {
      if (err) {
        console.error('Erro ao resetar limites de perguntas:', err);
      } else {
        console.log('Limites de perguntas resetados com sucesso.');
      }
    }
  );
});

// Listening
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});