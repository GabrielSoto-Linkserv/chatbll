import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { ReactComponent as Logo } from "./bll-logo.svg";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const userData = await response.json();
        login(userData); // Save user data in context
      } else {
        const { error } = await response.json();
        alert(error || "Login failed.");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Something went wrong.");
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chatbot", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleCreateAccount = () => {
    navigate("/register");
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="logo-container">
          <Logo className="logo" />
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Insira seu email"
              className="input-field"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Insira sua senha"
              className="input-field"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="login-button">
            Log In
          </button>

          <button
            type="button"
            className="create-account-button"
            onClick={handleCreateAccount}
          >
            Criar conta
          </button>
        </form>
      </div>
    </div>
  );
}
