import os
import pathlib
import pymupdf
import json
import re

'''
    Versão atual está configurada para extrair texto e metadata do pdf para arquivos respectivos, para o caso do texto,
limpando caracteres indesejados e formatando para respeitar um certo grau de paragrafos.
    Funcionamento através de path hardcoded para indicar pasta de entrada + pasta de saida, extrai todos os docs .pdf 
que encontrar na pasta de entrada. A filtragem dos dados é feita através de pymupdf e a formatação através de regex.
'''

def create_text_and_metadata(input, output):
    os.makedirs(output, exist_ok=True)

    for filename in os.listdir(input):
        if filename.lower().endswith(('.pdf', '.txt')):
            file_path = os.path.join(input, filename)
            process_file(file_path, output)

def process_file(file_path, output):
    file = pathlib.Path(file_path)
    basename_no_ext = file.stem
    txt_output_path = output / f"{basename_no_ext}_text_only.txt"
    metadata_output_path = output / f"{basename_no_ext}_metadata.json"

    try:
        doc = pymupdf.open(file_path)
        text = ""
        metadata = doc.metadata
        for page in doc:
            # Separação entre páginas
            text += page.get_text("text") + "\n"
        doc.close()

        # Remoção de símbolos e caracteres invisíveis substituindo arrows e bullets (tópicos) por - em nova linha
        text = re.sub(r'[\u2022\u2023\u25A0-\u25FF\u2190-\u21FF]', '\n- ', text)
        text = re.sub(r'[\u200B-\u200D\uFEFF\u2022\u2023\u25A0-\u25FF\u2190-\u21FF\u2600-\u27BF]', '', text)
        text = re.sub(r'[\U0001F300-\U0001FAFF]', '', text)

        # Simplifica qualquer duplicação de pontuação
        text = re.sub(r'([\.?!]){2,}', r'\1', text)

        # Remove espaços extras em linhas
        lines = text.split('\n')
        processed_lines = []
        for line in lines:
            cleaned = re.sub(r'[ \t]+', ' ', line.strip())
            processed_lines.append(cleaned)

        cleaned_text = '\n'.join(processed_lines)

        paragraphs = []
        buffer = []
        for line in cleaned_text.splitlines():
            if line.strip():
                buffer.append(line)
            elif buffer:
                paragraph = ' '.join(buffer)
                paragraphs.append(paragraph)
                buffer = []
        if buffer:
            paragraphs.append(' '.join(buffer))

        final_text = '\n\n'.join(paragraphs).strip()

        with open(txt_output_path, 'w', encoding='utf-8') as txt_file:
            txt_file.write(final_text)

        with open(metadata_output_path, 'w', encoding='utf-8') as json_file:
            json.dump(metadata, json_file, indent=4)

        print(f"Texto extraído para: {txt_output_path}")
        print(f"Metadados extraídos para: {metadata_output_path}")
        return txt_output_path, metadata_output_path

    except Exception as e:
        print(f"Erro ao processar {file_path}: {e}")
        return None, None

if __name__ == "__main__":
    print("Inicializando Extração de Conteúdo dos arquivos .pdf")
    dir_path = pathlib.Path(__file__).parent.resolve()
    input_dir = dir_path / "resource"
    output_dir = dir_path / "output"
    print(f"Diretório teste: {dir_path}\nInput: {input_dir}\nOutput: {output_dir}")
    create_text_and_metadata(input_dir, output_dir)
