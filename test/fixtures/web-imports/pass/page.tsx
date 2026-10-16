import { readFileSync } from "node:fs";
import { z } from "zod";

export default function Page() {
  return <p>{String([readFileSync, z])}</p>;
}
