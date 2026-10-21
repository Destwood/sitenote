import { useEffect, useState } from "react";

import type { Size } from "../placement";

function readViewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewport(): Size {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    function handleResize() {
      setSize(readViewport());
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return size;
}
