# Protótipo do ChatBot para BLL Compras

Modelo de chatbot utilizando técnicas de RAG para vasculhar vetores de trechos relevantes de informação e assim gerar uma resposta legível via LLM.
## Diretórios e Scripts

O projeto contém scripts relevantes nas seguintes pastas:

### `./bll-chatbot`

Diretório contendo o front-end da aplicação

#### `npm start`

Inicia o projeto no http://localhost:3000 para visualização em desenvolvimento.

#### `npm run build`

Cria a build para produção, adicionando o projeto ao diretório `build`

### `./bll-chatbot-backend`

Diretório contendo o back-end da aplicação, toda a parte relacionada ao servidor, busca, banco vetorial e llm.

#### `npm run dev`

Inicializa o servidor.

#### ` npm run load -- path`

Script para criar e alimentar o banco de vetores manualmente, permitindo assim controle direto sobre os arquivos que entram e o gasto de tokens para criá-lo. path deve ser uma string com o path do diretório onde os .pdf a serem utilizados se encontram. Por ex:  "..\chatbll\pythonUtils\output"

### `./lanceDb`

Diretório onde é armazenado o banco de vetores, contendo tabela criada pelo script `npm run load` do back-end.

### `./pythonUtils`

Diretório contendo as subpastas com arquivos pré processados e a com os resultados, além do próprio script que realiza a extração.

#### `python main.py`

Script para extrair todo o conteúdo textual dos arquivos .pdf localizados na sub-pasta `./resource` e enviar para `./output` os textos e metadados de cada um.