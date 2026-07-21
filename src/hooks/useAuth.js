import { useEffect, useState } from "react";
import { observarAutenticacion } from "../utils/auth.js";

export const useAuth = (cliente) => {
  const [estado, setEstado] = useState({
    verificando: true,
    session: null,
    error: ""
  });

  useEffect(() => observarAutenticacion(cliente, setEstado), [cliente]);

  return estado;
};
