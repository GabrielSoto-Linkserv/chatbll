import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./Login";
import Chatbot from "./Chatbot"
import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import RegisterPage from "./Register";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/chatbot" 
            element={
                <ProtectedRoute>
                <Chatbot/>
                </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
