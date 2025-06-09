import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";
import { ReactComponent as Logo } from "./bll-logo.svg";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    department: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {      
        const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json(); 

      if (response.ok) {
        navigate("/");
      } else {
        console.error("Backend error:", data);
        alert("Falha ao registrar: " + (data.error || "Erro desconhecido"));
      }
    } catch (error) {
        console.error("Falha ao registrar:", error);
        alert("Erro ao registrar novo cadastro.");
    }
  };

  return (
    <div className="register-container">
      <div className="register-box">
        <div className="logo-container">
          <Logo className="logo" />
        </div>
        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="firstName">Nome</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              className="input-field"
              required
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="lastName">Sobrenome</label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              className="input-field"
              required
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="department">Departmento</label>
            <select
              id="department"
              name="department"
              className="input-field"
              required
              onChange={handleChange}
              value={formData.department}
            >
              <option value="">Selecione o Departmento</option>
              <option value = "comercial">Comercial</option>
              <option value = "financeiro">Financeiro</option>
              <option value = "fomento">Fomento</option>
              <option value = "pesquisa">Pesquisa</option>
              <option value = "prospeccao">Prospecção</option>
              <option value = "sup_fornecedor">Supt. Fornecer</option>
              <option value = "sup_orgao">Supt. Órgão</option>

            </select>
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input-field"
              required
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input-field"
              required
              onChange={handleChange}
            />
          </div>
          <button type="submit" className="register-button">Registrar</button>
        </form>
      </div>
    </div>
  );
}
