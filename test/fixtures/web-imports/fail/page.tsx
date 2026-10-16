// Deliberately non-compliant: reaches forbidden packages through a helper file.
import { thumbnail } from "./lib/helper";

export default function Page() {
  return <p>{String(thumbnail)}</p>;
}
