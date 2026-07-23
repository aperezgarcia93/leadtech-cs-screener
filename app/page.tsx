import { getCandidateDirectory } from "@/lib/candidates";
import { ChatApp } from "./components/chat-app";

export default function Page() {
  const candidates = getCandidateDirectory();
  return <ChatApp candidates={candidates} />;
}
