import { useEffect, useState } from "react";
import { MOBILE_READER_QUERY } from "../domain/readerInteractions";

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_READER_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(MOBILE_READER_QUERY);
    if (!query) return;
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

