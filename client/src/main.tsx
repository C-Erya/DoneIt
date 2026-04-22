import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./shared/AppLayout";
import { ExecutionPage } from "./pages/ExecutionPage";
import { HonorPage } from "./pages/HonorPage";
import { InspirationPage } from "./pages/InspirationPage";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <ExecutionPage /> },
      { path: "inspiration", element: <InspirationPage /> },
      { path: "execution", element: <ExecutionPage /> },
      { path: "honor", element: <HonorPage /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
