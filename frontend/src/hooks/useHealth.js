import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

/** 백엔드와 로컬 LLM(Ollama) 상태. llm이 false면 채팅 입력을 막는다. */
export function useHealth() {
  const [state, setState] = useState({ checked: false, server: false, llm: false, problem: null, model: null });

  const check = useCallback(async () => {
    try {
      const h = await api.health();
      setState({ checked: true, server: true, llm: !!h.llm, problem: h.llm_problem ?? null, model: h.model ?? null });
    } catch {
      setState({ checked: true, server: false, llm: false, problem: "백엔드가 꺼져 있어. 서버를 켠 뒤 다시 확인해 줘.", model: null });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  return { ...state, recheck: check };
}
