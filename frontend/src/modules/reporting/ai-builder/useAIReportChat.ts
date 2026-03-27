import { useState, useCallback, useRef } from 'react';
import { aiReportBuilderApi } from '@/api/endpoints';
import type { AIChatMessage, AIReportSpec } from '@/types/api';

export function useAIReportChat() {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reportSpec, setReportSpec] = useState<AIReportSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    const userMsg: AIChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      let reply;
      if (!conversationIdRef.current) {
        reply = await aiReportBuilderApi.startConversation(text);
        conversationIdRef.current = reply.conversation_id;
      } else {
        reply = await aiReportBuilderApi.sendMessage(
          conversationIdRef.current,
          text,
        );
      }

      const assistantMsg: AIChatMessage = {
        role: 'assistant',
        content: reply.text,
        report: reply.report,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (reply.report) {
        setReportSpec(reply.report);
      }
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : 'An unexpected error occurred.';
      setError(errMsg);
      const errorAssistant: AIChatMessage = {
        role: 'assistant',
        content: errMsg,
      };
      setMessages((prev) => [...prev, errorAssistant]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const reset = useCallback(() => {
    if (conversationIdRef.current) {
      aiReportBuilderApi
        .deleteConversation(conversationIdRef.current)
        .catch(() => {});
      conversationIdRef.current = null;
    }
    setMessages([]);
    setReportSpec(null);
    setError(null);
  }, []);

  return { messages, isLoading, reportSpec, error, sendMessage, reset };
}
