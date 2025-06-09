import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './Chatbot.css';
import { ReactComponent as Logo } from "./bll-logo.svg";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

function Chatbot() {
    const [inputText, setInputText] = useState('');
    const [messages, setMessages] = useState([]);
    const [sessionList, setSessionList] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const chatEndRef = useRef(null);
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // Fetch chat messages for selected session
    useEffect(() => {
        const fetchChatHistory = async () => {
            setLoadingHistory(true);
            try {
                const response = await axios.post("http://localhost:5000/chat-history", {
                    sessionId: sessionId,
                });

                if (Array.isArray(response.data)) {
                    const formattedHistory = response.data.map(item => ({
                        text: item.content,
                        sender: item.role === 'user' ? 'user' : 'bot',
                        timestamp: item.timestamp,
                    }));
                    setMessages(formattedHistory);
                } else {
                    console.error("Expected an array for chat history but got:", response.data);
                    setMessages([]);
                }
            } catch (err) {
                console.error("Failed to load chat history:", err);
                setMessages([]);
            } finally {
                setLoadingHistory(false);
            }
        };

        if (sessionId) {
            fetchChatHistory();
        } else if (user?.id) {
            const message = ["Olá sou o bot assistente da BLL, como posso ajudar?\n",
                "Lembre-se, você está interagindo com uma inteligência artificial. Para melhorar sua experiência:",
                "1. Seja claro e específico, evite perguntas vagas.",
                "2. Utilize comandos objetivos como \"explique\", \"resuma\", \"compare\".",
                "3. Exemplifique o formato da resposta esperada (\"resuma o texto\", \"liste em tópicos\", etc.).",
                "4. Esse é um modelo RAG, ou seja, a resposta é baseada em documentos, não busque por informações externas.",
                "5. O modelo atual permite perguntas de em média 1400 caracteres, se deseja resumir um trecho maior que isso, informe o título ou secção onde o trecho está.",
                "6. Se deseja fazer uma pergunta sobre um tema diferente do tema da sessão atual, utilize o botão \"Novo\" para iniciar uma nova sessão",
                "7. O máximo de perguntas que você pode fazer dentro do período de 24 horas é 5, independente de tamanho da pergunta ou da quantidade de sessões.",
            ].join("\n\n");
            setMessages([{ text: message, sender: 'bot' }]);
            setLoadingHistory(false);
        } else {
            setLoadingHistory(false);
        }
    }, [sessionId, user?.id]);

    // Fetch user's sessions with titles
    useEffect(() => {
        if (user?.id) {
            axios.post("http://localhost:5000/user-sessions", {
                userId: user.id,
            })
            .then(res => setSessionList(res.data))
            .catch(err => console.error("Failed to load user sessions:", err));
        }
    }, [user]);

    const handleInputChange = (e) => setInputText(e.target.value);

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        const userMessage = { text: inputText, sender: 'user' };
        setMessages((prev) => [...prev, userMessage]);
        setInputText('');

        try {
            const response = await axios.post('http://localhost:5000/chat', {
                userId: user.id,
                message: inputText,
                sessionId: sessionId, // could be null on first message
            });
            console.log("Teste axios");

            const botMessage = { text: response.data.response, sender: 'bot' };
            setMessages((prev) => [...prev, botMessage]);
            console.log("Teste setMessages");

            // Update sessionId if it's a new session
            if (!sessionId && response.data.sessionId) {
                setSessionId(response.data.sessionId);
            } else if (response.data.sessionId !== sessionId) {
                setSessionId(response.data.sessionId);
            }
            console.log("Teste SessionID");
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            let errorMessage = 'Erro ao comunicar-se com o chatbot.'; 
            if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
                errorMessage = error.response.data.error;
            }
            const errorMsg = {
                text: errorMessage,
                sender: 'bot',
            };
            setMessages((prev) => [...prev, errorMsg]);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleLogout = (e) => {
        e.preventDefault();
        logout();
        navigate("/");
    };

    const loadSessionHistory = (sessionIdToLoad) => {
        setSessionId(sessionIdToLoad);
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleNewSession = () => {
    if (sessionId) {
        setSessionId(null);
        setMessages([{ text: "Olá sou o assistente virtual da BLL, como posso ajudar?", sender: 'bot' }]);
    }
};

    return (
        <div className="chatbot-wrapper">
            <aside className="chatbot-sidebar">
                <div className="sidebar-content">
                    <div className="logo-container">
                        <Logo className="logo" />
                    </div>
                    <h2>Assistente BLL</h2>
                    <div className='sidebar-buttons'>
                        <button className='help'>
                            Ajuda
                        </button>
                        <button className='novo' onClick={handleNewSession}>
                            Novo
                        </button>
                    </div>

                    <div className="chatbot-history">
                        <h3>Histórico</h3>
                        {sessionList.map((session, index) => (
                            <div key={index} className="chatbot-history-item" onClick={() => loadSessionHistory(session.session_id)}>
                                <p><strong>{session.title || 'Sem título'}</strong></p>
                                <small>{new Date(session.created_at).toLocaleDateString('pt-BR')}</small>
                                <hr />
                            </div>
                        ))}
                    </div>

                    <div className='logout-container'>
                        <div>Usuário: {user.firstName}</div>
                        <button onClick={handleLogout} className="logout-button">
                            Sair
                        </button>
                    </div>
                </div>
            </aside>

            <main className="chatbot-main">
                <div className="chat-window">
                    {messages.map((msg, index) => (
                        <div key={index} className={`message message-${msg.sender}`}>
                            <strong>{msg.sender === 'user' ? 'Você:' : 'Bot:'}</strong> {msg.text}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                <div className="input-area">
                    <input
                        type="text"
                        value={inputText}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        className="chat-input"
                        placeholder="Pergunte algo..."
                    />
                    <button onClick={handleSendMessage} className="send-button">
                        Enviar
                    </button>
                </div>
            </main>
        </div>
    );
}

export default Chatbot;