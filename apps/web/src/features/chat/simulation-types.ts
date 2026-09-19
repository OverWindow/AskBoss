export interface ChatSimulationRequest {
  id: string;
  translationId: string;
  replyIndex: number;
  inputText: string;
  reply: string;
}
