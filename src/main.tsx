import { createRoot } from "react-dom/client";
// 展示ラベルの欧文・数字・学名に使う。和文は端末の明朝体と組み合わせる。
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
